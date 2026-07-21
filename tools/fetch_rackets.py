#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
球拍参数采集脚本 —— 半自动：搜公开规格 → 提取 → 输出 JSON 供校对后导入 gear 集合

用法：
  python tools/fetch_rackets.py            # 采集内置清单，输出 tools/gear_seed.json
  python tools/fetch_rackets.py --list     # 只看内置清单

合规说明：
  - 仅采集公开商品规格数据（重量/平衡点/中杆/磅数/框型/价格等客观参数）
  - 不搬运宣传图文、营销文案、图片
  - 输出需人工校对后再导入，标注数据来源
  - 价格为采集时参考价，非实时

依赖：requests（pip install requests）
"""

import json
import re
import sys
import time
import urllib.parse

try:
    import requests
except ImportError:
    print('缺少 requests，请运行: pip install requests')
    sys.exit(1)

# 内置热门球拍清单（YY/胜利/李宁，可自行增删）
RACKET_LIST = [
    # YONEX
    {'brand': 'YONEX', 'name': '天斧100ZZ ASTROX 100ZZ', 'tier': 'high'},
    {'brand': 'YONEX', 'name': '天斧99 ASTROX 99', 'tier': 'high'},
    {'brand': 'YONEX', 'name': '天斧88D PRO ASTROX 88D Pro', 'tier': 'high'},
    {'brand': 'YONEX', 'name': '天斧77 ASTROX 77', 'tier': 'mid'},
    {'brand': 'YONEX', 'name': '疾光800 NANOFLARE 800', 'tier': 'high'},
    {'brand': 'YONEX', 'name': '疾光700 NANOFLARE 700', 'tier': 'high'},
    {'brand': 'YONEX', 'name': '弓箭11 PRO ARCSABER 11 Pro', 'tier': 'high'},
    {'brand': 'YONEX', 'name': '弓箭7 PRO ARCSABER 7 Pro', 'tier': 'mid'},
    # 胜利 VICTOR
    {'brand': 'VICTOR', 'name': '龙牙之刃一代 THRUSTER F', 'tier': 'high'},
    {'brand': 'VICTOR', 'name': '神速90K ARS-90K', 'tier': 'high'},
    {'brand': 'VICTOR', 'name': '神速100X ARS-100X', 'tier': 'high'},
    {'brand': 'VICTOR', 'name': '极速12 II ARS-12 II', 'tier': 'mid'},
    {'brand': 'VICTOR', 'name': '挑战者9500 CHA-9500', 'tier': 'entry'},
    {'brand': 'VICTOR', 'name': '铁锤 TK-HMR', 'tier': 'entry'},
    # 李宁 Li-Ning
    {'brand': 'Li-Ning', 'name': '雷霆80 Axforce 80', 'tier': 'high'},
    {'brand': 'Li-Ning', 'name': '雷霆90 Axforce 90', 'tier': 'high'},
    {'brand': 'Li-Ning', 'name': '战戟800 Halbertec 800', 'tier': 'high'},
    {'brand': 'Li-Ning', 'name': '风动6000 Axforce 6000', 'tier': 'mid'},
    {'brand': 'Li-Ning', 'name': '风刃500 Windstorm 500', 'tier': 'mid'},
    {'brand': 'Li-Ning', 'name': 'HC1200', 'tier': 'entry'},
]

UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'


def search_specs(query):
    """用 Bing 搜公开规格页，返回结果文本拼接（供正则提取）"""
    url = 'https://www.bing.com/search'
    params = {'q': query, 'count': 8, 'setlang': 'zh-CN'}
    headers = {'User-Agent': UA}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=15)
        r.encoding = 'utf-8'
        return r.text
    except Exception as e:
        print(f'  搜索失败: {e}')
        return ''


def extract_param(text, patterns):
    """用多个正则提取参数，返回第一个命中"""
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            return m.group(1).strip()
    return ''


def parse_racket(html_text, name):
    """从搜索结果 HTML 文本提取球拍参数"""
    # 去 tag，保留文本
    plain = re.sub(r'<[^>]+>', ' ', html_text)
    plain = re.sub(r'\s+', ' ', plain)

    # 重量 U（2U/3U/4U/5U）
    u_weight = extract_param(plain, [
        r'(\dU)\s*(?:重量|/|，|。|\s)',
        r'重量[：:\s]*(\dU)',
        r'(\dU)\s*\d{2,3}\s*g',
    ])
    # 重量克数
    weight_g = extract_param(plain, [
        r'(\d{2,3})\s*[－\-~到至]\s*(\d{2,3})\s*g',
        r'(\d{2,3})\s*[gｇ克]',
    ])
    if weight_g and not re.search(r'(\d{2,3})\s*[－\-~到至]\s*(\d{2,3})\s*g', plain):
        weight_g = extract_param(plain, [r'(\d{2,3})\s*g'])
    # 平衡点
    balance = extract_param(plain, [
        r'平衡点[：:\s]*(\d{2,3})\s*mm',
        r'(\d{2,3})\s*mm\s*[\(（].*?平衡',
        r'平衡[：:\s]*(\d{2,3})',
    ])
    if balance:
        balance = balance + 'mm'
    # 中杆硬度
    shaft = extract_param(plain, [
        r'中杆硬度[：:\s]*([软硬中]+)',
        r'硬度[：:\s]*([软硬中]+)',
    ])
    # 建议磅数
    tension = extract_param(plain, [
        r'(?:建议|推荐)?磅数[：:\s]*(\d{1,2}\s*[－\-~到至]\s*\d{1,2})',
        r'(\d{1,2}\s*[-~]\s*\d{1,2})\s*磅',
    ])
    if tension:
        tension = tension + '磅'
    # 框型
    frame = extract_param(plain, [
        r'框型[：:\s]*([一-龥A-Za-z0-9]+)',
        r'(破风|盒框|流体|椭圆|平头|圆头)[框型]*',
    ])
    # 价格（参考）
    price = extract_param(plain, [
        r'[¥￥]\s*(\d{3,5})',
        r'价格[：:\s]*(\d{3,5})',
        r'到手价?\s*(\d{3,5})',
    ])

    return {
        'u_weight': u_weight,
        'weight_g': weight_g,
        'balance_point': balance,
        'shaft_hardness': shaft,
        'tension': tension,
        'frame': frame,
        'price_ref': price,
    }


def build_gear_doc(item, spec):
    """组装成 gear 集合文档"""
    price = int(spec['price_ref']) if spec['price_ref'].isdigit() else 0
    return {
        'name': item['name'],
        'brand': item['brand'],
        'category': 'racket',
        'tier': item.get('tier', ''),
        'spec': {
            'u_weight': spec['u_weight'],
            'weight_g': spec['weight_g'],
            'balance_point': spec['balance_point'],
            'shaft_hardness': spec['shaft_hardness'],
            'tension': spec['tension'],
            'frame': spec['frame'],
        },
        'price_low': price,
        'price_high': price,
        'injury_tags': [],
        'cover_file_id': '',
        'status': 'approved',
        'review_count': 0,
        'avg_score': 0,
        'official_score': 0,
        'official_review_id': '',
        'data_source': '公开规格采集(待人工校对)',
    }


def main():
    if '--list' in sys.argv:
        print('内置球拍清单（%d款）：' % len(RACKET_LIST))
        for i, r in enumerate(RACKET_LIST, 1):
            print(f'  {i}. [{r["brand"]}] {r["name"]} ({r.get("tier","")})')
        return

    results = []
    print(f'开始采集 {len(RACKET_LIST)} 款球拍参数...\n')
    for i, item in enumerate(RACKET_LIST, 1):
        print(f'[{i}/{len(RACKET_LIST)}] {item["brand"]} {item["name"]}')
        query = f'{item["name"]} 羽毛球拍 规格 重量 平衡点 中杆 磅数'
        html = search_specs(query)
        spec = parse_racket(html, item['name']) if html else {}
        doc = build_gear_doc(item, spec)
        # 打印提取结果供查看
        print(f'  U: {spec["u_weight"] or "?"}  重量: {spec["weight_g"] or "?"}g  '
              f'平衡点: {spec["balance_point"] or "?"}  中杆: {spec["shaft_hardness"] or "?"}  '
              f'磅数: {spec["tension"] or "?"}  框型: {spec["frame"] or "?"}  价格: {spec["price_ref"] or "?"}')
        results.append(doc)
        time.sleep(1.5)  # 礼貌延时

    out_path = 'tools/gear_seed.json'
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'\n采集完成，输出：{out_path}')
    print('⚠️  请人工校对参数后再导入 gear 集合（采集结果可能不全或需修正）')


if __name__ == '__main__':
    main()
