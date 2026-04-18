"""Domain errors mapped to HTTP responses."""
from __future__ import annotations

from fastapi import HTTPException, status


class AppError(HTTPException):
    code = "app_error"

    def __init__(self, detail: str, status_code: int = 400):
        super().__init__(status_code=status_code, detail={"code": self.code, "message": detail})


class NotFound(AppError):
    code = "not_found"
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(detail, status.HTTP_404_NOT_FOUND)


class Conflict(AppError):
    code = "conflict"
    def __init__(self, detail: str = "Conflict"):
        super().__init__(detail, status.HTTP_409_CONFLICT)


class BadRequest(AppError):
    code = "bad_request"
    def __init__(self, detail: str = "Bad request"):
        super().__init__(detail, status.HTTP_400_BAD_REQUEST)


class Unauthorized(AppError):
    code = "unauthorized"
    def __init__(self, detail: str = "Unauthorized"):
        super().__init__(detail, status.HTTP_401_UNAUTHORIZED)


class Forbidden(AppError):
    code = "forbidden"
    def __init__(self, detail: str = "Forbidden"):
        super().__init__(detail, status.HTTP_403_FORBIDDEN)


class TooLarge(AppError):
    code = "payload_too_large"
    def __init__(self, detail: str = "Payload too large"):
        super().__init__(detail, status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)


class RangeNotSatisfiable(AppError):
    code = "range_not_satisfiable"
    def __init__(self, detail: str = "Range not satisfiable"):
        super().__init__(detail, status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE)


class TooManyRequests(AppError):
    code = "too_many_requests"
    def __init__(self, detail: str = "Too many requests"):
        super().__init__(detail, status.HTTP_429_TOO_MANY_REQUESTS)

