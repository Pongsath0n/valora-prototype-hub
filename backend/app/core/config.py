from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="", alias="APP_ENV")
    frontend_url: str = Field(default="", alias="FRONTEND_URL")
    backend_url: str = Field(default="", alias="BACKEND_URL")

    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    line_channel_access_token: str = Field(default="", alias="LINE_CHANNEL_ACCESS_TOKEN")
    line_channel_secret: str = Field(default="", alias="LINE_CHANNEL_SECRET")
    line_login_channel_id: str = Field(default="", alias="LINE_LOGIN_CHANNEL_ID")
    line_login_channel_secret: str = Field(default="", alias="LINE_LOGIN_CHANNEL_SECRET")
    liff_id: str = Field(default="", alias="LIFF_ID")


settings = Settings()
