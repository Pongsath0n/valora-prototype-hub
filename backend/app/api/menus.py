from fastapi import APIRouter, Query
from ..core.supabase import get_supabase
from ..core.errors import internal_error
from ..repositories.menu_repo import MenuRepo
from ..services.menu_service import MenuService

router = APIRouter(prefix='/api/menus', tags=['menus'])


@router.get('')
def get_menus(store_id: str = Query(...), channel_id: str | None = Query(None)):
    try:
        return MenuService(MenuRepo(get_supabase())).list_menus(store_id, channel_id)
    except Exception as e:
        raise internal_error(e, 'menus.get_menus')
