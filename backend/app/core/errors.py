import logging
from fastapi import HTTPException

logger = logging.getLogger("valora.api")


def internal_error(exc: Exception, context: str = "") -> HTTPException:
    logger.exception("Unhandled error in %s", context or "unknown", exc_info=exc)
    return HTTPException(
        status_code=500,
        detail={
            "error": "internal_server_error",
            "message": "Something went wrong. Please try again.",
        },
    )


def bad_request(error: str, message: str) -> HTTPException:
    return HTTPException(status_code=400, detail={"error": error, "message": message})


def not_found(error: str, message: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"error": error, "message": message})


def conflict(error: str, message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"error": error, "message": message})
