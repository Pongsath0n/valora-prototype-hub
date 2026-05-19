from pydantic import BaseModel
from typing import Any


class CreateOrderRequest(BaseModel):
    store_id: str
    customer_id: str
    pickup_time: str | None = None
    customer_note: str | None = None


class AddOrderItemRequest(BaseModel):
    product_id: str | None = None
    product_name_snapshot: str
    quantity: int
    unit_price: float
    unit_cost: float
    options: dict[str, Any] | None = None
    note: str | None = None


class PatchOrderStatusRequest(BaseModel):
    order_status: str
    cancelled_reason: str | None = None
