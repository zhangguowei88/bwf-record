// pages/gear_detail/gear_detail.js — 装备详情（4Tab + 三层数据）
const { call } = require('../../utils/cloud')
const rules = require('../../utils/rules')
const dateUtil = require('../../utils/date')

Page({
  data: {
    gearId: '',
    gear: null,
    tab: 0,                // 0参数 1官方实测 2第三方 3众测
    tabs: ['基础参数', '平台实测', '第三方', '用户众测'],
    reviews: [],
    page: 1,
    hasMore: false,
    loading: false,
    myReview: null,
    // 加工后的维度条形图数据
    officialDims: [],
    thirdpartyList: [],
  },

  onLoad(options) {
    this.setData({ gearId: options.gear_id })
    this.loadGear()
    this.loadReviews(true)
  },

  onShow() {
    if (this.data.gear) {
      this.loadGear()
      this.loadReviews(true)
    }
  },

  async loadGear() {
    try {
      const data = await call('gear', { type: 'gear_detail', gear_id: this.data.gearId })
      const dims = rules.GEAR_DIMENSIONS[data.category] || []
      const lv = rules.scoreColor(data.avg_score)
      // 官方实测维度条形图
      let officialDims = []
      if (data.official && data.official.dimensions) {
        officialDims = dims.map((d) => ({
          name: d.name,
          score: data.official.dimensions[d.key] || 0,
          pct: ((data.official.dimensions[d.key] || 0) / 10) * 100,
        }))
      }
      // 第三方
      const thirdpartyList = (data.thirdparty || []).map((t) => ({
        ...t,
        time_text: dateUtil.formatShort(new Date(t.created_at)),
      }))
      this.setData({
        gear: {
          ...data,
          category_name: rules.GEAR_CATEGORY_NAMES[data.category] || data.category,
          tier_name: (rules.GEAR_TIERS.find((t) => t.value === data.tier) || {}).name || '',
          score_color: lv,
          score_text: data.avg_score ? Number(data.avg_score).toFixed(1) : '暂无',
          official_score_text: data.official_score ? Number(data.official_score).toFixed(1) : '',
          price_text: data.price_low ? `¥${data.price_low}-${data.price_high}` : '',
        },
        myReview: data.my_review,
        officialDims,
        thirdpartyList,
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async loadReviews(reset) {
    const page = reset ? 1 : this.data.page + 1
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const data = await call('gear', {
        type: 'list_review', page, page_size: 20, gear_id: this.data.gearId,
      })
      const dims = rules.GEAR_DIMENSIONS[(this.data.gear && this.data.gear.category) || 'racket'] || []
      const newItems = data.list.map((r) => ({
        ...r,
        time_text: dateUtil.formatShort(new Date(r.created_at)),
        media_count: (r.media || []).length,
        level_name: (rules.USER_LEVELS.find((u) => u.value === (r.user_profile && r.user_profile.level)) || {}).name || '',
        style_name: (rules.PLAY_STYLES.find((p) => p.value === (r.user_profile && r.user_profile.play_style)) || {}).name || '',
        dim_bars: dims.map((d) => ({
          name: d.name,
          score: (r.dimensions && r.dimensions[d.key]) || 0,
          pct: (((r.dimensions && r.dimensions[d.key]) || 0) / 10) * 100,
        })),
      }))
      this.setData({
        reviews: reset ? newItems : this.data.reviews.concat(newItems),
        page,
        hasMore: data.has_more,
      })
    } catch (e) {} finally {
      this.setData({ loading: false })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading && this.data.tab === 3) this.loadReviews(false)
  },

  switchTab(e) {
    this.setData({ tab: Number(e.currentTarget.dataset.idx) })
  },

  goWriteReview() {
    wx.navigateTo({ url: `/pages/review_edit/review_edit?gear_id=${this.data.gearId}` })
  },

  goReviewDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/review_detail/review_detail?review_id=${id}` })
  },
})
