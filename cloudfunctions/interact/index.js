// cloudfunctions/interact/index.js
// 点赞 / 取消点赞 / 评论

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

  const userRes = await db.collection('user_profile').where({ openid }).get()
  if (userRes.data.length === 0) {
    return { code: -1, msg: '用户不存在', data: null }
  }
  const userId = userRes.data[0]._id

  const { action, target_id, content } = event

  if (!target_id) {
    return { code: -1, msg: '参数缺失', data: null }
  }

  // === 点赞 ===
  if (action === 'like') {
    // 查是否已点赞
    const exist = await db.collection('like').where({ user_id: userId, target_id }).get()
    if (exist.data.length) {
      return { code: 0, msg: '已点赞', data: { liked: true } }
    }
    await db.collection('like').add({
      data: {
        user_id: userId,
        target_id,
        created_at: db.serverDate(),
      },
    })
    await db.collection('manual_record').doc(target_id).update({
      data: { like_count: _.inc(1) },
    })
    return { code: 0, msg: 'success', data: { liked: true } }
  }

  // === 取消点赞 ===
  if (action === 'unlike') {
    const exist = await db.collection('like').where({ user_id: userId, target_id }).get()
    if (!exist.data.length) {
      return { code: 0, msg: '未点赞', data: { liked: false } }
    }
    await db.collection('like').doc(exist.data[0]._id).remove()
    await db.collection('manual_record').doc(target_id).update({
      data: { like_count: _.inc(-1) },
    })
    return { code: 0, msg: 'success', data: { liked: false } }
  }

  // === 评论 ===
  if (action === 'comment') {
    if (!content || !content.trim()) {
      return { code: -1, msg: '评论内容不能为空', data: null }
    }
    // 内容安全检测
    try {
      const msgCheck = await cloud.openapi.security.msgSecCheck({ content })
      if (msgCheck.errcode !== 0) {
        return { code: -1, msg: '评论含违规信息', data: null }
      }
    } catch (e) {
      // 检测失败不阻塞
    }
    const addRes = await db.collection('comment').add({
      data: {
        user_id: userId,
        target_id,
        content: content.trim().slice(0, 200),
        created_at: db.serverDate(),
      },
    })
    await db.collection('manual_record').doc(target_id).update({
      data: { comment_count: _.inc(1) },
    })
    return { code: 0, msg: 'success', data: { comment_id: addRes._id } }
  }

  // === 评论列表 ===
  if (action === 'commentList') {
    const commentRes = await db.collection('comment')
      .where({ target_id })
      .orderBy('created_at', 'asc')
      .limit(50)
      .get()
    // 批量查评论作者
    const cmtUserIds = [...new Set(commentRes.data.map((c) => c.user_id))]
    let cmtAuthorMap = {}
    if (cmtUserIds.length) {
      const cmtAuthorRes = await db.collection('user_profile')
        .where({ _id: _.in(cmtUserIds) })
        .get()
      cmtAuthorRes.data.forEach((u) => {
        cmtAuthorMap[u._id] = u.nick_name || '羽球爱好者'
      })
    }
    const list = commentRes.data.map((c) => ({
      _id: c._id,
      user_id: c.user_id,
      author_name: cmtAuthorMap[c.user_id] || '羽球爱好者',
      content: c.content,
      created_at: c.created_at,
    }))
    return { code: 0, msg: 'success', data: { list } }
  }

  // === 举报 ===
  if (action === 'report') {
    const { reason } = event
    if (!reason) {
      return { code: -1, msg: '请选择举报原因', data: null }
    }
    await db.collection('report').add({
      data: {
        reporter_id: userId,
        target_id,
        reason,
        created_at: db.serverDate(),
      },
    })
    return { code: 0, msg: '举报已提交，我们会尽快处理', data: null }
  }

  // === 删除自己的动态（取消分享） ===
  if (action === 'deleteShare') {
    // 只有作者本人能删
    const recRes = await db.collection('manual_record').doc(target_id).get()
    if (!recRes.data || recRes.data.user_id !== userId) {
      return { code: -1, msg: '无权操作', data: null }
    }
    await db.collection('manual_record').doc(target_id).update({
      data: { is_shared: false },
    })
    return { code: 0, msg: '已从球友圈移除', data: null }
  }

  return { code: -1, msg: '未知操作', data: null }
}
