// pages/feedback/feedback.js — 意见反馈/需求收集
const { call, callWithToast } = require('../../utils/cloud')
const dateUtil = require('../../utils/date')

const CATEGORIES = [
  { value: 'bug', name: 'Bug 反馈', desc: '功能异常、报错、卡顿' },
  { value: 'feature', name: '新需求', desc: '希望增加的功能' },
  { value: 'suggestion', name: '改进建议', desc: '现有功能优化建议' },
  { value: 'other', name: '其他', desc: '其他想说的' },
]

const STATUS_TEXT = {
  open: '待处理',
  processing: '处理中',
  done: '已处理',
}

Page({
  data: {
    categories: CATEGORIES,
    category: 'feature',
    content: '',
    contact: '',
    submitting: false,
    list: [],
    page: 1,
    hasMore: false,
    loading: false,
  },

  onLoad() {
    this.loadList(true)
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadList(false)
  },

  pickCategory(e) {
    this.setData({ category: e.currentTarget.dataset.value })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value })
  },

  async submit() {
    if (this.data.submitting) return
    const content = (this.data.content || '').trim()
    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' })
      return
    }
    if (content.length < 5) {
      wx.showToast({ title: '再写详细些(≥5字)', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      await call('feedback', {
        type: 'submit',
        category: this.data.category,
        content,
        contact: this.data.contact,
      })
      wx.showToast({ title: '已提交，感谢反馈 🙏', icon: 'success' })
      this.setData({ content: '', contact: '', category: 'feature', submitting: false })
      this.loadList(true)
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    }
  },

  async loadList(reset) {
    const page = reset ? 1 : this.data.page + 1
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const data = await call('feedback', { type: 'list', page, page_size: 20 })
      const newItems = data.list.map((r) => ({
        ...r,
        category_name: (CATEGORIES.find((c) => c.value === r.category) || {}).name || '其他',
        status_text: STATUS_TEXT[r.status] || '待处理',
        dateText: r.created_at ? dateUtil.formatShort(new Date(r.created_at)) : '',
      }))
      this.setData({
        list: reset ? newItems : this.data.list.concat(newItems),
        page,
        hasMore: data.has_more,
      })
    } catch (e) {
      // 静默
    } finally {
      this.setData({ loading: false })
    }
  },
})
