// pages/review_edit/review_edit.js — 写评测（10分7维度 + 用户画像）
const { call } = require('../../utils/cloud')
const rules = require('../../utils/rules')

Page({
  data: {
    gearId: '',
    gearName: '',
    category: '',
    dimensions: [],         // [{key,name,score}] 当前品类维度
    dimsMap: {},            // {key: score}
    reviewTypes: rules.REVIEW_TYPES,
    reviewType: 'quick',
    durationMonths: 1,
    content: '',
    pros: '',
    cons: '',
    media: [],
    verified: false,
    submitting: false,
    // 用户画像
    userLevels: rules.USER_LEVELS,
    userLevel: '',
    playStyles: rules.PLAY_STYLES,
    playStyle: '',
    weight: '',
    injuries: rules.INJURY_TAGS,
    injuryPicked: [],
    scoreList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },

  onLoad(options) {
    if (options.gear_id) {
      this.setData({ gearId: options.gear_id })
      this.loadGearAndMyReview(options.gear_id)
    }
  },

  async loadGearAndMyReview(gearId) {
    try {
      const data = await call('gear', { type: 'gear_detail', gear_id: gearId })
      const dims = rules.GEAR_DIMENSIONS[data.category] || []
      const dimsMap = {}
      dims.forEach((d) => (dimsMap[d.key] = 0))
      this.setData({
        gearName: data.name,
        category: data.category,
        dimensions: dims,
        dimsMap,
      })
      // 回填已有评测
      if (data.my_review) {
        const r = data.my_review
        this.setData({
          reviewType: r.review_type || 'quick',
          dimsMap: Object.assign({}, dimsMap, r.dimensions || {}),
          durationMonths: r.duration_months || 1,
          content: r.content || '',
          pros: r.pros || '',
          cons: r.cons || '',
          media: (r.media || []).map((m) => ({ ...m, tempPath: m.file_id, uploading: false })),
          verified: true,
          userLevel: (r.user_profile && r.user_profile.level) || '',
          playStyle: (r.user_profile && r.user_profile.play_style) || '',
          weight: (r.user_profile && r.user_profile.weight) ? String(r.user_profile.weight) : '',
          injuryPicked: (r.user_profile && r.user_profile.injuries) || [],
        })
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  pickType(e) {
    this.setData({ reviewType: e.currentTarget.dataset.value })
  },

  pickDim(e) {
    const { key, score } = e.currentTarget.dataset
    const dimsMap = Object.assign({}, this.data.dimsMap, { [key]: Number(score) })
    this.setData({ dimsMap })
  },

  onDurationInput(e) {
    let v = parseInt(e.detail.value, 10)
    if (isNaN(v)) v = 1
    v = Math.max(1, Math.min(120, v))
    this.setData({ durationMonths: v })
  },

  onContentInput(e) { this.setData({ content: e.detail.value }) },
  onProsInput(e) { this.setData({ pros: e.detail.value }) },
  onConsInput(e) { this.setData({ cons: e.detail.value }) },
  onWeightInput(e) { this.setData({ weight: e.detail.value }) },

  pickLevel(e) {
    this.setData({ userLevel: e.currentTarget.dataset.value })
  },
  pickStyle(e) {
    this.setData({ playStyle: e.currentTarget.dataset.value })
  },
  toggleInjury(e) {
    const v = e.currentTarget.dataset.value
    const arr = [...this.data.injuryPicked]
    const i = arr.indexOf(v)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(v)
    this.setData({ injuryPicked: arr })
  },

  toggleVerify() {
    this.setData({ verified: !this.data.verified })
  },

  // ===== media 上传 =====
  chooseMedia() {
    const remain = 9 - this.data.media.length
    if (remain <= 0) { wx.showToast({ title: '最多9个', icon: 'none' }); return }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 15,
      camera: 'back',
      success: (res) => {
        const picked = res.tempFiles.map((f) => ({
          type: f.fileType, tempPath: f.tempFilePath, file_id: '', uploading: true,
        }))
        this.setData({ media: this.data.media.concat(picked) })
        picked.forEach((m) => this.uploadOneMedia(m))
      },
    })
  },

  async uploadOneMedia(media) {
    if (media.file_id) return
    const app = getApp()
    const openid = (app.globalData && app.globalData.openid) || 'user'
    const ext = media.type === 'video' ? 'mp4' : 'jpg'
    const cloudPath = `review_media/${openid}_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`
    try {
      const upRes = await wx.cloud.uploadFile({ cloudPath, filePath: media.tempPath })
      const list = this.data.media
      const i = list.findIndex((x) => x.tempPath === media.tempPath)
      if (i >= 0) {
        list[i] = { ...list[i], file_id: upRes.fileID, uploading: false }
        this.setData({ media: list })
      }
    } catch (e) {
      const list = this.data.media
      const i = list.findIndex((x) => x.tempPath === media.tempPath)
      if (i >= 0) {
        list[i] = { ...list[i], uploading: false, error: true }
        this.setData({ media: list })
      }
    }
  },

  removeMedia(e) {
    const idx = e.currentTarget.dataset.idx
    const list = this.data.media
    list.splice(idx, 1)
    this.setData({ media: list })
  },

  previewFormMedia(e) {
    const idx = e.currentTarget.dataset.idx
    const sources = this.data.media.map((m) => ({ url: m.tempPath || m.file_id, type: m.type }))
    wx.previewMedia({ sources, current: idx, showmenu: true })
  },

  async submit() {
    if (this.data.submitting) return
    // 校验维度全填
    const dims = this.data.dimsMap
    const unfilled = this.data.dimensions.find((d) => !dims[d.key])
    if (unfilled) {
      wx.showToast({ title: `请给「${unfilled.name}」打分`, icon: 'none' }); return
    }
    if (!this.data.verified) {
      wx.showToast({ title: '请勾选使用承诺', icon: 'none' }); return
    }
    if (!this.data.userLevel) {
      wx.showToast({ title: '请选择水平', icon: 'none' }); return
    }
    const content = (this.data.content || '').trim()
    if (!content) { wx.showToast({ title: '请填写评价内容', icon: 'none' }); return }
    if (this.data.media.some((m) => m.uploading)) {
      wx.showToast({ title: '媒体上传中', icon: 'none' }); return
    }
    this.setData({ submitting: true })
    try {
      const payload = {
        type: 'submit_review',
        gear_id: this.data.gearId,
        review_type: this.data.reviewType,
        duration_months: this.data.durationMonths,
        pros: this.data.pros,
        cons: this.data.cons,
        content,
        media: this.data.media.filter((m) => m.file_id && !m.error).map((m) => ({ type: m.type, file_id: m.file_id })),
        is_verified_use: this.data.verified,
        dimensions: this.data.dimsMap,
        user_level: this.data.userLevel,
        play_style: this.data.playStyle,
        weight: this.data.weight,
        injuries: this.data.injuryPicked,
      }
      const data = await call('gear', payload)
      if (data.need_review) {
        wx.showModal({
          title: '已提交',
          content: '评测含待审核内容，审核通过后将公开展示。',
          showCancel: false,
          success: () => wx.navigateBack(),
        })
      } else {
        wx.showToast({ title: '评测已发布', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 800)
      }
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    }
  },
})
