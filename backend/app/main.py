import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.health import router as health_router
from app.api.customer import router as customer_router
from app.api.line import router as line_router
from app.api.store_admin import router as store_admin_router

LOCAL_DEFAULT_ORIGINS = ["http://localhost:8080", "http://127.0.0.1:8080"]


def get_allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if not raw.strip():
        return LOCAL_DEFAULT_ORIGINS

    deduped: list[str] = []
    for item in raw.split(","):
        origin = item.strip()
        if not origin or origin == "*":
            continue
        if origin not in deduped:
            deduped.append(origin)

    return deduped or LOCAL_DEFAULT_ORIGINS


app = FastAPI(title="Valora Backend")

# CORS for local dev and configurable production origins (no real LINE/LIFF activation).
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
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
