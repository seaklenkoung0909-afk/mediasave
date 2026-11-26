# MediaSave 4K: online version (Render, Railway, Fly.io or any Docker host)
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn \
 && pip install --no-cache-dir -U yt-dlp gallery-dl

COPY . .

ENV MEDIASAVE_HOSTED=1 \
    MEDIASAVE_DIR=/tmp/mediasave \
    PYTHONUNBUFFERED=1

# One process (jobs live in memory), many threads for downloads + polling
CMD gunicorn app:app --workers 1 --threads 16 --timeout 300 --bind 0.0.0.0:${PORT:-10000}
