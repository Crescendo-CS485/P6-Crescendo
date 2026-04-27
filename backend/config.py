import os
from dotenv import load_dotenv

load_dotenv()


def _truthy(val: str) -> bool:
    return val.lower() in ("1", "true", "yes", "on")


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "postgresql://localhost/crescendo_p4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-crescendo")

    # Comma-separated origins for credentialed browser requests (production).
    # Empty = permissive CORS for local development only.
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "").strip()

    ENABLE_DEBUG_ROUTES = _truthy(os.environ.get("ENABLE_DEBUG_ROUTES", ""))
    ENABLE_CATALOG_WRITE = _truthy(os.environ.get("ENABLE_CATALOG_WRITE", ""))

    SESSION_COOKIE_SECURE = _truthy(os.environ.get("SESSION_COOKIE_SECURE", ""))
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
