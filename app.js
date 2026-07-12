// app.js — 运动周报小程序入口
// 云开发初始化 + 静默登录

App({
  globalData: {
    openid: '',
    profile: null,
    hasWerun: false, // 是否已授权微信运动
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    // 初始化云开发
    // ⚠️ 部署时替换为你的云环境 ID
    wx.cloud.init({
      env: 'cloud1-d9gdvsrfl60292569',
      traceUser: true,
    })
    // 静默登录，拿 openid
    this.login()
  },

  /** 静默登录：调用 login 云函数换取 openid */
  async login() {
    try {
      const res = await wx.cloud.callFunction({ name: 'login' })
      if (res.result && res.result.code === 0) {
        this.globalData.openid = res.result.data.openid
        this.globalData.profile = res.result.data.profile || null
        // 未授权头像昵称 → 跳转授权页
        const p = this.globalData.profile
        if (p && !p.avatar_url && !p.nick_name) {
          wx.reLaunch({ url: '/pages/welcome/welcome' })
        }
      }
    } catch (e) {
      console.error('静默登录失败', e)
    }
  },

  /** 检查 session 有效性，失效则重新登录 */
  async ensureLogin() {
    if (this.globalData.openid) return this.globalData.openid
    await this.login()
    return this.globalData.openid
  },
})
