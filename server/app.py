# server/app.py — 动作诊断分析引擎入口 (FastAPI)
# 部署到微信云托管。POST /analyze 接收 {file_url, action_type} 返回报告 JSON
import os
import json
import tempfile
import urllib.request
from fastapi import FastAPI
from pydantic import BaseModel

from pose import extract_landmarks, sample_skeleton_frames
from biomechanics import segment, calc_metrics, dtw_score, LM
from rules import check_errors, stage_scores, total_score

app = FastAPI(title='bwf-coach-analyzer')

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), 'templates')


def _load_template(action_type):
    """加载标准动作模板，缺失则返回空模板（降级，不阻塞）"""
    path = os.path.join(TEMPLATE_DIR, f'{action_type}.json')
    if not os.path.exists(path):
        return {'elbow_angle': [], 'shoulder_angle': [], 'wrist_y': []}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _download_video(url, dest):
    """下载视频到本地临时文件"""
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
        f.write(r.read())


class AnalyzeReq(BaseModel):
    file_url: str          # 视频可下载 URL（云函数侧 getTempFileURL 得到）
    action_type: str = 'high_clear'  # high_clear | smash | drop
    main_side: str = 'r'   # 持拍手 r/l/auto


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/analyze')
def analyze(req: AnalyzeReq):
    """主分析接口。同步处理，返回完整报告。"""
    tmp_path = None
    try:
        # 1. 下载视频
        tmp_path = tempfile.mktemp(suffix='.mp4')
        _download_video(req.file_url, tmp_path)

        # 2. 提骨骼点
        landmarks_seq = extract_landmarks(tmp_path, max_frames=180)
        if len(landmarks_seq) < 8:
            return {'code': -1, 'msg': '骨骼点提取失败或视频过短', 'data': None}

        # 3. 主手判断
        side = req.main_side if req.main_side in ('r', 'l') else 'r'

        # 4. 时序分割
        seg = segment(landmarks_seq, side=side)

        # 5. 指标
        metrics = calc_metrics(landmarks_seq, seg, side=side)

        # 6. DTW 比对
        template = _load_template(req.action_type)
        tmpl_score = dtw_score(landmarks_seq, template, side=side)

        # 7. 错误规则
        errors = check_errors(metrics, seg, req.action_type)

        # 8. 阶段分 + 总分
        stage_sc = stage_scores(seg, metrics, tmpl_score)
        total = total_score(stage_sc, errors)

        # 9. 关键帧骨架（前端 Canvas 用）
        skeleton_frames = sample_skeleton_frames(landmarks_seq, k=6)

        return {
            'code': 0,
            'msg': 'success',
            'data': {
                'total_score': total,
                'stage_scores': stage_sc,
                'metrics': metrics,
                'errors': errors,
                'skeleton_frames': skeleton_frames,
                'hit_frame': seg.get('hit_frame'),
                'segment_confidence': seg.get('confidence', 0),
                'main_side': side,
                'frames_analyzed': len(landmarks_seq),
            },
        }
    except Exception as e:
        return {'code': -1, 'msg': f'分析失败: {e}', 'data': None}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
