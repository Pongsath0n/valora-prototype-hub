from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter

from app.core.config import settings
from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client


SAFE_HEALTH_TABLES = ("profiles", "stores")

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

    connection_reason = None
    checked_table = None

    if configured:
        try:
            client = get_supabase_admin_client()
            client_status = "available" if client is not None else "unavailable"
        except SupabaseConfigurationError:
            configured = False
            client_status = "not_checked"
        except Exception:
            client_status = "unavailable"

        if client_status == "available" and client is not None:
            connection_status, connection_reason, checked_table = _probe_supabase_connection(client)

    status: str
    if not configured:
        status = "partial"
        client_status = client_status if client_status != "available" else "not_checked"
        connection_status = "not_checked"
    elif connection_status == "ok":
        status = "ok"
    elif client_status == "available" and connection_status == "not_checked":
        status = "partial"
    elif client_status == "unavailable":
        status = "partial"
        connection_status = "not_checked"
    else:
        status = "error"

    return {
        "status": status,
        "database": {
            "configured": configured,
            "client": client_status,
            "connection": connection_status,
            "checked_table": checked_table,
            "reason": connection_reason,
            "variables": {key: _mask_status(value) for key, value in supabase_variables.items()},
        },
    }


def _probe_supabase_connection(client: Any) -> tuple[str, str | None, str | None]:
    """Check Supabase connectivity using a safe table probe.

    Returns (connection_status, reason, checked_table)
    connection_status: ok | not_checked | error
    reason: sanitized short reason string
    checked_table: table name if used
    """

    for table_name in SAFE_HEALTH_TABLES:
        try:
            response = client.table(table_name).select("id").limit(1).execute()
            error = getattr(response, "error", None)

            if error:
                if _is_missing_table(error):
                    continue
                return "error", "query_failed", None

            return "ok", None, table_name
        except Exception:
            # Treat unexpected errors as connection issues; keep message sanitized
            return "error", "connection_failed", None

    return "not_checked", "No safe database table configured for health check", None


def _is_missing_table(error: Any) -> bool:
    message = getattr(error, "message", "") or str(error)
    lowered = message.lower()
    return "does not exist" in lowered or "relation" in lowered


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
    # Grouped readiness (all masked)
    messaging_required = {
        "LINE_CHANNEL_ACCESS_TOKEN": settings.line_channel_access_token,
        "LINE_CHANNEL_SECRET": settings.line_channel_secret,
    }
    liff_required = {
        "LINE_LOGIN_CHANNEL_ID": settings.line_login_channel_id,
        "LINE_LOGIN_CHANNEL_SECRET": settings.line_login_channel_secret,
        "LIFF_ID": settings.liff_id,
        "LIFF_URL": settings.liff_url,
    }
    webhook_required = {
        "LINE_CHANNEL_SECRET": settings.line_channel_secret,
        "LINE_WEBHOOK_URL": settings.line_webhook_url,
    }
    optional_ids = {
        "LINE_OA_BASIC_ID": settings.line_oa_basic_id,
        "LINE_OA_CHANNEL_ID": settings.line_oa_channel_id,
    }

    def mask_group(group: Dict[str, Any]) -> Dict[str, str]:
        return {key: _mask_status(val) for key, val in group.items()}

    def group_status(masked: Dict[str, str]) -> str:
        vals = list(masked.values())
        configured = vals.count("configured")
        if configured == 0:
            return "not_configured"
        if configured == len(masked):
            return "ready_candidate"
        return "partial"

    messaging_masked = mask_group(messaging_required)
    liff_masked = mask_group(liff_required)
    webhook_masked = mask_group(webhook_required)
    optional_masked = mask_group(optional_ids)

    groups = {
        "messaging_api": {
            "status": group_status(messaging_masked),
            "variables": messaging_masked,
        },
        "liff": {
            "status": group_status(liff_masked),
            "variables": liff_masked,
        },
        "webhook": {
            "status": group_status(webhook_masked),
            "variables": webhook_masked,
        },
        "optional_ids": {
            "status": group_status(optional_masked),
            "variables": optional_masked,
        },
    }

    overall_vals = [g["status"] for g in groups.values()]
    if all(v == "not_configured" for v in overall_vals):
        overall_status = "not_configured"
    elif any(v == "partial" for v in overall_vals):
        overall_status = "partial"
    else:
        overall_status = "ready_candidate"

    return {
        "status": overall_status,
        "mode": settings.line_send_mode or "mock",
        "real_send_enabled": False,
        "groups": groups,
    }
