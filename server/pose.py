# server/pose.py — MediaPipe Pose 封装：视频 → 骨骼点序列
import os
import math

# cv2 / mediapipe 延迟导入，避免服务启动即加载
cv2 = None
def _cv2():
    global cv2
    if cv2 is None:
        import cv2 as _cv2_mod
        cv2 = _cv2_mod
    return cv2


def extract_landmarks(video_path, max_frames=180):
    """
    用 MediaPipe Pose 提取骨骼点序列。
    返回 [{frame, landmarks:[{x,y,z,visibility} x33]}, ...]
    - 视频抽帧到约 30fps，最多 max_frames 帧，控制耗时
    - landmarks 坐标已归一化（x,y ∈ [0,1]，z 相对深度）
    """
    import mediapipe as mp  # 延迟导入
    cv2 = _cv2()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError('无法打开视频文件')

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    # 抽帧步长：目标 30fps，避免过长视频耗时
    step = max(1, int(round(fps / 30.0)))

    landmarks_seq = []
    frame_idx = 0
    saved = 0

    with mp.solutions.pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        smooth_landmarks=True,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        while cap.isOpened() and saved < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % step == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                res = pose.process(rgb)
                if res.pose_landmarks:
                    lm = [
                        {
                            'x': round(p.x, 4),
                            'y': round(p.y, 4),
                            'z': round(p.z, 4),
                            'visibility': round(p.visibility, 3),
                        }
                        for p in res.pose_landmarks.landmark
                    ]
                    landmarks_seq.append({'frame': saved, 'landmarks': lm})
                    saved += 1
            frame_idx += 1

    cap.release()
    return landmarks_seq


def detect_subject_info(landmarks_seq, side='r'):
    """
    计算被识别者（MediaPipe Pose 单人模式检测到的人）的位置信息。
    返回：
      bbox: {x_min, y_min, x_max, y_max}  归一化包围盒
      h_position: 'left' | 'center' | 'right'  画面水平位置
      h_position_text: 中文描述
      main_side: 'r' | 'l'  持拍手
      main_side_text: 中文
    说明：MediaPipe Pose 单实例只检测画面中显著性最高的一个人，
    若画面多人，结果对应最显著那位，需在前端标注。
    """
    if not landmarks_seq:
        return None
    xs, ys = [], []
    for s in landmarks_seq:
        for lm in s['landmarks']:
            if lm['visibility'] >= 0.3:
                xs.append(lm['x'])
                ys.append(lm['y'])
    if not xs:
        return None
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    center_x = (x_min + x_max) / 2
    if center_x < 0.35:
        h_pos, h_text = 'left', '画面左侧'
    elif center_x > 0.65:
        h_pos, h_text = 'right', '画面右侧'
    else:
        h_pos, h_text = 'center', '画面中间'
    side_text = '右手持拍' if side == 'r' else '左手持拍'
    return {
        'bbox': {'x_min': round(x_min, 3), 'y_min': round(y_min, 3),
                  'x_max': round(x_max, 3), 'y_max': round(y_max, 3)},
        'h_position': h_pos,
        'h_position_text': h_text,
        'main_side': side,
        'main_side_text': side_text,
        'note': '单人识别模式，结果为画面中最显著的人',
    }


def sample_skeleton_frames(landmarks_seq, k=6):
    """
    抽取 k 个关键帧的骨骼点用于前端 Canvas 重绘（压缩传输）。
    返回 [{frame, points:[{x,y,vis} for 关键关节]}]
    """
    if not landmarks_seq:
        return []
    # MediaPipe Pose 骨骼连接（仅上肢+躯干核心，用于可视化）
    KEY_POINTS = [11, 12, 13, 14, 15, 16, 23, 24]  # 双肩肘腕 + 双髋

    n = len(landmarks_seq)
    indices = [int(i) for i in np_linspace(0, n - 1, k)]
    out = []
    for idx in indices:
        s = landmarks_seq[idx]
        pts = [
            {'x': s['landmarks'][i]['x'], 'y': s['landmarks'][i]['y'],
             'vis': s['landmarks'][i]['visibility']}
            for i in KEY_POINTS
        ]
        out.append({'frame': s['frame'], 'points': pts})
    return out


def np_linspace(start, stop, num):
    import numpy as np
    if num <= 1:
        return [start]
    return np.linspace(start, stop, num).tolist()
