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
    return (await client.post(f"/api/v1/uploads/{up['id']}/complete", headers=HDR)).json()["file"]


async def test_trash_lifecycle(auth_client):
    f = await _upload(auth_client, "trashme.bin", b"data")
    r = await auth_client.delete(f"/api/v1/files/{f['id']}", headers=HDR)
    assert r.status_code == 204

    trash = await auth_client.get("/api/v1/trash")
    assert any(x["id"] == f["id"] for x in trash.json()["files"])

    r = await auth_client.post(f"/api/v1/trash/files/{f['id']}/restore", headers=HDR)
    assert r.status_code == 200
    assert r.json()["id"] == f["id"]

    r = await auth_client.get(f"/api/v1/files/{f['id']}")
    assert r.status_code == 200

