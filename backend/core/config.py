from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./nulltor.db"

    # JWT
    JWT_SECRET_KEY: str = "change-me-to-a-random-64-char-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours

    # Superadmin seed (applied only on first run)
    SUPERADMIN_EMAIL: str = "superadmin@nulltor.com"
    SUPERADMIN_USERNAME: str = "superadmin"
    SUPERADMIN_PASSWORD: str = "admin123"

    # App
    APP_NAME: str = "Nulltor"
    DEBUG: bool = False

    # Storage — directory for encrypted Yjs snapshots (relative to backend/)
    SNAPSHOT_DIR: str = "storage/snapshots"

    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    # AI Agent (Groq)
    GROQ_API_KEY: str = ""
    AI_BASE_URL: str = "https://api.groq.com/openai/v1"
    AI_MODEL: str = "openai/gpt-oss-120b"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    model_config = {"env_file": "../.env", "extra": "ignore"}


settings = Settings()
