from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    DATABASE_URL: str = Field(default="sqlite+aiosqlite:///./makerai.db")
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str = "dev-secret-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    # When true, farm endpoints reject anonymous requests instead of
    # serving them unscoped (legacy dashboard compat). Flip once the
    # deployed frontend sends a JWT on every request.
    AUTH_ENFORCE: bool = False

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "makerai"
    MINIO_SECRET_KEY: str = "makerai_dev"
    MINIO_BUCKET: str = "makerai-files"
    MINIO_SECURE: bool = False

    OCTOPRINT_BASE_URL: str = "http://localhost:5000"
    OCTOPRINT_API_KEY: str = ""

    ENVIRONMENT: str = "development"

    # Masked customer<->technician chat relay (PLAN.md #21)
    # Disabled by default: image/voice PII handling is not built yet, so the
    # relay must not be customer-facing. Flip only per the PLAN #21 checklist.
    CHAT_RELAY_ENABLED: bool = False
    # Shared secret for n8n -> relay endpoints (X-Relay-Key header).
    CHAT_RELAY_API_KEY: str = ""
    # Claude API key for the PII second-pass classifier. Without it,
    # regex-clean messages are withheld (fail-closed), not relayed.
    ANTHROPIC_API_KEY: str = ""
    PII_LLM_MODEL: str = "claude-haiku-4-5-20251001"

    # Shopify integration
    SHOPIFY_DOMAIN: str = Field(default="store.fofus.in")
    SHOPIFY_ADMIN_TOKEN: str = Field(default="")
    SHOPIFY_WEBHOOK_SECRET: str = Field(default="")
    SHOPIFY_API_VERSION: str = Field(default="2024-04")

    class Config:
        env_file = ".env"


settings = Settings()
