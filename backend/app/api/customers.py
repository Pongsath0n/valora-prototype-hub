from fastapi import APIRouter
from ..core.supabase import get_supabase
from ..core.errors import internal_error
from ..repositories.customer_repo import CustomerRepo
from ..schemas.customer import UpsertLineCustomerRequest
from ..services.customer_service import CustomerService

router = APIRouter(prefix='/api/customers', tags=['customers'])


@router.post('/line')
def upsert_line_customer(body: UpsertLineCustomerRequest):
    try:
        service = CustomerService(CustomerRepo(get_supabase()))
        customer_id = service.upsert_line_customer(body.store_id, body.line_user_id, body.display_name, body.phone)
        return {'customer_id': customer_id}
    except Exception as e:
        raise internal_error(e, 'customers.upsert_line_customer')
