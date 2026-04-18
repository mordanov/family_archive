"""Browse a real ZIP via the HTTP API."""
import io
import zipfile

HDR = {"X-Requested-With": "fetch"}


def _make_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("hello.txt", b"hello!\n")
        zf.writestr("nested/world.txt", b"world\n" * 10)
    return buf.getvalue()


async def _upload(client, name, body, ctype="application/zip"):
    init = await client.post(
        "/api/v1/uploads",
        json={"folder_id": 1, "filename": name, "size_bytes": len(body), "content_type": ctype},
        headers=HDR,
    )
    up = init.json()
    await client.put(f"/api/v1/uploads/{up['id']}/parts/1", content=body,
                     headers={**HDR, "Content-Type": "application/octet-stream"})
    return (await client.post(f"/api/v1/uploads/{up['id']}/complete", headers=HDR)).json()["file"]


async def test_zip_entries_and_entry(auth_client):
    blob = _make_zip()
    f = await _upload(auth_client, "archive.zip", blob)
    entries = (await auth_client.get(f"/api/v1/files/{f['id']}/zip/entries")).json()
    paths = {e["path"] for e in entries}
    assert {"hello.txt", "nested/world.txt"}.issubset(paths)

    r = await auth_client.get(f"/api/v1/files/{f['id']}/zip/entry", params={"path": "hello.txt"})
    assert r.status_code == 200
    assert r.content == b"hello!\n"

