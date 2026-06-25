FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV PORT=8000
EXPOSE 8000

# OrcaSlicer is optional — set ORCA_SLICER_PATH env var if available.
# Without it, the slicer endpoint returns estimates (fallback mode).
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
