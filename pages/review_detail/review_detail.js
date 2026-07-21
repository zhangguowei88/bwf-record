// pages/review_detail/review_detail.js — 评测详情（10分维度）
const { call } = require('../../utils/cloud')
const rules = require('../../utils/rules')
const dateUtil = require('../../utils/date')

Page({
  data: {
    reviewId: '',
    r: null,
    dimBars: [],
  },

  onLoad(options) {
    this.setData({ reviewId: options.review_id })
    this.loadDetail()
  },

  async loadDetail() {
    try {
      const data = await call('gear', { type: 'review_detail', review_id: this.data.reviewId })
      const dims = rules.GEAR_DIMENSIONS[data.category] || []
      const dimBars = dims.map((d) => ({
        name: d.name,
        score: (data.dimensions && data.dimensions[d.key]) || 0,
        pct: (((data.dimensions && data.dimensions[d.key]) || 0) / 10) * 100,
      }))
      this.setData({
        r: {
          ...data,
          category_name: rules.GEAR_CATEGORY_NAMES[data.category] || data.category,
          star_text: rules.starText(data.score),
          time_text: dateUtil.formatShort(new Date(data.created_at)),
          level_name: (rules.USER_LEVELS.find((u) => u.value === (data.user_profile && data.user_profile.level)) || {}).name || '',
          style_name: (rules.PLAY_STYLES.find((p) => p.value === (data.user_profile && data.user_profile.play_style)) || {}).name || '',
        },
        dimBars,
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  previewMedia(e) {
    const idx = e.currentTarget.dataset.idx
    const sources = (this.data.r.media || []).map((m) => ({ url: m.file_id, type: m.type }))
    wx.previewMedia({ sources, current: idx, showmenu: true })
  },

  goGear() {
    if (this.data.r && this.data.r.gear_id) {
      wx.navigateTo({ url: `/pages/gear_detail/gear_detail?gear_id=${this.data.r.gear_id}` })
    }
  },
})
