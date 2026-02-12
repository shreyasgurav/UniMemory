FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    ENVIRONMENT=production

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Copy requirements first (for caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Expose port
EXPOSE 8000

# Run with production settings
# - Workers: 1 (required for MCP SSE transport - SSE sessions are in-memory
#   and must be shared between GET /mcp/sse and POST /mcp/sse/messages handlers.
#   asyncio handles concurrent I/O, so 1 worker is sufficient for I/O-bound workloads.)
# - Timeout: 120 seconds for long-running requests
# - Keep-alive: 5 seconds
# - Access log: disabled (we have middleware)
CMD ["uvicorn", "app.main:app", \
    "--host", "0.0.0.0", \
    "--port", "8000", \
    "--workers", "1", \
    "--timeout-keep-alive", "5", \
    "--limit-concurrency", "100", \
    "--limit-max-requests", "10000", \
    "--no-access-log"]
