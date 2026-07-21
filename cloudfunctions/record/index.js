// cloudfunctions/record/index.js
// 打球记录录入 / 等级球龄目标设置 / 档案更新

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, msg: '未登录', data: null }
  }

  const userRes = await db.collection('user_profile').where({ openid }).get()
  if (userRes.data.length === 0) {
    return { code: -1, msg: '用户不存在', data: null }
  }
  const userId = userRes.data[0]._id

  // === 档案更新 ===
  if (event.type === 'profile') {
    const { nick_name, avatar_url, age, gender, height_cm, weight_kg } = event
    const updateData = { updated_at: db.serverDate() }
    if (nick_name != null) updateData.nick_name = String(nick_name).slice(0, 20)
    if (avatar_url != null) updateData.avatar_url = String(avatar_url).slice(0, 500)
    if (age != null) updateData.age = Number(age)
    if (gender != null) updateData.gender = Number(gender)
    if (height_cm != null) updateData.height_cm = Number(height_cm)
    if (weight_kg != null) updateData.weight_kg = Number(weight_kg)
    await db.collection('user_profile').doc(userId).update({ data: updateData })
    return { code: 0, msg: 'success', data: { updated: true } }
  }

  // === 等级 / 球龄更新 ===
  if (event.type === 'level') {
    const updateData = { updated_at: db.serverDate(), level_updated_at: db.serverDate(), level_set: true }
    if (event.badminton_level != null) {
      updateData.badminton_level = Number(event.badminton_level)
    }
    if (event.play_since) {
      updateData.play_since = String(event.play_since)
    }
    await db.collection('user_profile').doc(userId).update({ data: updateData })
    return { code: 0, msg: 'success', data: { updated: true } }
  }

  // === 每周目标更新 ===
  if (event.type === 'goal') {
    const days = Math.min(Math.max(Number(event.weekly_goal) || 3, 1), 7)
    await db.collection('user_profile').doc(userId).update({
      data: { weekly_goal: days, updated_at: db.serverDate() },
    })
    return { code: 0, msg: 'success', data: { weekly_goal: days } }
  }

  // === 修改记录 ===
  if (event.type === 'update') {
    const { record_id, duration_min, intensity, feeling, sore_parts, venue, partners, note, is_shared, media } = event
    if (!record_id) {
      return { code: -1, msg: '参数缺失', data: null }
    }
    // 校验归属
    const recRes = await db.collection('manual_record').doc(record_id).get()
    if (!recRes.data || recRes.data.user_id !== userId) {
      return { code: -1, msg: '无权操作', data: null }
    }
    const updateData = { updated_at: db.serverDate() }
    if (duration_min != null) updateData.duration_min = Number(duration_min)
    if (intensity != null) updateData.intensity = Number(intensity)
    if (feeling != null) updateData.feeling = Number(feeling)
    if (Array.isArray(sore_parts)) updateData.sore_parts = sore_parts
    if (venue != null) updateData.venue = venue
    if (Array.isArray(partners)) updateData.partners = partners
    if (note != null) updateData.note = note
    if (is_shared != null) updateData.is_shared = !!is_shared
    if (Array.isArray(media)) updateData.media = media.slice(0, 9)
    await db.collection('manual_record').doc(record_id).update({ data: updateData })
    return { code: 0, msg: 'success', data: { updated: true } }
  }

  // === 删除记录 ===
  if (event.type === 'delete') {
    const { record_id } = event
    if (!record_id) {
      return { code: -1, msg: '参数缺失', data: null }
    }
    const recRes = await db.collection('manual_record').doc(record_id).get()
    if (!recRes.data || recRes.data.user_id !== userId) {
      return { code: -1, msg: '无权操作', data: null }
    }
    await db.collection('manual_record').doc(record_id).remove()
    // 关联的点赞评论也清理（可选，简化处理：保留但不显示）
    return { code: 0, msg: 'success', data: { deleted: true } }
  }

  // === 打球记录录入 ===
  const {
    record_date, duration_min, intensity, feeling,
    sore_parts, venue, partners, note, is_shared, media,
  } = event

  if (!record_date || !duration_min) {
    return { code: -1, msg: '参数缺失', data: null }
  }

  // 内容安全检测（分享且有备注时检查；检测失败不阻塞，降级为不分享）
  let finalShared = !!is_shared
  if (finalShared && note) {
    try {
      const msgCheck = await cloud.openapi.security.msgSecCheck({ content: note })
      if (msgCheck.errcode !== 0) {
        finalShared = false
      }
    } catch (e) {
      // 检测不可用，降级为不分享但保留记录
      finalShared = false
    }
  }

  const addRes = await db.collection('manual_record').add({
    data: {
      user_id: userId,
      record_date,
      duration_min: Number(duration_min),
      intensity: Number(intensity) || 2,
      feeling: Number(feeling) || 1,
      sore_parts: Array.isArray(sore_parts) ? sore_parts : [],
      venue: venue || '',
      partners: Array.isArray(partners) ? partners : [],
      note: note || '',
      media: Array.isArray(media) ? media.slice(0, 9) : [],
      is_shared: finalShared,
      like_count: 0,
      comment_count: 0,
      created_at: db.serverDate(),
    },
  })

  return {
    code: 0,
    msg: 'success',
    data: { record_id: addRes._id },
  }
}
