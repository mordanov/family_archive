HDR = {"X-Requested-With": "fetch"}


async def _upload(client, name, body):
    init = await client.post(
        "/api/v1/uploads",
        json={"folder_id": 1, "filename": name, "size_bytes": len(body), "content_type": "text/plain"},
        headers=HDR,
    )
    up = init.json()
    await client.put(f"/api/v1/uploads/{up['id']}/parts/1", content=body,
                     headers={**HDR, "Content-Type": "application/octet-stream"})
    return (await client.post(f"/api/v1/uploads/{up['id']}/complete", headers=HDR)).json()["file"]


async def test_create_share_and_public_download(auth_client):
    f = await _upload(auth_client, "share.txt", b"hello world")
    r = await auth_client.post("/api/v1/shares", json={"target_type": "file", "file_id": f["id"]}, headers=HDR)
    assert r.status_code == 201
    token = r.json()["token"]

    # Public meta (no auth needed; httpx client still has session cookie but endpoint allows anonymous)
    meta = await auth_client.get(f"/api/v1/shares/{token}")
    assert meta.status_code == 200

    dl = await auth_client.get(f"/api/v1/shares/{token}/download")
    assert dl.status_code == 200
    assert dl.content == b"hello world"


async def test_password_protected_share(auth_client):
    f = await _upload(auth_client, "secret.txt", b"top")
    r = await auth_client.post(
        "/api/v1/shares",
        json={"target_type": "file", "file_id": f["id"], "password": "letmein"},
        headers=HDR,
    )
    token = r.json()["token"]

    bad = await auth_client.get(f"/api/v1/shares/{token}/download")
    assert bad.status_code == 403

    ok = await auth_client.get(
        f"/api/v1/shares/{token}/download", headers={"X-Share-Password": "letmein"}
    )
    assert ok.status_code == 200
    assert ok.content == b"top"

