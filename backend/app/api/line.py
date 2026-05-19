from fastapi import APIRouter
from ..core.errors import internal_error
from ..schemas.line import LinePushRequest
from ..services.line_service import LineService

router = APIRouter(prefix='/api/line', tags=['line'])


@router.post('/push')
def push_line(body: LinePushRequest):
    try:
        return LineService().push_message(
            line_user_id=body.line_user_id,
            message_type='manual_push',
            text=body.message,
            order_id=body.order_id,
            customer_id=body.customer_id,
        )
    except Exception as e:
        raise internal_error(e, 'line.push')
