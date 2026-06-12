# Use standard light python image
FROM python:3.10-slim

# Set working directory inside container
WORKDIR /app

# Install system dependencies needed for python packages (e.g. gcc for pymysql/cryptography if compiling)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to take advantage of Docker caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application files (including static files)
COPY . .

# Expose port
EXPOSE 8000

# Start FastAPI server via uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
