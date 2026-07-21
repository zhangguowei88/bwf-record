// cloudfunctions/feedback/index.js
// 用户反馈/需求收集：submit 提交 / list 查本人历史

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

  // === 提交反馈 ===
  if (event.type === 'submit') {
    const { category, content, contact } = event
    if (!content || !String(content).trim()) {
      return { code: -1, msg: '请填写反馈内容', data: null }
    }
    const text = String(content).trim().slice(0, 1000)
    // 内容安全检测（失败降级：仍保存但标记 unchecked）
    let safe = true
    try {
      const msgCheck = await cloud.openapi.security.msgSecCheck({ content: text })
      if (msgCheck.errcode !== 0) safe = false
    } catch (e) {
      safe = false
    }

    const addRes = await db.collection('feedback').add({
      data: {
        user_id: userId,
        openid,
        category: category || 'other',   // bug / feature / suggestion / other
        content: text,
        contact: contact ? String(contact).trim().slice(0, 50) : '',
        status: 'open',                  // open / processing / done
        safe,
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
      },
    })
    return { code: 0, msg: 'success', data: { feedback_id: addRes._id } }
  }

  // === 本人反馈历史 ===
  if (event.type === 'list') {
    const page = event.page || 1
    const pageSize = Math.min(event.page_size || 20, 50)
    const skip = (page - 1) * pageSize
    const countRes = await db.collection('feedback')
      .where({ user_id: userId })
      .count()
    const total = countRes.total
    const listRes = await db.collection('feedback')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
    const list = listRes.data.map((r) => ({
      _id: r._id,
      category: r.category,
      content: r.content,
      contact: r.contact,
      status: r.status,
      created_at: r.created_at,
    }))
    return {
      code: 0, msg: 'success',
      data: { list, total, page, page_size: pageSize, has_more: skip + list.length < total },
    }
  }

  return { code: -1, msg: '未知操作类型', data: null }
}
