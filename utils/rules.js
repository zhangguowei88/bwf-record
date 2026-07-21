// utils/rules.js — 羽毛球垂类规则
// 中羽民间等级（参考中羽在线业余分级，自评用）

/** 中羽民间等级定义 1.0-5.0 */
const LEVELS = [
  { value: 1.0, name: '入门', desc: '打球频次少，能把球打过网，让回合持续',
    next_tip: '先学正确握拍，多打多熟悉球感' },
  { value: 1.5, name: '初学', desc: '知道要让对方接不到，多为苍蝇拍握法，正反手握拍不熟',
    next_tip: '改掉苍蝇拍握法，练正反手转换' },
  { value: 2.0, name: '业余初级', desc: '经常打球，懂单双打规则，实战能力初步形成',
    next_tip: '练米字步和高远球，动作要规范' },
  { value: 3.0, name: '业余中级', desc: '能跨步、并步跑全场但不流畅，参加过基础训练',
    next_tip: '强化杀球和网前球，提升进攻能力' },
  { value: 4.0, name: '业余中高', desc: '每周多次，有双打意识，反手能过渡，普通业余中等水平',
    next_tip: '练反手后场稳定性和战术组织' },
  { value: 5.0, name: '业余高手', desc: '技术无短板，能组织战术，可当陪练，业余巅峰',
    next_tip: '已是业余巅峰，可尝试官方等级测试挑战自己' },
]

/** 默认每周目标场次 */
const DEFAULT_WEEKLY_GOAL = 3

/** 动作诊断 - 动作类型选项 */
const ACTION_TYPES = [
  { value: 'high_clear', name: '高远球', desc: '后场击高远球，发力链条最完整，推荐首选' },
  { value: 'smash', name: '杀球', desc: '下压进攻杀球' },
  { value: 'drop', name: '吊球', desc: '后场吊网前' },
]

/** 动作诊断 - 阶段名称 */
const STAGE_NAMES = {
  prepare: '准备期',
  backswing: '引拍期',
  hit: '击球期',
  follow_through: '随挥期',
}

/** 动作类型名称映射 */
const ACTION_TYPE_NAMES = ACTION_TYPES.reduce((m, t) => {
  m[t.value] = t.name
  return m
}, {})

/** 装备分类（限羽毛球专用） */
const GEAR_CATEGORIES = [
  { value: 'racket', name: '球拍', icon: '🏸' },
  { value: 'shuttle', name: '羽毛球', icon: '⚪' },
  { value: 'shoe', name: '球鞋', icon: '👟' },
  { value: 'apparel', name: '服装', icon: '👕' },
  { value: 'bag', name: '球包', icon: '🎒' },
  { value: 'guard', name: '护具', icon: '🩹' },
]

/** 装备分类名称映射 */
const GEAR_CATEGORY_NAMES = GEAR_CATEGORIES.reduce((m, c) => {
  m[c.value] = c.name
  return m
}, {})

/** 评测类型 */
const REVIEW_TYPES = [
  { value: 'quick', name: '快速点评' },
  { value: 'long', name: '深度评测' },
]

/** 评测来源（三层数据分层） */
const REVIEW_SOURCES = [
  { value: 'official', name: '平台实测', color: '#3b82f6' },   // 官方，蓝色
  { value: 'thirdparty', name: '第三方参考', color: '#9ca3af' }, // 第三方，灰色
  { value: 'user', name: '用户众测', color: '#f59e0b' },        // 用户，金色(总分)
]

/** 各品类评测维度（统一 10 分制） */
const GEAR_DIMENSIONS = {
  racket: [
    { key: 'attack', name: '进攻' },
    { key: 'smash', name: '点杀连贯' },
    { key: 'drive', name: '平抽挡' },
    { key: 'clear', name: '高远控球' },
    { key: 'net', name: '网前容错' },
    { key: 'difficulty', name: '上手难度' },
    { key: 'shock', name: '减震护腕' },
  ],
  shoe: [
    { key: 'support', name: '侧向支撑' },
    { key: 'grip', name: '急停防滑' },
    { key: 'cushion', name: '起跳缓震' },
    { key: 'speed', name: '启动速度' },
    { key: 'wrap', name: '鞋面包裹' },
    { key: 'durability', name: '久穿耐磨' },
    { key: 'breath', name: '透气性' },
  ],
  shuttle: [
    { key: 'stable', name: '飞行稳定' },
    { key: 'durable', name: '耐打次数' },
    { key: 'sound', name: '击球声音' },
    { key: 'cold', name: '低温耐打' },
    { key: 'humid', name: '湿度衰减' },
    { key: 'consistency', name: '批次一致性' },
    { key: 'value', name: '性价比' },
  ],
  apparel: [
    { key: 'comfort', name: '穿着舒适' },
    { key: 'sweat', name: '吸汗速干' },
    { key: 'stretch', name: '延展性' },
    { key: 'durability', name: '耐洗耐磨' },
    { key: 'value', name: '性价比' },
  ],
  bag: [
    { key: 'capacity', name: '容量' },
    { key: 'compartment', name: '分区合理' },
    { key: 'material', name: '用料做工' },
    { key: 'carry', name: '背负舒适' },
    { key: 'value', name: '性价比' },
  ],
  guard: [
    { key: 'protect', name: '防护性' },
    { key: 'comfort', name: '佩戴舒适' },
    { key: 'fix', name: '固定不滑' },
    { key: 'breath', name: '透气性' },
    { key: 'durability', name: '耐久度' },
  ],
}

/** 用户水平（影响评测权重） */
const USER_LEVELS = [
  { value: 'beginner', name: '新手', weight: 0.15 },
  { value: 'intermediate', name: '进阶', weight: 0.15 },
  { value: 'advanced', name: '高阶(球龄3年+)', weight: 0.25 },
]

/** 主打打法 */
const PLAY_STYLES = [
  { value: 'singles_rally', name: '单打拉吊' },
  { value: 'aggressive', name: '暴力进攻' },
  { value: 'doubles_drive', name: '双打平抽' },
]

/** 装备定位 */
const GEAR_TIERS = [
  { value: 'entry', name: '入门' },
  { value: 'mid', name: '中端' },
  { value: 'high', name: '高端' },
  { value: 'pro', name: '专业' },
]

/** 伤病提醒标签 */
const INJURY_TAGS = ['手腕不适慎选', '肩部不适慎选', '膝盖不适慎选', '大体重慎选', '宽脚适配', '瘦脚适配']

/** 星级文案（10分制） */
function starText(score) {
  const s = Number(score) || 0
  if (s >= 9) return '强烈推荐'
  if (s >= 7.5) return '推荐'
  if (s >= 6) return '一般'
  if (s >= 4) return '不太行'
  return '不推荐'
}

/** 装备均分颜色（10分制） */
function scoreColor(score) {
  const s = Number(score) || 0
  if (s >= 9) return '#10b981'
  if (s >= 7.5) return '#3b82f6'
  if (s >= 6) return '#f59e0b'
  return '#ef4444'
}

/** 强度标签 */
const INTENSITY_LABELS = {
  1: '摸鱼',
  2: '正常',
  3: '猛冲',
}

/** 身体感受标签 */
const FEELING_LABELS = {
  1: '良好',
  2: '有点累',
  3: '不适',
}

/** 不适部位选项 */
const SORE_PARTS = ['膝盖', '肩膀', '脚踝', '手肘', '腰部', '足底']

/** 根据等级值取等级对象 */
function getLevel(value) {
  const v = Number(value) || 2.0
  // 找最接近的等级
  let best = LEVELS[0]
  let bestDiff = Math.abs(LEVELS[0].value - v)
  for (const lv of LEVELS) {
    const diff = Math.abs(lv.value - v)
    if (diff < bestDiff) {
      best = lv
      bestDiff = diff
    }
  }
  return best
}

/** 取下一等级（用于进阶引导），已是最高则返回 null */
function getNextLevel(value) {
  const v = Number(value) || 2.0
  for (let i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].value === v && i < LEVELS.length - 1) {
      return LEVELS[i + 1]
    }
  }
  // 找第一个比当前高的
  for (const lv of LEVELS) {
    if (lv.value > v) return lv
  }
  return null
}

/** 等级配色 */
function levelColor(value) {
  const v = Number(value) || 0
  if (v >= 5.0) return '#ef4444'
  if (v >= 4.0) return '#f59e0b'
  if (v >= 3.0) return '#10b981'
  if (v >= 2.0) return '#3b82f6'
  return '#9ca3af'
}

/** 动作诊断 - 评分等级文案 */
function scoreLevel(score) {
  const s = Number(score) || 0
  if (s >= 85) return { name: '优秀', color: '#10b981', desc: '动作规范，保持节奏' }
  if (s >= 70) return { name: '良好', color: '#3b82f6', desc: '基本到位，细节可优化' }
  if (s >= 55) return { name: '一般', color: '#f59e0b', desc: '存在明显问题，建议针对性练习' }
  return { name: '待改进', color: '#ef4444', desc: '动作偏差较大，建议从基础练起' }
}

/**
 * 计算球龄文字
 * @param {string} playSince YYYY-MM 格式
 * @returns {string} 如 "1年2个月"
 */
function playAgeText(playSince) {
  if (!playSince) return '未设置'
  const [y, m] = playSince.split('-').map(Number)
  if (!y || !m) return '未设置'
  const now = new Date()
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m)
  if (months < 0) months = 0
  const years = Math.floor(months / 12)
  const leftMonths = months % 12
  if (years === 0) return `${leftMonths}个月`
  if (leftMonths === 0) return `${years}年`
  return `${years}年${leftMonths}个月`
}

/**
 * 生成智能提醒
 * @param {object} params
 * @param {Array}  params.recentRecords  最近记录（按日期倒序）
 * @param {number} params.weekCount       本周场次
 * @param {number} params.weeklyGoal      每周目标
 */
function buildAdvice(params = {}) {
  const { recentRecords = [], weekCount = 0, weeklyGoal = DEFAULT_WEEKLY_GOAL } = params

  // 1. 同一部位连续 2 次不适（最高优先级）
  const soreRecords = recentRecords.filter((r) => r.feeling === 3 && r.sore_parts && r.sore_parts.length)
  if (soreRecords.length >= 2) {
    const part = soreRecords[0].sore_parts[0]
    // 检查最近2次不适是否同一部位
    if (soreRecords[1].sore_parts && soreRecords[1].sore_parts.includes(part)) {
      return `${part}连续出现不适，建议休息 3-5 天，持续不缓解建议就医。`
    }
  }

  // 2. 本周高强度过量
  const weekHighIntensity = recentRecords
    .filter((r) => isThisWeek(r.record_date))
    .filter((r) => r.intensity >= 3).length
  if (weekHighIntensity >= 3) {
    return `本周已打 ${weekCount} 场，其中 ${weekHighIntensity} 场猛冲，强度偏高，建议安排休息。`
  }

  // 3. 本周场次超额
  if (weekCount >= weeklyGoal + 2) {
    return `本周已打 ${weekCount} 场，超出目标，注意膝盖和肩膀的恢复。`
  }

  // 4. 近 2 周频率下降
  const last2Week = recentRecords.filter((r) => withinDays(r.record_date, 14))
  const prev2Week = recentRecords.filter((r) => withinDays(r.record_date, 28) && !withinDays(r.record_date, 14))
  if (prev2Week.length >= 3 && last2Week.length <= Math.ceil(prev2Week.length / 3)) {
    return '最近两周打球频率明显下降，别松懈，约一场吧。'
  }

  // 5. 默认
  if (weekCount >= weeklyGoal) {
    return '本周目标已达成，保持节奏，注意热身和拉伸。'
  }
  const remain = weeklyGoal - weekCount
  return `本周还差 ${remain} 场达成本周目标，动起来吧。`
}

/** 判断日期是否本周（周一起始） */
function isThisWeek(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() + diff)
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 7)
  return d >= weekStart && d < weekEnd
}

/** 判断日期是否在最近 N 天内 */
function withinDays(dateStr, days) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const limit = new Date()
  limit.setDate(limit.getDate() - days)
  return d >= limit
}

module.exports = {
  LEVELS,
  DEFAULT_WEEKLY_GOAL,
  INTENSITY_LABELS,
  FEELING_LABELS,
  SORE_PARTS,
  ACTION_TYPES,
  ACTION_TYPE_NAMES,
  STAGE_NAMES,
  GEAR_CATEGORIES,
  GEAR_CATEGORY_NAMES,
  REVIEW_TYPES,
  REVIEW_SOURCES,
  GEAR_DIMENSIONS,
  USER_LEVELS,
  PLAY_STYLES,
  GEAR_TIERS,
  INJURY_TAGS,
  getLevel,
  getNextLevel,
  levelColor,
  playAgeText,
  buildAdvice,
  isThisWeek,
  scoreLevel,
  starText,
  scoreColor,
}
