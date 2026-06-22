import opencascadeInit from './occ/opencascade.wasm.js';
let oc = null;
let currentShape = null;
let currentParams = { grid_x: 1, grid_y: 1, height_u: 3 };

async function buildBox(grid_x, grid_y, height_u) {
  const w = grid_x * 42;
  const d = grid_y * 42;
  const h = height_u * 7;
  const box = new oc.BRepPrimAPI_MakeBox_2(new oc.gp_Pnt_3(0,0,0), w, d, h).Shape();
  new oc.BRepMesh_IncrementalMesh_2(box, 0.5, false, 0.5, false);
  return box;
}

function addHole(shape, params) {
  try {
    const r = (params.d || 8) / 2;
    const w = currentParams.grid_x * 42;
    const depthY = currentParams.grid_y * 42;
    const h = currentParams.height_u * 7;

    // Cylinder along Y axis through center of front face
    const ax = new oc.gp_Ax2_3(
      new oc.gp_Pnt_3(w/2, -5, h/2),
      new oc.gp_Dir_4(0, 1, 0)
    );
    const cylMaker = new oc.BRepPrimAPI_MakeCylinder_3(ax, r, depthY + 10);
    cylMaker.Build();
    const cyl = cylMaker.Shape();

    const cut = new oc.BRepAlgoAPI_Cut_1();
    const args = new oc.TopTools_ListOfShape_1();
    args.Append_1(shape);
    const tools = new oc.TopTools_ListOfShape_1();
    tools.Append_1(cyl);
    cut.SetArguments(args);
    cut.SetTools(tools);
    cut.Build();
    console.log('cut IsDone:', cut.IsDone());
    if (cut.IsDone()) return cut.Shape();
  } catch(e) { console.error('hole error:', e.message) }
  return shape;
}

function addFillet(shape, params) {
  try {
    const r = params.radius || 1.0;
    const fillet = new oc.BRepFilletAPI_MakeFillet(shape);
    const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (exp.More()) {
      try { fillet.Add_2(r, oc.TopoDS.Edge_1(exp.Current())); } catch(e) {}
      exp.Next();
    }
    fillet.Build();
    if (fillet.IsDone()) return fillet.Shape();
  } catch(e) { console.error('fillet error', e) }
  return shape;
}

async function buildVase(base_r, amplitude, frequency, height, segments) {
  const loft = new oc.BRepOffsetAPI_ThruSections(false, false, 1.0e-6);
  for (let i = 0; i <= segments; i++) {
    const z = (i / segments) * height;
    const t = i / segments;
    const r = base_r + amplitude * Math.sin(frequency * Math.PI * 2 * t);
    const wire = makeCircleWire(r, z);
    loft.AddWire(wire);
  }
  loft.Build();
  const shape = loft.Shape();
  new oc.BRepMesh_IncrementalMesh_2(shape, 0.5, false, 0.5, false);
  return shape;
}

function makeCircleWire(r, z) {
  const ax = new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, z), new oc.gp_Dir_4(0, 0, 1));
  const circ = new oc.gp_Circ_2(ax, r);
  const edge = new oc.BRepBuilderAPI_MakeEdge_8(circ).Edge();
  return new oc.BRepBuilderAPI_MakeWire_2(edge).Wire();
}

function extractMesh(shape) {
  const verts = [];
  const exp = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (exp.More()) {
    const face = oc.TopoDS.Face_1(exp.Current());
    const loc = new oc.TopLoc_Location_1();
    const tri = oc.BRep_Tool.Triangulation(face, loc).get();
    if (tri) {
      const trsf = loc.IsIdentity() ? null : loc.Transformation();
      for (let i = 1; i <= tri.NbTriangles(); i++) {
        const t = tri.Triangle(i);
        [t.Value(1), t.Value(2), t.Value(3)].forEach(n => {
          let p = tri.Node(n);
          if (trsf) p = p.Transformed(trsf);
          verts.push(p.X(), p.Y(), p.Z());
        });
      }
    }
    exp.Next();
  }
  return new Float32Array(verts);
}

async function init() {
  self.postMessage({ status: "loading" });
  try {
    oc = await opencascadeInit({
      locateFile: () => new URL('./occ/opencascade.wasm.wasm', import.meta.url).href
    });
    self.postMessage({ status: "ready" });
    currentShape = await buildBox(1, 1, 3);
    const arr = extractMesh(currentShape);
    self.postMessage({ status: "mesh", verts: arr }, [arr.buffer]);
  } catch (err) {
    self.postMessage({ status: "error", message: err.message });
  }
}

self.onmessage = async (e) => {
  if (!oc) return;
  try {
    let shape;
    if (e.data.type === 'build') {
      currentParams = { grid_x: e.data.grid_x, grid_y: e.data.grid_y, height_u: e.data.height_u };
      shape = await buildBox(e.data.grid_x, e.data.grid_y, e.data.height_u);
      currentShape = shape;
    } else if (e.data.type === 'vase') {
      shape = await buildVase(e.data.base_r, e.data.amplitude, e.data.frequency, e.data.height, 20);
      currentShape = shape;
    } else if (e.data.type === 'feature') {
      if (!currentShape) return;
      shape = currentShape;
      const feat = e.data.feature;
      if (feat.op === 'hole') shape = addHole(shape, feat);
      else if (feat.op === 'fillet') shape = addFillet(shape, feat);
      new oc.BRepMesh_IncrementalMesh_2(shape, 0.5, false, 0.5, false);
      currentShape = shape;
    }
    if (shape) {
      const arr = extractMesh(shape);
      self.postMessage({ status: "mesh", verts: arr }, [arr.buffer]);
    }
  } catch (err) {
    self.postMessage({ status: "error", message: err.message });
  }
}

init();
