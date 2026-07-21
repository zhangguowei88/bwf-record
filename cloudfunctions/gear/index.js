// cloudfunctions/gear/index.js
// 装备评测：三层数据(官方实测/第三方/用户众测) + 10分7维度 + 加权综合分

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 用户水平权重（与前端 rules.js USER_LEVELS 保持一致）
const LEVEL_WEIGHT = { beginner: 0.15, intermediate: 0.15, advanced: 0.25 }
// 官方实测权重
const OFFICIAL_WEIGHT = 0.6

// 各品类维度 key（与前端 rules.js GEAR_DIMENSIONS 一致）
const DIM_KEYS = {
  racket: ['attack', 'smash', 'drive', 'clear', 'net', 'difficulty', 'shock'],
  shoe: ['support', 'grip', 'cushion', 'speed', 'wrap', 'durability', 'breath'],
  shuttle: ['stable', 'durable', 'sound', 'cold', 'humid', 'consistency', 'value'],
  apparel: ['comfort', 'sweat', 'stretch', 'durability', 'value'],
  bag: ['capacity', 'compartment', 'material', 'carry', 'value'],
  guard: ['protect', 'comfort', 'fix', 'breath', 'durability'],
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: -1, msg: '未登录', data: null }
  }
  const userRes = await db.collection('user_profile').where({ openid }).get()
  const me = userRes.data[0]
  const myUserId = me ? me._id : ''

  switch (event.type) {
    case 'list_gear':
      return await listGear(event)
    case 'gear_detail':
      return await gearDetail(event, myUserId)
    case 'submit_review':
      return await submitReview(event, me, 'user')
    case 'submit_official':
      return await submitReview(event, me, 'official')
    case 'submit_thirdparty':
      return await submitThirdparty(event, me)
    case 'list_review':
      return await listReview(event, myUserId)
    case 'list_thirdparty':
      return await listThirdparty(event)
    case 'review_detail':
      return await reviewDetail(event, myUserId)
    case 'apply_gear':
      return await applyGear(event, me)
    case 'my_review':
      return await myReview(event, myUserId)
    default:
      return { code: -1, msg: '未知操作类型', data: null }
  }
}

/** 装备库分页 */
async function listGear(event) {
  const page = event.page || 1
  const pageSize = Math.min(event.page_size || 20, 50)
  const skip = (page - 1) * pageSize
  const where = { status: 'approved' }
  if (event.category) where.category = event.category
  if (event.tier) where.tier = event.tier
  if (event.keyword) {
    const kw = String(event.keyword).trim()
    if (kw) where.name = db.Regexp({ regexp: kw, options: 'i' })
  }
  // 价格区间筛选（price_max 传入时按 price_low 过滤）
  if (event.price_max != null) {
    where.price_low = _.lte(Number(event.price_max))
  }
  const countRes = await db.collection('gear').where(where).count()
  const total = countRes.total
  const listRes = await db.collection('gear')
    .where(where)
    .orderBy('review_count', 'desc')
    .orderBy('created_at', 'desc')
    .skip(skip)
    .limit(pageSize)
    .get()
  const list = listRes.data.map((g) => mapGearCard(g))
  return {
    code: 0, msg: 'success',
    data: { list, total, page, page_size: pageSize, has_more: skip + list.length < total },
  }
}

function mapGearCard(g) {
  return {
    _id: g._id,
    name: g.name,
    brand: g.brand,
    category: g.category,
    tier: g.tier || '',
    cover_file_id: g.cover_file_id || '',
    price_low: g.price_low || 0,
    price_high: g.price_high || 0,
    injury_tags: g.injury_tags || [],
    review_count: g.review_count || 0,
    avg_score: g.avg_score || 0,
    has_official: !!g.official_review_id,
  }
}

/** 装备详情：含官方/第三方/众测聚合 */
async function gearDetail(event, myUserId) {
  const { gear_id } = event
  if (!gear_id) return { code: -1, msg: '参数缺失: gear_id', data: null }
  const res = await db.collection('gear').doc(gear_id).get()
  if (!res.data) return { code: -1, msg: '装备不存在', data: null }
  const g = res.data

  let myReview = null
  if (myUserId) {
    try {
      const mr = await db.collection('gear_review')
        .where({ gear_id, user_id: myUserId, source: 'user' })
        .limit(1).get()
      myReview = mr.data[0] || null
    } catch (e) {}
  }

  // 官方实测
  let official = null
  if (g.official_review_id) {
    try {
      const o = await db.collection('gear_review').doc(g.official_review_id).get()
      official = o.data || null
    } catch (e) {}
  }

  // 第三方列表
  let thirdparty = []
  try {
    const tp = await db.collection('gear_review')
      .where({ gear_id, source: 'thirdparty', status: 'normal' })
      .orderBy('created_at', 'desc')
      .limit(5).get()
    thirdparty = tp.data
  } catch (e) {}

  return {
    code: 0, msg: 'success',
    data: {
      _id: g._id,
      name: g.name,
      brand: g.brand,
      category: g.category,
      tier: g.tier || '',
      spec: g.spec || {},
      cover_file_id: g.cover_file_id || '',
      price_low: g.price_low || 0,
      price_high: g.price_high || 0,
      injury_tags: g.injury_tags || [],
      review_count: g.review_count || 0,
      avg_score: g.avg_score || 0,
      official_score: g.official_score || 0,
      my_review: myReview,
      official,
      thirdparty,
    },
  }
}

/** 校验维度打分（10分制） */
function validateDimensions(dimensions, category) {
  const keys = DIM_KEYS[category]
  if (!keys) return { ok: false, msg: '分类不支持' }
  if (!dimensions || typeof dimensions !== 'object') return { ok: false, msg: '请完成各维度打分' }
  const out = {}
  for (const k of keys) {
    const v = Number(dimensions[k])
    if (!v || v < 1 || v > 10) return { ok: false, msg: `维度 ${k} 分数需1-10` }
    out[k] = v
  }
  return { ok: true, dims: out }
}

/** 维度均分（综合分） */
function dimsAvg(dims) {
  const vals = Object.values(dims || {})
  if (!vals.length) return 0
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10
}

/** 提交评测（user / official 共用） */
async function submitReview(event, me, source) {
  if (!me) return { code: -1, msg: '用户不存在', data: null }
  // 官方实测仅管理员(me.is_admin 或白名单)可写，这里用 user_profile.is_admin 字段，缺省放行(你自己测试)
  // 上线后建议在 user_profile 加 is_admin:true 限定
  const userId = me._id
  const {
    gear_id, review_type = 'quick', duration_months = 1,
    pros = '', cons = '', content, media = [], is_verified_use,
    dimensions, user_level, play_style, weight, injuries = [],
    tester, test_env, test_date,
  } = event

  if (!gear_id) return { code: -1, msg: '请选择装备', data: null }
  const gRes = await db.collection('gear').doc(gear_id).get()
  if (!gRes.data || gRes.data.status !== 'approved') {
    return { code: -1, msg: '装备不存在或未审核', data: null }
  }
  const category = gRes.data.category

  // 维度校验
  const dv = validateDimensions(dimensions, category)
  if (!dv.ok) return { code: -1, msg: dv.msg, data: null }

  // 用户众测必填使用承诺 + 画像
  if (source === 'user') {
    if (!is_verified_use) return { code: -1, msg: '请勾选使用承诺', data: null }
    if (!user_level) return { code: -1, msg: '请选择水平', data: null }
  }
  const text = String(content || '').trim()
  if (!text) return { code: -1, msg: '请填写评价内容', data: null }
  if (text.length > 3000) return { code: -1, msg: '内容过长', data: null }
  const dur = Math.max(1, Math.min(120, Number(duration_months) || 1))
  const safeMedia = Array.isArray(media) ? media.slice(0, 9).map((m) => ({ type: m.type, file_id: m.file_id })) : []

  // 内容安全
  let safe = true
  try {
    const allText = text + ' ' + String(pros) + ' ' + String(cons)
    const msgCheck = await cloud.openapi.security.msgSecCheck({ content: allText.slice(0, 600) })
    if (msgCheck.errcode !== 0) safe = false
  } catch (e) { safe = false }
  const status = safe ? 'normal' : 'pending_review'

  const author = {
    nick_name: me.nick_name || '羽球爱好者',
    avatar_url: me.avatar_url || '',
    badminton_level: me.badminton_level || 2.0,
  }

  const payload = {
    gear_id, gear_name: gRes.data.name, category,
    user_id: userId, openid: me.openid || '',
    author,
    source,
    review_type,
    dimensions: dv.dims,
    score: dimsAvg(dv.dims),
    duration_months: dur,
    pros: String(pros).slice(0, 500),
    cons: String(cons).slice(0, 500),
    content: text,
    media: safeMedia,
    is_verified_use: source === 'user' ? !!is_verified_use : true,
    // 用户画像
    user_profile: source === 'user' ? {
      level: user_level,
      play_style,
      weight: weight ? Number(weight) : 0,
      injuries: Array.isArray(injuries) ? injuries : [],
    } : null,
    // 官方实测专属
    tester: source === 'official' ? (tester || '') : '',
    test_env: source === 'official' ? (test_env || '') : '',
    test_date: source === 'official' ? (test_date || '') : '',
    status,
    like_count: 0,
    comment_count: 0,
    updated_at: db.serverDate(),
  }

  // 官方实测：每装备仅一条，作为 official_review_id 挂载
  if (source === 'official') {
    let existOfficialId = gRes.data.official_review_id || ''
    if (existOfficialId) {
      await db.collection('gear_review').doc(existOfficialId).update({ data: payload })
    } else {
      payload.created_at = db.serverDate()
      const addRes = await db.collection('gear_review').add({ data: payload })
      existOfficialId = addRes._id
      await db.collection('gear').doc(gear_id).update({ data: { official_review_id: existOfficialId } })
    }
    await recomputeGearStats(gear_id)
    return { code: 0, msg: 'success', data: { review_id: existOfficialId, status, need_review: !safe } }
  }

  // 用户众测：每用户每装备 1 条
  let existingId = ''
  try {
    const ex = await db.collection('gear_review')
      .where({ gear_id, user_id: userId, source: 'user' })
      .limit(1).get()
    existingId = (ex.data[0] && ex.data[0]._id) || ''
  } catch (e) {}

  let reviewId
  if (existingId) {
    await db.collection('gear_review').doc(existingId).update({ data: payload })
    reviewId = existingId
  } else {
    payload.created_at = db.serverDate()
    const addRes = await db.collection('gear_review').add({ data: payload })
    reviewId = addRes._id
  }
  await recomputeGearStats(gear_id)
  return { code: 0, msg: 'success', data: { review_id: reviewId, status, need_review: !safe } }
}

/** 第三方评测录入（仅管理员，摘抄量化数据） */
async function submitThirdparty(event, me) {
  if (!me) return { code: -1, msg: '用户不存在', data: null }
  const { gear_id, source_name, source_url, data_summary, pros = '', cons = '' } = event
  if (!gear_id || !source_name) return { code: -1, msg: '参数缺失', data: null }
  const gRes = await db.collection('gear').doc(gear_id).get()
  if (!gRes.data) return { code: -1, msg: '装备不存在', data: null }
  const addRes = await db.collection('gear_review').add({
    data: {
      gear_id, gear_name: gRes.data.name, category: gRes.data.category,
      user_id: me._id, author: { nick_name: me.nick_name || '管理员' },
      source: 'thirdparty',
      source_name: String(source_name).slice(0, 60),
      source_url: String(source_url || '').slice(0, 300),
      data_summary: String(data_summary || '').slice(0, 1000),
      pros: String(pros).slice(0, 500),
      cons: String(cons).slice(0, 500),
      dimensions: {},
      score: 0,  // 第三方不计入总分
      status: 'normal',
      created_at: db.serverDate(),
      updated_at: db.serverDate(),
    },
  })
  return { code: 0, msg: 'success', data: { review_id: addRes._id } }
}

/** 第三方列表 */
async function listThirdparty(event) {
  const { gear_id } = event
  if (!gear_id) return { code: -1, msg: '参数缺失', data: null }
  const res = await db.collection('gear_review')
    .where({ gear_id, source: 'thirdparty', status: 'normal' })
    .orderBy('created_at', 'desc').get()
  return { code: 0, msg: 'success', data: { list: res.data } }
}

/** 加权重算综合分：官方60% + 资深用户25% + 普通用户15%
 *  - 有官方：总分 = 官方分*0.6 + 用户加权均分*0.4(资深/普通内部按权重)
 *  - 无官方：总分 = 用户加权均分(资深0.25/普通0.15 归一化)
 */
async function recomputeGearStats(gearId) {
  try {
    const g = await db.collection('gear').doc(gearId).get()
    const gear = g.data
    // 用户众测（normal）
    const uRes = await db.collection('gear_review')
      .where({ gear_id: gearId, source: 'user', status: 'normal' })
      .get()
    const userReviews = uRes.data
    // 官方
    let officialScore = 0
    if (gear.official_review_id) {
      try {
        const o = await db.collection('gear_review').doc(gear.official_review_id).get()
        if (o.data && o.data.status === 'normal') officialScore = o.data.score || 0
      } catch (e) {}
    }

    let total = 0
    if (officialScore > 0) {
      // 用户部分加权
      const userWeighted = weightedUserScore(userReviews)
      total = officialScore * OFFICIAL_WEIGHT + userWeighted * (1 - OFFICIAL_WEIGHT)
    } else {
      total = weightedUserScore(userReviews, true)
    }
    total = Math.round(total * 10) / 10

    await db.collection('gear').doc(gearId).update({
      data: {
        review_count: userReviews.length,
        avg_score: total,
        official_score: officialScore,
        updated_at: db.serverDate(),
      },
    })
  } catch (e) {}
}

/** 用户评测加权均分。normalize=true 时把权重归一化(无官方场景) */
function weightedUserScore(reviews, normalize) {
  if (!reviews || !reviews.length) return 0
  let wSum = 0, sSum = 0
  reviews.forEach((r) => {
    const w = (LEVEL_WEIGHT[r.user_profile && r.user_profile.level] || 0.15)
    wSum += w
    sSum += (r.score || 0) * w
  })
  if (!wSum) return 0
  return sSum / wSum
}

/** 评测信息流（用户众测） */
async function listReview(event, myUserId) {
  const page = event.page || 1
  const pageSize = Math.min(event.page_size || 20, 50)
  const skip = (page - 1) * pageSize
  const where = { status: 'normal', source: 'user' }
  if (event.category) where.category = event.category
  if (event.gear_id) where.gear_id = event.gear_id

  const countRes = await db.collection('gear_review').where(where).count()
  const total = countRes.total
  const listRes = await db.collection('gear_review')
    .where(where)
    .orderBy('created_at', 'desc')
    .skip(skip).limit(pageSize).get()
  const reviews = listRes.data
  if (!reviews.length) {
    return { code: 0, msg: 'success', data: { list: [], total, page, page_size: pageSize, has_more: false } }
  }
  const ids = reviews.map((r) => r._id)
  let likedSet = new Set()
  if (myUserId && ids.length) {
    try {
      const likeRes = await db.collection('like')
        .where({ user_id: myUserId, target_id: _.in(ids) }).get()
      likeRes.data.forEach((l) => likedSet.add(l.target_id))
    } catch (e) {}
  }
  const list = reviews.map((r) => ({
    _id: r._id,
    gear_id: r.gear_id,
    gear_name: r.gear_name,
    category: r.category,
    user_id: r.user_id,
    is_mine: r.user_id === myUserId,
    author: r.author || { nick_name: '羽球爱好者', badminton_level: 2.0 },
    review_type: r.review_type,
    dimensions: r.dimensions || {},
    score: r.score,
    duration_months: r.duration_months,
    user_profile: r.user_profile || {},
    content: r.content,
    media: Array.isArray(r.media) ? r.media.slice(0, 3) : [],
    like_count: r.like_count || 0,
    comment_count: r.comment_count || 0,
    is_liked: likedSet.has(r._id),
    created_at: r.created_at,
  }))
  return { code: 0, msg: 'success', data: { list, total, page, page_size: pageSize, has_more: skip + list.length < total } }
}

/** 单条评测详情 */
async function reviewDetail(event, myUserId) {
  const { review_id } = event
  if (!review_id) return { code: -1, msg: '参数缺失: review_id', data: null }
  const res = await db.collection('gear_review').doc(review_id).get()
  if (!res.data) return { code: -1, msg: '评测不存在', data: null }
  const r = res.data
  if (r.status !== 'normal' && r.user_id !== myUserId) {
    return { code: -1, msg: '该评测暂不可见', data: null }
  }
  let is_liked = false
  if (myUserId) {
    try {
      const lk = await db.collection('like').where({ user_id: myUserId, target_id: review_id }).count()
      is_liked = lk.total > 0
    } catch (e) {}
  }
  return {
    code: 0, msg: 'success',
    data: {
      _id: r._id, gear_id: r.gear_id, gear_name: r.gear_name, category: r.category,
      user_id: r.user_id, is_mine: r.user_id === myUserId,
      author: r.author || {},
      source: r.source, review_type: r.review_type,
      dimensions: r.dimensions || {}, score: r.score,
      duration_months: r.duration_months,
      user_profile: r.user_profile || null,
      tester: r.tester || '', test_env: r.test_env || '', test_date: r.test_date || '',
      source_name: r.source_name || '', source_url: r.source_url || '', data_summary: r.data_summary || '',
      pros: r.pros || '', cons: r.cons || '', content: r.content,
      media: r.media || [],
      like_count: r.like_count || 0, comment_count: r.comment_count || 0,
      is_liked, status: r.status, created_at: r.created_at,
    },
  }
}

/** 用户申请新装备 */
async function applyGear(event, me) {
  if (!me) return { code: -1, msg: '用户不存在', data: null }
  const { name, brand, category, spec = {}, price_low, price_high, tier } = event
  if (!name || !category) return { code: -1, msg: '请填写名称和分类', data: null }
  const ALLOW = ['racket', 'shuttle', 'shoe', 'apparel', 'bag', 'guard']
  if (!ALLOW.includes(category)) return { code: -1, msg: '分类不支持', data: null }
  try {
    const dup = await db.collection('gear')
      .where({ name: db.Regexp({ regexp: String(name).trim(), options: 'i' }) })
      .limit(1).get()
    if (dup.data.length) return { code: -1, msg: '该装备已存在或正在审核中', data: null }
  } catch (e) {}
  const addRes = await db.collection('gear').add({
    data: {
      name: String(name).trim().slice(0, 60),
      brand: String(brand || '').trim().slice(0, 30),
      category, tier: tier || '',
      spec,
      price_low: Number(price_low) || 0,
      price_high: Number(price_high) || 0,
      injury_tags: [],
      cover_file_id: '',
      status: 'pending',
      review_count: 0, avg_score: 0, official_score: 0,
      official_review_id: '',
      applied_by: me._id,
      created_at: db.serverDate(), updated_at: db.serverDate(),
    },
  })
  return { code: 0, msg: 'success', data: { gear_id: addRes._id } }
}

/** 我对某装备的评测 */
async function myReview(event, myUserId) {
  const { gear_id } = event
  if (!gear_id || !myUserId) return { code: -1, msg: '参数缺失', data: null }
  try {
    const res = await db.collection('gear_review')
      .where({ gear_id, user_id: myUserId, source: 'user' })
      .limit(1).get()
    return { code: 0, msg: 'success', data: { review: res.data[0] || null } }
  } catch (e) {
    return { code: 0, msg: 'success', data: { review: null } }
  }
}
