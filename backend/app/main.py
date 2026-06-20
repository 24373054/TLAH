import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.database import init_db, migrate_db
from app.routers import router as api_router

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
STATIC_DIR = os.path.abspath(STATIC_DIR)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    migrate_db()
    yield


app = FastAPI(
    title="TLAH",
    description="Talk Like A Human — ChatBot Prompt Debugging Framework",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Production: serve built frontend ──────────────────────────────

if os.path.isdir(STATIC_DIR):
    # Serve static assets (JS, CSS, images)
    assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # Favicon
    favicon = os.path.join(STATIC_DIR, "favicon.svg")
    if os.path.isfile(favicon):
        @app.get("/favicon.svg", include_in_schema=False)
        async def favicon():
            return FileResponse(favicon)

    # SPA fallback — all non-API routes serve index.html
    index_html = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_html):
        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa_fallback(full_path: str):
            # Only serve for non-API paths, and only if the file doesn't exist as a static asset
            if full_path.startswith("api/"):
                from fastapi.responses import JSONResponse
                return JSONResponse({"detail": "Not found"}, status_code=404)
            return FileResponse(index_html)
