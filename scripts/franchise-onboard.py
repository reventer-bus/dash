#!/usr/bin/env python3
"""
FOFUS Franchise Onboarding Script
===================================
Creates a complete franchise setup across:
  1. PrintDash backend (Partner record + franchise_admin user)
  2. Bambuddy (Franchise group with scoped permissions)
  3. Bridge mapping (printer ID mapping for the bridge script)

Usage:
  python3 franchise-onboard.py --name "3D Devine" --slug 3ddevine --id 101 \\
    --email admin@3ddevine.com --city Thrissur

  python3 franchise-onboard.py --list  # list all franchises
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

PRINTDASH_BASE = os.environ.get("PRINTDASH_BASE", "http://localhost:4322")
BAMBUDDY_BASE = os.environ.get("BAMBUDDY_BASE", "http://localhost:8000")
BRIDGE_CONFIG = Path("/home/reventer/dash/scripts/franchise-printer-map.json")

# ─── Bambuddy Permission Sets ───────────────────────────────────────

FRANCHISE_OPS_PERMS = [
    "printers:read", "printers:control", "printers:files",
    "queue:create", "queue:read_own", "queue:update_own", "queue:delete_own",
    "library:upload", "library:read_own", "library:update_own", "library:delete_own",
    "archives:read_own", "archives:create", "archives:update_own",
    "filaments:read", "inventory:read", "inventory:create", "inventory:update",
    "maintenance:read",
    "projects:read",
    "camera:view",
    "notifications:read",
    "websocket:connect",
    "stats:read",
    "system:read",
]

FRANCHISE_VIEWER_PERMS = [
    "printers:read", "queue:read_own", "library:read_own",
    "archives:read_own", "filaments:read", "inventory:read",
    "maintenance:read", "projects:read", "notifications:read",
    "websocket:connect", "stats:read", "system:read",
]


def api_call(base, method, path, data=None, timeout=10):
    """Make an API call and return (result, status_code)."""
    url = f"{base}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/json"},
        method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        try:
            return json.loads(err_body), e.code
        except json.JSONDecodeError:
            return {"error": err_body}, e.code
    except Exception as e:
        return {"error": str(e)}, 0


def create_franchise(name, slug, franchise_id, email, city):
    """Create a franchise across PrintDash + Bambuddy."""
    print(f"\n{'='*60}")
    print(f"  Onboarding Franchise: {name}")
    print(f"  ID: {franchise_id} | Slug: {slug} | City: {city}")
    print(f"  Admin Email: {email}")
    print(f"{'='*60}")

    results = {"printdash": {}, "bambuddy": {}, "bridge": {}}

    # ─── 1. PrintDash: Create Partner ────────────────────────────────
    print("\n[1/4] PrintDash — Creating Partner record...")
    # Partner is created implicitly when a user registers with a new partner_id
    # For now, we note the partner ID — it gets created on first user registration
    pd_partner, pd_status = api_call(
        PRINTDASH_BASE, "GET", f"/api/v1/partners/{franchise_id}"
    )
    if pd_status == 200:
        print(f"  ✅ Partner {franchise_id} already exists")
        results["printdash"]["partner"] = "exists"
    else:
        print(f"  ⚠️  Partner {franchise_id} not found — will be created on first user registration")
        results["printdash"]["partner"] = "pending"
    
    # Note: Creating the franchise_admin user requires auth (JWT from super_admin)
    # This is a manual step — the onboarding script records the intent
    results["printdash"]["franchise_admin_email"] = email
    results["printdash"]["franchise_id"] = franchise_id
    print(f"  📝 Create franchise_admin user via: POST /api/v1/admin/users")
    print(f"     email={email}, role=franchise_admin, partner_id={franchise_id}")

    # ─── 2. Bambuddy: Create Franchise Groups ────────────────────────
    print("\n[2/4] Bambuddy — Creating franchise groups...")
    
    ops_group_name = f"Franchise-{franchise_id}-{slug.title()}-Ops"
    viewer_group_name = f"Franchise-{franchise_id}-{slug.title()}-Viewer"
    
    # Check if already exists
    bb_groups, _ = api_call(BAMBUDDY_BASE, "GET", "/api/v1/groups/")
    existing_names = {g.get("name") for g in bb_groups} if bb_groups else set()
    
    for group_name, perms, desc in [
        (ops_group_name, FRANCHISE_OPS_PERMS, f"{name} {city} — operator access"),
        (viewer_group_name, FRANCHISE_VIEWER_PERMS, f"{name} {city} — read-only viewer"),
    ]:
        if group_name in existing_names:
            print(f"  ✅ Group already exists: {group_name}")
            results["bambuddy"][group_name] = "exists"
        else:
            result, status = api_call(
                BAMBUDDY_BASE, "POST", "/api/v1/groups/",
                {"name": group_name, "description": desc, "permissions": perms}
            )
            if status in (200, 201):
                print(f"  ✅ Created group: {group_name} (ID={result.get('id')}, {len(perms)} perms)")
                results["bambuddy"][group_name] = result.get("id")
            else:
                print(f"  ❌ Failed to create group: {group_name} — {result}")
                results["bambuddy"][group_name] = f"error: {result}"

    # ─── 3. Bambuddy: Create API Key for Franchise ───────────────────
    print("\n[3/4] Bambuddy — Creating franchise API key...")
    api_key_data = {"name": f"Franchise-{franchise_id}-{slug}", "group_id": results["bambuddy"].get(ops_group_name)}
    # Check if API key endpoint exists
    api_key_result, api_key_status = api_call(
        BAMBUDDY_BASE, "POST", "/api/v1/api-keys/", api_key_data
    )
    if api_key_status in (200, 201):
        key = api_key_result.get("key", api_key_result.get("api_key", ""))
        print(f"  ✅ API key created (ID={api_key_result.get('id')})")
        print(f"     Key: {key[:20]}..." if key else "     Key: (check Bambuddy UI)")
        results["bambuddy"]["api_key"] = key
    else:
        print(f"  ⚠️  API key creation: {api_key_result} (status={api_key_status})")
        print(f"     Create manually in Bambuddy UI → Settings → API Keys")
        results["bambuddy"]["api_key"] = "manual"

    # ─── 4. Bridge: Update Printer Mapping ───────────────────────────
    print("\n[4/4] Bridge — Updating printer mapping...")
    
    # Load existing mapping or create new
    if BRIDGE_CONFIG.exists():
        mapping = json.loads(BRIDGE_CONFIG.read_text())
    else:
        mapping = {"franchises": {}}
    
    mapping["franchises"][franchise_id] = {
        "name": name,
        "slug": slug,
        "city": city,
        "printdash_partner_id": franchise_id,
        "bambuddy_ops_group": ops_group_name,
        "bambuddy_viewer_group": viewer_group_name,
        "printer_map": {},  # Fill in when printers are registered
        "created_at": str(__import__("datetime").datetime.now()),
    }
    
    BRIDGE_CONFIG.parent.mkdir(parents=True, exist_ok=True)
    BRIDGE_CONFIG.write_text(json.dumps(mapping, indent=2))
    print(f"  ✅ Printer mapping saved: {BRIDGE_CONFIG}")
    results["bridge"]["config"] = str(BRIDGE_CONFIG)

    # ─── Summary ─────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"  ✅ Franchise Onboarded: {name}")
    print(f"{'='*60}")
    print(f"  PrintDash Partner ID: {franchise_id}")
    print(f"  Bambuddy Ops Group: {ops_group_name}")
    print(f"  Bambuddy Viewer Group: {viewer_group_name}")
    print(f"  Bridge Config: {BRIDGE_CONFIG}")
    print(f"\n  Next Steps:")
    print(f"    1. Create franchise_admin user in PrintDash (requires super_admin JWT)")
    print(f"    2. Create Bambuddy user for franchisee (assign to ops group)")
    print(f"    3. Register franchise printers in Bambuddy")
    print(f"    4. Update printer_map in {BRIDGE_CONFIG}")
    print(f"    5. Set up Vercel domain: {franchise_id}-{slug}.platform.fofus.in")
    
    return results


def list_franchises():
    """List all configured franchises."""
    if not BRIDGE_CONFIG.exists():
        print("No franchises configured yet.")
        return
    
    mapping = json.loads(BRIDGE_CONFIG.read_text())
    franchises = mapping.get("franchises", {})
    
    if not franchises:
        print("No franchises configured yet.")
        return
    
    print(f"\n{'='*60}")
    print(f"  FOFUS Franchise Network — {len(franchises)} franchise(s)")
    print(f"{'='*60}")
    
    for fid, fdata in franchises.items():
        print(f"\n  [{fid}] {fdata['name']} ({fdata['city']})")
        print(f"    Slug: {fdata['slug']}")
        print(f"    PrintDash Partner: {fdata['printdash_partner_id']}")
        print(f"    Bambuddy Ops Group: {fdata['bambuddy_ops_group']}")
        print(f"    Printers: {len(fdata.get('printer_map', {}))}")
        if fdata.get("printer_map"):
            for pid, bb_id in fdata["printer_map"].items():
                print(f"      {pid} → Bambuddy #{bb_id}")


def main():
    parser = argparse.ArgumentParser(description="FOFUS Franchise Onboarding")
    parser.add_argument("--name", help="Franchise name (e.g. '3D Devine')")
    parser.add_argument("--slug", help="URL slug (e.g. '3ddevine')")
    parser.add_argument("--id", help="Franchise ID (e.g. '101')")
    parser.add_argument("--email", help="Franchise admin email")
    parser.add_argument("--city", help="City (e.g. 'Thrissur')")
    parser.add_argument("--list", action="store_true", help="List all franchises")
    
    args = parser.parse_args()
    
    if args.list:
        list_franchises()
        return
    
    if not all([args.name, args.slug, args.id, args.email, args.city]):
        parser.error("All of --name, --slug, --id, --email, --city required (or use --list)")
    
    create_franchise(args.name, args.slug, args.id, args.email, args.city)


if __name__ == "__main__":
    main()