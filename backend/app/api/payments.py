from fastapi import APIRouter, Depends
from ..core.security import get_admin_user
from ..core.supabase import get_supabase
from ..core.errors import bad_request, internal_error
from ..repositories.payment_repo import PaymentRepo
from ..schemas.payment import UploadSlipRequest, ApprovePaymentRequest, RejectPaymentRequest
from ..services.payment_service import PaymentService

router = APIRouter(prefix='/api/payments', tags=['payments'])


@router.post('/upload-slip')
def upload_slip(body: UploadSlipRequest):
    try:
        return PaymentService(PaymentRepo(get_supabase())).upload_slip(body.model_dump())
    except Exception as e:
        raise internal_error(e, 'payments.upload_slip')


@router.patch('/{payment_id}/approve')
def approve_payment(payment_id: str, body: ApprovePaymentRequest, admin_user_id: str | None = Depends(get_admin_user)):
    try:
        return PaymentService(PaymentRepo(get_supabase())).approve(payment_id, body.confirmed_by or admin_user_id)
    except ValueError:
        raise bad_request('invalid_payment_status', 'Invalid payment status.')
    except Exception as e:
        raise internal_error(e, 'payments.approve')


@router.patch('/{payment_id}/reject')
def reject_payment(payment_id: str, body: RejectPaymentRequest):
    try:
        return PaymentService(PaymentRepo(get_supabase())).reject(payment_id, body.reject_reason)
    except ValueError:
        raise bad_request('invalid_payment_status', 'Invalid payment status.')
    except Exception as e:
        raise internal_error(e, 'payments.reject')
