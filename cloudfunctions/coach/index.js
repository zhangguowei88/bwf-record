// cloudfunctions/coach/index.js
// 动作诊断编排云函数：analyze / list / detail / share
// analyze 流程：建 pending 记录 → getTempFileURL → 内网调云托管 Python 服务 → 回写 done

const cloud = require('wx-server-sdk')
const axios = require('axios')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 云托管分析服务地址（部署后在云函数环境变量配置 ANALYZER_URL）
const ANALYZER_URL = process.env.ANALYZER_URL || ''

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

  // === 分析 ===
  if (event.type === 'analyze') {
    return await doAnalyze(event, userId, openid)
  }

  // === 报告列表 ===
  if (event.type === 'list') {
    return await doList(event, userId)
  }

  // === 报告详情 ===
  if (event.type === 'detail') {
    return await doDetail(event, userId)
  }

  // === 分享到球友圈 ===
  if (event.type === 'share') {
    return await doShare(event, userId, openid)
  }

  return { code: -1, msg: '未知操作类型', data: null }
}

/** 分析：建 pending → 调云托管 → 回写 */
async function doAnalyze(event, userId, openid) {
  const { file_id, action_type = 'high_clear', main_side = 'r' } = event
  if (!file_id) {
    return { code: -1, msg: '参数缺失: file_id', data: null }
  }
  if (!ANALYZER_URL) {
    return { code: -1, msg: '分析服务未配置', data: null }
  }

  // 1. 建 pending 记录
  const addRes = await db.collection('action_report').add({
    data: {
      user_id: userId,
      openid,
      video_file_id: file_id,
      action_type,
      main_side,
      status: 'pending',
      like_count: 0,
      comment_count: 0,
      is_shared: false,
      created_at: db.serverDate(),
      updated_at: db.serverDate(),
    },
  })
  const reportId = addRes._id

  try {
    // 2. 取视频临时下载 URL
    const urlRes = await cloud.getTempFileURL({ fileList: [file_id] })
    const fileItem = urlRes.fileList && urlRes.fileList[0]
    if (!fileItem || fileItem.status !== 0 || !fileItem.tempFileURL) {
      throw new Error('获取视频下载地址失败')
    }

    // 3. 调云托管 Python 分析服务
    const resp = await axios.post(
      ANALYZER_URL,
      { file_url: fileItem.tempFileURL, action_type, main_side },
      { timeout: 55000, headers: { 'Content-Type': 'application/json' } }
    )
    const result = resp.data
    if (!result || result.code !== 0) {
      throw new Error((result && result.msg) || '分析服务返回异常')
    }

    // 4. 回写 done + 报告数据
    const data = result.data
    await db.collection('action_report').doc(reportId).update({
      data: {
        status: 'done',
        total_score: data.total_score,
        stage_scores: data.stage_scores,
        metrics: data.metrics,
        errors: data.errors,
        skeleton_frames: data.skeleton_frames,
        hit_frame: data.hit_frame,
        segment_confidence: data.segment_confidence,
        frames_analyzed: data.frames_analyzed,
        updated_at: db.serverDate(),
      },
    })

    return { code: 0, msg: 'success', data: { report_id: reportId, ...data } }
  } catch (e) {
    // 回写 fail
    await db.collection('action_report').doc(reportId).update({
      data: { status: 'fail', fail_reason: e.message || String(e), updated_at: db.serverDate() },
    })
    return { code: -1, msg: e.message || '分析失败', data: { report_id: reportId } }
  }
}

/** 报告列表（本人，分页） */
async function doList(event, userId) {
  const page = event.page || 1
  const pageSize = Math.min(event.page_size || 20, 50)
  const skip = (page - 1) * pageSize
  const countRes = await db.collection('action_report')
    .where({ user_id: userId, status: 'done' })
    .count()
  const total = countRes.total
  const listRes = await db.collection('action_report')
    .where({ user_id: userId, status: 'done' })
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()
  // 列表不返回完整 skeleton_frames，减少传输
  const list = listRes.data.map((r) => ({
    _id: r._id,
    action_type: r.action_type,
    total_score: r.total_score,
    stage_scores: r.stage_scores,
    errors: (r.errors || []).filter((e) => e.severity !== 'info'),
    video_file_id: r.video_file_id,
    created_at: r.created_at,
    is_shared: r.is_shared,
  }))
  return {
    code: 0, msg: 'success',
    data: { list, total, page, page_size: pageSize, has_more: skip + list.length < total },
  }
}

/** 报告详情 */
async function doDetail(event, userId) {
  const { report_id } = event
  if (!report_id) return { code: -1, msg: '参数缺失: report_id', data: null }
  const res = await db.collection('action_report').doc(report_id).get()
  if (!res.data || res.data.user_id !== userId) {
    return { code: -1, msg: '无权查看或记录不存在', data: null }
  }
  return { code: 0, msg: 'success', data: res.data }
}

/** 分享到球友圈：设 is_shared=true，feed 流读取 action_report 中 is_shared 的记录 */
async function doShare(event, userId, openid) {
  const { report_id } = event
  if (!report_id) return { code: -1, msg: '参数缺失: report_id', data: null }
  const res = await db.collection('action_report').doc(report_id).get()
  if (!res.data || res.data.user_id !== userId) {
    return { code: -1, msg: '无权操作', data: null }
  }
  await db.collection('action_report').doc(report_id).update({
    data: { is_shared: true, updated_at: db.serverDate() },
  })
  return { code: 0, msg: 'success', data: { shared: true } }
}
