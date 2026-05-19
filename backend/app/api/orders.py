from fastapi import APIRouter
from ..core.supabase import get_supabase
from ..core.errors import bad_request, internal_error, not_found
from ..repositories.order_repo import OrderRepo
from ..schemas.order import CreateOrderRequest, AddOrderItemRequest, PatchOrderStatusRequest
from ..services.order_service import OrderService

router = APIRouter(prefix='/api/orders', tags=['orders'])


@router.post('')
def create_order(body: CreateOrderRequest):
    try:
        return OrderService(OrderRepo(get_supabase())).create_order(body.store_id, body.customer_id, body.pickup_time, body.customer_note)
    except Exception as e:
        raise internal_error(e, 'orders.create_order')


@router.post('/{order_id}/items')
def add_order_item(order_id: str, body: AddOrderItemRequest):
    try:
        return OrderService(OrderRepo(get_supabase())).add_item(order_id, body.model_dump())
    except Exception as e:
        raise internal_error(e, 'orders.add_item')


@router.get('/{order_id}')
def get_order(order_id: str):
    try:
        row = OrderService(OrderRepo(get_supabase())).get_order(order_id)
        if not row:
            raise not_found('order_not_found', 'Order not found.')
        return row
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise
        raise internal_error(e, 'orders.get_order')


@router.patch('/{order_id}/status')
def patch_order_status(order_id: str, body: PatchOrderStatusRequest):
    try:
        return OrderService(OrderRepo(get_supabase())).patch_status(order_id, body.order_status, body.cancelled_reason)
    except ValueError:
        raise bad_request('invalid_order_status', 'Invalid order status.')
    except Exception as e:
        raise internal_error(e, 'orders.patch_status')
