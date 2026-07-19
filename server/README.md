# 动作诊断分析引擎 (Python)

微信云托管容器服务，负责 MediaPipe 骨骼提取 + 生物力学分析 + DTW 评分。

## 本地验证

```bash
cd server
# 建议用 uv 临时环境运行（避免污染全局）
uv run --with-requirements requirements.txt uvicorn app:app --host 0.0.0.0 --port 8000

# 健康检查
curl http://localhost:8000/health

# 分析（file_url 需为可公网下载的视频 URL）
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"file_url":"https://example.com/swing.mp4","action_type":"high_clear","main_side":"r"}'
```

## 部署到微信云托管

1. 在微信云开发控制台 → 云托管 → 新建服务，选择"本地代码/代码库"上传 `server/` 目录
2. 服务端口设为 8000（Dockerfile 已读 PORT 环境变量）
3. 部署成功后得到服务内网调用地址，填入云函数 `coach` 的环境变量 `ANALYZER_URL`

## 模块说明

| 文件 | 职责 |
|---|---|
| `app.py` | FastAPI 入口，`POST /analyze` 编排全流程 |
| `pose.py` | MediaPipe Pose 封装，视频→骨骼点序列 + 关键帧采样 |
| `biomechanics.py` | 时序分割 / 关节角 / 动力链 / DTW 打分 |
| `rules.py` | 错误规则库 + 阶段分 + 综合分聚合 |
| `templates/*.json` | 标准动作模板（待标定） |

## 待标定项

- `templates/*.json` 标准动作轨迹（需采集专业样本）
- `rules.py` 中 THRESH 阈值（抬肘角、击球点等）
- 深度方向指标（内旋角）单目置信度低，建议引导侧面 45° 拍摄
