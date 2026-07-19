# server/pose.py — MediaPipe Pose 封装：视频 → 骨骼点序列
import os
import cv2
import math


def extract_landmarks(video_path, max_frames=180):
    """
    用 MediaPipe Pose 提取骨骼点序列。
    返回 [{frame, landmarks:[{x,y,z,visibility} x33]}, ...]
    - 视频抽帧到约 30fps，最多 max_frames 帧，控制耗时
    - landmarks 坐标已归一化（x,y ∈ [0,1]，z 相对深度）
    """
    import mediapipe as mp  # 延迟导入，避免服务启动即加载

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
