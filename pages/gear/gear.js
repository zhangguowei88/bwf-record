// pages/gear/gear.js — 装备评测主页
const { call } = require('../../utils/cloud')
const rules = require('../../utils/rules')

Page({
  data: {
    categories: [{ value: '', name: '全部' }].concat(rules.GEAR_CATEGORIES.map((c) => ({ value: c.value, name: c.name }))),
    category: '',
    keyword: '',
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
  },

  onLoad() {
    this.loadList(true)
  },

  onShow() {
    // 从评测页返回时刷新（评测数/均分可能变了）
    if (this.data.list.length) this.loadList(true)
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadList(false)
  },

  pickCategory(e) {
    const v = e.currentTarget.dataset.value
    this.setData({ category: v }, () => this.loadList(true))
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearchConfirm() {
    this.loadList(true)
  },

  async loadList(reset) {
    const page = reset ? 1 : this.data.page + 1
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const data = await call('gear', {
        type: 'list_gear',
        page,
        page_size: 20,
        category: this.data.category,
        keyword: this.data.keyword,
      })
      const newItems = data.list.map((g) => ({
        ...g,
        category_name: rules.GEAR_CATEGORY_NAMES[g.category] || g.category,
        score_color: rules.scoreColor(g.avg_score),
        score_text: g.avg_score ? Number(g.avg_score).toFixed(1) : '暂无',
      }))
      this.setData({
        list: reset ? newItems : this.data.list.concat(newItems),
        page,
        hasMore: data.has_more,
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  goGearDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/gear_detail/gear_detail?gear_id=${id}` })
  },

  goMatch() {
    wx.navigateTo({ url: '/pages/gear_match/gear_match' })
  },
})
