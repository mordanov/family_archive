"""add downloads table

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "downloads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("username", sa.String(255), nullable=True),
        sa.Column("share_id", sa.BigInteger(), sa.ForeignKey("share_links.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("total_bytes", sa.BigInteger(), nullable=False),
        sa.Column("bytes_sent", sa.BigInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'active'"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("CREATE INDEX ix_downloads_status_updated ON downloads (status, updated_at DESC)")
    op.execute("CREATE INDEX ix_downloads_started_at ON downloads (started_at DESC)")


def downgrade() -> None:
    op.drop_table("downloads")
