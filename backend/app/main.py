from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.api.customer import router as customer_router
from app.api.line import router as line_router
from app.api.store_admin import router as store_admin_router

app = FastAPI(title="Valora Backend")

# Development CORS for local frontend (no real LINE/LIFF activation).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)
app.include_router(health_router)
app.include_router(line_router)
app.include_router(customer_router)
app.include_router(store_admin_router)


@app.get("/")
def root() -> JSONResponse:
    return JSONResponse(
        {
            "app": "Valora Backend",
            "status": "running",
            "docs": "/docs",
            "health": "/health",
        }
    )
