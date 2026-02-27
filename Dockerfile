# ============================================================
# Dockerfile for SchoolPay FastAPI Backend
#
# LEARNING NOTE: We use a multi-stage build.
# Stage 1 (builder): installs dependencies
# Stage 2 (final):   copies only what's needed — smaller image
#
# Production server: gunicorn + uvicorn workers
# NOT uvicorn alone (that's single-threaded dev mode)
# ============================================================

# ── Stage 1: Build dependencies ─────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Install build tools needed for some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: Production image ────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY app/ ./app/

# Create a non-root user for security
# Running as root inside Docker is a security risk
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# Expose the port FastAPI listens on
EXPOSE 8000

# Health check — Docker will restart the container if this fails
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()"

# ── Production startup command ───────────────────────────────
# gunicorn manages multiple worker processes
# uvicorn.workers.UvicornWorker makes each worker async-capable
# --workers 4 = 4 parallel request handlers (good for 4GB VPS)
# --bind 0.0.0.0:8000 = accept connections from any interface
# --timeout 120 = kill workers that take longer than 2 minutes
# --access-logfile - = log to stdout (Docker collects this)
CMD ["gunicorn", \
     "app.main:app", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--workers", "4", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]
