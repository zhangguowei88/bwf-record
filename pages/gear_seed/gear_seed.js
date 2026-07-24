// pages/gear_seed/gear_seed.js — 导入种子装备 + 第三方参考
const { call } = require('../../utils/cloud')
const seedData = require('../../data/gear_seed.js')
const thirdpartyData = require('../../data/thirdparty_seed.js')

Page({
  data: {
    list: seedData || [],
    tpList: thirdpartyData || [],
    importing: false,
    tpImporting: false,
    result: null,
    tpResult: null,
  },

  async importAll() {
    if (this.data.importing) return
    if (!this.data.list.length) {
      wx.showToast({ title: '无种子数据', icon: 'none' })
      return
    }
    this.setData({ importing: true })
    wx.showLoading({ title: '导入中...', mask: true })
    try {
      const res = await call('gear', { type: 'seed', gears: this.data.list })
      wx.hideLoading()
      this.setData({ importing: false, result: res })
      wx.showModal({
        title: '导入完成',
        content: `新增 ${res.inserted} 条，跳过 ${res.skipped} 条，共 ${res.total} 条`,
        showCancel: false,
      })
    } catch (e) {
      wx.hideLoading()
      this.setData({ importing: false })
      wx.showToast({ title: e.message || '导入失败', icon: 'none' })
    }
  },

  async importThirdparty() {
    if (this.data.tpImporting) return
    if (!this.data.tpList.length) {
      wx.showToast({ title: '无第三方数据', icon: 'none' })
      return
    }
    this.setData({ tpImporting: true })
    wx.showLoading({ title: '导入第三方参考...', mask: true })
    try {
      const res = await call('gear', { type: 'seed_thirdparty', list: this.data.tpList })
      wx.hideLoading()
      this.setData({ tpImporting: false, tpResult: res })
      wx.showModal({
        title: '导入完成',
        content: `新增 ${res.inserted} 条，更新 ${res.skipped} 条，未匹配装备 ${res.notfound} 条`,
        showCancel: false,
      })
    } catch (e) {
      wx.hideLoading()
      this.setData({ tpImporting: false })
      wx.showToast({ title: e.message || '导入失败', icon: 'none' })
    }
  },
})
