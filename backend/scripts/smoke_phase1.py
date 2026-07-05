"""
Phase 1 end-to-end smoke test — runs the FastAPI app in-process (httpx ASGI)
against a scratch Postgres (alembic upgrade head first; needs an EMPTY DB
so the JSONL import path triggers), exercising:

  1. Legacy JSONL import on first startup (orders + spools + comments)
  2. Auth: bootstrap super_admin, partner user, role-escalation guard
  3. Order lifecycle: patch status (history entry), assign partner,
     print attempt, comments, spool CRUD + alerts
  4. Partner scoping: /status, /orders/mine, by-partner 403, PATCH 403,
     admin endpoints 403 for partner token
  5. Restart persistence: fresh startup_load() → data comes back from PG
"""
import asyncio, json, os, sys, tempfile
from pathlib import Path

TMP = tempfile.mkdtemp(prefix="makerai-smoke-")
os.environ["MAKER_AI_DIR"] = TMP
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://postgres@127.0.0.1:5432/printdash_test")

# Safety: this test writes fixture orders and test user accounts into the
# target database. Refuse to run against anything that doesn't look like a
# scratch DB unless explicitly overridden.
if "test" not in os.environ["DATABASE_URL"] and os.environ.get("ALLOW_SMOKE") != "1":
    sys.exit("refusing to run: DATABASE_URL has no 'test' in it (set ALLOW_SMOKE=1 to override)")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Seed legacy JSONL fixtures BEFORE app import/startup
spec = os.path.join(TMP, "spec")
os.makedirs(spec, exist_ok=True)
orders = [
    {"id": "shopify-111", "name": "#1001 — Ganesha Idol", "status": "NEW",
     "shopify_order_id": 111, "material": "PLA", "total_inr": 1499.0,
     "customer_name": "Legacy Customer", "created_at": "2026-07-01T10:00:00+00:00",
     "history": [{"event": "shopify_webhook", "at": "2026-07-01T10:00:00+00:00"}]},
    {"id": "shopify-222", "name": "#1002 — Temple Model", "status": "PRINTING",
     "shopify_order_id": 222, "material": "PETG", "total_inr": 4999.0,
     "assigned_partner": "101", "assigned_partner_name": "3D Devine",
     "assigned_at": "2026-07-02T09:00:00+00:00",
     "customer_name": "Second Customer", "created_at": "2026-07-02T08:00:00+00:00"},
]
with open(os.path.join(spec, "orders.jsonl"), "w") as f:
    for o in orders:
        f.write(json.dumps(o) + "\n")
with open(os.path.join(spec, "spools.jsonl"), "w") as f:
    f.write(json.dumps({"id": "spool-1", "material": "PLA", "brand": "Bambu",
                        "color_name": "White", "total_g": 1000, "remaining_g": 40}) + "\n")
with open(os.path.join(spec, "comments.jsonl"), "w") as f:
    f.write(json.dumps({"id": "cmt-1", "order_id": "shopify-222", "text": "legacy comment",
                        "author_name": "admin", "created_at": "2026-07-02T10:00:00+00:00",
                        "read_by": []}) + "\n")
with open(os.path.join(spec, "printers.jsonl"), "w") as f:
    f.write(json.dumps({"id": "prn-1", "name": "A1-Bay1", "status": "idle",
                        "connection_type": "bambu", "host": "10.0.0.5",
                        "serial": "AC12", "access_code": "9999", "api_key": ""}) + "\n")

import httpx
from app.main import app
from app.services import farm_store

PASS, FAIL = 0, 0
def check(name, cond, extra=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  ok    {name}")
    else: FAIL += 1; print(f"  FAIL  {name}  {extra}")

async def main():
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:

            # ── 1. JSONL import happened ──
            r = await c.get("/api/v1/farm/status")
            data = r.json()
            check("JSONL orders imported", len(data["orders"]) == 2, str(len(data["orders"])))
            check("JSONL printer imported", len(data["printers"]) == 1)
            conn = farm_store.get_printer_connection("prn-1")
            check("printer connection secrets kept", conn and conn.get("access_code") == "9999")
            check("printer dict has no secrets", "access_code" not in data["printers"][0])
            inv = (await c.get("/api/v1/farm/inventory")).json()
            check("JSONL spool imported", len(inv) == 1)
            alerts = (await c.get("/api/v1/farm/inventory/alerts")).json()
            check("critical spool alert (40g)", alerts["summary"]["critical"] == 1)
            cm = (await c.get("/api/v1/farm/orders/shopify-222/comments")).json()
            check("JSONL comment imported", cm["count"] == 1)

            # ── 2. Auth ──
            r = await c.get("/api/v1/auth/bootstrap-needed")
            check("bootstrap-needed true on empty users", r.json().get("needed") is True, r.text)
            r = await c.post("/api/v1/auth/register", json={
                "name": "HQ Admin", "email": "admin@fofus.in",
                "password": "adminpass123", "role": "super_admin"})
            check("bootstrap super_admin (first user)", r.status_code == 201, r.text)
            admin_tok = r.json().get("access_token")
            r = await c.post("/api/v1/auth/register", json={
                "name": "Evil", "email": "evil@x.com",
                "password": "evilpass1234", "role": "super_admin"})
            check("role escalation blocked for anon", r.status_code == 403, r.text)
            r = await c.post("/api/v1/auth/register", json={
                "name": "3D Devine Tech", "email": "tech@3ddevine.in",
                "password": "partnerpass1", "partner_id": "101", "role": "partner"})
            check("partner registration", r.status_code == 201, r.text)
            partner_tok = r.json().get("access_token")
            A = {"Authorization": f"Bearer {admin_tok}"}
            P = {"Authorization": f"Bearer {partner_tok}"}
            r = await c.get("/api/v1/auth/me", headers=P)
            check("login/me works (DB-backed)", r.json().get("partner_id") == "101", r.text)

            r = await c.get("/api/v1/auth/bootstrap-needed")
            check("bootstrap-needed false once users exist", r.json().get("needed") is False, r.text)

            # ── 2b. Admin user management (/api/v1/admin/users) ──
            r = await c.get("/api/v1/admin/users")
            check("admin/users anonymous → 401", r.status_code == 401, str(r.status_code))
            r = await c.get("/api/v1/admin/users", headers=P)
            check("admin/users partner token → 403", r.status_code == 403, str(r.status_code))
            r = await c.get("/api/v1/admin/users", headers=A)
            check("admin/users list", r.status_code == 200 and len(r.json()["users"]) == 2, r.text)
            r = await c.post("/api/v1/admin/users", headers=A, json={
                "name": "Floor Tech", "email": "floor@3ddevine.in",
                "password": "floorpass123", "role": "technician", "partner_id": "101"})
            check("admin creates technician", r.status_code == 201, r.text)
            r = await c.post("/api/v1/auth/login", json={
                "email": "floor@3ddevine.in", "password": "floorpass123"})
            check("created technician can log in", r.status_code == 200, r.text)
            r = await c.delete("/api/v1/admin/users/floor@3ddevine.in", headers=A)
            check("admin deactivates user", r.status_code == 200 and r.json().get("active") is False, r.text)
            r = await c.post("/api/v1/auth/login", json={
                "email": "floor@3ddevine.in", "password": "floorpass123"})
            check("deactivated user login → 403", r.status_code == 403, r.text)
            r = await c.delete("/api/v1/admin/users/admin@fofus.in", headers=A)
            check("self-deactivation blocked", r.status_code == 400, r.text)

            # ── 3. Lifecycle ──
            r = await c.patch("/api/v1/farm/orders/shopify-111",
                              json={"status": "AI_PREP"}, headers=A)
            check("admin PATCH status", r.json().get("status") == "AI_PREP", r.text)
            check("history entry appended",
                  any(h.get("event") == "status_change" and h.get("to") == "AI_PREP"
                      for h in r.json().get("history", [])))
            r = await c.post("/api/v1/farm/orders/shopify-111/assign-partner",
                             json={"partner_id": "101", "partner_name": "3D Devine"}, headers=A)
            check("admin assign-partner", r.json().get("assigned_partner") == "101", r.text)
            r = await c.post("/api/v1/farm/orders/shopify-111/print-attempt",
                             json={"status": "failed", "error_text": "spaghetti"}, headers=P)
            check("partner print-attempt on own order", r.json().get("ok") is True, r.text)
            r = await c.post("/api/v1/farm/orders/shopify-111/comments",
                             json={"text": "starting reprint"}, headers=P)
            check("partner comment", r.json().get("ok") is True, r.text)
            r = await c.post("/api/v1/farm/inventory", json={"material": "PETG", "total_g": 1000})
            spool_id = r.json().get("id")
            check("add spool", bool(spool_id), r.text)
            r = await c.put(f"/api/v1/farm/inventory/{spool_id}", json={"remaining_g": 150})
            check("update spool", r.json().get("remaining_g") == 150, r.text)
            r = await c.get("/api/v1/farm/analytics", headers=A)
            an = r.json()
            check("analytics computes", an.get("total_orders") == 2 and "sales" in an, r.text)
            r = await c.patch("/api/v1/farm/orders/shopify-111",
                              json={"status": "DISPATCH"}, headers=A)
            check("DISPATCH triggers shopify auto-push dry-run",
                  any(h.get("event") == "shopify_auto_push" and h.get("result") == "dry_run"
                      for h in r.json().get("history", [])), r.text)

            # ── 4. Scoping ──
            r = await c.get("/api/v1/farm/status", headers=P)
            check("partner /status scoped to own orders",
                  all(o.get("assigned_partner") == "101" for o in r.json()["orders"]))
            r = await c.get("/api/v1/farm/status")
            check("anonymous /status unscoped (legacy)", len(r.json()["orders"]) == 2)
            r = await c.get("/api/v1/farm/orders/mine", headers=P)
            check("/orders/mine partner", r.json().get("partner_id") == "101", r.text)
            r = await c.get("/api/v1/farm/orders/by-partner/999", headers=P)
            check("by-partner other partner → 403", r.status_code == 403, r.text)
            r = await c.get("/api/v1/farm/partners", headers=P)
            check("partner token on admin endpoint → 403", r.status_code == 403, r.text)
            r = await c.get("/api/v1/farm/partners", headers=A)
            check("admin /partners works", r.status_code == 200 and "partners" in r.json(), r.text)
            # unassign shopify-222 from partner 101? it IS partner 101's. Make partner try to PATCH a foreign order:
            r = await c.post("/api/v1/farm/orders/shopify-222/unassign", json={}, headers=A)
            check("admin unassign", r.status_code == 200 and "error" not in r.json(), r.text)
            r = await c.patch("/api/v1/farm/orders/shopify-222",
                              json={"status": "PACK"}, headers=P)
            check("partner PATCH foreign order → 403", r.status_code == 403, r.text)
            r = await c.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})
            check("bad token → 401", r.status_code == 401)

            # cleanup-test-data admin gate
            r = await c.post("/api/v1/farm/admin/cleanup-test-data?dry_run=true", headers=P)
            check("cleanup-test-data partner → 403", r.status_code == 403, r.text)
            r = await c.post("/api/v1/farm/admin/cleanup-test-data?dry_run=true", headers=A)
            check("cleanup-test-data dry-run admin", r.json().get("ok") is True, r.text)

    # ── 5. Restart persistence: wipe caches, delete JSONL, reload from DB ──
    for fn in ("orders.jsonl", "spools.jsonl", "comments.jsonl", "printers.jsonl"):
        os.unlink(os.path.join(spec, fn))
    farm_store._orders = []
    farm_store._printers = []
    farm_store._inventory = []
    farm_store._comments = []
    await farm_store.startup_load()
    o = farm_store.get_order("shopify-111")
    check("restart: order back from PG", o is not None and o.get("status") == "DISPATCH",
          str(o and o.get("status")))
    check("restart: history survived", o and any(h.get("event") == "shopify_auto_push"
                                                 for h in o.get("history", [])))
    check("restart: print_history survived", o and len(o.get("print_history", [])) == 1)
    check("restart: spools back", len(farm_store.get_inventory()) == 2)
    check("restart: printer + connection back",
          farm_store.get_printer_connection("prn-1").get("access_code") == "9999")
    check("restart: comments back", len(farm_store.list_comments("shopify-111")) == 1)

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(1 if FAIL else 0)

asyncio.run(main())
