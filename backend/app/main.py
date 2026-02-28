# ============================================================
# app/main.py
#
# The entry point for the entire backend.
# This is where FastAPI is created and configured.
#
# What this file does:
# - Creates the FastAPI app instance
# - Adds CORS middleware (allows React frontend to call us)
# - Registers all routes under /api/v1
# - Adds a /health endpoint for Docker healthchecks
# - Adds global error handlers for clean error responses
# ============================================================

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import logging
import time

from app.core.config import settings
from app.core.database import check_db_connection
from app.api.v1.router import api_router

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.is_production else logging.DEBUG,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# PRIORITY-0: Never leak auth headers/tokens from low-level HTTP debug logs.
# In production we force these noisy client loggers down to WARNING.
if settings.is_production and not settings.HTTP_CLIENT_DEBUG_LOGS:
    for noisy_logger in ("httpx", "httpcore", "hpack"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)


# ── Startup / Shutdown ───────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs on startup and shutdown."""
    # Startup
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT}")

    db_ok = await check_db_connection()
    if db_ok:
        logger.info("✅ Database connection OK")
    else:
        logger.error("❌ Database connection FAILED — check SUPABASE_URL and keys")

    yield

    # Shutdown
    logger.info("Shutting down SchoolPay API")


# ── Create App ───────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "SchoolPay — Fee Management & Payment Automation for Nigerian Schools. "
        "Multi-tenant SaaS backend."
    ),
    docs_url="/docs" if not settings.is_production else None,   # Hide Swagger in prod
    redoc_url="/redoc" if not settings.is_production else None,
    lifespan=lifespan,
)


# ── CORS Middleware ──────────────────────────────────────────
# LEARNING NOTE: CORS tells browsers which frontend URLs are
# allowed to call this API. Without this, the browser blocks
# requests from your React app.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request timing middleware ────────────────────────────────
@app.middleware("http")
async def add_request_timing(request: Request, call_next):
    """Logs how long each request takes. Useful for finding slow endpoints."""
    start = time.time()
    response = await call_next(request)
    duration = (time.time() - start) * 1000
    logger.info(f"{request.method} {request.url.path} → {response.status_code} ({duration:.1f}ms)")
    return response


# ── Global error handlers ────────────────────────────────────
@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    """
    When Pydantic validation fails (e.g. missing required field),
    return a clean JSON error instead of the default ugly response.
    """
    errors = []
    for error in exc.errors():
        field = " → ".join(str(e) for e in error["loc"])
        errors.append(f"{field}: {error['msg']}")

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "message": "Validation error",
            "detail": errors,
        },
    )


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    """Catch-all for unexpected errors. Never expose stack traces in production."""
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "An unexpected error occurred. Please try again.",
        },
    )


# ── Routes ───────────────────────────────────────────────────
app.include_router(api_router, prefix=settings.API_PREFIX)


# ── Health check ─────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health_check():
    """
    Docker uses this endpoint to know if the container is healthy.
    Returns 200 when the API and DB are reachable.
    Returns 503 if the DB is down.
    """
    db_ok = await check_db_connection()
    if db_ok:
        return {"status": "healthy", "version": settings.APP_VERSION}
    return JSONResponse(
        status_code=503,
        content={"status": "unhealthy", "reason": "database_unreachable"},
    )


@app.get("/", tags=["Health"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }
