# Dockerfile — 微信云托管 Python 分析服务
# 构建上下文：仓库根
# 关键：监听端口必须与云托管探针端口(默认80)一致
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

EXPOSE 80

# 端口 80 硬编码，不依赖环境变量（云托管默认探针端口为 80）
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "80"]
