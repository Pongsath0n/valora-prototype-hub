"""DEPRECATED ENTRYPOINT.

This module is intentionally disabled to prevent accidental usage of legacy
Phase 1 endpoints that were based on non-confirmed schema assumptions.

Use the structured backend entrypoint instead:
    uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
"""

raise RuntimeError(
    "backend_app.py is deprecated and disabled. "
    "Use 'backend.app.main:app' as the FastAPI entrypoint."
)
