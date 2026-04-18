HDR = {"X-Requested-With": "fetch"}


async def _upload(client, name, body):
    init = await client.post(
        "/api/v1/uploads",
        json={"folder_id": 1, "filename": name, "size_bytes": len(body), "content_type": "application/octet-stream"},
        headers=HDR,
    )
    up = init.json()
    await client.put(f"/api/v1/uploads/{up['id']}/parts/1", content=body,
                     headers={**HDR, "Content-Type": "application/octet-stream"})
    done = await client.post(f"/api/v1/uploads/{up['id']}/complete", headers=HDR)
    return done.json()["file"]


async def test_rename_and_soft_delete(auth_client):
    f = await _upload(auth_client, "a.bin", b"hello")
    fid = f["id"]
    r = await auth_client.patch(f"/api/v1/files/{fid}", json={"name": "renamed.bin"}, headers=HDR)
    assert r.status_code == 200
    assert r.json()["name"] == "renamed.bin"
    r = await auth_client.delete(f"/api/v1/files/{fid}", headers=HDR)
    assert r.status_code == 204
    r = await auth_client.get(f"/api/v1/files/{fid}")
    assert r.status_code == 404


async def test_range_download(auth_client):
    body = b"0123456789" * 100  # 1000 bytes
    f = await _upload(auth_client, "range.bin", body)
    r = await auth_client.get(f"/api/v1/files/{f['id']}/raw", headers={"Range": "bytes=10-19"})
    assert r.status_code == 206
    assert r.content == body[10:20]
    assert r.headers["Content-Range"] == f"bytes 10-19/{len(body)}"

