from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog


async def log(
    db: AsyncSession,
    *,
    user_id: int | None,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    extra: dict | None = None,
    ip: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            extra_data=extra,
            ip=ip,
        )
    )


async def recent(db: AsyncSession, limit: int = 100) -> list[AuditLog]:
    res = await db.execute(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit))
    return list(res.scalars())

