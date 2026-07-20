# Dockerfile — 微信云托管 Python 分析服务（仓库根版本）
# 构建上下文：仓库根
# 端口：80（与云托管默认探针端口一致，避免配置不一致导致健康检查失败）
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

# 强制监听 80 端口（云托管默认健康探针端口）
ENV PORT=80
EXPOSE 80

# 启动：监听 80 端口
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-80}"]
