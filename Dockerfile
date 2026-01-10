FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements from api folder
COPY api/requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code from api folder
COPY api/app/ ./app/

# Copy Firebase service account if it exists
COPY api/firebase-service-account.json* ./firebase-service-account.json* 2>/dev/null || true

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Run the application (use PORT env var for Railway)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

