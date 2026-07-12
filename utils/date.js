// utils/date.js — 日期处理工具
// 统一 UTC+8，周一为一周起始

/** 格式化日期为 YYYY-MM-DD */
function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 日期加减天数，返回新 Date */
function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** 获取本周一（周一为一周开始） */
function getWeekStart(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() // 0=周日 1=周一 ... 6=周六
  const diff = day === 0 ? -6 : 1 - day // 回到周一
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 获取本周日 */
function getWeekEnd(date = new Date()) {
  return addDays(getWeekStart(date), 6)
}

/** 获取上周一 */
function getLastWeekStart(date = new Date()) {
  return addDays(getWeekStart(date), -7)
}

/** 获取某日期是周几（中文） */
function getWeekdayCN(date) {
  const map = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const d = date instanceof Date ? date : new Date(date)
  return map[d.getDay()]
}

/** 获取本周一到周日的 7 天日期数组 */
function getWeekDays(weekStart) {
  const start = weekStart instanceof Date ? weekStart : new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays(start, i)))
}

/** 获取本周的简短日期标签（周一/周二...） */
function getWeekLabels() {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
}

/** 友好日期：MM-DD */
function formatShort(date) {
  const d = date instanceof Date ? date : new Date(date)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${m}-${day}`
}

module.exports = {
  formatDate,
  addDays,
  getWeekStart,
  getWeekEnd,
  getLastWeekStart,
  getWeekdayCN,
  getWeekDays,
  getWeekLabels,
  formatShort,
}
