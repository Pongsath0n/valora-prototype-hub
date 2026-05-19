from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    supabase_url: str = Field(alias='SUPABASE_URL')
    supabase_service_role_key: str = Field(alias='SUPABASE_SERVICE_ROLE_KEY')
    default_store_id: str = Field(alias='DEFAULT_STORE_ID')
    line_channel_access_token: str | None = Field(default=None, alias='LINE_CHANNEL_ACCESS_TOKEN')
    line_channel_secret: str | None = Field(default=None, alias='LINE_CHANNEL_SECRET')


settings = Settings()
