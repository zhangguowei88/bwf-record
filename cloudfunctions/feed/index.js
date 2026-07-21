// cloudfunctions/feed/index.js
// 球友圈：查询分享的打球记录 + 作者信息 + 点赞/评论数

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { code: -1, msg: '未登录', data: null }
  }

  // 当前用户 id（用于判断是否已点赞）
  const userRes = await db.collection('user_profile').where({ openid }).get()
  const me = userRes.data[0]
  const myUserId = me ? me._id : ''

  const page = event.page || 1
  const pageSize = event.page_size || 20
  const skip = (page - 1) * pageSize

  // 查分享的记录 + 自己的所有记录（保证自己发的肯定能看到）
  const where = myUserId
    ? _.or([{ is_shared: true }, { user_id: myUserId }])
    : { is_shared: true }
  const listRes = await db.collection('manual_record')
    .where(where)
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const records = listRes.data
  if (!records.length) {
    return { code: 0, msg: 'success', data: { list: [], has_more: false } }
  }

  // 收集所有作者 id，批量查作者信息
  const authorIds = [...new Set(records.map((r) => r.user_id))]
  const authorRes = await db.collection('user_profile')
    .where({ _id: _.in(authorIds) })
    .get()
  const authorMap = {}
  authorRes.data.forEach((u) => {
    authorMap[u._id] = {
      nick_name: u.nick_name || '羽球爱好者',
      gender: u.gender,
      badminton_level: u.badminton_level || 2.0,
    }
  })

  // 查当前用户对这些记录的点赞状态（like 集合可能不存在，容错）
  const recordIds = records.map((r) => r._id)
  let likedSet = new Set()
  if (myUserId && recordIds.length) {
    try {
      const likeRes = await db.collection('like')
        .where({ user_id: myUserId, target_id: _.in(recordIds) })
        .get()
      likeRes.data.forEach((l) => likedSet.add(l.target_id))
    } catch (e) {
      // like 集合不存在时忽略，不影响列表展示
    }
  }

  const list = records.map((r) => ({
    _id: r._id,
    user_id: r.user_id,
    is_mine: r.user_id === myUserId,
    author: authorMap[r.user_id] || { nick_name: '羽球爱好者', badminton_level: 2.0 },
    record_date: r.record_date,
    duration_min: r.duration_min,
    intensity: r.intensity,
    feeling: r.feeling,
    sore_parts: r.sore_parts || [],
    venue: r.venue || '',
    media: Array.isArray(r.media) ? r.media : [],
    note: r.note || '',
    like_count: r.like_count || 0,
    comment_count: r.comment_count || 0,
    is_liked: likedSet.has(r._id),
    created_at: r.created_at,
  }))

  return {
    code: 0,
    msg: 'success',
    data: {
      list,
      has_more: list.length === pageSize,
    },
  }
}
