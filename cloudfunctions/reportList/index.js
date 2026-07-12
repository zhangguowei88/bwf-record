// cloudfunctions/reportList/index.js
// 历史打球记录列表（分页，按日期倒序）

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

  const page = event.page || 1
  const pageSize = event.page_size || 20
  const skip = (page - 1) * pageSize

  const countRes = await db.collection('manual_record')
    .where({ user_id: userId })
    .count()
  const total = countRes.total

  const listRes = await db.collection('manual_record')
    .where({ user_id: userId })
    .orderBy('record_date', 'desc')
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()

  return {
    code: 0,
    msg: 'success',
    data: {
      list: listRes.data,
      total,
      page,
      page_size: pageSize,
      has_more: skip + listRes.data.length < total,
    },
  }
}
