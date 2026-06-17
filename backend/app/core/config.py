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
    default_store_id: str = Field(default="", alias="DEFAULT_STORE_ID")

    line_channel_access_token: str = Field(default="", alias="LINE_CHANNEL_ACCESS_TOKEN")
    line_channel_secret: str = Field(default="", alias="LINE_CHANNEL_SECRET")
    line_login_channel_id: str = Field(default="", alias="LINE_LOGIN_CHANNEL_ID")
    line_login_channel_secret: str = Field(default="", alias="LINE_LOGIN_CHANNEL_SECRET")
    liff_id: str = Field(default="", alias="LIFF_ID")
    liff_url: str = Field(default="", alias="LIFF_URL")
    line_webhook_url: str = Field(default="", alias="LINE_WEBHOOK_URL")
    line_oa_basic_id: str = Field(default="", alias="LINE_OA_BASIC_ID")
    line_oa_channel_id: str = Field(default="", alias="LINE_OA_CHANNEL_ID")
    line_send_mode: str = Field(default="mock", alias="LINE_SEND_MODE")

    payment_instructions_enabled: bool = Field(default=True, alias="PAYMENT_INSTRUCTIONS_ENABLED")
    payment_method_label: str = Field(default="โอนผ่านบัญชีธนาคาร", alias="PAYMENT_METHOD_LABEL")
    payment_bank_name: str = Field(default="", alias="PAYMENT_BANK_NAME")
    payment_account_name: str = Field(default="", alias="PAYMENT_ACCOUNT_NAME")
    payment_account_number: str = Field(default="", alias="PAYMENT_ACCOUNT_NUMBER")
    payment_promptpay_id: str = Field(default="", alias="PAYMENT_PROMPTPAY_ID")
    payment_note_lines: str = Field(default="", alias="PAYMENT_NOTE_LINES")
    payment_slip_max_mb: float = Field(default=5.0, alias="PAYMENT_SLIP_MAX_MB")
    payment_slip_bucket: str = Field(default="payment-slips", alias="PAYMENT_SLIP_BUCKET")
    menu_image_bucket: str = Field(default="menu-images", alias="MENU_IMAGE_BUCKET")
    menu_image_max_mb: float = Field(default=5.0, alias="MENU_IMAGE_MAX_MB")
    purchase_receipt_bucket: str = Field(default="purchase-receipts", alias="PURCHASE_RECEIPT_BUCKET")
    purchase_receipt_max_mb: float = Field(default=5.0, alias="PURCHASE_RECEIPT_MAX_MB")


settings = Settings()
