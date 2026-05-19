from fastapi import APIRouter, HTTPException, Depends
from ..core.security import get_admin_user
from ..core.supabase import get_supabase
from ..repositories.payment_repo import PaymentRepo
from ..schemas.payment import UploadSlipRequest, ApprovePaymentRequest, RejectPaymentRequest
from ..services.payment_service import PaymentService

router = APIRouter(prefix='/api/payments', tags=['payments'])


@router.post('/upload-slip')
def upload_slip(body: UploadSlipRequest):
    try:
        return PaymentService(PaymentRepo(get_supabase())).upload_slip(body.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch('/{payment_id}/approve')
def approve_payment(payment_id: str, body: ApprovePaymentRequest, admin_user_id: str | None = Depends(get_admin_user)):
    try:
        return PaymentService(PaymentRepo(get_supabase())).approve(payment_id, body.confirmed_by or admin_user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch('/{payment_id}/reject')
def reject_payment(payment_id: str, body: RejectPaymentRequest):
    try:
        return PaymentService(PaymentRepo(get_supabase())).reject(payment_id, body.reject_reason)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
