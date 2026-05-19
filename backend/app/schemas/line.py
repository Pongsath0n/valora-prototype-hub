from pydantic import BaseModel


class LinePushRequest(BaseModel):
    store_id: str
    customer_id: str | None = None
    line_user_id: str
    message: str
    order_id: str | None = None
