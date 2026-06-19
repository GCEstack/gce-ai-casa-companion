FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e ".[all]"

# Copy source code
COPY src/ ./src/
COPY solution-a/ ./solution-a/
COPY client/ ./client/

# Set environment
ENV PYTHONPATH=/app/src
ENV PORT=8080

EXPOSE 8080

CMD ["uvicorn", "solution_a.main:app", "--host", "0.0.0.0", "--port", "8080"]
