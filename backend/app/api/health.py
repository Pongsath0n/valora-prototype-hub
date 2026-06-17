from typing import Any, Dict
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter

from app.core.config import settings
from app.core.supabase import SupabaseConfigurationError, get_supabase_admin_client


SAFE_HEALTH_TABLES = ("profiles", "stores")
STORAGE_BUCKETS = (
    {
        "key": "payment_slips",
        "label": "Payment Slip Bucket",
        "attr": "payment_slip_bucket",
        "mode": "private",
        "required": True,
        "notes": "ใช้สำหรับสลิปการชำระเงินของลูกค้า",
    },
    {
        "key": "menu_images",
        "label": "Menu Image Bucket",
        "attr": "menu_image_bucket",
        "mode": "public",
        "required": True,
        "notes": "รูปเมนูและสินทรัพย์ร้านค้าสาธารณะ",
    },
    {
        "key": "purchase_receipts",
        "label": "Purchase Receipt Bucket",
        "attr": "purchase_receipt_bucket",
        "mode": "private",
        "required": True,
        "notes": "เก็บใบเสร็จซื้อวัตถุดิบและสต็อก",
    },
)

router = APIRouter()


def _mask_status(value: str) -> str:
    return "configured" if value else "missing"


def _app_env_detail(value: str) -> Dict[str, Any]:
    normalized = (value or "").strip()
    if not normalized:
        status = "warning"
    elif normalized.lower() in {"production", "development"}:
        status = "ok"
    else:
        status = "info"

    return {
        "status": status,
        "value": normalized or "unset",
        "recommended": {
            "local": "development",
            "railway": "production",
        },
        "notes": "ตั้งค่า APP_ENV=development ในเครื่อง และ APP_ENV=production บน Railway เพื่อบอก context ชัดเจน",
    }


def _probe_storage_bucket(client: Any, bucket_name: str) -> tuple[str, str | None]:
    try:
        storage_client = client.storage.from_(bucket_name)
    except Exception:
        return "error", "bucket_not_accessible"

    try:
        storage_client.list(path="", options={"limit": 1})
    except AttributeError:
        return "manual", "list_not_supported"
    except Exception:
        return "error", "list_failed"

    return "ok", None


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

    app_env_detail = _app_env_detail(settings.app_env)
    if app_env_detail["status"] != "ok" and overall_status == "ok":
        overall_status = "warning"

    return {
        "status": overall_status,
        "environment": environment_status,
        "details": {
            "matrix": [
                {
                    "key": key,
                    "status": environment_status[key],
                    "required": True,
                }
                for key in required_envs
            ],
            "app_env": app_env_detail,
        },
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
        if not vals or configured == 0:
            return "not_enabled"
        if configured == len(masked):
            return "configured"
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

    send_mode = (settings.line_send_mode or "mock").strip() or "mock"
    send_mode_status = "mock" if send_mode.lower() != "real" else "configured"

    line_checks = {
        "send_mode": {
            "status": send_mode_status,
            "mode": send_mode,
            "notes": "mock = ปิดการส่ง LINE push จริง (ปลอดภัยก่อน Soft Launch)",
        },
        "messaging_api": {
            "status": groups["messaging_api"]["status"],
            "variables": messaging_masked,
            "notes": "ต้องมีทั้ง channel access token และ channel secret",
        },
        "webhook": {
            "status": groups["webhook"]["status"],
            "variables": webhook_masked,
            "notes": "ต้องระบุ LINE_WEBHOOK_URL และ channel secret เพื่อ verify",
        },
        "rich_menu": {
            "status": "manual",
            "notes": "Rich Menu ถูกตั้งค่าด้วยมือ (ลิงก์ /order และ /order/status)",
        },
        "liff": {
            "status": "not_enabled",
            "variables": liff_masked,
            "notes": "LIFF ถูกเลื่อนออกจาก Phase H2-B",
        },
    }

    messaging_status = groups["messaging_api"]["status"]
    webhook_status = groups["webhook"]["status"]
    liff_status = groups["liff"]["status"]

    if all(status == "not_enabled" for status in (messaging_status, webhook_status, liff_status)):
        overall_status = "not_enabled"
    elif messaging_status == "configured" and webhook_status in {"configured", "partial"}:
        overall_status = "configured"
    else:
        overall_status = "partial"

    return {
        "status": overall_status,
        "mode": send_mode,
        "real_send_enabled": False,
        "checks": line_checks,
        "groups": groups,
    }


@router.get("/health/storage")
def health_storage() -> Dict[str, Any]:
    supabase_configured = bool(settings.supabase_url and settings.supabase_service_role_key)
    client = None
    if supabase_configured:
        try:
            client = get_supabase_admin_client()
        except SupabaseConfigurationError:
            supabase_configured = False

    buckets: list[Dict[str, Any]] = []
    missing_required = False
    probe_failures = False

    for bucket_cfg in STORAGE_BUCKETS:
        bucket_name = getattr(settings, bucket_cfg["attr"], "")
        configured = bool(bucket_name)
        entry = {
            "key": bucket_cfg["key"],
            "label": bucket_cfg["label"],
            "bucket": bucket_name,
            "mode": bucket_cfg["mode"],
            "required": bucket_cfg["required"],
            "notes": bucket_cfg.get("notes"),
            "configured": configured,
            "probe": "not_checked",
            "status": "action_required" if bucket_cfg["required"] else "not_enabled",
            "reason": None,
        }

        if not configured:
            entry["reason"] = "bucket_env_missing"
            missing_required = missing_required or bucket_cfg["required"]
        elif not supabase_configured or client is None:
            entry["status"] = "configured"
            entry["reason"] = "supabase_not_ready"
        else:
            probe_status, probe_reason = _probe_storage_bucket(client, bucket_name)
            entry["probe"] = probe_status
            entry["reason"] = probe_reason
            if probe_status == "ok":
                entry["status"] = "ok"
            elif probe_status == "manual":
                entry["status"] = "manual"
            else:
                entry["status"] = "action_required"
                probe_failures = True

        buckets.append(entry)

    if missing_required:
        overall_status = "action_required"
    elif not supabase_configured:
        overall_status = "manual"
    elif probe_failures:
        overall_status = "warning"
    else:
        overall_status = "ok"

    return {
        "status": overall_status,
        "storage": {
            "supabase_configured": supabase_configured,
            "probe_mode": "list" if supabase_configured else "manual",
            "buckets": buckets,
            "notes": [
                "อ่าน bucket แบบ list limit=1 เท่านั้น (ไม่ลบ/เขียนไฟล์)",
                "หากต้องการตรวจสอบเชิงลึกต้องทำ manual audit เพิ่มเติม",
            ],
        },
    }
