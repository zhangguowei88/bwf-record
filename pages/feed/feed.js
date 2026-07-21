// pages/feed/feed.js — 球友圈
const { call } = require('../../utils/cloud')
const format = require('../../utils/format')
const rules = require('../../utils/rules')

Page({
  data: {
    loading: true,
    list: [],
    page: 1,
    hasMore: false,
    // 评论弹窗
    showComment: false,
    currentTarget: null,
    commentText: '',
    comments: [],
    submittingComment: false,
  },

  onLoad() {
    this.loadFeed()
  },

  onPullDownRefresh() {
    this.loadFeed(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadFeed()
    }
  },

  async loadFeed(reset = false) {
    try {
      if (reset) this.setData({ page: 1 })
      this.setData({ loading: true })
      const data = await call('feed', { page: this.data.page, page_size: 20 })
      const newItems = data.list.map((r) => ({
        ...r,
        intensity_label: rules.INTENSITY_LABELS[r.intensity] || '正常',
        feeling_label: rules.FEELING_LABELS[r.feeling] || '良好',
        duration_text: format.formatMinutes(r.duration_min),
        level_name: rules.getLevel(r.author.badminton_level).name,
        level_color: rules.levelColor(r.author.badminton_level),
        time_text: this.formatTime(r.created_at),
      }))
      this.setData({
        loading: false,
        list: this.data.page === 1 ? newItems : this.data.list.concat(newItems),
        hasMore: data.has_more,
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  formatTime(d) {
    if (!d) return ''
    const date = new Date(d)
    const now = new Date()
    const diff = (now - date) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
    if (diff < 604800) return Math.floor(diff / 86400) + '天前'
    return `${date.getMonth() + 1}/${date.getDate()}`
  },

  // 预览媒体（九宫格点击）
  previewFeedMedia(e) {
    const { id, idx } = e.currentTarget.dataset
    const item = this.data.list.find((x) => x._id === id)
    if (!item || !item.media || !item.media.length) return
    const sources = item.media.map((m) => ({
      url: m.file_id,
      type: m.type,   // 'image' | 'video'
    }))
    wx.previewMedia({ sources, current: Number(idx), showmenu: true })
  },

  // 点赞
  async toggleLike(e) {
    const id = e.currentTarget.dataset.id
    const idx = this.data.list.findIndex((x) => x._id === id)
    if (idx < 0) return
    const item = this.data.list[idx]
    const action = item.is_liked ? 'unlike' : 'like'
    // 乐观更新
    this.setData({
      [`list[${idx}].is_liked`]: !item.is_liked,
      [`list[${idx}].like_count`]: item.like_count + (item.is_liked ? -1 : 1),
    })
    try {
      await call('interact', { action, target_id: id })
    } catch (e) {
      // 回滚
      this.setData({
        [`list[${idx}].is_liked`]: item.is_liked,
        [`list[${idx}].like_count`]: item.like_count,
      })
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // 评论
  async openComment(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find((x) => x._id === id)
    this.setData({ showComment: true, currentTarget: id, commentText: '', comments: [] })
    this.loadComments(id)
  },

  closeComment() {
    this.setData({ showComment: false, currentTarget: null })
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  async loadComments(id) {
    try {
      const data = await call('interact', { action: 'commentList', target_id: id })
      const comments = (data.list || []).map((c) => ({
        ...c,
        time_text: this.formatTime(c.created_at),
      }))
      this.setData({ comments })
    } catch (e) {}
  },

  async submitComment() {
    if (this.data.submittingComment) return
    const text = this.data.commentText.trim()
    if (!text) {
      wx.showToast({ title: '请输入评论', icon: 'none' })
      return
    }
    this.setData({ submittingComment: true })
    try {
      await call('interact', {
        action: 'comment',
        target_id: this.data.currentTarget,
        content: text,
      })
      this.setData({ commentText: '' })
      this.loadComments(this.data.currentTarget)
      // 更新列表评论数
      const idx = this.data.list.findIndex((x) => x._id === this.data.currentTarget)
      if (idx >= 0) {
        this.setData({ [`list[${idx}].comment_count`]: this.data.list[idx].comment_count + 1 })
      }
    } catch (e) {
      wx.showToast({ title: e.message || '评论失败', icon: 'none' })
    } finally {
      this.setData({ submittingComment: false })
    }
  },

  // 分享单条动态
  onShareAppMessage(e) {
    const id = (e.target && e.target.dataset && e.target.dataset.id) || ''
    const item = this.data.list.find((x) => x._id === id)
    if (item) {
      return {
        title: `${item.author.nick_name}：${item.duration_text}${item.note ? ' ' + item.note : ''}`,
        path: `/pages/feed/feed`,
        imageUrl: '',
      }
    }
    return {
      title: '来球友圈一起打球',
      path: '/pages/feed/feed',
    }
  },

  // 更多操作（举报/删除）
  showMoreMenu(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.find((x) => x._id === id)
    const isMine = item && item.is_mine
    const items = isMine ? ['从球友圈移除', '取消'] : ['举报这条动态', '取消']
    wx.showActionSheet({
      itemList: isMine ? ['从球友圈移除'] : ['举报这条动态'],
      success: (res) => {
        if (isMine && res.tapIndex === 0) {
          this.deleteShare(id)
        } else if (!isMine && res.tapIndex === 0) {
          this.reportPost(id)
        }
      },
    })
  },

  async deleteShare(id) {
    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: '移除动态',
        content: '从球友圈移除这条记录？记录本身保留。',
        success: (r) => resolve(r.confirm),
      })
    })
    if (!confirm) return
    try {
      await call('interact', { action: 'deleteShare', target_id: id })
      wx.showToast({ title: '已移除', icon: 'success' })
      this.loadFeed(true)
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
    }
  },

  reportPost(id) {
    wx.showActionSheet({
      itemList: ['广告引流', '不当言论', '色情低俗', '其他'],
      success: async (res) => {
        const reasons = ['广告引流', '不当言论', '色情低俗', '其他']
        try {
          await call('interact', {
            action: 'report',
            target_id: id,
            reason: reasons[res.tapIndex],
          })
          wx.showToast({ title: '举报已提交', icon: 'success' })
        } catch (e) {
          wx.showToast({ title: e.message || '举报失败', icon: 'none' })
        }
      },
    })
  },
})
