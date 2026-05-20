from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter

from app.core.config import settings
from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client

router = APIRouter()


def _mask_status(value: str) -> str:
    return "configured" if value else "missing"


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/db")
def health_db() -> Dict[str, Any]:
    supabase_variables = {
        "SUPABASE_URL": settings.supabase_url,
        "SUPABASE_ANON_KEY": settings.supabase_anon_key,
        "SUPABASE_SERVICE_ROLE_KEY": settings.supabase_service_role_key,
    }

    configured = all(supabase_variables.values())
    client_status = "not_checked"
    connection_status = "not_checked"

    if configured:
        try:
            client = get_supabase_admin_client()
            client_status = "available" if client is not None else "unavailable"
        except SupabaseConfigurationError:
            configured = False
            client_status = "not_checked"
        except Exception:
            client_status = "unavailable"

        if client_status == "available" and settings.supabase_url:
            try:
                connection_status = "ok" if _check_supabase_connection(settings.supabase_url) else "error"
            except Exception:
                connection_status = "error"

    status: str
    if not configured:
        status = "partial"
        client_status = client_status if client_status != "available" else "not_checked"
        connection_status = "not_checked"
    elif connection_status == "error":
        status = "error"
    elif client_status == "unavailable":
        status = "partial"
        connection_status = "not_checked"
    elif client_status == "available" and connection_status == "ok":
        status = "ok"
    else:
        status = "partial"

    return {
        "status": status,
        "database": {
            "configured": configured,
            "client": client_status,
            "connection": connection_status,
            "variables": {key: _mask_status(value) for key, value in supabase_variables.items()},
        },
    }


def _check_supabase_connection(base_url: str) -> bool:
    health_url = base_url.rstrip("/") + "/auth/v1/health"
    request = Request(health_url, method="GET")
    try:
        with urlopen(request, timeout=3) as response:  # nosec B310
            return 200 <= getattr(response, "status", 0) < 300
    except HTTPError as exc:
        return 200 <= exc.code < 300
    except URLError:
        return False


@router.get("/health/env")
def health_env() -> Dict[str, Any]:
    required_envs = {
        "APP_ENV": settings.app_env,
        "FRONTEND_URL": settings.frontend_url,
        "BACKEND_URL": settings.backend_url,
        "SUPABASE_URL": settings.supabase_url,
        "SUPABASE_ANON_KEY": settings.supabase_anon_key,
        "SUPABASE_SERVICE_ROLE_KEY": settings.supabase_service_role_key,
    }

    environment_status = {key: _mask_status(value) for key, value in required_envs.items()}
    configured_count = list(environment_status.values()).count("configured")
    overall_status = "ok" if configured_count == len(environment_status) else ("partial" if configured_count else "not_configured")

    return {
        "status": overall_status,
        "environment": environment_status,
    }


@router.get("/health/auth")
def health_auth() -> Dict[str, Any]:
    auth_envs = {
        "SUPABASE_URL": settings.supabase_url,
        "SUPABASE_ANON_KEY": settings.supabase_anon_key,
    }

    auth_status = {key: _mask_status(value) for key, value in auth_envs.items()}
    configured = all(value == "configured" for value in auth_status.values())

    return {
        "status": "ok" if configured else "not_configured",
        "auth": {
            "configured": configured,
            "provider": "supabase",
            "variables": auth_status,
        },
    }


@router.get("/health/line-ready")
def health_line_ready() -> Dict[str, Any]:
    line_envs = {
        "LINE_CHANNEL_ACCESS_TOKEN": settings.line_channel_access_token,
        "LINE_CHANNEL_SECRET": settings.line_channel_secret,
        "LINE_LOGIN_CHANNEL_ID": settings.line_login_channel_id,
        "LINE_LOGIN_CHANNEL_SECRET": settings.line_login_channel_secret,
        "LIFF_ID": settings.liff_id,
    }

    line_status = {key: _mask_status(value) for key, value in line_envs.items()}
    configured_count = list(line_status.values()).count("configured")
    ready = configured_count == len(line_status)
    overall_status = "ok" if ready else ("partial" if configured_count else "not_configured")

    return {
        "status": overall_status,
        "line": line_status,
        "ready": ready,
    }
