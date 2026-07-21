// pages/record/record.js — 记录页（记一笔弹窗 + 历史列表）
const { call } = require('../../utils/cloud')
const dateUtil = require('../../utils/date')
const format = require('../../utils/format')
const rules = require('../../utils/rules')

const DURATION_OPTIONS = [30, 60, 90, 120, 150, 180]

Page({
  data: {
    loading: true,
    list: [],
    page: 1,
    hasMore: false,
    // 弹窗
    showSheet: false,
    submitting: false,
    editingId: '',  // 空=新增，有值=编辑
    form: {
      record_date: '',
      duration_min: 90,
      intensity: 2,
      feeling: 1,
      sore_parts: [],
      venue: '',
      partners: '',
      note: '',
      media: [],
      is_shared: true,
    },
    durationOptions: DURATION_OPTIONS,
    intensityOptions: [],
    feelingOptions: [],
    soreParts: rules.SORE_PARTS,
    // 本周进度
    weekCount: 0,
    weeklyGoal: 3,
    // 上次场地（预填）
    lastVenue: '',
  },

  onLoad() {
    const today = dateUtil.formatDate(new Date())
    const intensityOptions = Object.entries(rules.INTENSITY_LABELS).map(([v, label]) => ({ value: Number(v), label }))
    const feelingOptions = Object.entries(rules.FEELING_LABELS).map(([v, label]) => ({ value: Number(v), label }))
    this.setData({
      'form.record_date': today,
      intensityOptions,
      feelingOptions,
    })
    this.loadList()
  },

  onShow() {
    if (this.data.list.length) {
      this.loadList(true)
    }
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadList(reset = false) {
    try {
      if (reset) this.setData({ page: 1, loading: true })
      const data = await call('reportList', { page: this.data.page, page_size: 20 })
      const newItems = data.list.map((r) => ({
        ...r,
        intensity_label: rules.INTENSITY_LABELS[r.intensity] || '正常',
        feeling_label: rules.FEELING_LABELS[r.feeling] || '良好',
        duration_text: format.formatMinutes(r.duration_min),
        sore_text: r.sore_parts && r.sore_parts.length ? r.sore_parts.join('、') : '',
      }))

      // 本周场次统计
      let weekCount = 0
      const weekStart = dateUtil.formatDate(dateUtil.getWeekStart())
      newItems.forEach((r) => {
        if (r.record_date >= weekStart) weekCount++
      })

      // 预填上次的场地
      const lastVenue = data.list.length ? (data.list[0].venue || '') : this.data.lastVenue

      this.setData({
        loading: false,
        list: this.data.page === 1 ? newItems : this.data.list.concat(newItems),
        hasMore: data.has_more,
        weekCount,
        lastVenue,
      })

      // 同步本周目标（从 dashboard 拿，简化：直接用 user_profile，这里先默认）
      if (reset && !this.data.weeklyGoal) {
        this.fetchGoal()
      }
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async fetchGoal() {
    try {
      const d = await call('dashboard', {})
      this.setData({ weeklyGoal: d.weekly_goal || 3, weekCount: d.week_count || 0 })
    } catch (e) {}
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 })
      this.loadList()
    }
  },

  // ===== 弹窗 =====
  openSheet() {
    const today = dateUtil.formatDate(new Date())
    this.setData({
      showSheet: true,
      editingId: '',
      'form.record_date': today,
      'form.duration_min': 90,
      'form.intensity': 2,
      'form.feeling': 1,
      'form.sore_parts': [],
      'form.venue': this.data.lastVenue,
      'form.partners': '',
      'form.note': '',
      'form.media': [],
      'form.is_shared': true,
    })
  },

  // 编辑某条记录
  editRecord(e) {
    const item = this.data.list.find((x) => x._id === e.currentTarget.dataset.id)
    if (!item) return
    this.setData({
      showSheet: true,
      editingId: item._id,
      'form.record_date': item.record_date,
      'form.duration_min': item.duration_min,
      'form.intensity': item.intensity,
      'form.feeling': item.feeling,
      'form.sore_parts': item.sore_parts || [],
      'form.venue': item.venue || '',
      'form.partners': (item.partners || []).join('、'),
      'form.note': item.note || '',
      'form.media': item.media || [],
      'form.is_shared': item.is_shared !== false,
    })
  },

  // 删除记录
  async deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '删除记录',
        content: '确定删除这条打球记录？',
        success: (r) => resolve(r.confirm),
      })
    })
    if (!res) return
    try {
      await call('record', { type: 'delete', record_id: id })
      wx.showToast({ title: '已删除', icon: 'success' })
      this.loadList(true)
    } catch (e) {
      wx.showToast({ title: e.message || '删除失败', icon: 'none' })
    }
  },

  closeSheet() {
    this.setData({ showSheet: false, editingId: '' })
  },

  onDateChange(e) {
    this.setData({ 'form.record_date': e.detail.value })
  },

  selectDuration(e) {
    this.setData({ 'form.duration_min': Number(e.currentTarget.dataset.value) })
  },

  selectIntensity(e) {
    this.setData({ 'form.intensity': Number(e.currentTarget.dataset.value) })
  },

  selectFeeling(e) {
    const feeling = Number(e.currentTarget.dataset.value)
    this.setData({
      'form.feeling': feeling,
      'form.sore_parts': feeling === 3 ? this.data.form.sore_parts : [],
    })
  },

  toggleSore(e) {
    const part = e.currentTarget.dataset.value
    const parts = [...this.data.form.sore_parts]
    const idx = parts.indexOf(part)
    if (idx >= 0) parts.splice(idx, 1)
    else parts.push(part)
    this.setData({ 'form.sore_parts': parts })
  },

  onVenueInput(e) {
    this.setData({ 'form.venue': e.detail.value })
  },

  onPartnersInput(e) {
    this.setData({ 'form.partners': e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ 'form.note': e.detail.value })
  },

  toggleShare() {
    this.setData({ 'form.is_shared': !this.data.form.is_shared })
  },

  // 选择图片/视频（最多9个）
  chooseMedia() {
    const remain = 9 - this.data.form.media.length
    if (remain <= 0) {
      wx.showToast({ title: '最多9个', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 15,
      camera: 'back',
      success: (res) => {
        const picked = res.tempFiles.map((f) => ({
          type: f.fileType,            // 'image' | 'video'
          tempPath: f.tempFilePath,
          size: f.size,
          duration: f.duration,
          file_id: '',                 // 上传后填充
          uploading: true,
        }))
        this.setData({ 'form.media': this.data.form.media.concat(picked) })
        // 逐个上传
        picked.forEach((m, idx) => this.uploadOneMedia(m, idx))
      },
    })
  },

  async uploadOneMedia(media, idx) {
    const app = getApp()
    const openid = (app.globalData && app.globalData.openid) || 'user'
    const ext = media.type === 'video' ? 'mp4' : 'jpg'
    const cloudPath = `record_media/${openid}_${Date.now()}_${idx}.${ext}`
    try {
      const upRes = await wx.cloud.uploadFile({ cloudPath, filePath: media.tempPath })
      const list = this.data.form.media
      // 定位这条（用 tempPath 匹配，避免索引漂移）
      const i = list.findIndex((x) => x.tempPath === media.tempPath)
      if (i >= 0) {
        list[i] = { ...list[i], file_id: upRes.fileID, uploading: false }
        this.setData({ 'form.media': list })
      }
    } catch (e) {
      const list = this.data.form.media
      const i = list.findIndex((x) => x.tempPath === media.tempPath)
      if (i >= 0) {
        list[i] = { ...list[i], uploading: false, error: true }
        this.setData({ 'form.media': list })
      }
      wx.showToast({ title: '有媒体上传失败', icon: 'none' })
    }
  },

  removeMedia(e) {
    const idx = e.currentTarget.dataset.idx
    const list = this.data.form.media
    list.splice(idx, 1)
    this.setData({ 'form.media': list })
  },

  previewFormMedia(e) {
    const idx = e.currentTarget.dataset.idx
    const list = this.data.form.media
    const sources = list.map((m) => ({
      url: m.tempPath,
      type: m.type,
    }))
    wx.previewMedia({ sources, current: idx, showmenu: true })
  },

  async submit() {
    if (this.data.submitting) return
    if (!this.data.form.duration_min) {
      wx.showToast({ title: '请选择时长', icon: 'none' })
      return
    }
    if (this.data.form.media.some((m) => m.uploading)) {
      wx.showToast({ title: '媒体上传中，请稍候', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const partners = this.data.form.partners
        ? this.data.form.partners.split(/[,，、\s]+/).filter(Boolean)
        : []
      const payload = {
        record_date: this.data.form.record_date,
        duration_min: this.data.form.duration_min,
        intensity: this.data.form.intensity,
        feeling: this.data.form.feeling,
        sore_parts: this.data.form.feeling === 3 ? this.data.form.sore_parts : [],
        venue: this.data.form.venue,
        partners,
        note: this.data.form.note,
        is_shared: this.data.form.is_shared,
        media: this.data.form.media
          .filter((m) => m.file_id && !m.uploading && !m.error)
          .map((m) => ({ type: m.type, file_id: m.file_id })),
      }
      if (this.data.editingId) {
        payload.type = 'update'
        payload.record_id = this.data.editingId
        await call('record', payload)
        wx.showToast({ title: '已更新', icon: 'success' })
      } else {
        await call('record', payload)
        wx.showToast({ title: '记录成功 ✅', icon: 'success' })
      }
      this.setData({ showSheet: false, submitting: false, editingId: '' })
      this.loadList(true)
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },
})
