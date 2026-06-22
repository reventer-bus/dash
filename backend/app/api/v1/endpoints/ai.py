from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from app.ai.optimiser import ModelFeatures, optimise

router = APIRouter()


# ── Slicer optimisation ──────────────────────────────────────────────────────

class OptimiseRequest(BaseModel):
    volume_cm3: float
    surface_area_cm2: float
    bounding_box_mm: tuple[float, float, float]
    overhang_angle_max: float = 0.0
    wall_thickness_min: float = 1.2
    material: str = "PLA"


@router.post("/optimise")
async def optimise_print(req: OptimiseRequest):
    features = ModelFeatures(
        volume_cm3=req.volume_cm3,
        surface_area_cm2=req.surface_area_cm2,
        bounding_box_mm=req.bounding_box_mm,
        overhang_angle_max=req.overhang_angle_max,
        wall_thickness_min=req.wall_thickness_min,
        material=req.material,
    )
    return optimise(features)


# ── AI Chat (parametric design assistant) ───────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    params: dict = {}
    pendingAction: dict | None = None


def _dfm_check(op: str, op_params: dict, model_params: dict) -> list:
    violations = []
    wall = model_params.get("wall", 1.2)
    if op == "fillet" and op_params.get("radius", 0) > wall - 0.2:
        violations.append({"fix": round(wall - 0.2, 1)})
    if op == "hole" and op_params.get("d", 99) < 2.0:
        violations.append({"fix": 2.0})
    if op == "set_param" and op_params.get("wall", 99) < 1.2:
        violations.append({"fix": 1.2})
    return violations


@router.post("/chat")
async def ai_chat(req: ChatRequest):
    msg = req.message.lower().strip()
    params = req.params
    pending = req.pendingAction

    response_type = "message"
    changes: dict = {}
    features: list = []
    ask_user = None
    reply = ""

    import re

    if pending and msg in ("yes", "confirm", "ok"):
        if pending.get("type") == "add_feature":
            response_type = "add_feature"
            features = [pending["feature"]]
            reply = f"✅ Added {pending['feature']['op']} — {pending['feature']['description']}"

    elif pending and msg in ("no", "cancel"):
        reply = "Cancelled. What else would you like to change?"

    elif re.search(r"(\d+)\s*(units?\s*)?(wide|width|columns?|grid.?x)", msg):
        val = int(re.search(r"(\d+)", msg).group(1))
        changes["grid_x"] = val; response_type = "set_param"; reply = f"Setting grid_x = {val}"

    elif re.search(r"(\d+)\s*(units?\s*)?(deep|depth|rows?|grid.?y)", msg):
        val = int(re.search(r"(\d+)", msg).group(1))
        changes["grid_y"] = val; response_type = "set_param"; reply = f"Setting grid_y = {val}"

    elif re.search(r"(\d+)\s*(units?\s*)?(tall|high|height)", msg):
        val = int(re.search(r"(\d+)", msg).group(1))
        changes["height_u"] = val; response_type = "set_param"; reply = f"Setting height_u = {val}"

    elif re.search(r"wall\s*[=:]?\s*([\d.]+)", msg):
        val = float(re.search(r"([\d.]+)", msg).group(1))
        v = _dfm_check("set_param", {"wall": val}, params)
        changes["wall"] = v[0]["fix"] if v else val
        response_type = "set_param"
        reply = (
            f"DFM: wall {val}mm below minimum, fixed to {changes['wall']}mm"
            if v else f"Setting wall = {val}mm"
        )

    elif re.search(r"hole|cable|routing", msg):
        d_match = re.search(r"(\d+)\s*mm", msg)
        if d_match:
            d = int(d_match.group(1))
            response_type = "ask_user"
            ask_user = {
                "question": f"Add a {d}mm cable routing hole on the front face?",
                "pendingAction": {"type": "add_feature", "feature": {"op": "hole", "d": d, "face": "front", "description": f"{d}mm hole on front face"}},
            }
            reply = ask_user["question"]
        else:
            response_type = "ask_user"
            ask_user = {"question": 'What diameter? (e.g. "8mm hole")', "pendingAction": None}
            reply = ask_user["question"]

    elif re.search(r"fillet|round|smooth", msg):
        r_match = re.search(r"([\d.]+)\s*mm", msg)
        requested_r = float(r_match.group(1)) if r_match else 1.0
        v = _dfm_check("fillet", {"radius": requested_r}, params)
        final_r = v[0]["fix"] if v else requested_r
        dfm_note = f" DFM: {requested_r}mm exceeds max, auto-corrected to {final_r}mm" if v else ""
        response_type = "ask_user"
        ask_user = {
            "question": f"Add {final_r}mm fillet on top inner edges?{dfm_note}",
            "pendingAction": {"type": "add_feature", "feature": {"op": "fillet", "radius": final_r, "edges": "top_inner", "description": f"{final_r}mm fillet on top inner edges"}},
        }
        reply = ask_user["question"]

    else:
        reply = "I can set grid_x, grid_y, height_u, wall — or add a hole/fillet. Try \"make it 3 wide\" or \"add a 10mm fillet\"."

    return JSONResponse({
        "type": response_type,
        "changes": changes,
        "features": features,
        "reply": reply,
        "message": reply,
        "askUser": ask_user,
    })
