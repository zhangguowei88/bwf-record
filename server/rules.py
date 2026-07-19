# server/rules.py — 挥拍常见错误规则库与评分聚合
# 每条规则：检查 metrics/seg，命中返回 {code,name,severity,desc,fix}

# 阈值参数（待标定，先用合理默认值）
THRESH = {
    'elbow_raise_min': 70.0,     # 抬肘角下限（度）
    'hit_point_y_max_ratio': 0.0,  # 击球点 y 应小于肩 y（屏幕坐标）
    'chain_disconnect': True,
}


def check_errors(metrics, seg, action_type='high_clear'):
    errors = []

    # 1. 肘部低于肩部（抬肘不足）
    ea = metrics.get('elbow_raise_angle', 0)
    if ea < THRESH['elbow_raise_min']:
        errors.append({
            'code': 'elbow_below_shoulder',
            'name': '抬肘不足',
            'severity': 'warn',
            'desc': f'引拍期肘部抬起角度仅 {ea}°，低于建议 {THRESH["elbow_raise_min"]}°',
            'fix': '引拍时主动抬肘、肘高于肩，为发力留出空间',
        })

    # 2. 击球点过低 / 偏后
    hp = metrics.get('hit_point', {})
    if not hp.get('is_optimal', True):
        desc = '击球点偏低或偏后，未在身体前上方最佳区域' if not hp.get('is_optimal') else ''
        errors.append({
            'code': 'hit_point_low',
            'name': '击球点不佳',
            'severity': 'warn',
            'desc': desc,
            'fix': '主动迎球，在身体前上方最高点击球，借助身体力量',
        })

    # 3. 发力脱节（动力链不连贯）
    kc = metrics.get('kinetic_chain', {})
    if kc.get('is_disconnected'):
        errors.append({
            'code': 'kinetic_disconnected',
            'name': '发力脱节',
            'severity': 'danger',
            'desc': '髋→肩→肘→腕未依次加速，力量传导不连贯',
            'fix': '体会蹬地转体带肩、肩带肘、肘带腕的依次发力，避免手腕先发力',
        })

    # 4. 击球置信度提示（单目限制）
    if metrics.get('pronation_confidence') == 'low':
        errors.append({
            'code': 'low_confidence_depth',
            'name': '深度指标仅供参考',
            'severity': 'info',
            'desc': '单目视频无法精确测量内旋等深度方向动作',
            'fix': '建议侧面 45° 拍摄以提升深度方向分析精度',
        })

    return errors


def stage_scores(seg, metrics, template_score):
    """
    各阶段得分（0-100）。MVP 用击球阶段权重高 + DTW 总分 + 阶段内动作连贯。
    """
    if not seg or not seg.get('stages'):
        return {'prepare': 0, 'backswing': 0, 'hit': 0, 'follow_through': 0}

    base = template_score  # DTW 总分作为基准

    # 击球阶段：动力链连贯加分
    kc_ok = not metrics.get('kinetic_chain', {}).get('is_disconnected', True)
    hit_score = min(100.0, base * (1.1 if kc_ok else 0.85))

    # 引拍阶段：抬肘达标加分
    ea = metrics.get('elbow_raise_angle', 0)
    backswing_score = min(100.0, base * (1.05 if ea >= THRESH['elbow_raise_min'] else 0.8))

    # 击球点佳则击球阶段再加分
    if metrics.get('hit_point', {}).get('is_optimal'):
        hit_score = min(100.0, hit_score * 1.05)

    return {
        'prepare': round(base * 0.95, 1),
        'backswing': round(backswing_score, 1),
        'hit': round(hit_score, 1),
        'follow_through': round(base * 0.9, 1),
    }


def total_score(stage_sc, errors):
    """综合分：阶段加权 - 错误扣分"""
    w = {'prepare': 0.15, 'backswing': 0.3, 'hit': 0.4, 'follow_through': 0.15}
    base = sum(stage_sc.get(k, 0) * w[k] for k in w)
    penalty = 0
    for e in errors:
        if e['severity'] == 'danger':
            penalty += 8
        elif e['severity'] == 'warn':
            penalty += 4
    # info 不扣分
    return round(max(0.0, min(100.0, base - penalty)), 1)
