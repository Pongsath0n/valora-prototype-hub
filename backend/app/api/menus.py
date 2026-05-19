from fastapi import APIRouter, HTTPException, Query
from ..core.supabase import get_supabase
from ..repositories.menu_repo import MenuRepo
from ..services.menu_service import MenuService

router = APIRouter(prefix='/api/menus', tags=['menus'])


@router.get('')
def get_menus(store_id: str = Query(...), channel_id: str | None = Query(None)):
    try:
        return MenuService(MenuRepo(get_supabase())).list_menus(store_id, channel_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
