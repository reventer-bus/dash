from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str = "redis://localhost:6379"
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    MINIO_ENDPOINT: str
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET: str = "makerai-files"
    MINIO_SECURE: bool = False

    OCTOPRINT_BASE_URL: str = "http://localhost:5000"
    OCTOPRINT_API_KEY: str = ""

    ENVIRONMENT: str = "development"

    class Config:
        env_file = ".env"


settings = Settings()
