from fastapi import APIRouter

router = APIRouter()


@router.get("/healthz")
async def healthz():
    return {"status": "ok"}


@router.get("/readyz")
async def readyz():
    # Optional: ping DB / S3 lightly. Kept simple.
    return {"status": "ready"}

