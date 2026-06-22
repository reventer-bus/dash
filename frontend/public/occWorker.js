import opencascadeInit from './occ/opencascade.wasm.js';

async function init() {
  self.postMessage({ status: "loading" });
  try {
    const oc = await opencascadeInit({
      locateFile: () => new URL('./occ/opencascade.wasm.wasm', import.meta.url).href
    });
    self.postMessage({ status: "occ_ready" });

    const box = new oc.BRepPrimAPI_MakeBox_2(new oc.gp_Pnt_3(0,0,0), 42, 42, 42).Shape();
    new oc.BRepMesh_IncrementalMesh_2(box, 0.5, false, 0.5, false);

    // Write STL to emscripten virtual FS
    oc.FS.createDataFile('/', 'box.stl', [], true, true, true);
    const writer = new oc.StlAPI_Writer();
    writer.Write(box, '/box.stl');
    const stlData = oc.FS.readFile('/box.stl', { encoding: 'binary' });

    self.postMessage({ status: "stl", data: stlData.buffer }, [stlData.buffer]);
  } catch (err) {
    self.postMessage({ status: "error", message: err.message, stack: err.stack });
  }
}

init();