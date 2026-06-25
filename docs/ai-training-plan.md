# AI Training Plan — Maker AI

## Goal

Train an optimisation model that recommends the best slicer settings for any 3D model, learning from successful and failed prints across the franchise farm.

## Dataset Sources

| Source | Type | Volume |
|---|---|---|
| MakerWorld / Bambu projects | 3MF files with profiles | Thousands |
| OrcaSlicer presets | Slicer + material profiles | Hundreds |
| Farm print history | Success/failure + actual parameters | Growing daily |
| Partner corrections | Human-labelled fixes | Growing daily |

## Feature Extraction

From each 3MF file:
- **Geometry**: volume, surface area, bounding box, max overhang angle, min wall thickness
- **Slicer params**: layer height, wall count, infill %, speed, temps, retraction
- **Material**: type, brand, colour
- **Outcome**: success, failure type (if any), actual vs estimated time

## Model Architecture

**Phase 1 (MVP):** Gradient Boosted Trees (XGBoost / scikit-learn)
- Fast to train, interpretable, works with small datasets
- Input: geometry features + material type
- Output: recommended slicer parameters

**Phase 2:** Neural network regression (PyTorch)
- Input: 3D geometry embeddings (PointNet) + material
- Output: full slicer parameter set + success probability

## Training Pipeline

```python
# Simplified pseudocode
from sklearn.ensemble import GradientBoostingRegressor

X = extract_features(tmf_files)      # geometry + material
y = extract_targets(slicer_profiles)  # layer_height, infill, speed, etc.

model = GradientBoostingRegressor()
model.fit(X_train, y_train)

# Deploy
joblib.dump(model, "models/optimiser_v1.pkl")
```

## Failure Detection Model

- **Type**: Image classification (YOLOv8 or ResNet-50)
- **Classes**: spaghetti, layer_shift, warping, normal
- **Training data**: Labelled images from 3D printing failure datasets + farm footage
- **Inference**: Real-time from OctoPrint camera stream (~1 frame/5s)

## Continuous Learning Loop

1. Print completes → outcome recorded (success/fail)
2. If failed → partner selects failure type and fix applied
3. Data point added to KnowledgeBase
4. Nightly retraining job updates model weights
5. New model deployed via FastAPI on next server restart

## Knowledge Base Schema

```sql
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY,
  printer_id VARCHAR,
  material VARCHAR,
  layer_height FLOAT,
  infill_percent INT,
  speed INT,
  nozzle_temp INT,
  bed_temp INT,
  failure_type VARCHAR,    -- NULL if success
  solution_applied TEXT,
  result VARCHAR,          -- 'fixed' | 'failed_again'
  created_at TIMESTAMP
);
```
