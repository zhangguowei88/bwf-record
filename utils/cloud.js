// utils/cloud.js — 云函数调用统一封装
// 统一信封 { code, msg, data }，自动处理登录态与错误提示

/**
 * 调用云函数
 * @param {string} name 云函数名
 * @param {object} data 入参
 * @returns {Promise<object>} res.result.data
 */
function call(name, data = {}) {
  return wx.cloud.callFunction({ name, data }).then((res) => {
    const result = res.result || {}
    if (result.code === 0) {
      return result.data
    }
    // 业务错误
    const err = new Error(result.msg || '请求失败')
    err.code = result.code
    throw err
  }).catch((e) => {
    console.error(`[cloud:${name}]`, e)
    throw e
  })
}

/** 调用云函数并自动 toast 错误 */
async function callWithToast(name, data = {}) {
  try {
    return await call(name, data)
  } catch (e) {
    wx.showToast({ title: e.message || '网络异常', icon: 'none' })
    throw e
  }
}

module.exports = { call, callWithToast }
