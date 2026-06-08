import logging
from typing import Any, Dict, List, Optional, Literal, Tuple

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from app.api.store_admin import _get_system_ctx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/system", tags=["system"])

SystemRole = Literal["owner", "admin", "manager", "staff"]
StoreRole = Literal["owner", "admin", "manager", "staff"]


class UserRoleUpdate(BaseModel):
    role: SystemRole


class StoreMemberCreate(BaseModel):
    user_id: str
    store_id: str
    role: StoreRole


class StoreMemberUpdate(BaseModel):
    role: Optional[StoreRole] = None


class ListUsersResponse(BaseModel):
    items: List[Dict[str, Any]]


def _normalize_role(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return str(value).strip().lower() or None


def _fetch_profiles(client: Client, limit: int = 200) -> List[Dict[str, Any]]:
    try:
        resp = (
            client.table("profiles")
            .select("id, email, full_name, role, store_id, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="profiles_query_failed") from exc

    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="profiles_query_failed")
    return getattr(resp, "data", None) or []


def _fetch_store_members(client: Client, user_ids: List[str]) -> List[Dict[str, Any]]:
    if not user_ids:
        return []
    try:
        resp = (
            client.table("store_members")
            .select("id, user_id, store_id, role, created_at")
            .in_("user_id", user_ids)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="store_members_query_failed") from exc

    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="store_members_query_failed")
    return getattr(resp, "data", None) or []


def _load_store_names(client: Client, store_ids: List[str]) -> Dict[str, str]:
    if not store_ids:
        return {}
    unique_ids = list({str(sid) for sid in store_ids if sid})
    if not unique_ids:
        return {}
    try:
        resp = (
            client.table("stores")
            .select("id, name")
            .in_("id", unique_ids)
            .order("name", desc=False)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="stores_query_failed") from exc

    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="stores_query_failed")
    result: Dict[str, str] = {}
    for row in getattr(resp, "data", None) or []:
        sid = str(row.get("id")) if row.get("id") else None
        if sid:
            result[sid] = str(row.get("name") or f"Store {sid[:6]}")
    return result


def _map_store_memberships(
    rows: List[Dict[str, Any]],
    store_names: Dict[str, str],
) -> Dict[str, List[Dict[str, Any]]]:
    membership_map: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        user_id = str(row.get("user_id")) if row.get("user_id") else None
        if not user_id:
            continue
        store_id = str(row.get("store_id")) if row.get("store_id") else None
        entry = {
            "id": str(row.get("id")),
            "store_id": store_id,
            "store_name": store_names.get(store_id) if store_id else None,
            "role": _normalize_role(row.get("role")),
            "created_at": row.get("created_at"),
        }
        membership_map.setdefault(user_id, []).append(entry)
    return membership_map


def _count_owners(client: Client) -> int:
    try:
        resp = client.table("profiles").select("id").eq("role", "owner").execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="owner_count_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="owner_count_failed")
    return len(getattr(resp, "data", None) or [])


def _require_user_exists(client: Client, user_id: str) -> Dict[str, Any]:
    try:
        resp = client.table("profiles").select("id, role").eq("id", user_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="user_lookup_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="user_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    return rows[0]


@router.get("/users")
def list_users(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    ctx = _get_system_ctx(authorization)
    client = ctx["client"]

    profiles = _fetch_profiles(client)
    user_ids = [str(p.get("id")) for p in profiles if p.get("id")]
    memberships = _fetch_store_members(client, user_ids)
    store_ids = [str(row.get("store_id")) for row in memberships if row.get("store_id")]
    store_names = _load_store_names(client, store_ids)
    membership_map = _map_store_memberships(memberships, store_names)

    items = []
    for profile in profiles:
        profile_id = str(profile.get("id")) if profile.get("id") else None
        if not profile_id:
            continue
        items.append(
            {
                "id": profile_id,
                "email": profile.get("email"),
                "full_name": profile.get("full_name"),
                "role": _normalize_role(profile.get("role")),
                "store_id": profile.get("store_id"),
                "created_at": profile.get("created_at"),
                "memberships": membership_map.get(profile_id, []),
            }
        )

    return {"items": items}


@router.get("/roles")
def list_roles(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    _get_system_ctx(authorization)
    profile_roles = [
        {"id": "owner", "label": "Owner", "description": "Full access to business, store admin, and system console"},
        {"id": "admin", "label": "Admin", "description": "Manage business insights and store admin"},
        {"id": "manager", "label": "Manager", "description": "Business dashboards and reporting"},
        {"id": "staff", "label": "Staff", "description": "Store Admin operations only"},
    ]
    store_roles = [
        {"id": "admin", "label": "Store Admin", "description": "จัดการออเดอร์ การชำระเงิน และการตั้งค่าร้าน"},
        {"id": "manager", "label": "Store Manager", "description": "อนุมัติการชำระเงิน ดูรายงานร้าน"},
        {"id": "staff", "label": "Store Staff", "description": "ปฏิบัติงานในคิวออเดอร์"},
    ]
    return {"profile_roles": profile_roles, "store_roles": store_roles}


@router.patch("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    payload: UserRoleUpdate,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    ctx = _get_system_ctx(authorization)
    client = ctx["client"]

    existing = _require_user_exists(client, user_id)
    current_role = _normalize_role(existing.get("role"))
    next_role = _normalize_role(payload.role)
    if not next_role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role_required")

    if current_role == "owner" and next_role != "owner":
        if _count_owners(client) <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_remove_last_owner")

    try:
        resp = client.table("profiles").update({"role": next_role}).eq("id", user_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="user_role_update_failed") from exc

    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="user_role_update_failed")

    logger.info(
        "system_user_role_updated",
        extra={"user_id": user_id, "from_role": current_role, "to_role": next_role},
    )
    return {"status": "ok", "user_id": user_id, "role": next_role}


def _ensure_store_exists(client: Client, store_id: str) -> None:
    try:
        resp = client.table("stores").select("id").eq("id", store_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="store_lookup_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="store_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="store_not_found")


def _ensure_membership(client: Client, member_id: str) -> Dict[str, Any]:
    try:
        resp = client.table("store_members").select("id, user_id, store_id, role").eq("id", member_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="store_member_lookup_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="store_member_lookup_failed")
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="store_member_not_found")
    return rows[0]


@router.post("/store-members")
def create_store_member(
    payload: StoreMemberCreate,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    ctx = _get_system_ctx(authorization)
    client = ctx["client"]

    _require_user_exists(client, payload.user_id)
    _ensure_store_exists(client, payload.store_id)

    try:
        existing = (
            client.table("store_members")
            .select("id")
            .eq("user_id", payload.user_id)
            .eq("store_id", payload.store_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="store_member_lookup_failed") from exc
    if getattr(existing, "error", None):
        raise HTTPException(status_code=500, detail="store_member_lookup_failed")
    if (getattr(existing, "data", None) or []):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="membership_exists")

    data = {
        "user_id": payload.user_id,
        "store_id": payload.store_id,
        "role": payload.role,
    }

    try:
        resp = client.table("store_members").insert(data).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="store_member_create_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="store_member_create_failed")

    rows = getattr(resp, "data", None) or []
    created = rows[0] if rows else data
    logger.info(
        "system_store_member_created",
        extra={"user_id": payload.user_id, "store_id": payload.store_id, "role": payload.role},
    )
    return {"status": "ok", "member": created}


@router.patch("/store-members/{member_id}")
def update_store_member(
    member_id: str,
    payload: StoreMemberUpdate,
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    ctx = _get_system_ctx(authorization)
    client = ctx["client"]

    existing = _ensure_membership(client, member_id)
    update_data: Dict[str, Any] = {}
    if payload.role:
        update_data["role"] = payload.role

    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no_fields_to_update")

    try:
        resp = client.table("store_members").update(update_data).eq("id", member_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="store_member_update_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="store_member_update_failed")

    rows = getattr(resp, "data", None) or []
    updated = rows[0] if rows else existing | update_data
    logger.info(
        "system_store_member_updated",
        extra={"member_id": member_id, "role": update_data.get("role")},
    )
    return {"status": "ok", "member": updated}


@router.delete("/store-members/{member_id}")
def delete_store_member(member_id: str, authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    ctx = _get_system_ctx(authorization)
    client = ctx["client"]

    _ensure_membership(client, member_id)
    try:
        resp = client.table("store_members").delete().eq("id", member_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="store_member_delete_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="store_member_delete_failed")

    logger.info("system_store_member_deleted", extra={"member_id": member_id})
    return {"status": "ok"}


@router.get("/stores")
def list_stores(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    ctx = _get_system_ctx(authorization)
    client = ctx["client"]

    try:
        resp = client.table("stores").select("id, name").order("name", desc=False).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="stores_query_failed") from exc
    if getattr(resp, "error", None):
        raise HTTPException(status_code=500, detail="stores_query_failed")

    items = [
        {
            "id": str(row.get("id")) if row.get("id") else None,
            "name": row.get("name") or (f"Store {str(row.get('id'))[:6]}" if row.get("id") else None),
        }
        for row in (getattr(resp, "data", None) or [])
        if row.get("id")
    ]
    return {"items": items}
