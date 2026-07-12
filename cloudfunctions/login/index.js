// cloudfunctions/login/index.js
// 微信登录 + 用户档案初始化（羽毛球垂类）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, msg: '获取 openid 失败', data: null }
  }

  const userCol = db.collection('user_profile')
  const { data } = await userCol.where({ openid }).get()

  let profile
  if (data.length === 0) {
    // 新用户，创建默认档案
    const now = db.serverDate()
    const newProfile = {
      openid,
      nick_name: '',
      avatar_url: '',
      gender: 0,
      age: 30,
      height_cm: 170,
      weight_kg: 65.0,
      // 羽毛球垂类字段
      badminton_level: 2.0,          // 中羽民间等级 1.0-5.0，自评
      play_since: currentYM(),        // 球龄起点（年月），默认当月
      weekly_goal: 3,                 // 每周打球目标场次，默认 3
      level_set: false,               // 是否已自评水平（用于首次引导）
      level_updated_at: now,
      created_at: now,
      updated_at: now,
    }
    const addRes = await userCol.add({ data: newProfile })
    profile = { _id: addRes._id, ...newProfile }
    profile.created_at = new Date().toISOString()
    profile.updated_at = profile.created_at
  } else {
    profile = data[0]
    // 老用户兜底
    if (profile.badminton_level == null) profile.badminton_level = 2.0
    if (!profile.play_since) profile.play_since = currentYM()
    if (profile.weekly_goal == null) profile.weekly_goal = 3
    if (profile.level_set == null) profile.level_set = false
  }

  return {
    code: 0,
    msg: 'success',
    data: { openid, profile },
  }
}

/** 当前年月，格式 YYYY-MM */
function currentYM() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
