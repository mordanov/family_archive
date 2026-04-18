"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])

    op.create_table(
        "folders",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("parent_id", sa.BigInteger(), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_folders_parent_name_active "
        "ON folders (parent_id, lower(name)) WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX ix_folders_parent_active "
        "ON folders (parent_id) WHERE deleted_at IS NULL"
    )
    op.create_index("ix_folders_deleted_at", "folders", ["deleted_at"])

    op.create_table(
        "files",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column(
            "uuid",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            unique=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("folder_id", sa.BigInteger(), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("content_type", sa.String(255), nullable=False),
        sa.Column("sha256", sa.LargeBinary(), nullable=True),
        sa.Column("s3_key", sa.Text(), nullable=False),
        sa.Column("has_thumbnail", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("has_poster", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("audio_meta", postgresql.JSONB(), nullable=True),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_files_folder_name_active "
        "ON files (folder_id, lower(name)) WHERE deleted_at IS NULL"
    )
    op.execute(
        "CREATE INDEX ix_files_folder_active "
        "ON files (folder_id) WHERE deleted_at IS NULL"
    )
    op.create_index("ix_files_deleted_at", "files", ["deleted_at"])
    op.execute("CREATE INDEX ix_files_created_at ON files (created_at DESC)")

    op.create_table(
        "tags",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(64), nullable=False, unique=True),
        sa.Column("color", sa.String(16), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)

    op.create_table(
        "file_tags",
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", sa.BigInteger(), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_file_tags_tag", "file_tags", ["tag_id"])

    op.create_table(
        "uploads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", sa.BigInteger(), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("content_type", sa.String(255), nullable=False),
        sa.Column("chunk_size", sa.Integer(), nullable=False),
        sa.Column("total_parts", sa.Integer(), nullable=False),
        sa.Column("s3_key", sa.Text(), nullable=False),
        sa.Column("s3_upload_id", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default=sa.text("'init'")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_uploads_user_status", "uploads", ["user_id", "status"])
    op.create_index("ix_uploads_created_at", "uploads", ["created_at"])

    op.create_table(
        "upload_parts",
        sa.Column("upload_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("uploads.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("part_number", sa.Integer(), primary_key=True),
        sa.Column("etag", sa.String(128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "share_links",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("token", sa.String(128), nullable=False, unique=True),
        sa.Column("target_type", sa.String(16), nullable=False),
        sa.Column("file_id", sa.BigInteger(), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=True),
        sa.Column("folder_id", sa.BigInteger(), sa.ForeignKey("folders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("max_downloads", sa.Integer(), nullable=True),
        sa.Column("download_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_by", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(file_id IS NOT NULL)::int + (folder_id IS NOT NULL)::int = 1",
            name="ck_share_target_xor",
        ),
    )
    op.execute(
        "CREATE INDEX ix_share_token_active ON share_links (token) WHERE revoked_at IS NULL"
    )

    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("entity_type", sa.String(32), nullable=True),
        sa.Column("entity_id", sa.BigInteger(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_created_at", "audit_log", ["created_at"])
    op.execute("CREATE INDEX ix_audit_user_created ON audit_log (user_id, created_at DESC)")

    # Seed root folder (id will be 1 from BIGSERIAL).
    op.execute("INSERT INTO folders (name) VALUES ('') RETURNING id")


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_table("share_links")
    op.drop_table("upload_parts")
    op.drop_table("uploads")
    op.drop_table("file_tags")
    op.drop_table("tags")
    op.drop_table("files")
    op.drop_table("folders")
    op.drop_table("sessions")
    op.drop_table("users")

