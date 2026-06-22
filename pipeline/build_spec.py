import json, subprocess, hashlib, sys
from pathlib import Path

FOOTPRINT = 41.5
HEIGHT_UNIT = 7.0
MAGNET_D = 6.5
MAGNET_H = 2.4

def spec_to_scad(spec):
    p = spec["params"]
    gx, gy = p["grid_x"], p["grid_y"]
    hu, wall = p["height_u"], p["wall"]
    magnets = p["magnet_holes"]
    bx = gx * FOOTPRINT
    by = gy * FOOTPRINT
    bz = hu * HEIGHT_UNIT
    lines = [
        f"// Gridfinity bin — spec {spec['version']}",
        f"difference() {{",
        f"  cube([{bx}, {by}, {bz}]);",
        f"  translate([{wall}, {wall}, {wall}])",
        f"    cube([{bx - 2*wall}, {by - 2*wall}, {bz}]);",
    ]
    if magnets:
        for mx in [4.0, bx - 4.0]:
            for my in [4.0, by - 4.0]:
                lines.append(
                    f"  translate([{mx}, {my}, 0])"
                    f" cylinder(h={MAGNET_H}, d={MAGNET_D}, $fn=32);"
                )
    lines.append("}")
    return "\n".join(lines)

def main():
    spec_path = Path(sys.argv[1]) if len(sys.argv) > 1 else \
                Path("~/3d_model_generator/spec/gridfinity_bin.json").expanduser()
    spec_text = spec_path.read_text()
    spec = json.loads(spec_text)

    # Spec hash — this is the real determinism guarantee
    spec_hash = hashlib.sha256(spec_text.encode()).hexdigest()
    print(f"Spec SHA256: {spec_hash}")

    scad_code = spec_to_scad(spec)
    scad_path = spec_path.with_suffix(".scad")
    scad_path.write_text(scad_code)
    print(f"SCAD written: {scad_path}")

    stl_path = spec_path.with_suffix(".stl")
    subprocess.run(
        ["openscad", "--export-format", "binstl", "-o", str(stl_path), str(scad_path)],
        check=True
    )
    print(f"STL : {stl_path}")
    print(f"A1 DONE — spec {spec['version']} → STL built, spec hash above is reproducible")

if __name__ == "__main__":
    main()
