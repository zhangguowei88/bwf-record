# server/Dockerfile — 微信云托管 Python 分析服务
FROM python:3.10-slim

# MediaPipe / OpenCV 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgthread-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8000
EXPOSE 8000

# 云托管通过 PORT 环境变量指定端口
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
