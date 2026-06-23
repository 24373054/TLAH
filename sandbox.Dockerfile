# TLAH Agent Sandbox Image
# Ubuntu 24.04 with common dev tools pre-installed
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# ── Base toolchain ─────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Shell & utils
    bash curl wget ca-certificates gnupg \
    jq vim nano tree file \
    # Build tools
    build-essential gcc g++ make cmake \
    # Python
    python3 python3-pip python3-venv \
    # Node.js (via NodeSource)
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    # Git
    git \
    # Networking debug
    netcat-openbsd iputils-ping dnsutils \
    # Archive handling
    zip unzip tar gzip xz-utils \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Remove PEP 668 restriction (sandbox, not production) ──────────
RUN rm -f /usr/lib/python3.*/EXTERNALLY-MANAGED

# ── Aliases ────────────────────────────────────────────────────────
RUN ln -s /usr/bin/python3 /usr/local/bin/python \
    && ln -s /usr/bin/pip3 /usr/local/bin/pip \
    && (pip3 install --no-cache-dir --upgrade pip || true)

# ── Default workdir ────────────────────────────────────────────────
WORKDIR /workspace

# Keep container alive
CMD ["tail", "-f", "/dev/null"]
