from pydantic import BaseModel


class UpsertLineCustomerRequest(BaseModel):
    store_id: str
    line_user_id: str
    display_name: str
    phone: str | None = None


class UpsertLineCustomerResponse(BaseModel):
    customer_id: str
