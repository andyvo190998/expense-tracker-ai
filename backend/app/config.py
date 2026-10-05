from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    jwt_secret: str = "development-only-signing-secret-change-me"
    refresh_token_pepper: str = "development-only-refresh-pepper-change-me"
    jwt_algorithm: Literal["HS256"] = "HS256"
    jwt_issuer: str = "expense-tracker-api"
    jwt_audience: str = "expense-tracker-web"
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_days: int = Field(default=30, ge=1, le=90)
    access_cookie_name: str = "access_token"
    refresh_cookie_name: str = "refresh_token"
    csrf_cookie_name: str = "csrf_token"
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict"] = "lax"
    allowed_origins: list[str] = ["http://localhost:3000"]
    public_registration: bool = True

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> object:
        if isinstance(value, str) and not value.lstrip().startswith("["):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def reject_unsafe_production_secrets(self):
        if self.app_env != "production":
            return self
        unsafe = {"change-me", "development-only-signing-secret-change-me"}
        if len(self.jwt_secret) < 32 or self.jwt_secret in unsafe:
            raise ValueError("JWT_SECRET must be a strong production secret")
        if len(self.refresh_token_pepper) < 32 or "change-me" in self.refresh_token_pepper:
            raise ValueError("REFRESH_TOKEN_PEPPER must be a strong production secret")
        if not self.cookie_secure:
            raise ValueError("secure cookies are required in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
