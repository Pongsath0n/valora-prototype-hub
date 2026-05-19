from pydantic import BaseModel


class UploadSlipRequest(BaseModel):
    order_id: str
    customer_id: str
    amount: float
    slip_url: str | None = None
    slip_file_name: str | None = None
    slip_storage_path: str | None = None


class ApprovePaymentRequest(BaseModel):
    confirmed_by: str | None = None


class RejectPaymentRequest(BaseModel):
    reject_reason: str
