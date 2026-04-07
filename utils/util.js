// utils/util.js - 通用工具函数

/**
 * 生成唯一ID
 */
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 格式化日期
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  const second = String(d.getSeconds()).padStart(2, '0')

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second)
}

/**
 * 获取今天的日期字符串（本地时区）
 */
function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 获取本地时区的日期字符串（从时间戳）
 */
function getLocalDateString(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 计算周标识（从周一开始）
 * 返回格式：YYYY-Www (例如：2026-W14 表示2026年第14周，从周一开始)
 */
function getWeekIdentifier(date) {
  const d = new Date(date)

  // 获取本地时区的年月日
  const year = d.getFullYear()
  const month = d.getMonth()
  const day = d.getDate()
  const dayOfWeek = d.getDay() // 0=周日, 1=周一, ..., 6=周六

  // 计算本周一（如果今天是周日，则上周一是本周一）
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(year, month, day + mondayOffset)

  // 计算这周一是一年中的第几天
  const yearStart = new Date(year, 0, 1)
  const daysSinceYearStart = Math.floor((monday - yearStart) / (24 * 60 * 60 * 1000))

  // 计算周数
  const weekNumber = Math.floor(daysSinceYearStart / 7) + 1

  // 处理跨年情况：如果周1属于去年，则调整
  const weekYear = weekNumber <= 0 ? year - 1 : year
  const adjustedWeekNumber = weekNumber <= 0 ? 53 : weekNumber

  return `${weekYear}-W${adjustedWeekNumber.toString().padStart(2, '0')}`
}

/**
 * 获取月份标识（本地时区）
 * 返回格式：YYYY-MM
 */
function getMonthIdentifier(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * 计算自定义任务的状态和显示信息
 * @param {Object} task - 任务对象
 * @param {Number} completionCount - 已完成次数
 * @returns {Object} - { status, statusText, shouldHide }
 *   status: 'pending', 'active', 'completed', 'expired', 'ended'
 *   statusText: 状态显示文本
 *   shouldHide: 是否应该隐藏（已完成或已结束1天后）
 */
function getCustomTaskStatus(task, completionCount = 0) {
  const today = getLocalDateString(new Date())
  const startDate = task.startDate
  const endDate = task.endDate
  const maxCompletions = task.maxCompletions

  // 检查是否应该隐藏（已完成或已结束超过1天）
  let shouldHide = false
  let daysSinceEnd = null

  if (maxCompletions && completionCount >= maxCompletions) {
    // 已完成，计算完成日期
    const completionDate = getLocalDateString(new Date())
    daysSinceEnd = Math.floor((new Date(today) - new Date(completionDate)) / (24 * 60 * 60 * 1000))
  } else if (endDate && endDate < today) {
    // 已过期
    daysSinceEnd = Math.floor((new Date(today) - new Date(endDate)) / (24 * 60 * 60 * 1000))
  }

  if (daysSinceEnd !== null && daysSinceEnd > 1) {
    shouldHide = true
  }

  // 计算状态
  if (startDate && startDate > today) {
    // 未开始
    const daysUntilStart = Math.floor((new Date(startDate) - new Date(today)) / (24 * 60 * 60 * 1000))
    let statusText = ''
    if (daysUntilStart === 0) {
      statusText = '将于今天开始'
    } else if (daysUntilStart === 1) {
      statusText = '将于明天开始'
    } else {
      statusText = `将于${daysUntilStart}天后开始`
    }
    return { status: 'pending', statusText, shouldHide }
  }

  if (maxCompletions && completionCount >= maxCompletions) {
    // 已完成（次数用完）
    return { status: 'completed', statusText: '已完成', shouldHide }
  }

  if (endDate && endDate < today) {
    // 已过期（次数没用完但时间到了）
    return { status: 'expired', statusText: '已结束', shouldHide }
  }

  // 进行中
  let statusText = ''

  if (maxCompletions) {
    const remaining = maxCompletions - completionCount
    statusText = `剩余${remaining}次`
  }

  if (endDate) {
    const daysUntilEnd = Math.floor((new Date(endDate) - new Date(today)) / (24 * 60 * 60 * 1000))
    if (daysUntilEnd === 0) {
      statusText = statusText ? `${statusText}，今天结束` : '今天结束'
    } else if (daysUntilEnd === 1) {
      statusText = statusText ? `${statusText}，明天结束` : '明天结束'
    } else {
      statusText = statusText ? `${statusText}，剩余${daysUntilEnd}天` : `剩余${daysUntilEnd}天`
    }
  }

  if (!statusText) {
    statusText = '可完成'
  }

  return { status: 'active', statusText, shouldHide }
}

/**
 * 显示Toast提示
 */
function showToast(title, icon = 'none', duration = 2000) {
  wx.showToast({
    title,
    icon,
    duration
  })
}

/**
 * 显示加载中
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title,
    mask: true
  })
}

/**
 * 隐藏加载中
 */
function hideLoading() {
  wx.hideLoading()
}

/**
 * 显示确认对话框
 */
function showConfirm(content, title = '提示') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        resolve(res.confirm)
      }
    })
  })
}

module.exports = {
  generateId,
  formatDate,
  getTodayString,
  getLocalDateString,
  getWeekIdentifier,
  getMonthIdentifier,
  getCustomTaskStatus,
  showToast,
  showLoading,
  hideLoading,
  showConfirm
}
