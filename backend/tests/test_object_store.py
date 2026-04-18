"""Object store unit test against moto."""
import pytest


pytestmark = pytest.mark.usefixtures("s3_mock")


async def test_put_get_delete():
    from app.storage.object_store import object_store
    await object_store.put_object("test/key.txt", b"hello", "text/plain")
    meta = await object_store.head_object("test/key.txt")
    assert meta is not None and meta.size == 5
    iterator, _ = await object_store.get_object_stream("test/key.txt")
    chunks = []
    async for c in iterator:
        chunks.append(c)
    assert b"".join(chunks) == b"hello"
    await object_store.delete_object("test/key.txt")
    assert await object_store.head_object("test/key.txt") is None


async def test_range_read():
    from app.storage.object_store import object_store
    await object_store.put_object("test/ranged.bin", b"0123456789", "application/octet-stream")
    data = await object_store.get_range_bytes("test/ranged.bin", 2, 4)
    assert data == b"234"

