HDR = {"X-Requested-With": "fetch"}


async def test_create_list_rename_delete_folder(auth_client):
    # Create
    r = await auth_client.post("/api/v1/folders", json={"parent_id": 1, "name": "Photos"}, headers=HDR)
    assert r.status_code == 201, r.text
    fid = r.json()["id"]

    # Duplicate name → conflict
    r2 = await auth_client.post("/api/v1/folders", json={"parent_id": 1, "name": "photos"}, headers=HDR)
    assert r2.status_code == 409

    # List children of root
    r = await auth_client.get("/api/v1/folders/1/children")
    assert any(f["id"] == fid for f in r.json()["folders"])

    # Rename
    r = await auth_client.patch(f"/api/v1/folders/{fid}", json={"name": "Pics"}, headers=HDR)
    assert r.status_code == 200
    assert r.json()["name"] == "Pics"

    # Delete (soft)
    r = await auth_client.delete(f"/api/v1/folders/{fid}", headers=HDR)
    assert r.status_code == 204

    # Now invisible
    r = await auth_client.get("/api/v1/folders/1/children")
    assert not any(f["id"] == fid for f in r.json()["folders"])


async def test_cannot_delete_root(auth_client):
    r = await auth_client.delete("/api/v1/folders/1", headers=HDR)
    assert r.status_code == 409

