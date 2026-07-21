// pages/coach/coach.js — 动作诊断
// 选视频 → 上传云存储 → 调 coach 云函数分析 → 渲染报告 → Canvas 绘骨骼

const { call, callWithToast } = require('../../utils/cloud')
const rules = require('../../utils/rules')
const dateUtil = require('../../utils/date')

Page({
  data: {
    actionTypes: rules.ACTION_TYPES,
    actionType: 'high_clear',
    videoFileID: '',      // 已上传的云存储 fileID
    videoTempPath: '',    // 本地临时路径（预览用）
    uploading: false,
    analyzing: false,
    report: null,         // 分析报告（已加工）
    reportList: [],       // 历史报告
    page: 1,
    hasMore: false,
    loading: false,
    detailLoading: false,
  },

  onLoad(options) {
    if (options && options.report_id) {
      this.loadDetail(options.report_id)
    } else {
      this.loadList(true)
    }
  },

  onShow() {
    // 详情模式不刷新列表
    if (this.data.detailLoading || this.data.report) return
    if (this.data.reportList.length) this.loadList(true)
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadList(false)
  },

  /** 选择动作类型 */
  onPickAction(e) {
    this.setData({ actionType: e.currentTarget.dataset.value })
  },

  /** 选择视频 */
  chooseVideo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 15,
      camera: 'back',
      success: (res) => {
        const file = res.tempFiles[0]
        if (file.duration > 16) {
          wx.showToast({ title: '视频请控制在 15 秒内', icon: 'none' })
          return
        }
        this.setData({ videoTempPath: file.tempFilePath })
        this.uploadAndAnalyze(file.tempFilePath)
      },
    })
  },

  /** 上传 + 分析 */
   /**上传 +分析 */
 async uploadAndAnalyze(filePath) {
  this.setData({ uploading: true, analyzing: false, report: null })
  wx.showLoading({ title: '上传中...', mask: true })
  try {
  const app = getApp()
  //确保 openid已获取，未获取则等待
  let openid = app.globalData.openid
  if (!openid) {
  await app.ensureLogin()
  openid = app.globalData.openid || 'user'
  }
 
  //构建安全路径（去除特殊字符）
  const safeId = String(openid).replace(/[^a-zA-Z0-9_-]/g, '').slice(0,32)
  const cloudPath = `coach/${safeId}_${Date.now()}.mp4`
 
  console.log('[upload] start', cloudPath, filePath)
  const upRes = await wx.cloud.uploadFile({ cloudPath, filePath })
  console.log('[upload] success', upRes)
 
  const fileId = upRes.fileID
  if (!fileId) {
  throw new Error('上传成功但未获取文件ID')
  }
 
  this.setData({ videoFileID: fileId, uploading: false, analyzing: true })
  wx.hideLoading()
 
  //调云函数分析（同步等待，超时由云函数60s兜底）
  wx.showLoading({ title: '分析中...', mask: true })
  const data = await call('coach', {
  type: 'analyze',
  file_id: fileId,
  action_type: this.data.actionType,
  main_side: 'r',
  })
  wx.hideLoading()
  this.setData({ analyzing: false, report: this.decorateReport(data) })
  //绘制骨骼
  this.drawSkeleton(data.skeleton_frames)
  //刷新历史
  this.loadList(true)
  wx.showToast({ title: '诊断完成', icon: 'success' })
  } catch (e) {
  wx.hideLoading()
  this.setData({ uploading: false, analyzing: false })
  console.error('[uploadAndAnalyze] error:', e)
  //显示详细错误，特别是云存储上传错误
  const msg = e.errMsg || e.message || '上传失败'
  wx.showModal({
  title: '上传失败',
  content: msg + '\n\n请检查：\n1.视频文件是否超过100MB\n2.网络连接是否正常\n3.云存储权限是否配置正确',
  showCancel: false,
  })
  }
  },
 

  /** 加工报告：补充评分等级文案、错误数量等派生字段供 wxml 使用 */
  decorateReport(data) {
    if (!data) return null
    const lv = rules.scoreLevel(data.total_score)
    const errors = (data.errors || []).map((e) => ({
      ...e,
      severity: e.severity || 'info',
    }))
    return {
      ...data,
      scoreColor: lv.color,
      scoreName: lv.name,
      scoreDesc: lv.desc,
      errors,
      errorCount: errors.filter((e) => e.severity !== 'info').length,
    }
  },

  /** Canvas 绘制关键帧骨骼点 */
  drawSkeleton(frames) {
    if (!frames || !frames.length) return
    const query = wx.createSelectorQuery()
    query.select('#skeletonCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        const w = res[0].width
        const h = res[0].height

        ctx.fillStyle = '#1f2937'
        ctx.fillRect(0, 0, w, h)

        // 骨骼连接（KEY_POINTS 顺序：11,12,13,14,15,16,23,24）
        const LINKS = [
          [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
          [11, 23], [12, 24], [23, 24],
        ]
        const idxMap = { 11: 0, 12: 1, 13: 2, 14: 3, 15: 4, 16: 5, 23: 6, 24: 7 }

        frames.forEach((f, fi) => {
          const isLast = fi === frames.length - 1
          const pts = f.points
          ctx.strokeStyle = isLast ? '#10b981' : 'rgba(16,185,129,0.3)'
          ctx.fillStyle = isLast ? '#10b981' : 'rgba(16,185,129,0.3)'
          ctx.lineWidth = isLast ? 3 : 1.5
          LINKS.forEach(([a, b]) => {
            const pa = pts[idxMap[a]]
            const pb = pts[idxMap[b]]
            if (!pa || !pb || pa.vis < 0.3 || pb.vis < 0.3) return
            ctx.beginPath()
            ctx.moveTo(pa.x * w, pa.y * h)
            ctx.lineTo(pb.x * w, pb.y * h)
            ctx.stroke()
          })
          pts.forEach((p) => {
            if (p.vis < 0.3) return
            ctx.beginPath()
            ctx.arc(p.x * w, p.y * h, isLast ? 4 : 2.5, 0, Math.PI * 2)
            ctx.fill()
          })
        })
      })
  },

  /** 加载报告详情（从历史进入） */
  async loadDetail(reportId) {
    this.setData({ detailLoading: true })
    wx.showLoading({ title: '加载中...', mask: true })
    try {
      const data = await call('coach', { type: 'detail', report_id: reportId })
      wx.hideLoading()
      this.setData({ detailLoading: false, report: this.decorateReport(data) })
      this.drawSkeleton(data.skeleton_frames)
    } catch (e) {
      wx.hideLoading()
      this.setData({ detailLoading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  /** 加载历史报告列表 */
  async loadList(reset) {
    const page = reset ? 1 : this.data.page + 1
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const data = await call('coach', { type: 'list', page, page_size: 20 })
      const list = (reset ? data.list : this.data.reportList.concat(data.list)).map((item) => {
        const lv = rules.scoreLevel(item.total_score)
        return {
          ...item,
          actionTypeName: rules.ACTION_TYPE_NAMES[item.action_type] || item.action_type,
          scoreColor: lv.color,
          dateText: item.created_at ? dateUtil.formatShort(new Date(item.created_at)) : '',
        }
      })
      this.setData({
        reportList: list,
        page,
        hasMore: data.has_more,
      })
    } catch (e) {
      // 静默
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 分享到球友圈 */
  async shareToFeed() {
    if (!this.data.report) return
    try {
      await callWithToast('coach', { type: 'share', report_id: this.data.report.report_id })
      wx.showToast({ title: '已分享到球友圈', icon: 'success' })
    } catch (e) {
      // toast 已由 callWithToast 处理
    }
  },

  /** 查看历史报告详情 */
  viewDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/coach/coach?report_id=${id}` })
  },
})
