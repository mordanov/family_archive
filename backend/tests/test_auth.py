async def test_login_logout(client):
    r = await client.post("/api/v1/auth/login", json={"username": "tester", "password": "testpass"},
                          headers={"X-Requested-With": "fetch"})
    assert r.status_code == 204
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "tester"
    out = await client.post("/api/v1/auth/logout", headers={"X-Requested-With": "fetch"})
    assert out.status_code == 204


async def test_login_bad_password(client):
    r = await client.post("/api/v1/auth/login", json={"username": "tester", "password": "wrong"},
                          headers={"X-Requested-With": "fetch"})
    assert r.status_code == 401


async def test_csrf_required(client):
    r = await client.post("/api/v1/auth/login", json={"username": "tester", "password": "testpass"})
    assert r.status_code == 403


async def test_unauthenticated(client):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401

