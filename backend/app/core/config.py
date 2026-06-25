from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    DATABASE_URL: str = Field(default="sqlite+aiosqlite:///./makerai.db")
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str = "dev-secret-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "makerai"
    MINIO_SECRET_KEY: str = "makerai_dev"
    MINIO_BUCKET: str = "makerai-files"
    MINIO_SECURE: bool = False

    OCTOPRINT_BASE_URL: str = "http://localhost:5000"
    OCTOPRINT_API_KEY: str = ""

    ENVIRONMENT: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()
