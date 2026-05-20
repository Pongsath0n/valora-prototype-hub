from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api.health import router as health_router

app = FastAPI(title="Valora Backend")
app.include_router(health_router)


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
