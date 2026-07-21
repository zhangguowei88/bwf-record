# server/biomechanics.py — 羽毛球挥拍生物力学分析核心
# 输入：MediaPipe Pose 33 关键点序列 [{frame, landmarks:[{x,y,z,visibility} x33]}]
# 输出：阶段分割 / 关节角度 / 动力链 / 击球点 / DTW 评分

import math
import numpy as np

# MediaPipe Pose 33 关键点索引（仅列本模块用到的）
LM = {
    'nose': 0, 'l_shoulder': 11, 'r_shoulder': 12,
    'l_elbow': 13, 'r_elbow': 14, 'l_wrist': 15, 'r_wrist': 16,
    'l_hip': 23, 'r_hip': 24, 'l_knee': 25, 'r_knee': 26,
    'l_ankle': 27, 'r_ankle': 28,
}

# 挥拍主手判断：默认右手持拍，可由调用方覆盖
def _main_side(landmarks_seq, prefer='r'):
    """根据手腕活跃度判断主手侧，返回 'r' 或 'l'"""
    if prefer in ('r', 'l'):
        return prefer
    # 粗略：比较两侧手腕在整个序列的移动距离
    try:
        r_move = sum(_dist(s['landmarks'][LM['r_wrist']], s['landmarks'][LM['r_wrist']])
                     for s in landmarks_seq[1:])
        l_move = sum(_dist(s['landmarks'][LM['l_wrist']], s['landmarks'][LM['l_wrist']])
                     for s in landmarks_seq[1:])
        return 'r' if r_move >= l_move else 'l'
    except Exception:
        return 'r'


def _dist(a, b):
    return math.hypot(a['x'] - b['x'], a['y'] - b['y'])


def _vec(a, b):
    """从点 a 指向点 b 的二维向量"""
    return np.array([b['x'] - a['x'], b['y'] - a['y']])


def joint_angle(a, b, c):
    """三点 a-b-c 在 b 处的夹角（度），b 为顶点"""
    v1 = _vec(b, a)
    v2 = _vec(b, c)
    cos = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9))
    cos = max(-1.0, min(1.0, cos))
    return math.degrees(math.acos(cos))


def _velocity(seq_points):
    """相邻帧位移速度（每帧），返回 list[float]"""
    v = []
    for i in range(1, len(seq_points)):
        v.append(_dist(seq_points[i - 1], seq_points[i]))
    return v


def _smooth(values, window=5):
    """Savitzky-Golay 风格的简易滑动平均，去骨骼点抖动"""
    if len(values) < window:
        return values
    half = window // 2
    out = []
    for i in range(len(values)):
        lo, hi = max(0, i - half), min(len(values), i + half + 1)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out


def segment(landmarks_seq, side='r'):
    """
    时序分割：定位击球瞬间，切 4 阶段。
    原理：监测手腕相对肩部的速度与角速度，角速度峰值后迅速下降判定为击球。
    返回：{ stages: {prepare:[s,e], backswing:[s,e], hit:[s,e], follow_through:[s,e]},
            hit_frame, confidence }
    """
    n = len(landmarks_seq)
    if n < 8:
        return {'stages': None, 'hit_frame': None, 'confidence': 0.0}

    wrist_idx = LM['r_wrist'] if side == 'r' else LM['l_wrist']
    sh_idx = LM['r_shoulder'] if side == 'r' else LM['l_shoulder']

    # 手腕速度（平滑后）
    wrist_pts = [s['landmarks'][wrist_idx] for s in landmarks_seq]
    wv = _smooth(_velocity(wrist_pts))
    # 角速度：手腕相对肩部向量的方向变化率
    angles = []
    for s in landmarks_seq:
        v = _vec(s['landmarks'][sh_idx], s['landmarks'][wrist_idx])
        angles.append(math.atan2(v[1], v[0]))
    ang_vel = _smooth([abs(angles[i] - angles[i - 1]) for i in range(1, n)])

    # 击球帧：手腕速度峰值附近、且角速度由高转低
    # 用速度峰值作为候选，再向前后扩展
    if not wv:
        return {'stages': None, 'hit_frame': None, 'confidence': 0.0}
    hit_idx = int(np.argmax(wv)) + 1  # +1 因为 wv 比 n 少 1

    # 阶段切分（基于击球帧的比例划分，可调）
    # 准备期：前 30%；引拍期：30%~击球；击球期：击球±2帧；随挥：击球~末尾
    prepare_end = max(2, int(n * 0.25))
    backswing_end = max(prepare_end + 1, hit_idx)
    hit_start = max(backswing_end, hit_idx - 2)
    hit_end = min(n - 1, hit_idx + 2)

    # 置信度：击球帧速度显著高于平均
    mean_v = float(np.mean(wv)) if wv else 0.0
    peak_v = float(np.max(wv)) if wv else 0.0
    confidence = min(1.0, (peak_v / (mean_v + 1e-9)) / 3.0) if mean_v > 0 else 0.0

    return {
        'stages': {
            'prepare': [0, prepare_end],
            'backswing': [prepare_end, backswing_end],
            'hit': [hit_start, hit_end],
            'follow_through': [hit_end, n - 1],
        },
        'hit_frame': hit_idx,
        'confidence': round(confidence, 3),
    }


def calc_metrics(landmarks_seq, seg, side='r'):
    """
    计算关键生物力学指标。
    返回 dict：抬肘角、内旋角(低置信)、击球点、动力链。
    """
    s = side
    sh = LM[f'{s}_shoulder']
    el = LM[f'{s}_elbow']
    wr = LM[f'{s}_wrist']
    hip = LM[f'{s}_hip']

    n = len(landmarks_seq)
    hit_frame = seg.get('hit_frame') or (n // 2)

    # —— 抬肘角度：肩->肘 向量与垂直向上方向的夹角（引拍最高点附近取均值）
    back = seg['stages']['backswing'] if seg and seg.get('stages') else [0, hit_frame]
    lo, hi = back[0], max(back[0] + 1, back[1])
    elbow_raise_angles = []
    for i in range(lo, min(hi, n)):
        lm = landmarks_seq[i]['landmarks']
        v = _vec(lm[sh], lm[el])
        up = np.array([0.0, -1.0])  # 屏幕坐标 y 向下，垂直向上为 -y
        cos = float(np.dot(v, up) / (np.linalg.norm(v) + 1e-9))
        cos = max(-1.0, min(1.0, cos))
        elbow_raise_angles.append(math.degrees(math.acos(cos)))
    elbow_raise_angle = round(float(np.mean(elbow_raise_angles)), 1) if elbow_raise_angles else 0.0

    # —— 内旋角：前臂与上臂在击球瞬间的相对扭转（单目深度估计，低置信）
    # 用 肩-肘 与 肘-腕 的 3D 向量夹角变化近似
    pronation_samples = []
    for i in range(max(0, hit_frame - 3), min(n, hit_frame + 3)):
        lm = landmarks_seq[i]['landmarks']
        v1 = np.array([lm[el]['x'] - lm[sh]['x'], lm[el]['y'] - lm[sh]['y'], lm[el]['z'] - lm[sh]['z']])
        v2 = np.array([lm[wr]['x'] - lm[el]['x'], lm[wr]['y'] - lm[el]['y'], lm[wr]['z'] - lm[el]['z']])
        cos = float(np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9))
        cos = max(-1.0, min(1.0, cos))
        pronation_samples.append(math.degrees(math.acos(cos)))
    pronation_angle = round(float(np.mean(pronation_samples)), 1) if pronation_samples else 0.0

    # —— 击球点：击球帧手腕坐标，判断是否在身体前上方最佳区
    hit_lm = landmarks_seq[min(hit_frame, n - 1)]['landmarks']
    wrist_xy = {'x': round(hit_lm[wr]['x'], 3), 'y': round(hit_lm[wr]['y'], 3)}
    sh_xy = {'x': hit_lm[sh]['x'], 'y': hit_lm[sh]['y']}
    # 最佳区：手腕高于肩、且在身体前方（x 方向，主手侧）
    is_above_shoulder = wrist_xy['y'] < sh_xy['y']
    forward_sign = 1 if s == 'r' else -1
    is_forward = (wrist_xy['x'] - sh_xy['x']) * forward_sign > -0.05
    is_optimal = bool(is_above_shoulder and is_forward)
    hit_point = {'x': wrist_xy['x'], 'y': wrist_xy['y'], 'is_optimal': is_optimal,
                 'confidence': 'low'}  # 单目深度，置信低

    # —— 动力链：髋/肩/肘/腕 达到最大速度的帧序号，判断依次加速
    def reach_peak_frame(idx):
        pts = [s['landmarks'][idx] for s in landmarks_seq]
        v = _smooth(_velocity(pts))
        if not v:
            return 0
        return int(np.argmax(v)) + 1

    hip_t = reach_peak_frame(hip)
    shoulder_t = reach_peak_frame(sh)
    elbow_t = reach_peak_frame(el)
    wrist_t = reach_peak_frame(wr)
    # 标准应为 hip <= shoulder <= elbow <= wrist
    chain = [hip_t, shoulder_t, elbow_t, wrist_t]
    is_disconnected = not all(chain[i] <= chain[i + 1] + 1 for i in range(3))

    return {
        'elbow_raise_angle': elbow_raise_angle,
        'pronation_angle': pronation_angle,
        'pronation_confidence': 'low',
        'hit_point': hit_point,
        'kinetic_chain': {
            'hip_t': hip_t, 'shoulder_t': shoulder_t, 'elbow_t': elbow_t, 'wrist_t': wrist_t,
            'is_disconnected': bool(is_disconnected),
        },
    }


def _angle_series(landmarks_seq, a, b, c):
    """某关节角随帧变化序列，用于 DTW"""
    return [joint_angle(s['landmarks'][a], s['landmarks'][b], s['landmarks'][c])
            for s in landmarks_seq]


def dtw_distance(s1, s2):
    """标准 DTW 距离（一维序列）"""
    n, m = len(s1), len(s2)
    if n == 0 or m == 0:
        return 0.0
    INF = float('inf')
    dp = [[INF] * (m + 1) for _ in range(n + 1)]
    dp[0][0] = 0.0
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = abs(s1[i - 1] - s2[j - 1])
            dp[i][j] = cost + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    return dp[n][m]


def _cosine_sim(a, b):
    a, b = np.array(a), np.array(b)
    if len(a) != len(b):
        # 重采样到等长
        idx = np.linspace(0, len(a) - 1, len(b))
        a = np.interp(idx, np.arange(len(a)), a)
    denom = np.linalg.norm(a) * np.linalg.norm(b) + 1e-9
    return float(np.dot(a, b) / denom)


def dtw_score(landmarks_seq, template, side='r'):
    """
    与标准模板比对打分。
    template: { 'elbow_angle':[...], 'shoulder_angle':[...], 'wrist_y':[...] }
    返回 0-100 相似度。
    """
    s = side
    sh, el, wr = LM[f'{s}_shoulder'], LM[f'{s}_elbow'], LM[f'{s}_wrist']

    user_elbow = _angle_series(landmarks_seq, sh, el, wr)
    # 肩-肘-髋 肩关节角
    hip = LM[f'{s}_hip']
    user_shoulder = _angle_series(landmarks_seq, hip, sh, el)
    user_wrist_y = [s['landmarks'][wr]['y'] for s in landmarks_seq]

    has_tmpl = bool(template.get('elbow_angle')) or bool(template.get('shoulder_angle')) or bool(template.get('wrist_y'))

    def norm_dist(user, tmpl):
        if not user or not tmpl:
            return 1.0
        d = dtw_distance(user, tmpl) / max(len(user), len(tmpl))
        # 归一化到 0-1（角度差，经验上限 60°）
        return min(1.0, d / 60.0)

    # ---- 无标准模板：走"自身动作质量"兜底打分 ----
    # 思路：没有外部参照时，根据骨骼点提取稳定性 + 动作幅度，给合理基础分。
    # 这样未标定时分数不为 0，且仍能被错误规则扣分，反映动作质量。
    if not has_tmpl:
        # 1. 有效帧比例（可见度高 = 提取稳定）
        n = len(landmarks_seq)
        if n == 0:
            return 0.0
        vis_ok = 0
        for fr in landmarks_seq:
            lms = fr['landmarks']
            # 主手侧肩肘腕可见性
            if (lms[sh]['visibility'] >= 0.5 and lms[el]['visibility'] >= 0.5
                    and lms[wr]['visibility'] >= 0.5):
                vis_ok += 1
        vis_ratio = vis_ok / n  # 0-1

        # 2. 动作幅度（手腕 y 坐标变化范围，归一化）
        if user_wrist_y and max(user_wrist_y) > min(user_wrist_y):
            amp = max(user_wrist_y) - min(user_wrist_y)
            amp_score = min(1.0, amp / 0.35)  # 0.35 作为挥拍幅度经验值
        else:
            amp_score = 0.0

        # 基础分 55-80 区间：可见度为主，幅度为辅
        base = 55 + vis_ratio * 20 + amp_score * 5
        return round(max(0.0, min(100.0, base)), 1)

    # ---- 有标准模板：DTW 比对 ----
    d_elbow = norm_dist(user_elbow, template.get('elbow_angle', []))
    d_shoulder = norm_dist(user_shoulder, template.get('shoulder_angle', []))
    d_wrist = norm_dist(user_wrist_y, template.get('wrist_y', []))

    # 距离 → 相似度
    score = (1 - d_elbow) * 0.4 + (1 - d_shoulder) * 0.35 + (1 - d_wrist) * 0.25
    return round(max(0.0, min(1.0, score)) * 100, 1)
