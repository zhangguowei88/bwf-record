// pages/welcome/welcome.js — 首次授权页
const app = getApp()
const { call } = require('../../utils/cloud')

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    hasAvatar: false,
    hasNick: false,
    canEnter: false,
    uploading: false,
  },

  onLoad() {
    // 确保 profile 已加载
    app.ensureLogin().then(() => {
      const p = app.globalData.profile
      if (p && p.avatar_url && p.nick_name) {
        this.goHome()
      }
    })
  },

  // 选择头像
  async onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    this.setData({ uploading: true })
    try {
      // 确保 openid 已拿到
      await app.ensureLogin()
      const openid = app.globalData.openid || 'unknown'
      const cloudPath = `avatars/${openid}_${Date.now()}.png`
      console.log('[welcome] 上传头像, cloudPath:', cloudPath)
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempPath,
      })
      console.log('[welcome] 上传成功, fileID:', uploadRes.fileID)
      this.setData({
        avatarUrl: uploadRes.fileID,
        hasAvatar: true,
        uploading: false,
        canEnter: this.data.hasNick,
      })
    } catch (err) {
      console.error('[welcome] 上传头像失败:', err)
      this.setData({ uploading: false })
      wx.showToast({ title: err.message || '上传失败', icon: 'none' })
    }
  },

  // 输入昵称
  onNickInput(e) {
    const nick = e.detail.value.trim()
    this.setData({
      nickName: nick,
      hasNick: nick.length > 0,
      canEnter: this.data.hasAvatar && nick.length > 0,
    })
  },

  // 保存并进入
  async enterApp() {
    if (!this.data.canEnter) {
      wx.showToast({ title: '请先设置头像和昵称', icon: 'none' })
      return
    }
    try {
      console.log('[welcome] 保存档案, avatar:', this.data.avatarUrl, 'nick:', this.data.nickName)
      await call('record', {
        type: 'profile',
        avatar_url: this.data.avatarUrl,
        nick_name: this.data.nickName,
      })
      console.log('[welcome] 保存成功')
      app.globalData.profile.avatar_url = this.data.avatarUrl
      app.globalData.profile.nick_name = this.data.nickName
      this.goHome()
    } catch (err) {
      console.error('[welcome] 保存失败:', err)
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  // 跳过
  skip() {
    this.goHome()
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
  },
})
