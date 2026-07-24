// pages/profile/profile.js — 我的
const app = getApp()
const { call } = require('../../utils/cloud')
const format = require('../../utils/format')
const rules = require('../../utils/rules')

Page({
  data: {
    profile: null,
    stats: null,
    editingProfile: false,
    editForm: {},
    editingLevel: false,
    levelForm: { badminton_level: 2.0, play_since: '' },
    editingGoal: false,
    goalForm: { weekly_goal: 3 },
    levelOptions: [],
    goalRange: [1, 2, 3, 4, 5, 6, 7],
    saving: false,
  },

  onShow() {
    this.loadAll()
  },

  async loadAll() {
    try {
      await app.login()
      let profile = app.globalData.profile
      if (!profile) return
      // 兜底：dashboard 拿最新数据补全 avatar_url
      try {
        const d = await call('dashboard', {})
        if (d && d.user) {
          profile = { ...profile, ...d.user }
          app.globalData.profile = profile
        }
      } catch (e) {}

      const level = rules.getLevel(profile.badminton_level)
      const playAge = rules.playAgeText(profile.play_since)
      const nextLevel = rules.getNextLevel(profile.badminton_level)

      this.setData({
        profile: {
          ...profile,
          gender_label: ['', '男', '女'][profile.gender] || '未设置',
          weight_text: format.formatWeight(profile.weight_kg),
          level_name: level.name,
          level_desc: level.desc,
          level_color: rules.levelColor(profile.badminton_level),
          play_age: playAge,
          weekly_goal: profile.weekly_goal || 3,
          next_level_name: nextLevel ? nextLevel.name : null,
          next_level_value: nextLevel ? nextLevel.value : null,
          next_tip: level.next_tip,
          avatar_url: profile.avatar_url || '',
        },
        levelOptions: rules.LEVELS,
        levelForm: {
          badminton_level: profile.badminton_level || 2.0,
          play_since: profile.play_since || currentYM(),
        },
        goalForm: { weekly_goal: profile.weekly_goal || 3 },
      })

      // 拉累计数据
      try {
        const d = await call('dashboard', {})
        this.setData({
          stats: {
            total_count: d.total_count,
            total_hours: d.total_hours_text,
            month_count: d.month_count,
          },
        })
      } catch (e) {}
    } catch (e) {
      console.error('加载失败', e)
    }
  },

  // ===== 档案编辑 =====
  startEdit() {
    const p = this.data.profile
    this.setData({
      editingProfile: true,
      editForm: {
        nick_name: p.nick_name || '',
        avatar_url: p.avatar_url || '',
        age: p.age,
        gender: p.gender,
        height_cm: p.height_cm,
        weight_kg: p.weight_kg,
      },
    })
  },
  cancelEdit() {
    this.setData({ editingProfile: false })
  },
  onNickInput(e) { this.setData({ 'editForm.nick_name': e.detail.value }) },
  onAgeInput(e) { this.setData({ 'editForm.age': Number(e.detail.value) }) },
  onHeightInput(e) { this.setData({ 'editForm.height_cm': Number(e.detail.value) }) },
  onWeightInput(e) { this.setData({ 'editForm.weight_kg': Number(e.detail.value) }) },
  onGenderChange(e) { this.setData({ 'editForm.gender': Number(e.detail.value) + 1 }) },
  async saveProfile() {
    try {
      await call('record', { type: 'profile', ...this.data.editForm })
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ editingProfile: false })
      app.globalData.profile = { ...app.globalData.profile, ...this.data.editForm }
      this.loadAll()
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },

  // ===== 昵称单独快捷编辑 =====
  onUserNickInput(e) {
    this.setData({ 'profile.nick_name': e.detail.value })
  },

  async saveNickFromBlur(e) {
    const nick = (e.detail.value || '').trim()
    if (!nick || nick === (app.globalData.profile.nick_name || '')) return
    try {
      await call('record', { type: 'profile', nick_name: nick })
      app.globalData.profile.nick_name = nick
      this.setData({ 'profile.nick_name': nick })
      wx.showToast({ title: '已更新', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },

  // ===== 一键授权头像昵称 =====
  async onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    wx.showLoading({ title: '上传中...' })
    try {
      // 上传到云存储
      const cloudPath = `avatars/${app.globalData.openid}_${Date.now()}.png`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
      })
      const avatarUrl = uploadRes.fileID
      await call('record', { type: 'profile', avatar_url: avatarUrl })
      app.globalData.profile.avatar_url = avatarUrl
      this.setData({ 'profile.avatar_url': avatarUrl })
      wx.hideLoading()
      wx.showToast({ title: '头像已更新', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '上传失败', icon: 'none' })
    }
  },

  // ===== 等级编辑 =====
  startEditLevel() {
    this.setData({ editingLevel: true })
  },
  cancelEditLevel() {
    this.setData({ editingLevel: false })
  },
  selectLevel(e) {
    this.setData({ 'levelForm.badminton_level': Number(e.currentTarget.dataset.value) })
  },
  onPlaySinceChange(e) {
    this.setData({ 'levelForm.play_since': e.detail.value })
  },
  async saveLevel() {
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      await call('record', {
        type: 'level',
        badminton_level: this.data.levelForm.badminton_level,
        play_since: this.data.levelForm.play_since,
      })
      app.globalData.profile.badminton_level = this.data.levelForm.badminton_level
      app.globalData.profile.play_since = this.data.levelForm.play_since
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ editingLevel: false })
      this.loadAll()
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  // ===== 每周目标编辑 =====
  startEditGoal() {
    this.setData({ editingGoal: true })
  },
  cancelEditGoal() {
    this.setData({ editingGoal: false })
  },
  onGoalChange(e) {
    this.setData({ 'goalForm.weekly_goal': Number(this.data.goalRange[e.detail.value]) })
  },
  async saveGoal() {
    try {
      await call('record', { type: 'goal', weekly_goal: this.data.goalForm.weekly_goal })
      app.globalData.profile.weekly_goal = this.data.goalForm.weekly_goal
      wx.showToast({ title: '目标已更新', icon: 'success' })
      this.setData({ editingGoal: false })
      this.loadAll()
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },

  /** 导入种子装备 */
  goGearSeed() {
    wx.navigateTo({ url: '/pages/gear_seed/gear_seed' })
  },

  /** 打球记录 */
  goRecord() {
    wx.navigateTo({ url: '/pages/record/record' })
  },

  /** 意见反馈 */
  goFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' })
  },
})

function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
