FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed by some Python audio packages.
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies from pyproject.toml.
COPY pyproject.toml .
COPY src ./src
RUN pip install --no-cache-dir .

# Copy application entry point.
COPY main.py .

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
