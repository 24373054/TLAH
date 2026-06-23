"""
Docker-based sandbox for isolated command execution.

Each chat gets an ephemeral Alpine Linux container. Commands are executed
via ``docker exec`` with resource limits and timeouts. Containers are
auto-destroyed after idle timeout.

Uses subprocess to call the Docker CLI directly — no SDK dependency.
"""

import asyncio
import logging
import os
import shlex
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.database import SessionLocal
from app.models.sandbox import SandboxContainer as SandboxModel

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────

IMAGE = "tlah-sandbox:latest"
MEMORY_LIMIT = "512m"
CPU_LIMIT = "1.0"
PIDS_LIMIT = 100
COMMAND_TIMEOUT = 30  # seconds per command
IDLE_TTL = 600  # 10 minutes idle → destroy container
NETWORK_MODE = "bridge"  # network access for pip/npm/git

# Base directory for sandbox workspaces
SANDBOX_BASE = Path(os.environ.get("TLAH_SANDBOX_DIR", "/tmp/tlah-sandboxes"))


@dataclass
class SandboxResult:
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    error: str | None = None


# ── Subprocess helpers ────────────────────────────────────────────────


async def _run_docker(*args: str, timeout: int = 60) -> tuple[int, str, str]:
    """Run a docker CLI command asynchronously.

    Returns (exit_code, stdout, stderr).
    """
    cmd = ["docker"] + list(args)
    logger.debug("docker: %s", shlex.join(cmd))

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return (-1, "", f"Command timed out after {timeout}s")

    return (
        proc.returncode or 0,
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
    )


# ── Sandbox Manager ────────────────────────────────────────────────────


class SandboxManager:
    """Manages Docker sandbox containers for chat-based agent execution."""

    @staticmethod
    def _container_name(chat_id: str) -> str:
        return f"tlah-sandbox-{chat_id[:12]}"

    @staticmethod
    def _workspace_path(chat_id: str) -> Path:
        path = SANDBOX_BASE / chat_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    # ── Container lifecycle ──────────────────────────────────────────

    @classmethod
    async def ensure_container(cls, chat_id: str, db_session=None) -> SandboxModel:
        """Get or create a sandbox container for the chat.

        If db_session is provided (from DecisionLoop), uses that session
        to avoid SQLite write conflicts. Otherwise creates its own.
        """
        own_db = db_session is None
        db = db_session if db_session is not None else SessionLocal()
        try:
            existing = (
                db.query(SandboxModel)
                .filter(SandboxModel.chat_id == chat_id)
                .first()
            )

            if existing and existing.status == "running":
                # Verify the container is actually running
                code, out, _ = await _run_docker(
                    "inspect", "-f", "{{.State.Running}}",
                    cls._container_name(chat_id),
                    timeout=10,
                )
                if code == 0 and out.strip() == "true":
                    existing.last_activity = datetime.now(timezone.utc)
                    if own_db:
                        db.commit()
                    return existing
                # Container is dead — recreate
                existing.status = "stopped"
                if own_db:
                    db.commit()

            # Create new container
            workspace = cls._workspace_path(chat_id)
            container_name = cls._container_name(chat_id)

            # Remove old container if exists
            await _run_docker("rm", "-f", container_name, timeout=10)

            # Start a long-lived container
            code, out, err = await _run_docker(
                "run", "-d",
                "--name", container_name,
                "--network", NETWORK_MODE,
                "--memory", MEMORY_LIMIT,
                "--cpus", CPU_LIMIT,
                "--pids-limit", str(PIDS_LIMIT),
                "-v", f"{workspace}:/workspace",
                "-w", "/workspace",
                IMAGE,
                "tail", "-f", "/dev/null",  # keep alive
                timeout=30,
            )

            if code != 0:
                logger.error("Failed to create sandbox container: %s", err)
                if existing:
                    existing.status = "error"
                    if own_db:
                        db.commit()
                    return existing
                rec = SandboxModel(
                    chat_id=chat_id,
                    status="error",
                    image=IMAGE,
                    workspace_host=str(workspace),
                )
                db.add(rec)
                if own_db:
                    db.commit()
                return rec

            container_id = out.strip()

            if existing:
                existing.container_id = container_id
                existing.status = "running"
                existing.image = IMAGE
                existing.workspace_host = str(workspace)
                existing.last_activity = datetime.now(timezone.utc)
            else:
                existing = SandboxModel(
                    chat_id=chat_id,
                    container_id=container_id,
                    status="running",
                    image=IMAGE,
                    workspace_host=str(workspace),
                )
                db.add(existing)

            if own_db:
                db.commit()
                db.refresh(existing)
            logger.info(
                "Sandbox container created for chat %s: %s (%s)",
                chat_id, container_id[:12], container_name,
            )
            return existing
        finally:
            if own_db:
                db.close()

    # ── Command execution ─────────────────────────────────────────────

    @classmethod
    async def execute(
        cls,
        chat_id: str,
        command: str,
        working_dir: str = "/workspace",
    ) -> SandboxResult:
        """Execute a shell command in the sandbox container."""
        container_name = cls._container_name(chat_id)

        start = time.monotonic()

        # Build the command — run via sh so pipes/redirects work
        full_cmd = ["exec", "-w", working_dir, container_name, "sh", "-c", command]

        code, stdout, stderr = await _run_docker(
            *full_cmd, timeout=COMMAND_TIMEOUT,
        )

        duration_ms = int((time.monotonic() - start) * 1000)

        if code == -1 and "timed out" in stderr.lower():
            return SandboxResult(
                stdout=stdout, stderr=stderr, exit_code=-1,
                duration_ms=duration_ms,
                error=f"Command timed out after {COMMAND_TIMEOUT}s",
            )

        # Update last_activity
        cls._heartbeat_sync(chat_id)

        return SandboxResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=code,
            duration_ms=duration_ms,
        )

    @classmethod
    def _heartbeat_sync(cls, chat_id: str):
        """Update last_activity timestamp (sync, for use in sync context)."""
        db = SessionLocal()
        try:
            rec = (
                db.query(SandboxModel)
                .filter(SandboxModel.chat_id == chat_id)
                .first()
            )
            if rec:
                rec.last_activity = datetime.now(timezone.utc)
                db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

    # ── Cleanup ───────────────────────────────────────────────────────

    @classmethod
    async def destroy(cls, chat_id: str):
        """Stop and remove the sandbox container + workspace."""
        container_name = cls._container_name(chat_id)
        await _run_docker("rm", "-f", container_name, timeout=10)

        db = SessionLocal()
        try:
            rec = (
                db.query(SandboxModel)
                .filter(SandboxModel.chat_id == chat_id)
                .first()
            )
            if rec:
                rec.status = "stopped"
                rec.container_id = None
                db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

        # Clean workspace
        workspace = cls._workspace_path(chat_id)
        if workspace.exists():
            import shutil
            shutil.rmtree(workspace, ignore_errors=True)

        logger.info("Sandbox destroyed for chat %s", chat_id)

    @classmethod
    async def reset(cls, chat_id: str):
        """Destroy and recreate the sandbox."""
        await cls.destroy(chat_id)
        await cls.ensure_container(chat_id)

    @classmethod
    async def get_status(cls, chat_id: str) -> dict:
        """Get the current sandbox status for a chat."""
        db = SessionLocal()
        try:
            rec = (
                db.query(SandboxModel)
                .filter(SandboxModel.chat_id == chat_id)
                .first()
            )
            if not rec:
                return {"status": "not_created", "container_id": None}
            return {
                "status": rec.status,
                "container_id": rec.container_id,
                "image": rec.image,
                "last_activity": rec.last_activity.isoformat() if rec.last_activity else None,
            }
        finally:
            db.close()

    @classmethod
    async def cleanup_idle(cls):
        """Destroy sandboxes that have been idle for longer than IDLE_TTL."""
        db = SessionLocal()
        try:
            cutoff = datetime.now(timezone.utc).timestamp() - IDLE_TTL
            idle = (
                db.query(SandboxModel)
                .filter(
                    SandboxModel.status == "running",
                    SandboxModel.last_activity.isnot(None),
                )
                .all()
            )
            for rec in idle:
                if rec.last_activity and rec.last_activity.timestamp() < cutoff:
                    logger.info("Cleaning up idle sandbox for chat %s", rec.chat_id)
                    await cls.destroy(rec.chat_id)
        except Exception:
            logger.exception("Error during idle cleanup")
        finally:
            db.close()

    @classmethod
    async def stop_all(cls):
        """Stop all running sandbox containers (server shutdown)."""
        db = SessionLocal()
        try:
            running = (
                db.query(SandboxModel)
                .filter(SandboxModel.status == "running")
                .all()
            )
            for rec in running:
                container_name = cls._container_name(rec.chat_id)
                await _run_docker("stop", "-t", "5", container_name, timeout=15)
                await _run_docker("rm", container_name, timeout=10)
                rec.status = "stopped"
                rec.container_id = None
            db.commit()
            logger.info("Stopped all sandbox containers")
        except Exception:
            db.rollback()
            logger.exception("Error during stop_all")
        finally:
            db.close()
