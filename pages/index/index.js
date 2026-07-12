// pages/index/index.js — 首页
const { call } = require('../../utils/cloud')
const rules = require('../../utils/rules')
const format = require('../../utils/format')

Page({
  data: {
    loading: true,
    data: null,
    intensityLabel: rules.INTENSITY_LABELS,
    // 首次引导弹窗
    showWelcome: false,
    welcomeLevel: 3.0,
    levelOptions: rules.LEVELS,
    savingLevel: false,
  },

  onLoad() {
    this.loadDashboard()
  },

  onShow() {
    if (this.data.data) {
      this.loadDashboard()
    }
  },

  onPullDownRefresh() {
    this.loadDashboard().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadDashboard() {
    try {
      this.setData({ loading: true })
      const d = await call('dashboard', {})
      console.log('[dashboard 返回]', JSON.stringify(d).slice(0, 500))
      const level = rules.getLevel(d.user.badminton_level)
      const levelColor = rules.levelColor(d.user.badminton_level)
      const playAge = rules.playAgeText(d.user.play_since)

      // 最近记录格式化
      const recent = d.recent_records.map((r) => ({
        ...r,
        intensity_label: rules.INTENSITY_LABELS[r.intensity] || '正常',
        feeling_label: rules.FEELING_LABELS[r.feeling] || '良好',
        duration_text: format.formatMinutes(r.duration_min),
        sore_text: r.sore_parts && r.sore_parts.length ? r.sore_parts.join('、') : '',
      }))

      // 是否空状态（无任何记录）
      const isEmpty = d.total_count === 0

      // 月度复盘预算字段
      const mr = d.month_review || {}
      const countDiff = mr.count_diff || 0
      const minutesDiff = mr.minutes_diff || 0
      mr.count_diff_text = countDiff === 0 ? '持平' : (countDiff > 0 ? '↑' : '↓') + Math.abs(countDiff)
      mr.hours_diff_text = minutesDiff === 0 ? '持平' : (minutesDiff > 0 ? '↑' : '↓') + (Math.round(Math.abs(minutesDiff) / 6) / 10)
      mr.top_intensity_text = mr.top_intensity ? rules.INTENSITY_LABELS[mr.top_intensity] : '—'

      this.setData({
        loading: false,
        data: {
          ...d,
          month_review: mr,
          level_name: level.name,
          level_desc: level.desc,
          level_color: levelColor,
          play_age: playAge,
          week_progress_color: rules.levelColor(d.week_progress >= 100 ? 5 : d.week_progress >= 60 ? 3 : 2),
          recent,
          is_empty: isEmpty,
        },
        // 首次进入且没设过水平 → 弹引导
        showWelcome: !d.user.level_set,
        welcomeLevel: d.user.badminton_level || 3.0,
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  // ===== 首次引导 =====
  noop() {},

  selectWelcomeLevel(e) {
    this.setData({ welcomeLevel: Number(e.currentTarget.dataset.value) })
  },

  async submitWelcomeLevel() {
    if (this.data.savingLevel) return
    this.setData({ savingLevel: true })
    try {
      await call('record', {
        type: 'level',
        badminton_level: this.data.welcomeLevel,
      })
      this.setData({ showWelcome: false, savingLevel: false })
      this.loadDashboard()
    } catch (e) {
      this.setData({ savingLevel: false })
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },

  skipWelcome() {
    this.setData({ showWelcome: false })
  },

  // ===== 跳转 =====
  goRecord() {
    wx.switchTab({ url: '/pages/record/record' })
  },

  goProfileLevel() {
    wx.switchTab({ url: '/pages/profile/profile' })
  },

  goGuide() {
    wx.navigateTo({ url: '/pages/guide/guide' })
  },

  goGear() {
    wx.navigateTo({ url: '/pages/gear/gear' })
  },

  goFeed() {
    wx.navigateTo({ url: '/pages/feed/feed' })
  },

  onShareAppMessage() {
    const d = this.data.data
    return {
      title: d ? `我已打球 ${d.total_count} 场，等级 ${d.user.badminton_level}` : '一起来打羽毛球',
      path: '/pages/index/index',
    }
  },
})
