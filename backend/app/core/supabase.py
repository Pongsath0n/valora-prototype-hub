from supabase import Client, create_client

from app.core.config import settings


class SupabaseConfigurationError(RuntimeError):
    """Raised when required Supabase configuration is missing."""


def get_supabase_admin_client() -> Client:
    if not settings.supabase_url:
        raise SupabaseConfigurationError("Missing required setting: SUPABASE_URL")
    if not settings.supabase_service_role_key:
        raise SupabaseConfigurationError("Missing required setting: SUPABASE_SERVICE_ROLE_KEY")

    return create_client(settings.supabase_url, settings.supabase_service_role_key)
