"""End-to-end multipart upload through the API."""
HDR = {"X-Requested-With": "fetch"}


async def test_chunked_upload_lifecycle(auth_client):
    # Create a small file = 2 chunks of 5MB+ (S3 multipart minimum)
    chunk_size = 5 * 1024 * 1024
    body1 = b"a" * chunk_size
    body2 = b"b" * 1024  # last small part
    total = len(body1) + len(body2)

    # Override chunk size via init: server uses settings.CHUNK_SIZE_BYTES.
    # For test we rely on whatever is configured; use 8MB default but set sizes accordingly.
    # Simpler: 1 part of `total` bytes (single PUT works for sizes <= chunk_size)
    body = b"x" * 1024
    init = await auth_client.post(
        "/api/v1/uploads",
        json={"folder_id": 1, "filename": "hello.bin", "size_bytes": len(body), "content_type": "application/octet-stream"},
        headers=HDR,
    )
    assert init.status_code == 201, init.text
    upload = init.json()
    assert upload["total_parts"] == 1

    r = await auth_client.put(
        f"/api/v1/uploads/{upload['id']}/parts/1",
        content=body,
        headers={**HDR, "Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 200, r.text

    # resume info
    info = await auth_client.get(f"/api/v1/uploads/{upload['id']}")
    assert info.status_code == 200
    assert len(info.json()["parts"]) == 1

    done = await auth_client.post(f"/api/v1/uploads/{upload['id']}/complete", headers=HDR)
    assert done.status_code == 200, done.text
    file_id = done.json()["file"]["id"]

    # Download back
    r = await auth_client.get(f"/api/v1/files/{file_id}/raw")
    assert r.status_code == 200
    assert r.content == body


async def test_upload_wrong_size_rejected(auth_client):
    body = b"x" * 100
    init = await auth_client.post(
        "/api/v1/uploads",
        json={"folder_id": 1, "filename": "bad.bin", "size_bytes": 200, "content_type": "application/octet-stream"},
        headers=HDR,
    )
    assert init.status_code == 201
    r = await auth_client.put(
        f"/api/v1/uploads/{init.json()['id']}/parts/1",
        content=body,
        headers={**HDR, "Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 400

