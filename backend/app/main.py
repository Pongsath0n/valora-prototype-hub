from fastapi import FastAPI
from .api import customers, menus, orders, payments, line, admin

app = FastAPI(title='Valora Phase 1 Backend', version='1.0.0')


@app.get('/health')
def health():
    return {'status': 'ok'}


app.include_router(customers.router)
app.include_router(menus.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(line.router)
app.include_router(admin.router)
