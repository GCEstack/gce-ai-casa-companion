FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed by some Python audio packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies from pyproject.toml.
COPY pyproject.toml .
COPY src ./src
RUN pip install --no-cache-dir .

# Pre-download Silero VAD model so the container works offline / in restricted Azure networks.
RUN python - <<'PY'
import torch, os
os.makedirs("/app/.cache/torch/hub", exist_ok=True)
try:
    torch.hub.set_dir("/app/.cache/torch/hub")
    torch.hub.load("snakers4/silero-vad", model="silero_vad", force_reload=False, onnx=False)
    print("Silero VAD model cached")
except Exception as e:
    print(f"Silero VAD cache warning (will retry at runtime): {e}")
PY

# Copy application entry point.
COPY main.py .

ENV TORCH_HOME=/app/.cache/torch
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
