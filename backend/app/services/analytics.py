"""
Farm-wide analytics, computed live over the order cache.

Consumed by GET /api/v1/farm/analytics and rendered by the dashboard's
AnalyticsPanel (frontend/src/Dashboard.jsx) — the response keys here match
what that component destructures: sales, waste, quality, speed,
assigned_time, delivery_time, breakdowns, generated_at, total_orders.

Every metric is None (with samples: 0) when there isn't enough data, so
the UI shows "—" instead of misleading zeros. Cost is O(N) over orders.
"""

from datetime import datetime, timezone
from statistics import median


def _parse_ts(value) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _minutes_between(start, end) -> float | None:
    a, b = _parse_ts(start), _parse_ts(end)
    if a is None or b is None:
        return None
    delta = (b - a).total_seconds() / 60.0
    return delta if delta >= 0 else None


def compute_analytics(orders: list[dict]) -> dict:
    completed_statuses = ("DISPATCH", "DONE")

    # ── Sales ──
    order_values = [float(o.get("total_inr") or 0) for o in orders if o.get("total_inr")]
    completed = [o for o in orders if o.get("status") in completed_statuses]
    sales = {
        "total_inr": round(sum(order_values), 2) if order_values else None,
        "completed_orders": len(completed),
        "avg_inr_per_order": round(sum(order_values) / len(order_values), 2) if order_values else None,
    }

    # ── Waste (failed print attempts) ──
    failed_attempts = 0
    total_attempts = 0
    orders_with_failures = 0
    error_counts: dict[str, int] = {}
    for o in orders:
        attempts = o.get("print_history") or []
        fails = [a for a in attempts if a.get("status") == "failed"]
        total_attempts += len([a for a in attempts if a.get("status") in ("succeeded", "failed")])
        failed_attempts += len(fails)
        if fails:
            orders_with_failures += 1
        for a in fails:
            err = (a.get("error_text") or "unspecified error").strip()[:120]
            error_counts[err] = error_counts.get(err, 0) + 1
    waste = {
        "failed_attempts": failed_attempts,
        "orders_with_failures": orders_with_failures,
        "failure_rate": round(failed_attempts / total_attempts, 3) if total_attempts else None,
        "top_errors": sorted(error_counts.items(), key=lambda kv: -kv[1])[:5],
    }

    # ── Quality (1–5 star scores on orders) ──
    scores = []
    for o in orders:
        score = o.get("quality_score") or o.get("rating")
        if isinstance(score, (int, float)) and 1 <= score <= 5:
            scores.append(round(score))
    distribution = {str(star): scores.count(star) for star in range(1, 6)} if scores else {}
    quality = {
        "average_score": round(sum(scores) / len(scores), 1) if scores else None,
        "scored_orders": len(scores),
        "distribution": distribution,
    }

    # ── Work speed (actual vs claimed time from slicer feedback on orders) ──
    ratios = []
    for o in orders:
        actual = o.get("actual_time_seconds")
        claimed = o.get("claimed_time_seconds")
        if actual and claimed and claimed > 0:
            ratios.append(actual / claimed)
    speed = {
        "avg_speed_ratio": round(sum(ratios) / len(ratios), 2) if ratios else None,
        "samples": len(ratios),
        "faster_than_estimate": sum(1 for r in ratios if r < 1),
    }

    # ── Time to assignment ──
    assign_minutes = [
        m for o in orders
        if (m := _minutes_between(o.get("created_at"), o.get("assigned_at"))) is not None
    ]
    assigned_time = {
        "avg_minutes": round(sum(assign_minutes) / len(assign_minutes), 1) if assign_minutes else None,
        "median_minutes": round(median(assign_minutes), 1) if assign_minutes else None,
        "samples": len(assign_minutes),
    }

    # ── Time to dispatch ──
    dispatch_minutes = []
    for o in orders:
        if o.get("status") not in completed_statuses:
            continue
        dispatched_at = next(
            (h.get("at") for h in reversed(o.get("history") or [])
             if h.get("event") == "status_change" and h.get("to") in completed_statuses),
            o.get("updated_at"),
        )
        m = _minutes_between(o.get("created_at"), dispatched_at)
        if m is not None:
            dispatch_minutes.append(m)
    delivery_time = {
        "avg_hours": round(sum(dispatch_minutes) / len(dispatch_minutes) / 60.0, 1) if dispatch_minutes else None,
        "median_minutes": round(median(dispatch_minutes), 1) if dispatch_minutes else None,
        "samples": len(dispatch_minutes),
    }

    # ── Breakdowns ──
    by_status: dict[str, int] = {}
    by_material: dict[str, int] = {}
    by_partner: dict[str, int] = {}
    for o in orders:
        by_status[o.get("status") or "UNKNOWN"] = by_status.get(o.get("status") or "UNKNOWN", 0) + 1
        mat = o.get("material") or "unknown"
        by_material[mat] = by_material.get(mat, 0) + 1
        pid = o.get("assigned_partner")
        if pid:
            by_partner[pid] = by_partner.get(pid, 0) + 1

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_orders": len(orders),
        "sales": sales,
        "waste": waste,
        "quality": quality,
        "speed": speed,
        "assigned_time": assigned_time,
        "delivery_time": delivery_time,
        "breakdowns": {
            "by_status": by_status,
            "by_material": by_material,
            "by_partner": by_partner,
        },
    }
