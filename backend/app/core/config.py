# ============================================================
# app/core/config.py
#
# LEARNING NOTE: This file reads ALL configuration from
# environment variables. This is the 12-factor app approach.
# You never hardcode secrets in code — they live in .env
# locally, and in your VPS environment in production.
#
# Usage anywhere in the app:
#   from app.core.config import settings
#   print(settings.SUPABASE_URL)
# ============================================================

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os
from pathlib import Path

class Settings(BaseSettings):
    """
    All settings come from environment variables.
    Pydantic automatically reads .env file when running locally.
    In Docker / VPS, set these as real environment variables.
    """

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[3] / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",          # Ignore extra vars in .env
    )

    # ── App Identity ─────────────────────────────────────────
    APP_NAME: str = "SchoolPay"
    APP_VERSION: str = "1.0.0"

    # ── Database Schema ───────────────────────────────────────
    # SchoolPay tables live in the 'schoolpay' schema, not 'public'.
    # This keeps them isolated from your restaurant/n8n tables.
    # Migration 000 sets search_path automatically — you don't need
    # to prefix every table name in queries.
    DB_SCHEMA: str = "schoolpay"
    ENVIRONMENT: str = "development"        # development | production
    DEBUG: bool = False
    # PRIORITY-0: Keep production logs at INFO and suppress verbose HTTP wire logs by default.
    HTTP_CLIENT_DEBUG_LOGS: bool = False

    # PRIORITY-0: Brute-force protection knobs for login endpoints.
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 300
    LOGIN_RATE_LIMIT_MAX_PER_IP: int = 20
    LOGIN_RATE_LIMIT_MAX_PER_EMAIL: int = 10

    # PRIORITY-0: Idempotency cache TTL (initialize/webhook replay protection).
    IDEMPOTENCY_TTL_SECONDS: int = 600
    # Shared local store so idempotency works across multiple workers.
    IDEMPOTENCY_DB_PATH: str = "/tmp/schoolpay_idempotency.db"

    # ── API Settings ─────────────────────────────────────────
    API_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",            # React dev server
        "http://localhost:5173",            # Vite dev server
        "https://app.schoolpay.ng",        # Production React dashboard
        "https://admin.schoolpay.ng",      # Appsmith super admin
    ]

    # ── Supabase ─────────────────────────────────────────────
    # Get these from: Supabase Dashboard → Settings → API
    SUPABASE_URL: str                       # e.g. https://xyz.supabase.co
    SUPABASE_ANON_KEY: str                  # Public key (safe for clients)
    SUPABASE_SERVICE_KEY: str               # Service key — NEVER expose to frontend
    # SUPABASE_SERVICE_KEY bypasses RLS. Only use in backend.

    # ── JWT Authentication ────────────────────────────────────
    # LEARNING NOTE: We sign our own JWTs that contain school_id and role.
    # This is separate from Supabase Auth's JWT — we issue ours after
    # verifying the Supabase token.
    JWT_SECRET_KEY: str                     # Generate: openssl rand -hex 32
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8    # 8 hours (a school workday)
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Paystack ─────────────────────────────────────────────
    PAYSTACK_SECRET_KEY: str                # sk_live_xxx or sk_test_xxx
    PAYSTACK_PUBLIC_KEY: str                # pk_live_xxx or pk_test_xxx
    PAYSTACK_WEBHOOK_SECRET: str            # Set in Paystack dashboard → Webhooks
    PAYSTACK_BASE_URL: str = "https://api.paystack.co"

    # ── Termii (SMS + WhatsApp) ──────────────────────────────
    TERMII_API_KEY: str                     # From Termii dashboard
    TERMII_BASE_URL: str = "https://api.ng.termii.com/api"
    TERMII_SENDER_ID: str = "SchoolPay"    # Must be registered with Termii
    TERMII_CHANNEL: str = "generic"        # generic | dnd | whatsapp

    # ── n8n Automation ───────────────────────────────────────
    N8N_WEBHOOK_BASE_URL: str = "http://n8n:5678/webhook"
    # Internal Docker network URL — n8n is not exposed publicly
    N8N_PAYMENT_SUCCESS_WEBHOOK: str = "payment-success"
    N8N_FEE_REMINDER_WEBHOOK: str = "fee-reminder"

    # ── n8n Internal Communication ───────────────────────────────
    INTERNAL_SECRET_KEY: str    # Shared secret for n8n → FastAPI /internal/* endpoints
    
    # ── Platform Config ──────────────────────────────────────
    PLATFORM_FEE_PER_STUDENT: float = 500.0    # ₦500 per student per term
    MINIMUM_BILLABLE_STUDENTS: int = 100        # minimum billing floor
    TRIAL_PERIOD_DAYS: int = 30
    GRACE_PERIOD_DAYS: int = 14                 # after subscription due date

    # ── Frontend URLs ────────────────────────────────────────
    FRONTEND_URL: str = "https://app.schoolpay.ng"
    PAYMENT_PAGE_URL: str = "https://pay.schoolpay.ng"
    # Parent payment links: {PAYMENT_PAGE_URL}/invoice/{token}

    # ── File Storage ─────────────────────────────────────────
    MAX_FILE_SIZE_MB: int = 5               # Max upload size (bank transfer proof)
    ALLOWED_FILE_TYPES: List[str] = ["image/jpeg", "image/png", "application/pdf"]

    # ── Timezone ─────────────────────────────────────────────
    TIMEZONE: str = "Africa/Lagos"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


# Single instance — import this everywhere
settings = Settings()
