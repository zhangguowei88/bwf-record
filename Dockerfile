# Dockerfile — 微信云托管 Python 分析服务（仓库根版本）
# 构建上下文：仓库根
FROM python:3.10-slim

# MediaPipe / OpenCV 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgthread-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先装依赖（利用层缓存）
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝代码
COPY server/ .

ENV PORT=8000
EXPOSE 8000

# 云托管通过 PORT 环境变量指定端口
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
