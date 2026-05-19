from fastapi import APIRouter, HTTPException
from ..core.supabase import get_supabase
from ..schemas.line import LinePushRequest
from ..services.line_service import LineService

router = APIRouter(prefix='/api/line', tags=['line'])


@router.post('/push')
def push_line(body: LinePushRequest):
    try:
        return LineService(get_supabase()).push(body.store_id, body.line_user_id, body.message, body.order_id, body.customer_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
