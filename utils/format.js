// utils/format.js — 数据格式化工具

/** 数字千分位 */
function formatNumber(n) {
  if (n == null || isNaN(n)) return '0'
  return Number(n).toLocaleString('zh-CN')
}

/** 步数格式化：12345 -> 1.2万 / 8321 -> 8,321 */
function formatSteps(n) {
  if (n == null) return '0'
  if (n >= 10000) {
    return (n / 10000).toFixed(1) + '万'
  }
  return formatNumber(n)
}

/** 分钟格式化：90 -> 1小时30分 */
function formatMinutes(min) {
  if (!min) return '0分'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}小时${m}分`
  if (h > 0) return `${h}小时`
  return `${m}分`
}

/** 体重保留一位小数 */
function formatWeight(kg) {
  if (kg == null) return '--'
  return Number(kg).toFixed(1) + 'kg'
}

/** 百分比 */
function formatPercent(val) {
  return Math.round(val * 100) + '%'
}

module.exports = {
  formatNumber,
  formatSteps,
  formatMinutes,
  formatWeight,
  formatPercent,
}
