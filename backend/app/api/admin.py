from fastapi import APIRouter, Query, HTTPException
from ..core.supabase import get_supabase
from ..repositories.order_repo import OrderRepo
from ..repositories.payment_repo import PaymentRepo
from ..services.order_service import OrderService
from ..services.payment_service import PaymentService

router = APIRouter(prefix='/api/admin', tags=['admin'])


@router.get('/orders')
def list_orders(
    store_id: str | None = Query(None),
    order_status: str | None = Query(None),
    payment_status: str | None = Query(None),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
):
    try:
        return OrderService(OrderRepo(get_supabase())).list_admin_orders(
            store_id=store_id,
            order_status=order_status,
            payment_status=payment_status,
            start_date=start_date,
            end_date=end_date,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/payments/pending')
def pending_payments(store_id: str | None = Query(None)):
    try:
        return PaymentService(PaymentRepo(get_supabase())).pending_for_admin(store_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
