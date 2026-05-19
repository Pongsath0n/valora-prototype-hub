from pydantic import BaseModel


class MenuItemOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    image_url: str | None = None
    base_price: float
    is_special: bool
    category: str | None = None
