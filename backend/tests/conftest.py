import os
import sys
from pathlib import Path


# Ensure `import app...` resolves when tests run from repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


# Minimal defaults so settings can initialize in test environments.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
os.environ.setdefault("PAYSTACK_SECRET_KEY", "sk_test_key")
os.environ.setdefault("PAYSTACK_PUBLIC_KEY", "pk_test_key")
os.environ.setdefault("PAYSTACK_WEBHOOK_SECRET", "whsec_test")
os.environ.setdefault("TERMII_API_KEY", "termii_test")
os.environ.setdefault("INTERNAL_SECRET_KEY", "internal_test")
