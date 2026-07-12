// cloudfunctions/dashboard/index.js
// 首页聚合：等级 + 本周场次进度 + 智能提醒 + 累计数据 + 最近记录

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const DEFAULT_WEEKLY_GOAL = 3

function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}
function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

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
  const user = userRes.data[0]
  const userId = user._id
  const weeklyGoal = user.weekly_goal || DEFAULT_WEEKLY_GOAL

  // 拉取全部打球记录（业余用户数据量小，一次拉完够用）
  const recordRes = await db.collection('manual_record').where({ user_id: userId }).get()
  const records = recordRes.data.sort((a, b) => (a.record_date < b.record_date ? 1 : -1))

  // 本周场次
  const weekStart = formatDate(getWeekStart(new Date()))
  const weekEnd = formatDate(addDays(new Date(weekStart), 6))
  const weekRecords = records.filter((r) => r.record_date >= weekStart && r.record_date <= weekEnd)
  const weekCount = weekRecords.length

  // 本月场次 + 时长
  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthRecords = records.filter((r) => r.record_date.startsWith(monthPrefix))
  const monthCount = monthRecords.length
  const monthMinutes = monthRecords.reduce((s, r) => s + (r.duration_min || 0), 0)

  // 上月对比
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthPrefix = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
  const lastMonthRecords = records.filter((r) => r.record_date.startsWith(lastMonthPrefix))
  const lastMonthCount = lastMonthRecords.length
  const lastMonthMinutes = lastMonthRecords.reduce((s, r) => s + (r.duration_min || 0), 0)

  // 本月强度分布
  const monthIntensity = { 1: 0, 2: 0, 3: 0 }
  monthRecords.forEach((r) => {
    if (monthIntensity[r.intensity] != null) monthIntensity[r.intensity]++
  })

  // 累计
  const totalCount = records.length
  const totalMinutes = records.reduce((s, r) => s + (r.duration_min || 0), 0)

  // 最近 3 场
  const recent = records.slice(0, 3)

  // 智能提醒
  const advice = buildAdvice(records, weekCount, weeklyGoal)

  return {
    code: 0,
    msg: 'success',
    data: {
      user: {
        nick_name: user.nick_name || '',
        avatar_url: user.avatar_url || '',
        gender: user.gender,
        age: user.age,
        badminton_level: user.badminton_level || 2.0,
        play_since: user.play_since || '',
        weekly_goal: weeklyGoal,
        level_set: user.level_set !== false,
      },
      week_count: weekCount,
      weekly_goal: weeklyGoal,
      week_progress: Math.min(Math.round((weekCount / weeklyGoal) * 100), 100),
      week_achieved: weekCount >= weeklyGoal,
      month_count: monthCount,
      month_minutes: monthMinutes,
      month_hours_text: (monthMinutes / 60).toFixed(1),
      month_review: {
        count: monthCount,
        minutes: monthMinutes,
        hours_text: (monthMinutes / 60).toFixed(1),
        last_count: lastMonthCount,
        last_minutes: lastMonthMinutes,
        last_hours_text: (lastMonthMinutes / 60).toFixed(1),
        count_diff: monthCount - lastMonthCount,
        minutes_diff: monthMinutes - lastMonthMinutes,
        intensity: monthIntensity,
        // 最常强度
        top_intensity: getTopIntensity(monthIntensity),
      },
      total_count: totalCount,
      total_minutes: totalMinutes,
      total_hours_text: (totalMinutes / 60).toFixed(1),
      recent_records: recent,
      advice,
    },
  }
}

function getTopIntensity(intensityMap) {
  let top = 2, max = 0
  for (const k of [1, 2, 3]) {
    if (intensityMap[k] > max) {
      max = intensityMap[k]
      top = Number(k)
    }
  }
  return max > 0 ? top : 0
}

/** 智能提醒规则（与前端 utils/rules.js 一致，云函数内联一份） */
function buildAdvice(records, weekCount, weeklyGoal) {
  if (!records.length) {
    return '还没有记录，打完一场记一笔吧。'
  }

  // 1. 同一部位连续 2 次不适
  const soreRecords = records.filter((r) => r.feeling === 3 && r.sore_parts && r.sore_parts.length)
  if (soreRecords.length >= 2) {
    const part = soreRecords[0].sore_parts[0]
    if (soreRecords[1].sore_parts && soreRecords[1].sore_parts.includes(part)) {
      return `${part}连续出现不适，建议休息 3-5 天，持续不缓解建议就医。`
    }
  }

  // 2. 本周猛冲过量
  const weekStart = formatDate(getWeekStart(new Date()))
  const weekEnd = formatDate(addDays(new Date(weekStart), 6))
  const weekRecords = records.filter((r) => r.record_date >= weekStart && r.record_date <= weekEnd)
  const weekHigh = weekRecords.filter((r) => r.intensity >= 3).length
  if (weekHigh >= 3) {
    return `本周已打 ${weekCount} 场，其中 ${weekHigh} 场猛冲，强度偏高，建议安排休息。`
  }

  // 3. 本周超额
  if (weekCount >= weeklyGoal + 2) {
    return `本周已打 ${weekCount} 场，超出目标，注意膝盖和肩膀的恢复。`
  }

  // 4. 频率下降
  const last2 = records.filter((r) => withinDays(r.record_date, 14))
  const prev2 = records.filter((r) => withinDays(r.record_date, 28) && !withinDays(r.record_date, 14))
  if (prev2.length >= 3 && last2.length <= Math.ceil(prev2.length / 3)) {
    return '最近两周打球频率明显下降，别松懈，约一场吧。'
  }

  // 5. 默认
  if (weekCount >= weeklyGoal) {
    return '本周目标已达成，保持节奏，注意热身和拉伸。'
  }
  const remain = weeklyGoal - weekCount
  return `本周还差 ${remain} 场达成本周目标，动起来吧。`
}

function withinDays(dateStr, days) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const limit = new Date()
  limit.setDate(limit.getDate() - days)
  return d >= limit
}
