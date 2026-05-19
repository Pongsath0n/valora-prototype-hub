from fastapi import APIRouter, HTTPException
from ..core.supabase import get_supabase
from ..repositories.order_repo import OrderRepo
from ..schemas.order import CreateOrderRequest, AddOrderItemRequest, PatchOrderStatusRequest
from ..services.order_service import OrderService

router = APIRouter(prefix='/api/orders', tags=['orders'])


@router.post('')
def create_order(body: CreateOrderRequest):
    try:
        return OrderService(OrderRepo(get_supabase())).create_order(body.store_id, body.customer_id, body.pickup_time, body.customer_note)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/{order_id}/items')
def add_order_item(order_id: str, body: AddOrderItemRequest):
    try:
        return OrderService(OrderRepo(get_supabase())).add_item(order_id, body.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/{order_id}')
def get_order(order_id: str):
    try:
        return OrderService(OrderRepo(get_supabase())).get_order(order_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch('/{order_id}/status')
def patch_order_status(order_id: str, body: PatchOrderStatusRequest):
    try:
        return OrderService(OrderRepo(get_supabase())).patch_status(order_id, body.order_status, body.cancelled_reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
