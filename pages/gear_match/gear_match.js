// pages/gear_match/gear_match.js — 智能装备匹配（5题→推荐3+避坑2）
const { call } = require('../../utils/cloud')
const rules = require('../../utils/rules')

// 5道题
const QUESTIONS = [
  {
    key: 'level',
    title: '你的水平是？',
    options: [
      { value: 'beginner', label: '新手' },
      { value: 'intermediate', label: '进阶' },
      { value: 'advanced', label: '高阶' },
    ],
  },
  {
    key: 'style',
    title: '主打打法？',
    options: [
      { value: 'singles_rally', label: '单打拉吊' },
      { value: 'aggressive', label: '暴力进攻' },
      { value: 'doubles_drive', label: '双打平抽' },
    ],
  },
  {
    key: 'budget',
    title: '预算区间？',
    options: [
      { value: 300, label: '300以内' },
      { value: 800, label: '300-800' },
      { value: 1500, label: '800-1500' },
      { value: 9999, label: '1500以上' },
    ],
  },
  {
    key: 'body',
    title: '身体情况？',
    options: [
      { value: 'none', label: '无伤病' },
      { value: 'wrist', label: '手腕不适' },
      { value: 'knee', label: '膝盖不适' },
      { value: 'heavy', label: '大体重(85kg+)' },
    ],
  },
  {
    key: 'pref',
    title: '偏好？',
    options: [
      { value: 'light', label: '轻量好上手' },
      { value: 'power', label: '重杀暴力' },
      { value: 'cushion', label: '减震护腕' },
      { value: 'speed', label: '挥速快' },
    ],
  },
]

Page({
  data: {
    questions: QUESTIONS,
    step: 0,           // 当前题号 0-4，5=结果
    answers: {},       // {level, style, budget, body, pref}
    loading: false,
    recommends: [],
    avoids: [],
  },

  pick(e) {
    const { key, value } = e.currentTarget.dataset
    const answers = { ...this.data.answers, [key]: value }
    const next = this.data.step + 1
    this.setData({ answers })
    if (next < QUESTIONS.length) {
      setTimeout(() => this.setData({ step: next }), 200)
    } else {
      this.compute()
    }
  },

  prev() {
    if (this.data.step > 0) this.setData({ step: this.data.step - 1 })
  },

  restart() {
    this.setData({ step: 0, answers: {}, recommends: [], avoids: [] })
  },

  async compute() {
    this.setData({ loading: true, step: QUESTIONS.length })
    try {
      // 拉全部装备（只球拍）
      const data = await call('gear', { type: 'list_gear', page: 1, page_size: 100, category: 'racket' })
      const scored = data.list.map((g) => ({
        ...g,
        matchScore: this.scoreGear(g, this.data.answers),
      }))
      // 排序，取前3推荐
      const sorted = scored.filter((g) => g.matchScore > -50).sort((a, b) => b.matchScore - a.matchScore)
      const recommends = sorted.slice(0, 3).map((g) => this.decorate(g))
      // 避坑：分数最低2款（且不为负无限）
      const avoids = scored.filter((g) => g.matchScore < 0).sort((a, b) => a.matchScore - b.matchScore).slice(0, 2).map((g) => this.decorate(g))
      this.setData({ recommends, avoids, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '匹配失败', icon: 'none' })
    }
  },

  /** 给装备打匹配分。正分=推荐，负分=不推荐 */
  scoreGear(g, a) {
    let score = 0
    const spec = g.spec || {}
    const u = String(spec.u_weight || '')
    const bal = String(spec.balance_point || '')
    const shaft = String(spec.shaft_hardness || '')
    const price = (g.price_high || 0)

    // 预算硬过滤
    const budget = Number(a.budget) || 9999
    if (price > budget + 200) score -= 30   // 超预算扣分（留200容差）
    if (price <= budget) score += 10

    // 水平 × 定位
    const tier = g.tier || ''
    if (a.level === 'beginner') {
      if (tier === 'entry') score += 20
      if (tier === 'mid') score += 8
      if (tier === 'high') score -= 10
    } else if (a.level === 'intermediate') {
      if (tier === 'mid') score += 18
      if (tier === 'high') score += 10
      if (tier === 'entry') score -= 5
    } else {
      if (tier === 'high') score += 20
      if (tier === 'entry') score -= 15
    }

    // 打法
    if (a.style === 'aggressive') {
      if (bal.indexOf('头重') >= 0 || bal.indexOf('308') >= 0 || bal.indexOf('315') >= 0) score += 18
      if (shaft.indexOf('硬') >= 0) score += 8
      if (bal.indexOf('头轻') >= 0) score -= 12
    } else if (a.style === 'doubles_drive') {
      if (bal.indexOf('头轻') >= 0) score += 18
      if (u.indexOf('5U') >= 0 || u.indexOf('4U') >= 0) score += 6
      if (bal.indexOf('头重') >= 0) score -= 8
    } else { // singles_rally 均衡
      if (bal.indexOf('295') >= 0 || bal.indexOf('296') >= 0 || bal.indexOf('298') >= 0) score += 12
      if (shaft.indexOf('适中') >= 0 || shaft.indexOf('中等') >= 0) score += 8
    }

    // 身体情况
    if (a.body === 'wrist') {
      if (shaft.indexOf('硬') >= 0) score -= 15
      if ((g.injury_tags || []).join('').indexOf('手腕') >= 0) score -= 20
      if (shaft.indexOf('软') >= 0 || shaft.indexOf('适中') >= 0) score += 8
    }
    if (a.body === 'heavy') {
      // 大体重主要影响球鞋，球拍无直接关联，轻微倾向轻量
      if (u.indexOf('5U') >= 0) score += 5
    }

    // 偏好
    if (a.pref === 'light') {
      if (u.indexOf('5U') >= 0) score += 15
      if (u.indexOf('4U') >= 0) score += 8
      if (u.indexOf('3U') >= 0 && u.indexOf('4U') < 0 && u.indexOf('5U') < 0) score -= 8
    } else if (a.pref === 'power') {
      if (bal.indexOf('头重') >= 0) score += 15
      if (shaft.indexOf('硬') >= 0) score += 8
    } else if (a.pref === 'cushion') {
      if (shaft.indexOf('软') >= 0 || shaft.indexOf('适中') >= 0) score += 12
      if (shaft.indexOf('硬') >= 0) score -= 8
    } else if (a.pref === 'speed') {
      if (bal.indexOf('头轻') >= 0) score += 15
      if ((g.spec.frame || '').indexOf('破风') >= 0 || (g.spec.frame || '').indexOf('流体') >= 0) score += 6
    }

    return score
  },

  decorate(g) {
    return {
      ...g,
      score_color: rules.scoreColor(g.avg_score),
      score_text: g.avg_score ? Number(g.avg_score).toFixed(1) : '新品',
      price_text: g.price_low ? `¥${g.price_low}-${g.price_high}` : '',
    }
  },

  goDetail(e) {
    wx.navigateTo({ url: `/pages/gear_detail/gear_detail?gear_id=${e.currentTarget.dataset.id}` })
  },
})
