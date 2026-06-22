FROM python:3.11-slim

# --- OrcaSlicer headless deps ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget fuse libfuse2 \
    libglu1-mesa libgl1-mesa-glx \
    libxrender1 libx11-6 libxext6 \
    libfontconfig1 libdbus-1-3 libxcb1 \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Download and extract OrcaSlicer AppImage (runs headless via Xvfb)
ARG ORCA_VERSION=v2.2.0
RUN wget -q \
    "https://github.com/SoftFever/OrcaSlicer/releases/download/${ORCA_VERSION}/OrcaSlicer_Linux_${ORCA_VERSION}.AppImage" \
    -O /tmp/OrcaSlicer.AppImage \
    && chmod +x /tmp/OrcaSlicer.AppImage \
    && cd /opt && /tmp/OrcaSlicer.AppImage --appimage-extract \
    && mv /opt/squashfs-root /opt/OrcaSlicer \
    && rm /tmp/OrcaSlicer.AppImage

ENV ORCA_SLICER_PATH=/opt/OrcaSlicer/AppRun
ENV ORCA_PROFILES_DIR=/opt/OrcaSlicer

# --- Python backend ---
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

ENV PORT=8000
EXPOSE 8000

# Xvfb provides a virtual display so OrcaSlicer CLI can initialize even headlessly
CMD Xvfb :99 -screen 0 1024x768x24 -nolisten tcp & \
    export DISPLAY=:99 && \
    uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
