import uuid
from datetime import timedelta
from unittest.mock import AsyncMock, patch

from app.core.time import utcnow
from app.models import Download
from app.services import download_service

HDR = {"X-Requested-With": "fetch"}


def test_to_item_out_computes_progress_and_speed():
    now = utcnow()
    d = Download(
        id=uuid.uuid4(),
        file_id=10,
        filename="archive.zip",
        source="direct",
        user_id=1,
        username="tester",
        share_id=None,
        ip="127.0.0.1",
        total_bytes=1000,
        bytes_sent=250,
        status="active",
        started_at=now - timedelta(seconds=2),
        updated_at=now,
        finished_at=None,
    )
    out = download_service.to_item_out(d)
    assert out.progress_pct == 25.0
    assert out.speed_bps > 0
    assert out.filename == "archive.zip"


async def test_track_stream_updates_and_completes():
    created_id = uuid.uuid4()
    events: list[tuple] = []

    class DummySession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def commit(self):
            events.append(("commit",))

    async def fake_create(db, **kwargs):
        events.append(("create", kwargs["filename"], kwargs["total_bytes"]))
        row = Download(id=created_id, **kwargs)
        return row

    async def fake_update(db, download_id, bytes_sent):
        events.append(("update", download_id, bytes_sent))

    async def fake_finish(db, download_id, bytes_sent, status):
        events.append(("finish", download_id, bytes_sent, status))

    async def raw_chunks():
        yield b"x" * (600 * 1024)
        yield b"y" * (400 * 1024)

    with (
        patch.object(download_service.db_session, "AsyncSessionLocal", side_effect=DummySession),
        patch.object(download_service.downloads_repo, "create", side_effect=fake_create),
        patch.object(download_service.downloads_repo, "update_progress", side_effect=fake_update),
        patch.object(download_service.downloads_repo, "finish", side_effect=fake_finish),
    ):
        stream = await download_service.track_stream(
            raw_chunks(),
            file_id=5,
            filename="video.mp4",
            source="share",
            total_bytes=1000 * 1024,
            share_id=3,
            ip="10.0.0.1",
        )
        received = bytearray()
        async for chunk in stream:
            received.extend(chunk)

    assert len(received) == 1000 * 1024
    assert ("create", "video.mp4", 1000 * 1024) in events
    assert ("update", created_id, 600 * 1024) in events
    assert ("finish", created_id, 1000 * 1024, "completed") in events


async def _upload(client, name: str, body: bytes):
    init = await client.post(
        "/api/v1/uploads",
        json={"folder_id": 1, "filename": name, "size_bytes": len(body), "content_type": "text/plain"},
        headers=HDR,
    )
    up = init.json()["upload"]
    await client.put(
        f"/api/v1/uploads/{up['id']}/parts/1",
        content=body,
        headers={**HDR, "Content-Type": "application/octet-stream"},
    )
    return (await client.post(f"/api/v1/uploads/{up['id']}/complete", headers=HDR)).json()["file"]


async def test_direct_and_share_downloads_recorded(auth_client):
    f = await _upload(auth_client, "movie.bin", b"0123456789" * 100)

    dl = await auth_client.get(f"/api/v1/files/{f['id']}/download")
    assert dl.status_code == 200
    assert len(dl.content) == 1000

    sh = await auth_client.post("/api/v1/shares", json={"target_type": "file", "file_id": f["id"]}, headers=HDR)
    token = sh.json()["token"]
    sdl = await auth_client.get(f"/api/v1/shares/{token}/download")
    assert sdl.status_code == 200

    res = await auth_client.get("/api/v1/downloads")
    assert res.status_code == 200
    data = res.json()
    assert data["active"] == []
    sources = [h["source"] for h in data["history"] if h["filename"] == "movie.bin"]
    assert "direct" in sources and "share" in sources
    for h in data["history"]:
        if h["filename"] == "movie.bin":
            assert h["status"] == "completed"
            assert h["bytes_sent"] == 1000
            assert h["total_bytes"] == 1000
            assert h["progress_pct"] == 100.0
