// pages/index/index.js
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    colorTone: 'girl',
    currentChild: null,
    tasks: [],
    todayCompletions: [],
    isLoading: false,
    userInfo: null,          // 用户信息
    allFamilies: [],        // 所有家庭列表
    showFamilyPicker: false, // 显示家庭选择器
    currentFamilyId: null,   // 当前家庭ID
    currentFamilyChildren: [], // 当前家庭的儿童列表
    showChildPicker: false, // 显示儿童选择器
    currentFilter: 'all',   // 当前任务分类筛选
    allTasks: [],           // 所有任务（用于筛选）
    currentFamily: null,      // 当前选中的家庭详情 (包含背景图)
    animatingTaskId: null,   // 正在执行爆炸动画的任务ID
    spawningTaskId: null,    // 正在执行新生动画的任务ID
    enableFloatAnimation: true,  // 童趣模式飘动动画开关
    taskListClass: '',        // 任务列表样式类
    availableFilters: [],     // 可用的分类列表
    statsRange: 'today',     // 统计范围：today/month/year/all
    statsRangeOptions: ['today', 'month', 'year', 'all'],  // 统计范围选项
    calendarItems: [],      // 日历选项列表
    selectedCalendarId: '', // 选中的日历项ID
    selectedDate: null,     // 选中的日期对象
    selectedCalendarLabel: {}, // 选中的日历标签（用于静态显示）
    coinStats: {             // 金币统计
      redeemCount: 0,        // 兑换次数
      spentCoins: 0,         // 消耗金币
      earnCount: 0,          // 奖励次数
      earnedCoins: 0,        // 获得金币
      penaltyCoins: 0        // 惩罚金币
    },
    taskProgress: {          // 任务进度
      total: 0,              // 总任务数
      completed: 0,          // 已完成任务数
      percentage: 0          // 完成百分比
    },
    countdownTimer: null,    // 倒计时更新定时器
    showThemeMenu: false     // 主题快捷菜单显示状态
  },

  onLoad() {
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    // 从 app.globalData 和本地存储加载用户信息
    let userInfo = null
    if (app.globalData.useCloudStorage && app.globalData.currentUserOpenid) {
      userInfo = wx.getStorageSync('userInfo') || null
    }
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      isLoading: true,  // 页面加载时开始加载状态
      userInfo: userInfo
    })

    // 读取飘动动画设置
    try {
      const enableFloatAnimation = wx.getStorageSync('enableFloatAnimation')
      if (enableFloatAnimation !== undefined) {
        this.setData({
          enableFloatAnimation,
          taskListClass: enableFloatAnimation ? '' : 'no-float-gap'
        })
      }
    } catch (err) {
      console.error('[首页] 读取飘动动画设置失败:', err)
    }
  },

  async onShow() {
    // 刷新用户信息
    let userInfo = null
    if (app.globalData.useCloudStorage && app.globalData.currentUserOpenid) {
      userInfo = wx.getStorageSync('userInfo') || null
    }

    // 先更新主题，让用户立即看到主题变化
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)

    // 确保主题类正确
    let themeClass = 'theme-light'
    if (themeStyle === 'simple-dark') {
      themeClass = 'theme-dark'
    } else if (themeStyle === 'simple-light') {
      themeClass = 'theme-light'
    } else {
      themeClass = 'theme-light'
    }

    console.log('[首页 onShow] 设置主题:', { themeClass, themeStyle, isFunTheme })

    this.setData({
      themeClass: themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      userInfo: userInfo
    })

    // 刷新TabBar主题
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
      this.getTabBar().applyTheme()
    }

    this.setData({ isLoading: true })

    // 检查是否有家庭
    if (!app.getCurrentFamilyId()) {
      this.setData({
        currentChild: null,
        tasks: [],
        todayCompletions: [],
        isLoading: false,
        needFamily: true  // 显示需要家庭的提示
      })
      return
    }

    // 加载孩子数据（根据登录状态自动选择本地或云端）
    await app.loadChildren()

    // 获取当前孩子（会自动选择）
    let currentChild = app.getCurrentChild()

    // 如果没有选中的孩子，尝试自动选择当前家庭的儿童
    if (!currentChild) {
      const currentFamilyId = app.getCurrentFamilyId()
      const allChildren = app.globalData.children || []

      if (!currentFamilyId) {
        this.setData({
          currentChild: null,
          tasks: [],
          todayCompletions: [],
          isLoading: false,
          needFamily: true
        })
        return
      }

      // 筛选当前家庭的儿童
      const familyChildren = allChildren.filter(child => {
        const childFamilyId = child.familyId || currentFamilyId
        return childFamilyId === currentFamilyId
      })

      if (familyChildren.length > 0) {
        // 自动选择第一个儿童
        const firstChild = familyChildren[0]
        app.saveCurrentChildId(firstChild.childId)
        currentChild = firstChild
      }
    }

    console.log('[首页] 最终 currentChild:', currentChild)

    // 如果还是没有孩子，显示添加孩子提示
    if (!currentChild) {
      console.warn('[首页] 仍然没有孩子，显示添加提示')
      const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
      const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
      this.setData({
        themeClass: app.globalData.themeClass,
        themeStyle: themeStyle,
        colorTone: app.globalData.colorTone || 'neutral',
        isFunTheme: isFunTheme,
        currentChild: null,
        tasks: [],
        todayCompletions: [],
        isLoading: false,
        needFamily: false
      })
      return
    }

    // 加载所有家庭列表（用于家庭选择器）和当前家庭的儿童列表
    await this.loadAllFamilies()
    await this.loadCurrentFamilyChildren()

    // 补充家庭信息和金币余额
    // 确保 child 有 familyId 字段
    const childWithFamilyId = {
      ...currentChild,
      familyId: currentChild.familyId || app.getCurrentFamilyId()
    }
    // 加载家庭名称和金币余额
    const enrichedChild = await this.enrichChildInfo(childWithFamilyId)

    // 生成日历选项
    this.generateCalendarItems()

    // 一次性设置所有数据，减少 setData 调用次数
    const themeStyle2 = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme2 = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle2)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle2,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme2,
      currentChild: enrichedChild,
      needFamily: false,
      currentFamilyId: app.getCurrentFamilyId()
    })

    // 加载数据（包含计算金币统计）
    await this.loadData()
  },

  /**
   * 补充儿童信息（家庭名称和金币余额）
   */
  async enrichChildInfo(child) {
    try {
      // 获取当前家庭ID
      const currentFamilyId = app.getCurrentFamilyId()

      // 确保 child 有 familyId
      const childWithFamilyId = {
        ...child,
        familyId: child.familyId || currentFamilyId
      }

      // 如果儿童的家庭ID和当前家庭ID不一致，不显示
      if (currentFamilyId && childWithFamilyId.familyId !== currentFamilyId) {
        return child
      }

      // 使用带 familyId 的 child
      child = childWithFamilyId

      let familyName = '家庭'
      let familyCoins = 0

      // 未登录：从本地获取
      if (!app.globalData.useCloudStorage) {
        const localFamilies = wx.getStorageSync('localFamilies') || []
        const family = localFamilies.find(f => f.familyId === currentFamilyId)
        if (family) {
          familyName = family.name
        }

        // 从本地获取金币
        const localCoinBalances = wx.getStorageSync(`localCoinBalances_${currentFamilyId}`) || {}
        familyCoins = parseInt(localCoinBalances[child.childId]) || 0

        return {
          ...child,
          familyName: familyName,
          familyCoins: familyCoins
        }
      }

      // 已登录：从云端获取
      const [familyRes, coinsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyInfo',
            data: { familyId: currentFamilyId }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageFamilyCoins',
          data: {
            action: 'getChildCoinsInFamily',
            data: {
              childId: child.childId,
              familyId: currentFamilyId
            }
          }
        })
      ])

      familyName = familyRes.result.success ? familyRes.result.family.name : '家庭'
      familyCoins = coinsRes.result.success ? parseInt(coinsRes.result.balance) || 0 : 0

      return {
        ...child,
        familyName: familyName,
        familyCoins: familyCoins
      }
    } catch (err) {
      console.error('[首页] 补充儿童信息失败:', err)
      return child
    }
  },

  /**
   * 加载所有家庭列表
   */
  async loadAllFamilies() {
    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      // 补充 isCreator 标记（兼容旧本地数据）
      const processedLocalFamilies = localFamilies.map(f => ({
        ...f,
        isCreator: f.isCreator !== undefined ? f.isCreator : (f.role === 'admin')
      }))
      this.setData({ allFamilies: processedLocalFamilies })
      return
    }

    // 已登录：从云端加载
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getAllMyFamilies'
        }
      })

      if (res.result.success) {
        this.setData({ allFamilies: res.result.families || [] })
      }
    } catch (err) {
      console.error('[首页] 加载家庭列表失败:', err)
    }
  },

  /**
   * 加载当前家庭的儿童列表
   */
  async loadCurrentFamilyChildren() {
    const currentFamilyId = app.getCurrentFamilyId()
    if (!currentFamilyId) return

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      const localChildren = wx.getStorageSync(`localChildren_${currentFamilyId}`) || []
      this.setData({ currentFamilyChildren: localChildren })
      return
    }

    // 已登录：从全局数据中筛选
    const allChildren = app.globalData.children || []
    const familyChildren = allChildren.filter(child => child.familyId === currentFamilyId)
    this.setData({ currentFamilyChildren: familyChildren })
  },

  /**
   * 加载数据
   */
  async loadData() {
    // 获取当前家庭和孩子
    const currentFamilyId = app.getCurrentFamilyId()
    const currentChild = app.getCurrentChild()

    console.log('[首页] loadData() - currentFamilyId:', currentFamilyId, 'currentChild:', currentChild)
    console.log('[首页] loadData() - this.data.currentChild:', this.data.currentChild)
    console.log('[首页] loadData() - app.globalData.currentChildId:', app.globalData.currentChildId)
    console.log('[首页] loadData() - app.globalData.children:', app.globalData.children)

    if (!currentFamilyId || !currentChild) {
      // 没有家庭或孩子，显示空状态
      console.warn('[首页] loadData() - 缺少家庭或孩子，清空数据')
      // 如果页面已经有 currentChild 数据，不要清空它（避免主题切换时日历消失）
      if (this.data.currentChild) {
        console.log('[首页] loadData() - 页面已有 currentChild，不清空，只清空任务数据')
        this.setData({
          tasks: [],
          todayCompletions: [],
          isLoading: false
        })
        return
      }
      this.setData({
        tasks: [],
        todayCompletions: [],
        currentFamilyId: null,
        currentChild: null,
        isLoading: false
      })
      return
    }

    // 只设置 currentFamilyId，不覆盖 currentChild（因为它可能已经包含了 familyName 和 familyCoins）
    this.setData({ currentFamilyId, isLoading: true })

    // 未登录：从本地加载数据
    if (!app.globalData.useCloudStorage) {
      this.loadDataFromLocal(currentFamilyId, currentChild)
      return
    }

    // 已登录：从云端加载数据
    await this.loadDataFromCloud(currentFamilyId, currentChild)
  },

  /**
   * 从本地加载数据
   */
  loadDataFromLocal(currentFamilyId, currentChild) {
    const localTasks = wx.getStorageSync(`localTasks_${currentFamilyId}`) || []
    const localCompletions = wx.getStorageSync(`localCompletions_${currentFamilyId}`) || []

    // 过滤出当前孩子的任务
    const childTasks = localTasks.filter(task =>
      !task.targetChildId || task.targetChildId === currentChild.childId
    )

    // 过滤出当前孩子的完成记录
    const childCompletions = localCompletions.filter(comp =>
      comp.childId === currentChild.childId
    )

    // 检查完成状态（根据任务类型）- 使用本地时区
    const { getLocalDateString, getWeekIdentifier, getMonthIdentifier, getCustomTaskStatus } = require('../../utils/util.js')
    const today = getLocalDateString(new Date())
    const currentWeek = getWeekIdentifier(today)
    const currentMonth = getMonthIdentifier(today)

    const tasks = childTasks.map(task => {
      let completed = false
      let taskStatus = null

      if (task.taskType === 'daily') {
        // 每日任务：检查今天是否完成
        const todayCompletions = childCompletions.filter(c =>
          c.taskId === task.taskId && c.completedDate === today
        )
        completed = todayCompletions.length > 0

        // 调试：打印每日任务的 endTime
        console.log('[首页] 每日任务:', task.title, 'endTime:', task.endTime, 'completed:', completed)

        // 检查是否设置了结束时间（无论是否完成都要计算倒计时）
        if (task.endTime) {
          console.log('[首页] 计算倒计时 - endTime:', task.endTime)
          const now = new Date()
          const [hours, minutes] = task.endTime.split(':')
          const endTimeToday = new Date(today)
          endTimeToday.setHours(parseInt(hours), parseInt(minutes), 0, 0)

          console.log('[首页] 当前时间:', now.toLocaleString(), '结束时间:', endTimeToday.toLocaleString())

          if (now > endTimeToday) {
            // 已过期
            console.log('[首页] 任务已过期')
            taskStatus = {
              status: 'expired',
              statusText: '已过期',
              endTime: task.endTime
            }
            completed = false // 过期任务不算完成，但也不能点击
          } else {
            // 计算倒计时
            const timeDiff = endTimeToday.getTime() - now.getTime()
            const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60))
            const minutesLeft = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))
            const secondsLeft = Math.floor((timeDiff % (1000 * 60)) / 1000)

            let countdownText
            if (hoursLeft > 0) {
              countdownText = `${hoursLeft}小时${minutesLeft}分${secondsLeft}秒`
            } else if (minutesLeft > 0) {
              countdownText = `${minutesLeft}分${secondsLeft}秒`
            } else {
              countdownText = `${secondsLeft}秒`
            }

            console.log('[首页] 倒计时:', countdownText, 'timeDiff:', timeDiff)

            // 如果设置了最大完成次数，计算剩余次数
            if (task.maxCompletions && task.maxCompletions > 1) {
              const remaining = task.maxCompletions - todayCompletions.length
              taskStatus = {
                status: remaining > 0 ? 'active' : 'completed',
                statusText: remaining > 0 ? `${countdownText}·剩余${remaining}次` : `${countdownText}·已完成`,
                remaining: remaining,
                countdown: countdownText,
                endTime: task.endTime
              }
              completed = remaining <= 0
            } else {
              // 没有设置最大完成次数，显示倒计时
              taskStatus = {
                status: 'active',
                statusText: `在${countdownText}前完成后`,
                countdown: countdownText,
                endTime: task.endTime
              }
              console.log('[首页] 设置 taskStatus:', taskStatus)
            }
          }
        } else if (task.maxCompletions && task.maxCompletions > 1) {
          // 没有设置结束时间，但有最大完成次数
          const remaining = task.maxCompletions - todayCompletions.length
          taskStatus = {
            status: remaining > 0 ? 'active' : 'completed',
            statusText: remaining > 0 ? `今日剩余${remaining}次` : '今日已完成',
            remaining: remaining
          }
          completed = remaining <= 0
        }
      } else if (task.taskType === 'weekly') {
        // 每周任务：检查本周是否完成
        const weekCompletions = childCompletions.filter(c =>
          c.taskId === task.taskId && getWeekIdentifier(c.completedDate) === currentWeek
        )
        completed = weekCompletions.length > 0

        // 如果设置了最大完成次数，计算剩余次数
        if (task.maxCompletions && task.maxCompletions > 1) {
          const remaining = task.maxCompletions - weekCompletions.length
          taskStatus = {
            status: remaining > 0 ? 'active' : 'completed',
            statusText: remaining > 0 ? `本周剩余${remaining}次` : '本周已完成',
            remaining: remaining
          }
          completed = remaining <= 0
        }
      } else if (task.taskType === 'monthly') {
        // 每月任务：检查本月是否完成
        const monthCompletions = childCompletions.filter(c =>
          c.taskId === task.taskId && getMonthIdentifier(c.completedDate) === currentMonth
        )
        completed = monthCompletions.length > 0

        // 如果设置了最大完成次数，计算剩余次数
        if (task.maxCompletions && task.maxCompletions > 1) {
          const remaining = task.maxCompletions - monthCompletions.length
          taskStatus = {
            status: remaining > 0 ? 'active' : 'completed',
            statusText: remaining > 0 ? `本月剩余${remaining}次` : '本月已完成',
            remaining: remaining
          }
          completed = remaining <= 0
        }
      } else if (task.taskType === 'custom') {
        // 自定义任务：计算状态
        const completionCount = childCompletions.filter(c => c.taskId === task.taskId).length
        taskStatus = getCustomTaskStatus(task, completionCount)
        completed = taskStatus.status === 'completed'
      } else if (task.taskType === 'permanent' || task.taskType === 'penalty_parent' || task.taskType === 'penalty_child') {
        // 兼容旧的无期限任务和惩罚任务：始终显示为未完成，可以重复完成
        completed = false
      }

      // 计算 CSS 类
      const taskClass = []
      if (taskStatus && taskStatus.status === 'expired') {
        // 过期任务单独添加 expired 类
        taskClass.push('expired')
      } else if (completed || (taskStatus && (taskStatus.status === 'completed' || taskStatus.status === 'ended'))) {
        // 已完成任务添加 completed 类
        taskClass.push('completed')
      }
      if (taskStatus && taskStatus.status === 'pending') {
        taskClass.push('pending')
      }
      // 自定义任务（挑战）添加特殊样式
      if (task.taskType === 'custom') {
        taskClass.push('is-challenge')
      }

      // 判断是否可以完成任务
      const canComplete = !completed &&
        (!taskStatus || taskStatus.status !== 'pending') &&
        (!taskStatus || taskStatus.status !== 'completed') &&
        (!taskStatus || taskStatus.status !== 'expired') &&
        (!taskStatus || taskStatus.status !== 'ended')

      // 计算任务标签
      const { badgeText, badgeType } = this.getTaskBadge({ ...task, taskStatus })

      // 判断任务分类：常规 vs 活动
      let categoryClass = ''
      if (task.taskType === 'custom' &&
          (!task.maxCompletions || task.maxCompletions === -1) &&
          (!task.startDate || !task.endDate)) {
        // 常规任务：没有次数和时间限制的自定义任务
        categoryClass = 'normal'
      } else {
        // 活动任务：其他所有任务
        categoryClass = 'activity'
      }

      return { ...task, completed: completed, taskStatus: taskStatus, taskClass: taskClass.join(' '), canComplete: canComplete, badgeText, badgeType, categoryClass }
    }).filter(task => {
      // 过滤掉应该隐藏的自定义任务
      if (task.taskType === 'custom' && task.taskStatus && task.taskStatus.shouldHide) {
        return false
      }
      return true
    }).sort((a, b) => {
      // 排序逻辑：状态优先
      // 顺序：进行中 > 未开始 > 已完成/已结束
      const aCompleted = a.completed || (a.taskStatus && (a.taskStatus.status === 'completed' || a.taskStatus.status === 'expired' || a.taskStatus.status === 'ended'))
      const bCompleted = b.completed || (b.taskStatus && (b.taskStatus.status === 'completed' || b.taskStatus.status === 'expired' || b.taskStatus.status === 'ended'))
      const aPending = a.taskStatus && a.taskStatus.status === 'pending'
      const bPending = b.taskStatus && b.taskStatus.status === 'pending'

      // 如果两个任务状态不同，按优先级排序
      // 优先级：进行中 > 未开始 > 已完成
      if (!aCompleted && !bCompleted) {
        // 都是未完成状态
        if (aPending && !bPending) {
          return 1  // a未开始，b进行中，b在前
        }
        if (!aPending && bPending) {
          return -1  // a进行中，b未开始，a在前
        }
        // 都是进行中或都不是未开始，按金币倒序
        return (b.coinReward || 0) - (a.coinReward || 0)
      }

      // 一个已完成，一个未完成
      if (aCompleted !== bCompleted) {
        return aCompleted ? 1 : -1  // 未完成在前
      }

      // 都已完成，按金币倒序
      return (b.coinReward || 0) - (a.coinReward || 0)
    })

    const todayCompletions = childCompletions.filter(c => c.completedDate === today)

    // 保存所有任务并应用筛选
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)

    // 确保主题类正确
    let themeClass = 'theme-light'
    if (themeStyle === 'simple-dark') {
      themeClass = 'theme-dark'
    } else if (themeStyle === 'simple-light') {
      themeClass = 'theme-light'
    } else {
      themeClass = 'theme-light'
    }

    console.log('[首页 loadDataFromLocal] 设置主题:', { themeClass, themeStyle, isFunTheme, appThemeClass: app.globalData.themeClass })

    this.setData({
      themeClass: themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      allTasks: tasks,
      todayCompletions: todayCompletions,
      isLoading: false,
      enableFloatAnimation: this.data.enableFloatAnimation,
      taskListClass: this.data.taskListClass
    }, () => {
      this.filterTasks()
    })

    // 计算金币统计
    this.calculateCoinStats()

    // 启动倒计时更新定时器
    this.startCountdownTimer()
  },

  /**
   * 从云端加载数据
   */
  async loadDataFromCloud(currentFamilyId, currentChild) {
    try {
      // 获取任务列表和所有完成记录
      const [tasksRes, completionsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getTasks',
            data: {
              familyId: currentFamilyId,
              childId: currentChild.childId
            }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getAllCompletions',
            data: {
              familyId: currentFamilyId,
              childId: currentChild.childId
            }
          }
        })
      ])

      let tasks = []
      let todayCompletions = []

      if (tasksRes.result.success && completionsRes.result.success) {
        const { getLocalDateString, getWeekIdentifier, getMonthIdentifier, getCustomTaskStatus } = require('../../utils/util.js')
        const today = getLocalDateString(new Date())
        const currentWeek = getWeekIdentifier(today)
        const currentMonth = getMonthIdentifier(today)
        const allCompletions = completionsRes.result.completions || []

        // 过滤今日完成记录
        todayCompletions = allCompletions.filter(c => c.completedDate === today)

        // 根据任务类型检查是否已完成
        tasks = tasksRes.result.tasks.map(task => {
          let completed = false
          let taskStatus = null

          if (task.taskType === 'daily') {
            // 每日任务：检查今天是否完成
            const todayCompletions = allCompletions.filter(c =>
              c.taskId === task.taskId && c.completedDate === today
            )
            completed = todayCompletions.length > 0

            // 调试：打印每日任务的 endTime
            console.log('[首页 云端] 每日任务:', task.title, 'endTime:', task.endTime, 'completed:', completed)

            // 检查是否设置了结束时间（无论是否完成都要计算倒计时）
            if (task.endTime) {
              console.log('[首页 云端] 进入倒计时计算')
              console.log('[首页 云端] 计算倒计时 - endTime:', task.endTime)
              const now = new Date()
              const [hours, minutes] = task.endTime.split(':')
              const endTimeToday = new Date(today)
              endTimeToday.setHours(parseInt(hours), parseInt(minutes), 0, 0)

              console.log('[首页 云端] 当前时间:', now.toLocaleString(), '结束时间:', endTimeToday.toLocaleString())

              if (now > endTimeToday) {
                // 已过期
                console.log('[首页 云端] 任务已过期')
                taskStatus = {
                  status: 'expired',
                  statusText: '已过期',
                  endTime: task.endTime
                }
                completed = false // 过期任务不算完成，但也不能点击
              } else {
                // 计算倒计时
                const timeDiff = endTimeToday.getTime() - now.getTime()
                const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60))
                const minutesLeft = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))
                const secondsLeft = Math.floor((timeDiff % (1000 * 60)) / 1000)

                let countdownText
                if (hoursLeft > 0) {
                  countdownText = `${hoursLeft}小时${minutesLeft}分${secondsLeft}秒`
                } else if (minutesLeft > 0) {
                  countdownText = `${minutesLeft}分${secondsLeft}秒`
                } else {
                  countdownText = `${secondsLeft}秒`
                }

                console.log('[首页 云端] 倒计时:', countdownText, 'timeDiff:', timeDiff)

                // 如果设置了最大完成次数，计算剩余次数
                if (task.maxCompletions && task.maxCompletions > 1) {
                  const remaining = task.maxCompletions - todayCompletions.length
                  taskStatus = {
                    status: remaining > 0 ? 'active' : 'completed',
                    statusText: remaining > 0 ? `${countdownText}·剩余${remaining}次` : `${countdownText}·已完成`,
                    remaining: remaining,
                    countdown: countdownText,
                    endTime: task.endTime
                  }
                  completed = remaining <= 0
                } else {
                  // 没有设置最大完成次数，显示倒计时
                  taskStatus = {
                    status: 'active',
                    statusText: `${countdownText}后截止`,
                    countdown: countdownText,
                    endTime: task.endTime
                  }
                  console.log('[首页 云端] 设置 taskStatus:', taskStatus)
                }
              }
            } else if (task.maxCompletions && task.maxCompletions > 1) {
              // 没有设置结束时间，但有最大完成次数
              const remaining = task.maxCompletions - todayCompletions.length
              taskStatus = {
                status: remaining > 0 ? 'active' : 'completed',
                statusText: remaining > 0 ? `今日剩余${remaining}次` : '今日已完成',
                remaining: remaining
              }
              completed = remaining <= 0
            }
          } else if (task.taskType === 'weekly') {
            // 每周任务：检查本周是否完成
            const weekCompletions = allCompletions.filter(c =>
              c.taskId === task.taskId && c.completedWeek === currentWeek
            )
            completed = weekCompletions.length > 0

            // 如果设置了最大完成次数，计算剩余次数
            if (task.maxCompletions && task.maxCompletions > 1) {
              const remaining = task.maxCompletions - weekCompletions.length
              taskStatus = {
                status: remaining > 0 ? 'active' : 'completed',
                statusText: remaining > 0 ? `本周剩余${remaining}次` : '本周已完成',
                remaining: remaining
              }
              completed = remaining <= 0
            }
          } else if (task.taskType === 'monthly') {
            // 每月任务：检查本月是否完成
            const monthCompletions = allCompletions.filter(c =>
              c.taskId === task.taskId && c.completedMonth === currentMonth
            )
            completed = monthCompletions.length > 0

            // 如果设置了最大完成次数，计算剩余次数
            if (task.maxCompletions && task.maxCompletions > 1) {
              const remaining = task.maxCompletions - monthCompletions.length
              taskStatus = {
                status: remaining > 0 ? 'active' : 'completed',
                statusText: remaining > 0 ? `本月剩余${remaining}次` : '本月已完成',
                remaining: remaining
              }
              completed = remaining <= 0
            }
          } else if (task.taskType === 'custom') {
            // 自定义任务：计算状态
            const completionCount = allCompletions.filter(c => c.taskId === task.taskId).length
            taskStatus = getCustomTaskStatus(task, completionCount)
            completed = taskStatus.status === 'completed'
          } else if (task.taskType === 'permanent' || task.taskType === 'penalty_parent' || task.taskType === 'penalty_child') {
            // 兼容旧的无期限任务和惩罚任务
            completed = false
          }

          // 计算 CSS 类
          const taskClass = []
          if (completed || (taskStatus && (taskStatus.status === 'completed' || taskStatus.status === 'expired' || taskStatus.status === 'ended'))) {
            taskClass.push('completed')
          }
          if (taskStatus && taskStatus.status === 'pending') {
            taskClass.push('pending')
          }
          // 自定义任务（挑战）添加特殊样式
          if (task.taskType === 'custom') {
            taskClass.push('is-challenge')
          }

          // 判断是否可以完成任务
          const canComplete = !completed &&
            (!taskStatus || taskStatus.status !== 'pending') &&
            (!taskStatus || taskStatus.status !== 'completed') &&
            (!taskStatus || taskStatus.status !== 'expired') &&
            (!taskStatus || taskStatus.status !== 'ended')

          // 计算任务标签
          const { badgeText, badgeType } = this.getTaskBadge({ ...task, taskStatus })

          // 判断任务分类：常规 vs 活动
          let categoryClass = ''
          if (task.taskType === 'custom' &&
              (!task.maxCompletions || task.maxCompletions === -1) &&
              (!task.startDate || !task.endDate)) {
            // 常规任务：没有次数和时间限制的自定义任务
            categoryClass = 'normal'
          } else {
            // 活动任务：其他所有任务
            categoryClass = 'activity'
          }

          return {
            ...task,
            completed: completed,
            taskStatus: taskStatus,
            taskClass: taskClass.join(' '),
            canComplete: canComplete,
            badgeText,
            badgeType,
            categoryClass
          }
        }).filter(task => {
          // 过滤掉应该隐藏的自定义任务
          if (task.taskType === 'custom' && task.taskStatus && task.taskStatus.shouldHide) {
            return false
          }
          return true
        }).sort((a, b) => {
          // 排序逻辑：状态优先
          // 顺序：进行中 > 未开始 > 已完成 > 已过期

          // 判断是否已过期
          const aExpired = a.taskStatus && a.taskStatus.status === 'expired'
          const bExpired = b.taskStatus && b.taskStatus.status === 'expired'

          // 判断是否已完成
          const aCompleted = (a.completed || (a.taskStatus && (a.taskStatus.status === 'completed' || a.taskStatus.status === 'ended'))) && !aExpired
          const bCompleted = (b.completed || (b.taskStatus && (b.taskStatus.status === 'completed' || b.taskStatus.status === 'ended'))) && !bExpired

          const aPending = a.taskStatus && a.taskStatus.status === 'pending'
          const bPending = b.taskStatus && b.taskStatus.status === 'pending'

          // 优先级判断
          if (aExpired && !bExpired) {
            return 1  // a已过期，b未过期，a在后
          }
          if (!aExpired && bExpired) {
            return -1  // a未过期，b已过期，a在前
          }

          // 都是未完成状态（未过期）
          if (!aCompleted && !bCompleted) {
            // 都是未完成状态
            if (aPending && !bPending) {
              return 1  // a未开始，b进行中，b在前
            }
            if (!aPending && bPending) {
              return -1  // a进行中，b未开始，a在前
            }
            // 都是进行中或都不是未开始，按金币倒序
            return (b.coinReward || 0) - (a.coinReward || 0)
          }

          // 一个已完成，一个未完成
          if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1  // 未完成在前
          }

          // 都已完成或都已过期，按金币倒序
          return (b.coinReward || 0) - (a.coinReward || 0)
        })
      }

      // 保存所有任务并应用筛选
      const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
      const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)

      // 确保主题类正确
      let themeClass = 'theme-light'
      if (themeStyle === 'simple-dark') {
        themeClass = 'theme-dark'
      } else if (themeStyle === 'simple-light') {
        themeClass = 'theme-light'
      } else {
        themeClass = 'theme-light'
      }

      console.log('[首页 loadDataFromCloud] 设置主题:', { themeClass, themeStyle, isFunTheme, appThemeClass: app.globalData.themeClass })

      this.setData({
        themeClass: themeClass,
        themeStyle: themeStyle,
        colorTone: app.globalData.colorTone || 'neutral',
        isFunTheme: isFunTheme,
        allTasks: tasks,
        todayCompletions: todayCompletions
      }, () => {
        this.filterTasks()

        // 刷新完成后，如果存在正在「重生」的任务，1秒后清除其状态
        if (this.data.spawningTaskId) {
          setTimeout(() => {
            this.setData({ spawningTaskId: null })
          }, 1000)
        }
      })

      // 计算金币统计
      await this.calculateCoinStats()

      // 启动倒计时更新定时器
      this.startCountdownTimer()

    } catch (err) {
      console.error('[首页] 加载数据失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
      const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)

      // 确保主题类正确
      let themeClass = 'theme-light'
      if (themeStyle === 'simple-dark') {
        themeClass = 'theme-dark'
      } else if (themeStyle === 'simple-light') {
        themeClass = 'theme-light'
      } else {
        themeClass = 'theme-light'
      }

      console.log('[首页 loadDataFromCloud finally] 设置主题:', { themeClass, themeStyle, isFunTheme, appThemeClass: app.globalData.themeClass })

      this.setData({
        themeClass: themeClass,
        themeStyle: themeStyle,
        colorTone: app.globalData.colorTone || 'neutral',
        isFunTheme: isFunTheme,
        isLoading: false,
        enableFloatAnimation: this.data.enableFloatAnimation,
        taskListClass: this.data.taskListClass
      })
    }
  },

  /**
   * 完成任务
   */
  async completeTask(e) {
    const { taskid } = e.currentTarget.dataset

    if (!this.data.currentChild) {
      showToast('请先添加孩子')
      return
    }

    // 查找任务
    const task = this.data.tasks.find(t => t.taskId === taskid)
    if (!task) {
      showToast('任务不存在')
      return
    }

    // 检查任务是否已过期
    if (task.taskStatus && task.taskStatus.status === 'expired') {
      showToast('任务已过期')
      return
    }

    // 检查任务是否已完成
    if (task.completed) {
      if (task.taskType === 'penalty_parent' || task.taskType === 'penalty_child') {
        // 惩罚任务可以无限次完成，允许通过
      }
      // 根据任务类型显示不同的提示
      else if (task.taskType === 'daily') {
        // 每日任务：检查是否还有剩余次数
        if (task.maxCompletions && task.maxCompletions > 1) {
          showToast(task.taskStatus?.statusText || '今日任务已完成')
        } else {
          showToast('今日任务已完成')
        }
      } else if (task.taskType === 'weekly') {
        // 每周任务：检查是否还有剩余次数
        if (task.maxCompletions && task.maxCompletions > 1) {
          showToast(task.taskStatus?.statusText || '本周任务已完成')
        } else {
          showToast('本周任务已完成')
        }
      } else if (task.taskType === 'monthly') {
        // 每月任务：检查是否还有剩余次数
        if (task.maxCompletions && task.maxCompletions > 1) {
          showToast(task.taskStatus?.statusText || '本月任务已完成')
        } else {
          showToast('本月任务已完成')
        }
      } else if (task.taskType === 'custom') {
        // 自定义任务：检查状态
        if (task.taskStatus?.status === 'completed') {
          showToast('任务已完成')
        } else if (task.taskStatus?.status === 'expired') {
          showToast('任务已结束')
        } else if (task.taskStatus?.status === 'pending') {
          showToast('任务尚未开始')
        }
      } else if (task.taskType === 'permanent') {
        // 永久任务：可以重复完成
      }
      // 如果不是永久任务、惩罚任务或自定义任务中的可重复完成状态，返回
      if (task.taskType !== 'permanent' && task.taskType !== 'custom' && task.taskType !== 'penalty_parent' && task.taskType !== 'penalty_child') {
        return
      }
      // 自定义任务：检查是否可以继续完成
      if (task.taskType === 'custom' && task.taskStatus) {
        if (task.taskStatus.status === 'completed' || task.taskStatus.status === 'expired' || task.taskStatus.status === 'pending') {
          return
        }
      }
    }

    // 每日/每周/每月任务：检查是否设置了多次完成且还有剩余次数
    if ((task.taskType === 'daily' || task.taskType === 'weekly' || task.taskType === 'monthly') && task.maxCompletions && task.maxCompletions > 1) {
      if (task.completed) {
        // 已完成但可能还有剩余次数，上面的检查已经处理了提示
        return
      }
    }

    const confirm = await showConfirm(`确定执行操作吗？`)
    if (!confirm) return

    // 检查惩罚任务权限：仅限家庭创建者且进入家长模式后完成
    if (task.taskType === 'penalty_parent' || task.taskType === 'penalty_child') {
      let isCreator = false
      if (this.data.currentFamilyId) {
        // 从 allFamilies 匹配当前角色是否为创建者
        const family = this.data.allFamilies.find(f => f.familyId === this.data.currentFamilyId)
        if (family && family.isCreator) {
          isCreator = true
        }
      }

      if (!isCreator) {
        showToast('只有家庭创建者可以执行惩罚')
        return
      }

      if (!app.isParentMode()) {
        showToast('请先进入家长模式再执行惩罚')
        return
      }
    }

    // 加入风格化动画（少女风格：气球破裂）
    if (this.data.themeStyle === 'girl') {
      this.setData({ animatingTaskId: taskid })
      await new Promise(resolve => setTimeout(resolve, 600)) // 等待动画完成（稍微变长一点点更稳）
      this.setData({ animatingTaskId: null, spawningTaskId: taskid })
      // 这里的 spawningTaskId 会在数据刷新后触发新生动画
    }

    showLoading('处理中...')

    // 未登录：保存到本地
    if (!app.globalData.useCloudStorage) {
      this.completeTaskToLocal(taskid)
      return
    }

    // 已登录：保存到云端
    await this.completeTaskToCloud(taskid)
  },

  /**
   * 完成任务（保存到本地）
   */
  completeTaskToLocal(taskId) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      const task = this.data.tasks.find(t => t.taskId === taskId)
      if (!task) {
        hideLoading()
        showToast('任务不存在')
        return
      }

      // 检查是否已完成（永久任务除外）
      const storageKey = `localCompletions_${currentFamilyId}`
      const completions = wx.getStorageSync(storageKey) || []
      const { getLocalDateString, getWeekIdentifier, getMonthIdentifier } = require('../../utils/util.js')
      const today = getLocalDateString(new Date())
      const currentWeek = getWeekIdentifier(today)
      const currentMonth = getMonthIdentifier(today)

      // 检查是否可以继续完成
      if (task.taskType === 'daily' || task.taskType === 'weekly' || task.taskType === 'monthly') {
        // 获取本期内的完成记录
        const periodCompletions = completions.filter(c => {
          if (c.taskId !== taskId || c.childId !== this.data.currentChild.childId) {
            return false
          }
          if (task.taskType === 'daily') {
            return c.completedDate === today
          } else if (task.taskType === 'weekly') {
            return getWeekIdentifier(c.completedDate) === currentWeek
          } else if (task.taskType === 'monthly') {
            return getMonthIdentifier(c.completedDate) === currentMonth
          }
          return false
        })

        // 如果设置了最大完成次数，检查是否已达到
        if (task.maxCompletions && periodCompletions.length >= task.maxCompletions) {
          hideLoading()
          const periodText = task.taskType === 'daily' ? '今日' : (task.taskType === 'weekly' ? '本周' : '本月')
          showToast(`${periodText}任务已完成`)
          return
        }
      } else if (task.taskType === 'permanent' || task.taskType === 'penalty_parent' || task.taskType === 'penalty_child') {
        // 永久任务/惩罚任务：不检查
      }

      let finalCoinEarned = task.coinReward || 0
      if (task.taskType === 'penalty_child') {
        finalCoinEarned = -Math.abs(finalCoinEarned)
      } else if (task.taskType === 'penalty_parent') {
        finalCoinEarned = Math.abs(finalCoinEarned)
      }

      // 保存完成记录到本地
      const completion = {
        completionId: `completion_${Date.now()}`,
        taskId: taskId,
        taskTitle: task.title,
        childId: this.data.currentChild.childId,
        childName: this.data.currentChild.name,
        coinEarned: finalCoinEarned,
        completedAt: new Date().toISOString(),
        completedDate: today,
        completedWeek: currentWeek,
        completedMonth: currentMonth
      }
      completions.push(completion)
      wx.setStorageSync(storageKey, completions)

      // 更新该儿童在该家庭的金币余额
      const coinBalanceKey = `localCoinBalances_${currentFamilyId}`
      const coinBalances = wx.getStorageSync(coinBalanceKey) || {}
      const childId = this.data.currentChild.childId
      const currentBalance = coinBalances[childId] || 0
      const newBalance = currentBalance + finalCoinEarned
      coinBalances[childId] = newBalance
      wx.setStorageSync(coinBalanceKey, coinBalances)

      // 创建金币记录
      const coinRecordKey = `localCoinRecords_${currentFamilyId}`
      const coinRecords = wx.getStorageSync(coinRecordKey) || []
      coinRecords.push({
        recordId: `coin_record_${Date.now()}`,
        childId: childId,
        familyId: currentFamilyId,
        amount: finalCoinEarned,
        type: task.taskType === 'penalty_parent' || task.taskType === 'penalty_child' ? 'penalty' : 'task_complete',
        relatedId: taskId,
        description: task.title,
        balanceAfter: newBalance,
        createdAt: new Date().toISOString()
      })
      wx.setStorageSync(coinRecordKey, coinRecords)

      hideLoading()
      if (task.taskType === 'penalty_child') {
         showToast(`操作成功！扣除了 ${Math.abs(finalCoinEarned)} 金币`)
      } else if (task.taskType === 'penalty_parent') {
         showToast(`操作成功！增加了 ${Math.abs(finalCoinEarned)} 金币`)
      } else {
         showToast('任务完成！获得 ' + task.coinReward + ' 金币')
      }

      // 重新加载数据
      this.loadData()
    } catch (err) {
      hideLoading()
      console.error('[首页] 完成任务失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 完成任务（保存到云端）
   */
  async completeTaskToCloud(taskId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageTasks',
        data: {
          action: 'completeTask',
          data: {
            taskId: taskId,
            childId: this.data.currentChild.childId,
            familyId: this.data.currentFamilyId
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast('任务完成！')
        // 重新加载数据
        await this.loadData()
        // 更新全局孩子数据
        await this.refreshChildData()
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[首页] 完成任务失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 刷新孩子数据
   */
  async refreshChildData() {
    if (!this.data.currentChild) return

    try {
      let child = this.data.currentChild

      // 已登录：从云端获取最新孩子数据
      if (app.globalData.useCloudStorage) {
        const res = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'getChild',
            data: { childId: this.data.currentChild.childId }
          }
        })

        if (res.result.success) {
          child = res.result.child
          // 更新全局数据
          const index = app.globalData.children.findIndex(
            c => c.childId === child.childId
          )
          if (index !== -1) {
            app.globalData.children[index] = child
          }
        }
      }

      // 补充家庭信息和金币余额
      const enrichedChild = await this.enrichChildInfo(child)
      this.setData({ currentChild: enrichedChild })
    } catch (err) {
      console.error('[首页] 刷新孩子数据失败:', err)
    }
  },

  /**
   * 跳转到任务管理页
   */
  goToTasks() {
    wx.navigateTo({
      url: '/pages/tasks/tasks'
    })
  },

  /**
   * 跳转到孩子管理页
   */
  goToAddChild() {
    wx.navigateTo({
      url: '/pages/children/children'
    })
  },

  /**
   * 跳转到家庭页面
   */
  goToFamily() {
    wx.switchTab({
      url: '/pages/family-list/family-list'
    })
  },

  /**
   * 跳转到管理儿童页面
   */
  goToChildren() {
    wx.navigateTo({
      url: '/pages/children/children'
    })
  },

  /**
   * 跳转到首页
   */
  goToIndex() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  /**
   * 显示家庭选择器 UI
   */
  showFamilyPickerUI() {
    this.loadAllFamilies(true)
  },

  /**
   * 加载所有家庭列表并自动匹配当前家庭
   * @param {Boolean} show 是否显示家庭选择器
   */
  async loadAllFamilies(show = false) {
    if (show) {
      // 获取定位信息（仅在显示选择器时计算）
      const query = wx.createSelectorQuery().in(this)
      query.select('.child-name').boundingClientRect()
      query.exec((res) => {
        if (res && res[0]) {
          const rect = res[0]
          const pickerTop = rect.bottom + 8
          this.setData({
            pickerTop: pickerTop,
            pickerLeft: rect.left
          })
        }
      })
    }

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      const currentFamily = localFamilies.find(f => f.familyId === app.getCurrentFamilyId())
      this.setData({
        allFamilies: localFamilies,
        currentFamily: currentFamily || null,
        showFamilyPicker: show === true
      })
      return
    }

    // 已登录：从云端加载
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getAllMyFamilies'
        }
      })

      if (res.result.success) {
        const families = res.result.families || []
        const currentFamily = families.find(f => f.familyId === app.getCurrentFamilyId())
        this.setData({
          allFamilies: families,
          currentFamily: currentFamily || null,
          showFamilyPicker: show === true
        })
      }
    } catch (err) {
      console.error('[首页] 加载家庭列表失败:', err)
    }
  },

  /**
   * 隐藏家庭选择器
   */
  hideFamilyPicker() {
    this.setData({
      showFamilyPicker: false
    })
  },

  /**
   * 选择家庭
   */
  async selectFamily(e) {
    const { familyid } = e.currentTarget.dataset

    // 如果选择的是当前家庭，直接关闭
    if (familyid === this.data.currentFamilyId) {
      this.hideFamilyPicker()
      return
    }

    showLoading()

    try {
      // 切换家庭
      app.saveCurrentFamilyId(familyid)

      // 加载该家庭的儿童
      const childrenRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getFamilyChildren',
          data: { familyId: familyid }
        }
      })

      if (childrenRes.result.success) {
        const children = childrenRes.result.children || []

        if (children.length === 0) {
          // 没有儿童，跳转到添加儿童页面
          hideLoading()
          this.hideFamilyPicker()
          wx.navigateTo({
            url: '/pages/children/children'
          })
          return
        }

        // 选择第一个儿童
        const firstChild = children[0]
        app.saveCurrentChildId(firstChild.childId)

        // 更新当前数据
        const currentFamily = this.data.allFamilies.find(f => f.familyId === familyid)
        this.setData({
          currentFamilyId: familyid,
          currentFamily: currentFamily || null,
          currentChild: firstChild,
          currentFamilyChildren: children,
          showFamilyPicker: false
        })

        // 刷新任务列表
        await this.loadData()

        hideLoading()
        this.hideFamilyPicker()
        showToast(`已切换到${firstChild.familyName || '该家庭'}`)
      } else {
        hideLoading()
        showToast('加载儿童失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[首页] 切换家庭失败:', err)
      showToast('切换失败')
    }

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      const family = localFamilies.find(f => f.familyId === familyid)

      if (family) {
        const localChildren = wx.getStorageSync(`localChildren_${familyid}`) || []

        if (localChildren.length === 0) {
          hideLoading()
          this.hideFamilyPicker()
          wx.navigateTo({
            url: '/pages/children/children'
          })
          return
        }

        const firstChild = localChildren[0]
        app.saveCurrentChildId(firstChild.childId)

        this.setData({
          currentFamilyId: familyid,
          currentChild: firstChild,
          currentFamilyChildren: localChildren
        })

        await this.loadData()

        hideLoading()
        this.hideFamilyPicker()
        showToast(`已切换到${family.name}`)
      }
    }
  },

  /**
   * 显示儿童选择器
   */
  showChildPicker() {
    // 获取儿童名称元素的位置
    const query = wx.createSelectorQuery().in(this)
    query.select('.child-name.with-arrow').boundingClientRect()
    query.exec((res) => {
      if (res && res[0]) {
        const rect = res[0]
        // 选择器显示在箭头下方
        const pickerTop = rect.bottom + 8
        this.setData({
          childPickerTop: pickerTop
        })
      }
    })

    this.setData({ showChildPicker: true })
  },

  /**
   * 隐藏儿童选择器
   */
  hideChildPicker() {
    this.setData({
      showChildPicker: false
    })
  },

  /**
   * 选择儿童
   */
  async selectChild(e) {
    const { childid } = e.currentTarget.dataset

    // 如果选择的是当前儿童，直接关闭
    if (childid === this.data.currentChild.childId) {
      this.hideChildPicker()
      return
    }

    showLoading()

    try {
      // 切换儿童
      app.saveCurrentChildId(childid)

      // 从全局数据中获取新儿童
      const newChild = app.getCurrentChild()

      if (newChild) {
        // 补充家庭信息和金币余额
        const enrichedChild = await this.enrichChildInfo(newChild)
        this.setData({ currentChild: enrichedChild })

        // 重新加载数据
        await this.loadData()

        hideLoading()
        this.hideChildPicker()
        showToast(`已切换到${enrichedChild.name}`)
      } else {
        hideLoading()
        showToast('切换失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[首页] 切换儿童失败:', err)
      showToast('切换失败')
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止点击事件冒泡
  },

  /**
   * 任务分类筛选
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log('[首页] 切换筛选:', filter)

    this.setData({ currentFilter: filter })

    // 根据筛选条件过滤任务
    this.filterTasks()
  },

  /**
   * 根据筛选条件过滤任务
   */
  filterTasks() {
    const { allTasks, currentFilter } = this.data

    let filteredTasks = []

    if (currentFilter === 'penalty') {
      // 惩罚任务视图：仅显示惩罚任务
      filteredTasks = allTasks.filter(task => task.taskType === 'penalty_parent' || task.taskType === 'penalty_child')
    } else if (currentFilter === 'normal') {
      // 常规任务：没有次数限制和时间限制的自定义任务
      filteredTasks = allTasks.filter(task => {
        return task.taskType === 'custom' &&
               (!task.maxCompletions || task.maxCompletions === -1) &&
               (!task.startDate || !task.endDate)
      })
    } else if (currentFilter === 'activity') {
      // 活动任务：只有自定义任务中有时间限制或次数限制的
      filteredTasks = allTasks.filter(task => {
        if (task.taskType !== 'custom') return false
        // 自定义任务：有次数限制或时间限制的才算活动
        return (task.maxCompletions && task.maxCompletions !== -1) ||
               (task.startDate && task.endDate)
      })
    } else if (currentFilter === 'all') {
      // 全部任务：排除惩罚任务
      filteredTasks = allTasks.filter(task => task.taskType !== 'penalty_parent' && task.taskType !== 'penalty_child')
    } else {
      // 其他筛选：daily, weekly, monthly
      filteredTasks = allTasks.filter(task => task.taskType === currentFilter)
    }

    // 对筛选后的任务进行排序：未完成在前，已完成在后
    filteredTasks.sort((a, b) => {
      // 判断任务是否已完成
      const aCompleted = a.completed || (a.taskStatus && (a.taskStatus.status === 'completed' || a.taskStatus.status === 'expired' || a.taskStatus.status === 'ended'))
      const bCompleted = b.completed || (b.taskStatus && (b.taskStatus.status === 'completed' || b.taskStatus.status === 'expired' || b.taskStatus.status === 'ended'))

      // 一个已完成，一个未完成
      if (aCompleted !== bCompleted) {
        return aCompleted ? 1 : -1  // 未完成在前
      }

      // 都未完成，按金币倒序
      if (!aCompleted && !bCompleted) {
        return (b.coinReward || 0) - (a.coinReward || 0)
      }

      // 都已完成，按金币倒序
      return (b.coinReward || 0) - (a.coinReward || 0)
    })

    // 计算可用的分类
    const availableFilters = ['all']
    const hasPenalty = allTasks.some(task => task.taskType === 'penalty_parent' || task.taskType === 'penalty_child')

    // 检查常规任务
    const hasNormal = allTasks.some(task => {
      return task.taskType === 'custom' &&
             (!task.maxCompletions || task.maxCompletions === -1) &&
             (!task.startDate || !task.endDate)
    })
    if (hasNormal) availableFilters.push('normal')

    // 检查活动任务
    const hasActivity = allTasks.some(task => {
      if (task.taskType !== 'custom') return false
      return (task.maxCompletions && task.maxCompletions !== -1) ||
             (task.startDate && task.endDate)
    })
    if (hasActivity) availableFilters.push('activity')

    // 检查周期性任务
    const hasDaily = allTasks.some(task => task.taskType === 'daily')
    if (hasDaily) availableFilters.push('daily')

    const hasWeekly = allTasks.some(task => task.taskType === 'weekly')
    if (hasWeekly) availableFilters.push('weekly')

    const hasMonthly = allTasks.some(task => task.taskType === 'monthly')
    if (hasMonthly) availableFilters.push('monthly')

    // 惩罚任务始终添加到最后（即使没有也显示）
    availableFilters.push('penalty')

    this.setData({
      tasks: filteredTasks,
      availableFilters,
      hasPenalty
    })

    // 计算任务进度
    this.calculateTaskProgress()
  },

  /**
   * 计算任务进度
   */
  calculateTaskProgress() {
    const { allTasks, currentFilter } = this.data

    // 根据当前筛选确定要计算的任务列表
    let tasksToCount = []
    if (currentFilter === 'penalty') {
      // 惩罚任务不显示进度
      this.setData({
        taskProgress: {
          total: 0,
          completed: 0,
          percentage: 0
        }
      })
      return
    } else if (currentFilter === 'all') {
      // 全部：排除惩罚任务
      tasksToCount = allTasks.filter(task => task.taskType !== 'penalty_parent' && task.taskType !== 'penalty_child')
    } else if (currentFilter === 'normal') {
      // 常规任务
      tasksToCount = allTasks.filter(task => {
        return task.taskType === 'custom' &&
               (!task.maxCompletions || task.maxCompletions === -1) &&
               (!task.startDate || !task.endDate)
      })
    } else if (currentFilter === 'activity') {
      // 活动任务
      tasksToCount = allTasks.filter(task => {
        if (task.taskType !== 'custom') return false
        return (task.maxCompletions && task.maxCompletions !== -1) ||
               (task.startDate && task.endDate)
      })
    } else {
      // daily, weekly, monthly
      tasksToCount = allTasks.filter(task => task.taskType === currentFilter)
    }

    // 计算总任务数和完成数
    // 注意：多次可完成任务只算一次，当天完成一次就算完成
    const total = tasksToCount.length
    const completed = tasksToCount.filter(task => task.completed).length

    // 计算百分比
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    console.log('[首页] 任务进度:', { total, completed, percentage, filter: currentFilter })

    this.setData({
      taskProgress: {
        total,
        completed,
        percentage
      }
    })
  },

  /**
   * 计算任务标签文本和类型
   */
  getTaskBadge(task) {
    const { taskType, taskStatus } = task

    // 自定义任务
    if (taskType === 'custom') {
      if (taskStatus && taskStatus.status === 'pending') {
        return { badgeText: '即将开始', badgeType: 'upcoming' }
      }
      return { badgeText: '限时挑战', badgeType: 'challenge' }
    }

    // 每日任务：检查是否有倒计时
    if (taskType === 'daily') {
      if (taskStatus && taskStatus.countdown) {
        // 有倒计时，显示倒计时胶囊
        if (taskStatus.status === 'expired') {
          return { badgeText: '已过期', badgeType: 'expired' }
        }
        return { badgeText: taskStatus.countdown, badgeType: 'countdown' }
      }
      return { badgeText: '每日任务', badgeType: 'daily' }
    }

    // 周期性任务
    switch (taskType) {
      case 'weekly':
        return { badgeText: '每周任务', badgeType: 'weekly' }
      case 'monthly':
        return { badgeText: '每月任务', badgeType: 'monthly' }
      case 'penalty_parent':
        return { badgeText: '惩罚家长', badgeType: 'penalty' }
      case 'penalty_child':
        return { badgeText: '惩罚小孩', badgeType: 'penalty' }
      default:
        return { badgeText: '任务', badgeType: 'default' }
    }
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    const currentChild = this.data.currentChild
    return {
      title: currentChild
        ? `我在用"妈妈表扬我"记录${currentChild.name}的任务和奖励`
        : '妈妈表扬我 - 儿童任务奖励管理',
      path: '/pages/index/index',
      imageUrl: ''
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '妈妈表扬我 - 帮助孩子建立良好习惯的任务奖励小程序',
      query: '',
      imageUrl: ''
    }
  },

  /**
   * 启动倒计时更新定时器
   */
  startCountdownTimer() {
    // 清除旧的定时器
    this.stopCountdownTimer()

    console.log('[定时器] 启动倒计时定时器')

    // 每秒更新一次倒计时
    this.data.countdownTimer = setInterval(() => {
      console.log('[定时器] 执行定时任务')
      this.updateTaskCountdowns()
    }, 1000) // 1秒
  },

  /**
   * 停止倒计时更新定时器
   */
  stopCountdownTimer() {
    if (this.data.countdownTimer) {
      clearInterval(this.data.countdownTimer)
      this.setData({ countdownTimer: null })
    }
  },

  /**
   * 更新所有任务的倒计时（轻量级更新，只更新文本）
   */
  updateTaskCountdowns() {
    const { tasks } = this.data
    if (!tasks || tasks.length === 0) return

    const { getLocalDateString } = require('../../utils/util.js')
    const today = getLocalDateString(new Date())
    const now = new Date()

    // 构建更新数据
    const updateData = {}
    let needsUpdate = false

    tasks.forEach((task, index) => {
      if (task.taskType === 'daily' && task.endTime && !task.completed && task.taskStatus && task.taskStatus.countdown) {


        // 重新计算倒计时
        const [hours, minutes] = task.endTime.split(':')
        const endTimeToday = new Date(today)
        endTimeToday.setHours(parseInt(hours), parseInt(minutes), 0, 0)

        if (now <= endTimeToday) {
          // 还没过期，更新倒计时
          const timeDiff = endTimeToday.getTime() - now.getTime()
          const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60))
          const minutesLeft = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))
          const secondsLeft = Math.floor((timeDiff % (1000 * 60)) / 1000)

          let countdownText
          if (hoursLeft > 0) {
            countdownText = `${hoursLeft}小时${minutesLeft}分${secondsLeft}秒`
          } else if (minutesLeft > 0) {
            countdownText = `${minutesLeft}分${secondsLeft}秒`
          } else {
            countdownText = `${secondsLeft}秒`
          }

    

          // 更新 taskStatus
          const newStatusText = task.taskType === 'daily' && task.endTime
            ? `${countdownText}后截止`
            : task.taskStatus.statusText

          updateData[`tasks[${index}].taskStatus.countdown`] = countdownText
          updateData[`tasks[${index}].taskStatus.statusText`] = newStatusText
          needsUpdate = true
        }
      }
    })

    // 批量更新
    if (needsUpdate) {
      this.setData(updateData)
    } else {
    }
  },

  /**
   * 页面隐藏时清除定时器
   */
  onHide() {
    this.stopCountdownTimer()
  },

  /**
   * 页面卸载时清除定时器
   */
  onUnload() {
    this.stopCountdownTimer()
  },

  /**
   * 切换飘动动画
   */
  onFloatAnimationToggle(e) {
    const enable = !this.data.enableFloatAnimation
    this.setData({
      enableFloatAnimation: enable,
      taskListClass: enable ? '' : 'no-float-gap'
    })

    // 保存到本地存储
    try {
      wx.setStorageSync('enableFloatAnimation', enable)
    } catch (err) {
      console.error('[首页] 保存飘动动画设置失败:', err)
    }
  },

  /**
   * 切换统计范围
   */
  onStatsRangeChange(e) {
    const { range } = e.currentTarget.dataset
    console.log('[首页] 切换统计范围:', range)

    this.setData({ statsRange: range })
    this.generateCalendarItems()
    this.calculateCoinStats()
  },

  /**
   * 生成日历选项
   */
  generateCalendarItems() {
    const { statsRange } = this.data
    const { getLocalDateString } = require('../../utils/util.js')
    const today = new Date()
    const todayStr = getLocalDateString(today)

    let items = []
    let selectedId = ''

    if (statsRange === 'today') {
      // 生成最近30天的日期
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

      for (let i = 29; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = getLocalDateString(date)
        const day = date.getDate()
        const weekDay = weekDays[date.getDay()]
        const id = `day-${dateStr}`

        items.push({
          id: id,
          main: `${day}日`,
          sub: weekDay,
          date: dateStr,
          type: 'day',
          isSelected: dateStr === todayStr
        })

        if (dateStr === todayStr) {
          selectedId = id
        }
      }
    } else if (statsRange === 'month') {
      // 生成最近12个月
      const currentYear = today.getFullYear()
      const currentMonth = today.getMonth() + 1

      for (let i = 11; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const monthStr = `${year}-${month.toString().padStart(2, '0')}`
        const id = `month-${monthStr}`

        items.push({
          id: id,
          main: `${month}月`,
          sub: `${year}年`,
          date: monthStr,
          type: 'month',
          isSelected: year === currentYear && month === currentMonth
        })

        if (year === currentYear && month === currentMonth) {
          selectedId = id
        }
      }
    } else if (statsRange === 'year') {
      // 生成最近10年
      const currentYear = today.getFullYear()

      for (let i = 9; i >= 0; i--) {
        const year = currentYear - i
        const id = `year-${year}`

        items.push({
          id: id,
          main: `${year}年`,
          sub: '',
          date: `${year}`,
          type: 'year',
          isSelected: year === currentYear,
          isYearItem: true  // 标记为年份项目
        })

        if (year === currentYear) {
          selectedId = id
        }
      }
    } else if (statsRange === 'all') {
      // 全部模式：显示最近10年，默认不选中任何年份
      const currentYear = today.getFullYear()

      for (let i = 9; i >= 0; i--) {
        const year = currentYear - i
        const id = `year-${year}`

        items.push({
          id: id,
          main: `${year}年`,
          sub: '',
          date: `${year}`,
          type: 'year',
          isSelected: false,  // 全部模式默认不选中
          isYearItem: true  // 标记为年份项目
        })
      }

      // 全部模式不设置 selectedId，让用户自己选择
      selectedId = ''
    }

    // 设置选中的日期
    const selectedItem = items.find(item => item.isSelected)
    this.setData({
      calendarItems: items,
      selectedCalendarId: selectedId,
      selectedDate: selectedItem ? selectedItem.date : null,
      selectedCalendarLabel: selectedItem ? { main: selectedItem.main, sub: selectedItem.sub } : { main: '', sub: '' }
    })

    console.log('[首页] 生成日历选项:', {
      range: statsRange,
      itemCount: items.length,
      selectedId: selectedId,
      selectedItem: selectedItem,
      allItems: items.slice(0, 3) // 只打印前3个，避免日志太长
    })
  },

  /**
   * 选择日历项
   */
  onCalendarItemSelect(e) {
    const { item } = e.currentTarget.dataset
    console.log('[首页] 选择日历项:', item)

    // 如果当前是"全部"模式，点击年份后切换到"本年"模式
    if (this.data.statsRange === 'all' && item.type === 'year') {
      console.log('[首页] 全部模式下点击年份，切换到本年模式')

      // 切换到本年模式
      this.setData({
        statsRange: 'year'
      })

      // 重新生成本年模式的日历，并选中点击的年份
      const { getLocalDateString } = require('../../utils/util.js')
      const today = new Date()
      const selectedYear = parseInt(item.date)

      const items = []
      let selectedId = ''

      // 生成最近10年
      for (let i = 9; i >= 0; i--) {
        const year = today.getFullYear() - i
        const id = `year-${year}`

        items.push({
          id: id,
          main: `${year}年`,
          sub: '',
          date: `${year}`,
          type: 'year',
          isSelected: year === selectedYear,
          isYearItem: true
        })

        if (year === selectedYear) {
          selectedId = id
        }
      }

      this.setData({
        calendarItems: items,
        selectedCalendarId: selectedId,
        selectedDate: item.date
      })

      // 重新计算统计数据
      this.calculateCoinStats()
      return
    }

    // 更新选中状态
    const items = this.data.calendarItems.map(i => ({
      ...i,
      isSelected: i.id === item.id
    }))

    this.setData({
      calendarItems: items,
      selectedCalendarId: item.id,
      selectedDate: item.date
    })

    // 重新计算统计数据
    this.calculateCoinStats()
  },

  /**
   * 计算金币统计
   */
  async calculateCoinStats() {
    try {
      const currentChild = app.getCurrentChild()
      const currentFamilyId = app.getCurrentFamilyId()

      if (!currentChild || !currentFamilyId) {
        console.log('[首页] 缺少currentChild或familyId，跳过统计')
        return
      }

      const currentChildId = currentChild.childId
      const statsRange = this.data.statsRange
      const selectedDate = this.data.selectedDate

      console.log('[首页] 计算金币统计 - childId:', currentChildId, 'familyId:', currentFamilyId, 'range:', statsRange, 'selectedDate:', selectedDate)

      let coinRecords = []

      // 如果登录了，从云端获取
      if (app.globalData.useCloudStorage) {
        console.log('[首页] 从云端获取金币记录')
        const res = await wx.cloud.callFunction({
          name: 'manageFamilyCoins',
          data: {
            action: 'getCoinRecords',
            data: {
              childId: currentChildId,
              familyId: currentFamilyId,
              limit: 1000  // 获取更多记录以支持范围筛选
            }
          }
        })

        console.log('[首页] 云端返回:', res.result)

        if (res.result && res.result.success) {
          coinRecords = res.result.records || []
          console.log('[首页] 获取到金币记录数:', coinRecords.length)
        }
      } else {
        // 从本地存储获取
        console.log('[首页] 从本地获取金币记录')
        const storageKey = `localCoinRecords_${currentFamilyId}`
        const localRecords = wx.getStorageSync(storageKey) || []
        coinRecords = localRecords.filter(record => record.childId === currentChildId)
        console.log('[首页] 本地金币记录数:', coinRecords.length)
      }

      // 根据统计范围和选中日期筛选记录
      const { getLocalDateString } = require('../../utils/util.js')
      const today = getLocalDateString(new Date())

      console.log('[首页] 筛选范围 - statsRange:', statsRange, 'selectedDate:', selectedDate)

      const filteredRecords = coinRecords.filter(record => {
        if (!record.createdAt) return false

        const recordDate = new Date(record.createdAt)
        const recordDateStr = getLocalDateString(recordDate)
        const recordMonth = recordDateStr.substring(0, 7)  // YYYY-MM
        const recordYear = recordDateStr.substring(0, 4)    // YYYY

        // 根据选中的日期筛选
        if (selectedDate) {
          if (statsRange === 'today') {
            // 按天筛选
            return recordDateStr === selectedDate
          } else if (statsRange === 'month') {
            // 按月筛选
            return recordMonth === selectedDate
          } else if (statsRange === 'year') {
            // 按年筛选
            return recordYear === selectedDate
          }
        }

        // 如果没有选中日期，使用默认行为（今天/当月/本年）
        const currentMonth = today.substring(0, 7)
        const currentYear = today.substring(0, 4)

        if (statsRange === 'today') {
          return recordDateStr === today
        } else if (statsRange === 'month') {
          return recordMonth === currentMonth
        } else if (statsRange === 'year') {
          return recordYear === currentYear
        } else {
          // 'all' - 不筛选
          return true
        }
      })

      console.log('[首页] 筛选后金币记录数:', filteredRecords.length)

      // 计算统计数据
      const stats = {
        redeemCount: 0,        // 兑换次数
        spentCoins: 0,         // 消耗金币
        earnCount: 0,          // 奖励次数
        earnedCoins: 0,        // 获得金币
        penaltyCoins: 0        // 惩罚金币
      }

      console.log('[首页] 开始处理金币记录，总记录数:', filteredRecords.length)

      filteredRecords.forEach((record, index) => {
        const amount = record.amount || 0
        console.log(`[首页] 记录 ${index + 1}:`, {
          type: record.type,
          amount: amount,
          amountType: typeof amount,
          description: record.description,
          relatedId: record.relatedId
        })

        if (record.type === 'prize_redeem') {
          // 兑换奖品
          stats.redeemCount++
          stats.spentCoins += Math.abs(amount)
          console.log(`[首页] 兑换奖品累计: 次数=${stats.redeemCount}, 金币=${stats.spentCoins}`)
        } else if (record.type === 'task_complete') {
          // 完成任务：根据amount正负来判断是奖励还是惩罚
          if (amount >= 0) {
            // 正数：正常完成任务获得金币
            stats.earnCount++
            stats.earnedCoins += amount
            console.log(`[首页] 完成任务累计: 次数=${stats.earnCount}, 金币=${stats.earnedCoins}`)
          } else {
            // 负数：惩罚任务扣除金币
            stats.penaltyCoins += Math.abs(amount)
            console.log(`[首页] 惩罚累计: 金币=${stats.penaltyCoins}, 原始值=${amount}, 绝对值=${Math.abs(amount)}`)
          }
        } else if (record.type === 'penalty') {
          // 明确标记为惩罚的记录
          stats.penaltyCoins += Math.abs(amount)
          console.log(`[首页] 惩罚累计: 金币=${stats.penaltyCoins}, 原始值=${amount}, 绝对值=${Math.abs(amount)}`)
        } else if (record.type === 'manual_adjust') {
          // 手动调整
          if (amount > 0) {
            stats.earnedCoins += amount
          } else {
            stats.spentCoins += Math.abs(amount)
          }
          console.log(`[首页] 手动调整: type=${record.type}, amount=${amount}`)
        } else {
          console.log(`[首页] 未知记录类型: ${record.type}`)
        }
      })

      this.setData({ coinStats: stats })
      console.log('[首页] 金币统计:', stats)
      console.log('[首页] 兑换次数:', stats.redeemCount, '消耗金币:', stats.spentCoins)
      console.log('[首页] 完成次数:', stats.earnCount, '获得金币:', stats.earnedCoins)
      console.log('[首页] 惩罚金币:', stats.penaltyCoins)
    } catch (err) {
      console.error('[首页] 计算金币统计失败:', err)
    }
  },

  /**
   * 显示主题快捷菜单
   */
  showThemeQuickMenu() {
    this.setData({
      showThemeMenu: true
    })
  },

  /**
   * 隐藏主题快捷菜单
   */
  hideThemeQuickMenu() {
    this.setData({
      showThemeMenu: false
    })
  },

  /**
   * 快捷切换主题
   */
  quickSwitchTheme(e) {
    const theme = e.currentTarget.dataset.theme
    app.globalData.settings.themeStyle = theme
    app.applyTheme()
    app.saveSettingsToStorage()

    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: theme,
      colorTone: app.globalData.colorTone,
      showThemeMenu: false
    })

    // 更新TabBar主题
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().applyTheme()
    }

    wx.showToast({
      title: '主题已切换',
      icon: 'success'
    })
  },

  /**
   * 显示登录弹窗
   */
  showLoginModal() {
    wx.showModal({
      title: '登录',
      content: '登录后可以同步数据到云端，多设备使用',
      confirmText: '去登录',
      cancelText: '暂不登录',
      success: (res) => {
        if (res.confirm) {
          this.performLogin()
        }
      }
    })
  },

  /**
   * 执行登录
   */
  async performLogin() {
    try {
      // 先获取用户头像昵称
      const userProfile = await wx.getUserProfile({
        desc: '用于保存您的设置和历史记录'
      })

      wx.showLoading({
        title: '登录中...'
      })

      // 调用微信登录云函数
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          userInfo: userProfile.userInfo
        }
      })

      if (loginRes.result && loginRes.result.success) {
        const userInfo = loginRes.result.data

        // 保存用户信息
        app.globalData.useCloudStorage = true
        app.globalData.currentUserOpenid = userInfo.openid
        wx.setStorageSync('userInfo', userInfo)

        // 先更新用户信息显示
        this.setData({
          userInfo: userInfo,
          isLoading: true
        })

        wx.hideLoading()
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })

        // 同步本地数据到云端
        await app.syncLocalDataToCloud()

        // 延迟确保全局状态更新完成
        await new Promise(resolve => setTimeout(resolve, 200))

        // 检查是否有家庭，如果没有则创建默认家庭
        if (!app.getCurrentFamilyId()) {
          console.log('[首页登录] 没有家庭，创建默认家庭')
          await this.createDefaultFamily()
        }

        // 完全重新加载页面数据
        await this.onShow()
      } else {
        wx.hideLoading()
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 登录失败:', err)
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
    }
  },

  /**
   * 处理退出登录
   */
  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          this.performLogout()
        }
      }
    })
  },

  /**
   * 执行退出登录
   */
  performLogout() {
    // 清除用户信息
    app.globalData.useCloudStorage = false
    app.globalData.currentUserOpenid = null
    wx.removeStorageSync('userInfo')

    this.setData({
      userInfo: null
    })

    wx.showToast({
      title: '已退出登录',
      icon: 'success'
    })

    // 重新加载页面
    this.onShow()
  },

  /**
   * 创建默认家庭（首次登录时）
   */
  async createDefaultFamily() {
    try {
      const familyName = '我的家庭'
      const res = await wx.cloud.callFunction({
        name: 'manageFamily',
        data: {
          action: 'createFamily',
          data: {
            name: familyName
          }
        }
      })

      if (res.result && res.result.success) {
        const familyId = res.result.family.familyId
        app.saveCurrentFamilyId(familyId)
        console.log('[首页] 默认家庭创建成功:', familyId)
      }
    } catch (err) {
      console.error('[首页] 创建默认家庭失败:', err)
    }
  }
})
