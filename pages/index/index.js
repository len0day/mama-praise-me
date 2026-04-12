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
    childPickerTop: 0,      // 儿童选择器位置
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
    showThemeMenu: false,    // 主题快捷菜单显示状态
    showCreateFamilyModal: false,  // 显示创建家庭弹窗
    showJoinFamilyModal: false,    // 显示加入家庭弹窗
    showCreateChildModal: false,   // 显示创建第一个儿童弹窗
    familyFormData: {        // 家庭表单数据
      familyName: '',
      creatorNickname: '',
      inviteCode: '',
      nickname: ''
    },
    childFormData: {         // 儿童表单数据
      name: '',
      gender: 'male',
      age: 6,
      initialCoins: 0
    },
    // 首次使用流程对话框状态
    showCreateFamilyInput: false,
    showCreateChildInput: false,
    showJoinFamilyInput: false,
    familyNameInput: '',
    creatorNicknameInput: '',
    childNameInput: '',
    childGenderInput: 'male',
    childAgeInput: '',
    childCoinsInput: '0',
    childAvatarInput: '',
    inviteCodeInput: '',
    needFamily: true  // 默认显示需要家庭提示，避免先显示添加孩子
  },

  // 记录上次显示的家庭ID，用于检测家庭切换
  _lastDisplayedFamilyId: null,

  i18n: {},

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

    // 加载国际化文本
    this.loadI18n()

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

    // 刷新用户信息
    let userInfo = null
    if (app.globalData.useCloudStorage && app.globalData.currentUserOpenid) {
      userInfo = wx.getStorageSync('userInfo') || null
    }

    // 先设置主题和用户信息，避免页面空白
    this.setData({
      themeClass: themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      isLoading: false,  // 先设置为false，避免一直加载
      userInfo: userInfo
    })

    // 刷新TabBar主题
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
      this.getTabBar().applyTheme()
    }

    // 确保加载当前家庭ID（从本地存储恢复）
    app.loadCurrentFamilyId()
    app.loadCurrentChildId()

    // 检查家庭是否切换了
    const currentFamilyId = app.getCurrentFamilyId()
    const familyChanged = this._lastDisplayedFamilyId !== currentFamilyId
    console.log('[首页 onShow] 家庭切换检测:', {
      上次: this._lastDisplayedFamilyId,
      当前: currentFamilyId,
      切换: familyChanged
    })

    // 检查是否是首次使用（无家庭、无儿童、无本地数据）
    const isFirstTime = this.isFirstTimeUser()
    console.log('[首页 onShow] 是否首次使用:', isFirstTime)

    if (isFirstTime) {
      // 显示首次使用流程
      console.log('[首页 onShow] 开始首次使用流程')
      this.showFirstTimeFlow()
      return
    }

    // 继续正常的页面加载流程
    console.log('[首页 onShow] 设置主题:', { themeClass, themeStyle, isFunTheme })

    // 从其他 Tab 回到首页且家庭/孩子未变：不盖全屏加载层，在后台静默拉任务（避免每次切换都闪「加载中」）
    const resumeFamilyId = app.getCurrentFamilyId()
    const resumeChildId = app.globalData.currentChildId
    const silentTabResume =
      !this._justForceRefreshed &&
      !familyChanged &&
      this._lastDisplayedFamilyId != null &&
      this._lastDisplayedFamilyId === resumeFamilyId &&
      !!this.data.currentChild &&
      !!resumeChildId &&
      this.data.currentChild.childId === resumeChildId

    if (!silentTabResume) {
      this.setData({ isLoading: true })
    }

    // 检查是否有家庭
    if (!app.getCurrentFamilyId() && !this._justForceRefreshed) {
      this.setData({
        currentChild: null,
        tasks: [],
        todayCompletions: [],
        isLoading: false,
        needFamily: true  // 显示需要家庭的提示
      })
      return
    }

    // 如果正在强制刷新（登录后），等待数据加载
    if (this._justForceRefreshed) {
      // 延迟一下，让数据加载完成
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 加载孩子数据
    // 如果家庭切换了，强制刷新；否则使用缓存
    const shouldForceRefresh = familyChanged || this._justForceRefreshed
    await app.loadChildren(shouldForceRefresh)

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
        const familyIds = child.familyIds || []
        return familyIds.includes(currentFamilyId)
      })

      if (familyChildren.length > 0) {
        // 从家庭配置中获取该家庭上次选择的儿童ID
        const familyConfig = wx.getStorageSync('familyConfig') || {}
        const savedChildId = familyConfig[currentFamilyId]?.currentChildId

        let childToSelect
        if (savedChildId) {
          // 尝试找到上次选择的儿童
          childToSelect = familyChildren.find(c => c.childId === savedChildId)
        }

        // 如果没有保存的记录或找不到该儿童，选择第一个
        if (!childToSelect) {
          childToSelect = familyChildren[0]
        }

        app.saveCurrentChildId(childToSelect.childId)
        currentChild = childToSelect
        console.log('[首页] 自动选择儿童:', currentChild.name)
      }
    }

    console.log('[首页] 最终 currentChild:', currentChild)

    // 如果还是没有孩子，显示添加孩子提示，但要显示当前家庭信息
    if (!currentChild) {
      console.warn('[首页] 当前家庭没有儿童，显示添加提示')

      // 加载所有家庭列表，用于显示当前家庭
      await this.loadAllFamilies()

      // 获取当前家庭信息
      const currentFamilyId = app.getCurrentFamilyId()
      const currentFamily = this.data.allFamilies.find(f => f.familyId === currentFamilyId)

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
        needFamily: false,
        currentFamily: currentFamily || null,  // 显示当前家庭
        currentFamilyId: currentFamilyId
      })

      // 记录当前显示的家庭ID
      this._lastDisplayedFamilyId = currentFamilyId
      console.log('[首页 onShow] 无儿童家庭，记录当前家庭ID:', this._lastDisplayedFamilyId)
      return
    }

    // 加载所有家庭列表（用于家庭选择器）和当前家庭的儿童列表
    await this.loadAllFamilies()
    await this.loadCurrentFamilyChildren()

    // 补充家庭信息和金币余额
    // 加载家庭名称和金币余额
    const enrichedChild = await this.enrichChildInfo(currentChild)

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

    // 记录当前显示的家庭ID
    this._lastDisplayedFamilyId = app.getCurrentFamilyId()
    console.log('[首页 onShow] 记录当前家庭ID:', this._lastDisplayedFamilyId)

    // 加载数据（包含计算金币统计）
    // loadChildren 已按家庭级时间戳决定是否拉取孩子列表，无需再在此处二次 checkDataFreshness + loadData（避免重复云请求）
    await this.loadData({ silent: silentTabResume })

    // 清除强制刷新标记
    this._justForceRefreshed = false
  },

  /**
   * 补充儿童信息（家庭名称和金币余额）
   */
  async enrichChildInfo(child) {
    try {
      // 获取当前家庭ID
      const currentFamilyId = app.getCurrentFamilyId()

      // 检查儿童是否属于当前家庭（通过 familyIds 数组）
      const familyIds = child.familyIds || []
      if (currentFamilyId && !familyIds.includes(currentFamilyId)) {
        // 儿童不属于当前家庭，不显示
        return child
      }

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
            familyId: currentFamilyId
          }
        }),
        wx.cloud.callFunction({
          name: 'manageFamilyCoins',
          data: {
            action: 'getChildCoinsInFamily',
            childId: child.childId,
            familyId: currentFamilyId
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
    const familyChildren = allChildren.filter(child => {
      const familyIds = child.familyIds || []
      return familyIds.includes(currentFamilyId)
    })
    this.setData({ currentFamilyChildren: familyChildren })
  },

  /**
   * 加载数据
   * @param {{ silent?: boolean }} options - silent=true 时不点亮全屏 isLoading（用于 Tab 切回首页）
   */
  async loadData(options = {}) {
    const silent = options.silent === true

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
    if (silent) {
      this.setData({ currentFamilyId })
    } else {
      this.setData({ currentFamilyId, isLoading: true })
    }

    // 未登录：从本地加载数据
    if (!app.globalData.useCloudStorage) {
      this.loadDataFromLocal(currentFamilyId, currentChild)
      return
    }

    // 已登录：从云端加载数据
    await this.loadDataFromCloud(currentFamilyId, currentChild, { silent })
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

        // 如果任务已完成且没有多次完成设置，直接标记为完成，不计算倒计时
        if (completed && (!task.maxCompletions || task.maxCompletions <= 1)) {
          taskStatus = {
            status: 'completed',
            statusText: '今日已完成'
          }
        } else if (task.endTime) {
          // 有结束时间或可以多次完成：计算倒计时和状态
          console.log('[首页] 计算倒计时 - endTime:', task.endTime)
          const now = new Date()
          const timeParts = task.endTime.split(':')
          const hours = parseInt(timeParts[0])
          const minutes = parseInt(timeParts[1] || 0)
          const seconds = parseInt(timeParts[2] || 0)

          const endTimeToday = new Date(today)
          endTimeToday.setHours(hours, minutes, seconds, 0)

          console.log('[首页] 当前时间:', now.toLocaleString(), '结束时间:', endTimeToday.toLocaleString())

          if (now > endTimeToday) {
            // 已过期 - 检查是否是过期的第二天
            const yesterday = new Date(today)
            yesterday.setDate(yesterday.getDate() - 1)
            const endTimeYesterday = new Date(yesterday)
            endTimeYesterday.setHours(hours, minutes, seconds, 0)

            // 如果当前时间是过期后的第二天，标记为应该隐藏
            if (now > endTimeYesterday) {
              console.log('[首页] 任务已过期且是第二天，标记为隐藏')
              taskStatus = {
                status: 'expired',
                statusText: '已过期',
                endTime: task.endTime,
                shouldHide: true  // 标记为应该隐藏
              }
            } else {
              // 还是过期当天，仍然显示
              console.log('[首页] 任务已过期（当天）')
              taskStatus = {
                status: 'expired',
                statusText: '已过期',
                endTime: task.endTime
              }
            }
            // 注意：这里不设置 completed = false，让已完成的任务保持完成状态
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
   * @param {{ silent?: boolean }} loadOpts - silent 且短期缓存命中时跳过 getTasks/getAllCompletions（Tab 来回切时少打云）
   */
  async loadDataFromCloud(currentFamilyId, currentChild, loadOpts = {}) {
    const silent = loadOpts.silent === true
    const cacheKey = `${currentFamilyId}_${currentChild.childId}`
    const TASK_CACHE_TTL_MS = 45 * 1000
    if (
      silent &&
      this._homeTasksCacheKey === cacheKey &&
      this._homeTasksCacheAt > 0 &&
      Date.now() - this._homeTasksCacheAt < TASK_CACHE_TTL_MS
    ) {
      try {
        await this.calculateCoinStats()
      } catch (e) {}
      // onHide 会停表，从 Tab 回来时需恢复倒计时刷新
      this.startCountdownTimer()
      return
    }

    try {
      // 获取任务列表和所有完成记录
      const [tasksRes, completionsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getTasks',
            familyId: currentFamilyId,
            childId: currentChild.childId
          }
        }),
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getAllCompletions',
            familyId: currentFamilyId,
            childId: currentChild.childId
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

            // 如果任务已完成且没有多次完成设置，直接标记为完成，不计算倒计时
            if (completed && (!task.maxCompletions || task.maxCompletions <= 1)) {
              taskStatus = {
                status: 'completed',
                statusText: '今日已完成'
              }
            } else if (task.endTime) {
              // 有结束时间或可以多次完成：计算倒计时和状态
              console.log('[首页 云端] 进入倒计时计算')
              console.log('[首页 云端] 计算倒计时 - endTime:', task.endTime)
              const now = new Date()
              const timeParts = task.endTime.split(':')
              const hours = parseInt(timeParts[0])
              const minutes = parseInt(timeParts[1] || 0)
              const seconds = parseInt(timeParts[2] || 0)

              const endTimeToday = new Date(today)
              endTimeToday.setHours(hours, minutes, seconds, 0)

              console.log('[首页 云端] 当前时间:', now.toLocaleString(), '结束时间:', endTimeToday.toLocaleString())

              if (now > endTimeToday) {
                // 已过期 - 检查是否是过期的第二天
                const yesterday = new Date(today)
                yesterday.setDate(yesterday.getDate() - 1)
                const endTimeYesterday = new Date(yesterday)
                endTimeYesterday.setHours(hours, minutes, seconds, 0)

                // 如果当前时间是过期后的第二天，标记为应该隐藏
                if (now > endTimeYesterday) {
                  console.log('[首页 云端] 任务已过期且是第二天，标记为隐藏')
                  taskStatus = {
                    status: 'expired',
                    statusText: '已过期',
                    endTime: task.endTime,
                    shouldHide: true  // 标记为应该隐藏
                  }
                } else {
                  // 还是过期当天，仍然显示
                  console.log('[首页 云端] 任务已过期（当天）')
                  taskStatus = {
                    status: 'expired',
                    statusText: '已过期',
                    endTime: task.endTime
                  }
                }
                // 注意：这里不设置 completed = false，让已完成的任务保持完成状态
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

      this._homeTasksCacheKey = cacheKey
      this._homeTasksCacheAt = Date.now()

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
      showToast('任务已过期，无法完成')
      return
    }

    // 检查是否可以完成（双重保险）
    if (task.canComplete === false) {
      showToast('任务当前无法完成')
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
      // 1. 先更新云端（确保数据一致性）
      const res = await wx.cloud.callFunction({
        name: 'manageTasks',
        data: {
          action: 'completeTask',
          taskId: taskId,
          childId: this.data.currentChild.childId,
          familyId: this.data.currentFamilyId
        }
      })

      if (res.result.success) {
        // 2. 更新本地数据
        this.completeTaskToLocal(taskId)

        // 3. 立即更新时间戳（关键！）
        await app.updateChildTimestamp()

        // 4. 清除任务缓存
        app.invalidateTasksCache(this.data.currentFamilyId, this.data.currentChild.childId)

        hideLoading()
        showToast('任务完成！')
        // 重新加载数据
        await this.loadData()
        // 更新全局孩子数据
        await this.refreshChildData()
      } else {
        hideLoading()
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
            childId: this.data.currentChild.childId
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

      // 保存所有家庭到全局数据（包括没有孩子的家庭）
      app.globalData.families = localFamilies

      // 过滤掉没有儿童的家庭用于显示
      const familiesWithChildren = localFamilies.filter(family => {
        const storageKey = `localChildren_${family.familyId}`
        const familyChildren = wx.getStorageSync(storageKey) || []
        return familyChildren.length > 0
      })

      const currentFamily = familiesWithChildren.find(f => f.familyId === app.getCurrentFamilyId())
      this.setData({
        allFamilies: familiesWithChildren,
        currentFamily: currentFamily || null,
        showFamilyPicker: show === true
      })
      return
    }

    // 已登录：从云端加载（非「打开选择器」可走短缓存，减少重复 getAllMyFamilies）
    try {
      let families = null
      if (!show) {
        const cached = app.getFamiliesListCache()
        console.log('[首页] 缓存数据:', cached)
        if (cached) {
          // 兼容旧格式（数组）和新格式（对象）
          if (Array.isArray(cached)) {
            // 旧格式：直接是数组
            families = cached
            console.log('[首页] 使用旧格式缓存（数组）')
          } else if (cached && typeof cached === 'object') {
            // 新格式：对象包含 families 和 deletedFamilies
            families = cached.families || []
            console.log('[首页] 使用新格式缓存，家庭数:', families.length)
          }
        }
      }
      if (!families) {
        const res = await wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getAllMyFamilies'
          }
        })

        if (res.result.success) {
          families = res.result.families || []
          if (!show) {
            // 同时保存活跃家庭和已解散家庭到缓存
            app.setFamiliesListCache(families, res.result.deletedFamilies || [])
          }
        }
      }

      if (families && Array.isArray(families)) {
        app.globalData.families = families

        const familiesWithChildren = families.filter(family => {
          return (family.childCount || 0) > 0
        })

        const currentFamily = familiesWithChildren.find(f => f.familyId === app.getCurrentFamilyId())
        this.setData({
          allFamilies: familiesWithChildren,
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
          familyId: familyid
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

        // 更新全局儿童数据（这样 getCurrentChild 才能找到新儿童）
        app.globalData.children = children

        // 补充儿童信息（家庭名称和金币余额）
        const enrichedChild = await this.enrichChildInfo(firstChild)

        console.log('[首页 selectFamily] 切换到家庭:', familyid, '儿童:', enrichedChild.name, enrichedChild.childId)

        // 更新当前数据
        const currentFamily = this.data.allFamilies.find(f => f.familyId === familyid)
        this.setData({
          currentFamilyId: familyid,
          currentFamily: currentFamily || null,
          currentChild: enrichedChild,
          currentFamilyChildren: children,
          showFamilyPicker: false
        })

        console.log('[首页 selectFamily] 调用 loadData() 前, currentFamilyId:', app.getCurrentFamilyId(), 'currentChildId:', app.getCurrentChild()?.childId)

        // 刷新任务列表
        await this.loadData()

        console.log('[首页 selectFamily] loadData() 完成, 当前 coinStats:', JSON.stringify(this.data.coinStats))

        // loadData 可能会重置 currentChild，需要重新设置 enriched child（包含 familyCoins）
        this.setData({
          currentChild: enrichedChild
        })

        console.log('[首页 selectFamily] 重新设置 currentChild 后, currentChild.familyCoins:', enrichedChild.familyCoins)

        // 重新计算金币统计（确保切换家庭后统计被刷新）
        console.log('[首页 selectFamily] 调用 calculateCoinStats() 前, currentChildId:', app.getCurrentChild()?.childId, 'familyId:', app.getCurrentFamilyId())
        await this.calculateCoinStats()
        console.log('[首页 selectFamily] calculateCoinStats() 完成, coinStats:', JSON.stringify(this.data.coinStats))

        // 重新计算任务进度
        this.calculateTaskProgress()
        console.log('[首页 selectFamily] calculateTaskProgress() 完成, taskProgress:', JSON.stringify(this.data.taskProgress))

        hideLoading()
        this.hideFamilyPicker()
        showToast(`已切换到${enrichedChild.familyName || '该家庭'}`)
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

        // 补充儿童信息（家庭名称和金币余额）
        const enrichedChild = await this.enrichChildInfo(firstChild)

        this.setData({
          currentFamilyId: familyid,
          currentChild: enrichedChild,
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
   * 点击儿童名称
   */
  onChildNameTap() {
    // 只有当有多个儿童时才显示选择器
    if (this.data.currentFamilyChildren.length > 1) {
      this.showChildPicker()
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

    // 每秒更新一次倒计时
    this.data.countdownTimer = setInterval(() => {
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
      // 每日任务倒计时更新
      if (task.taskType === 'daily' && task.endTime && !task.completed && task.taskStatus && task.taskStatus.countdown) {
        // 重新计算倒计时
        const timeParts = task.endTime.split(':')
        const hours = parseInt(timeParts[0])
        const minutes = parseInt(timeParts[1] || 0)
        const seconds = parseInt(timeParts[2] || 0)

        const endTimeToday = new Date(today)
        endTimeToday.setHours(hours, minutes, seconds, 0)

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
          const newStatusText = task.maxCompletions && task.maxCompletions > 1
            ? `${countdownText}·剩余${task.taskStatus.remaining}次`
            : `${countdownText}后截止`

          updateData[`tasks[${index}].taskStatus.countdown`] = countdownText
          updateData[`tasks[${index}].taskStatus.statusText`] = newStatusText
          needsUpdate = true
        }
      }
      // 自定义任务倒计时更新
      else if (task.taskType === 'custom' && task.endDate && task.endTime && task.endTime !== '23:59:59' && !task.completed && task.taskStatus && task.taskStatus.countdown) {
        // 重新计算倒计时
        const endTimeDate = new Date(`${task.endDate} ${task.endTime}`)

        if (now <= endTimeDate) {
          // 还没过期，更新倒计时
          const timeDiff = endTimeDate.getTime() - now.getTime()
          const daysLeft = Math.floor(timeDiff / (24 * 60 * 60 * 1000))
          const hoursLeft = Math.floor((timeDiff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
          const minutesLeft = Math.floor((timeDiff % (60 * 60 * 1000)) / (60 * 1000))
          const secondsLeft = Math.floor((timeDiff % (60 * 1000)) / 1000)

          let countdownText
          if (daysLeft > 0) {
            countdownText = `${daysLeft}天${hoursLeft}小时${minutesLeft}分${secondsLeft}秒`
          } else if (hoursLeft > 0) {
            countdownText = `${hoursLeft}小时${minutesLeft}分${secondsLeft}秒`
          } else if (minutesLeft > 0) {
            countdownText = `${minutesLeft}分${secondsLeft}秒`
          } else {
            countdownText = `${secondsLeft}秒`
          }

          // 构建新的状态文本
          let newStatusText = countdownText + '后结束'
          if (task.maxCompletions && task.taskStatus.remaining !== undefined) {
            newStatusText = `剩余${task.taskStatus.remaining}次·${countdownText}后结束`
          }

          updateData[`tasks[${index}].taskStatus.countdown`] = countdownText
          updateData[`tasks[${index}].taskStatus.statusText`] = newStatusText
          needsUpdate = true
        }
      }
    })

    // 批量更新
    if (needsUpdate) {
      this.setData(updateData)
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
            childId: currentChildId,
            familyId: currentFamilyId,
            limit: 1000  // 获取更多记录以支持范围筛选
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

      this.setData({ coinStats: stats }, () => {
        console.log('[首页] 金币统计已更新 setData callback, coinStats:', this.data.coinStats)
      })
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
        app.mergeUserSettingsAfterLogin(userInfo)
        if (typeof app.invalidateFamiliesListCache === 'function') {
          app.invalidateFamiliesListCache()
        }

        // 先更新用户信息显示
        this.setData({
          userInfo: userInfo,
          isLoading: true
        })

        try {
          // 同步本地数据到云端
          const syncResult = await app.syncLocalDataToCloud()

          // 如果有冲突，让用户选择
          if (syncResult.status === 'conflict') {
            wx.hideLoading()
            const choice = await this.showConflictDialog(syncResult.localCount, syncResult.cloudCount)
            if (choice === 'cancel') {
              // 用户取消登录
              app.globalData.useCloudStorage = false
              app.globalData.currentUserOpenid = null
              wx.removeStorageSync('userInfo')
              wx.showToast({ title: '已取消登录', icon: 'none' })
              return
            } else if (choice === 'cloud') {
              // 用云端覆盖本地
              wx.showLoading({ title: '同步中...', mask: true })
              await app.downloadCloudDataToLocal()
              // 重新加载家庭和孩子数据
              await app.loadChildren(true)
            } else {
              // 用本地上传到云端（保留本地数据）
              wx.showLoading({ title: '同步中...', mask: true })
              await app.uploadLocalDataToCloud(
                wx.getStorageSync('localFamilies') || [],
                this.getLocalChildrenData(),
                false  // 不清除本地数据
              )
            }
            await new Promise(resolve => setTimeout(resolve, 500))
          }

          // 强制加载家庭和孩子数据（即使本地有缓存）
          console.log('[首页登录] 开始加载家庭和孩子数据')
          await this.loadAllFamilies()
          await app.loadChildren(true)  // 登录后强制刷新

          // 优先恢复上次选择的家庭/儿童
          const lastFamilyId = app.getCurrentFamilyId()
          const lastChildId = app.getCurrentChildId()

          if (lastFamilyId && this.data.allFamilies && this.data.allFamilies.length > 0) {
            // 检查上次选择的家庭是否还存在
            const familyExists = this.data.allFamilies.some(f => f.familyId === lastFamilyId)
            if (familyExists) {
              // 恢复上次选择的家庭
              app.saveCurrentFamilyId(lastFamilyId)
              console.log('[首页登录] 恢复上次选择的家庭:', lastFamilyId)

              // 恢复上次选择的儿童
              if (lastChildId) {
                const familyChildren = app.globalData.children || []
                const childExists = familyChildren.some(c => c.childId === lastChildId)
                if (childExists) {
                  app.setCurrentChildById(lastChildId)
                  console.log('[首页登录] 恢复上次选择的儿童:', lastChildId)
                }
              }
            } else {
              // 上次选择的家庭不存在，选择第一个家庭
              const firstFamily = this.data.allFamilies[0]
              app.saveCurrentFamilyId(firstFamily.familyId)
              console.log('[首页登录] 上次家庭不存在，选择第一个家庭:', firstFamily.name)
            }
          } else if (this.data.allFamilies && this.data.allFamilies.length > 0) {
            // 没有上次选择记录，选择第一个家庭
            const firstFamily = this.data.allFamilies[0]
            app.saveCurrentFamilyId(firstFamily.familyId)
            console.log('[首页登录] 无上次记录，选择第一个家庭:', firstFamily.name)
          } else if (!app.getCurrentFamilyId()) {
            // 没有家庭，创建默认家庭
            console.log('[首页登录] 没有家庭，创建默认家庭')
            await this.createDefaultFamily()
          }

          // 检查当前家庭是否有孩子
          const currentFamilyId = app.getCurrentFamilyId()
          const allChildren = app.globalData.children || []
          const familyChildren = allChildren.filter(child => {
            const familyIds = child.familyIds || []
            return familyIds.includes(currentFamilyId)
          })

          if (familyChildren.length === 0) {
            // 当前家庭没有孩子
            if (allChildren.length > 0) {
              // 有孩子但没分配到当前家庭，分配第一个孩子到当前家庭
              console.log('[首页登录] 有孩子但未分配到当前家庭，进行分配')
              const firstChild = allChildren[0]
              await this.assignChildToFamily(firstChild.childId, currentFamilyId)
            } else {
              // 完全没有孩子，创建默认孩子
              console.log('[首页登录] 没有孩子，创建默认孩子')
              await this.createDefaultChild()
            }
          }

          // 完全重新加载页面数据
          this._justForceRefreshed = true  // 标记刚刚强制刷新过
          await this.onShow()

          wx.hideLoading()
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          })
        } catch (dataLoadError) {
          wx.hideLoading()
          console.error('[首页登录] 加载数据失败:', dataLoadError)
          wx.showToast({
            title: '登录成功，但加载数据失败',
            icon: 'none'
          })
        }
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
      const userInfo = wx.getStorageSync('userInfo')
      const familyName = '我的家庭'
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'createFamily',
          name: familyName,
          creatorNickname: userInfo?.nickName || '创建者'
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
  },

  /**
   * 创建默认孩子（首次登录时）
   */
  async createDefaultChild() {
    try {
      const childName = '宝贝'
      const familyId = app.getCurrentFamilyId()

      if (!familyId) {
        console.error('[首页] 创建默认孩子失败: 没有家庭ID')
        return
      }

      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'createChild',
          name: childName,
          age: 6,
          gender: 'male',
          familyId: familyId
        }
      })

      if (res.result && res.result.success) {
        console.log('[首页] 默认孩子创建成功:', res.result.child.childId)
        // 重新加载孩子数据
        await app.loadChildren()
      }
    } catch (err) {
      console.error('[首页] 创建默认孩子失败:', err)
    }
  },

  /**
   * 将孩子分配到家庭
   */
  async assignChildToFamily(childId, familyId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'assignChildToFamily',
          familyId: familyId,
          childId: childId,
          initialCoins: 0
        }
      })

      if (res.result && res.result.success) {
        console.log('[首页] 孩子分配到家庭成功:', childId, '->', familyId)
        // 重新加载孩子数据
        await app.loadChildren()
      }
    } catch (err) {
      console.error('[首页] 分配孩子到家庭失败:', err)
    }
  },

  /**
   * 显示创建家庭弹窗
   */
  showCreateFamilyModal() {
    this.setData({
      showCreateFamilyModal: true,
      familyFormData: {
        familyName: '',
        creatorNickname: '',
        inviteCode: '',
        nickname: ''
      }
    })
  },

  /**
   * 显示加入家庭弹窗
   */
  showJoinFamilyModal() {
    // 未登录时不允许加入家庭
    if (!app.globalData.useCloudStorage) {
      wx.showModal({
        title: '需要登录',
        content: '加入其他家庭需要登录账号',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/settings/settings'
            })
          }
        }
      })
      return
    }

    this.setData({
      showJoinFamilyModal: true,
      familyFormData: {
        familyName: '',
        creatorNickname: '',
        inviteCode: '',
        nickname: ''
      }
    })
  },

  /**
   * 关闭所有家庭弹窗
   */
  closeFamilyModals() {
    this.setData({
      showCreateFamilyModal: false,
      showJoinFamilyModal: false
    })
  },

  /**
   * 家庭表单输入处理
   */
  onFamilyInputChange(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`familyFormData.${field}`]: value
    })
  },

  /**
   * 创建家庭
   */
  async createFamily() {
    const { familyName, creatorNickname } = this.data.familyFormData

    if (!familyName || !familyName.trim()) {
      wx.showToast({
        title: '请输入家庭名称',
        icon: 'none'
      })
      return
    }

    if (!creatorNickname || !creatorNickname.trim()) {
      wx.showToast({
        title: '请输入您的身份',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '创建中...'
      })

      // 未登录：保存到本地
      if (!app.globalData.useCloudStorage) {
        const localFamilies = wx.getStorageSync('localFamilies') || []
        const newFamily = {
          familyId: `local_${Date.now()}`,
          name: familyName.trim(),
          creatorNickname: creatorNickname.trim(),
          role: 'admin',
          memberCount: 1,
          inviteCode: null,  // 本地家庭没有邀请码
          isCreator: true,   // 本地创建的默认为创建者
          createdAt: new Date().toISOString()
        }

        localFamilies.push(newFamily)
        wx.setStorageSync('localFamilies', localFamilies)

        // 保存当前家庭ID
        app.saveCurrentFamilyId(newFamily.familyId)

        wx.hideLoading()
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        this.closeFamilyModals()

        // 重新加载数据
        await this.loadAllFamilies()
        await this.onShow()

        // 检查是否有儿童，如果没有则显示创建第一个儿童的弹窗
        const allChildren = wx.getStorageSync('allChildren') || []
        if (allChildren.length === 0) {
          // 没有儿童，显示创建第一个儿童弹窗
          setTimeout(() => {
            this.setData({
              showCreateChildModal: true,
              childFormData: {
                name: '',
                gender: 'male',
                age: 6,
                initialCoins: 0
              }
            })
          }, 500)
        }
        return
      }

      // 已登录：调用云函数
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'createFamily',
          name: familyName.trim(),
          creatorNickname: creatorNickname.trim()
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        const familyId = res.result.family.familyId

        this.closeFamilyModals()

        // 保存当前家庭ID
        app.saveCurrentFamilyId(familyId)

        // 等待云数据库完全写入
        await new Promise(resolve => setTimeout(resolve, 500))

        // 重新加载数据
        await this.loadAllFamilies()
        await app.loadChildren()

        // 再等待一小段时间确保数据完全同步
        await new Promise(resolve => setTimeout(resolve, 200))

        // 刷新页面显示
        await this.onShow()

        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })
      } else {
        wx.showToast({
          title: res.result?.error || '创建失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 创建家庭失败:', err)
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      })
    }
  },

  /**
   * 创建第一个儿童（创建家庭后）
   */
  async createFirstChild() {
    const { name, gender, age, initialCoins } = this.data.childFormData

    if (!name || !name.trim()) {
      wx.showToast({
        title: '请输入孩子姓名',
        icon: 'none'
      })
      return
    }

    const initialCoinsNum = parseInt(initialCoins) || 0
    if (initialCoinsNum < 0) {
      wx.showToast({
        title: '初始金币不能为负数',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '创建中...'
      })

      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        wx.hideLoading()
        wx.showToast({
          title: '请先创建家庭',
          icon: 'none'
        })
        return
      }

      // 未登录：保存到本地
      if (!app.globalData.useCloudStorage) {
        // 创建儿童数据
        const newChild = {
          childId: `child_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          name: name.trim(),
          avatar: '',
          gender: gender || 'male',
          age: parseInt(age) || 0,
          familyId: currentFamilyId,
          totalCoins: initialCoinsNum,  // 使用用户设置的初始金币
          completedTasks: 0,
          redeemedPrizes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        // 添加到主儿童列表
        let allChildren = wx.getStorageSync('allChildren') || []
        allChildren.push(newChild)
        wx.setStorageSync('allChildren', allChildren)

        // 添加到当前家庭的儿童列表
        const storageKey = `localChildren_${currentFamilyId}`
        let familyChildren = wx.getStorageSync(storageKey) || []
        familyChildren.push(newChild)
        wx.setStorageSync(storageKey, familyChildren)

        // 设置为当前儿童
        app.setCurrentChild(newChild)

        wx.hideLoading()
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        this.setData({ showCreateChildModal: false })

        // 重新加载数据
        await this.onShow()
        return
      }

      // 已登录：调用云函数
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'createChild',
          name: name.trim(),
          gender: gender || 'male',
          age: parseInt(age) || 0,
          familyId: currentFamilyId,
          initialCoins: initialCoinsNum  // 传递初始金币
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        this.setData({ showCreateChildModal: false })

        // 重新加载数据
        await app.loadChildren()
        await this.onShow()
      } else {
        wx.showToast({
          title: res.result?.error || '创建失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 创建儿童失败:', err)
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      })
    }
  },

  /**
   * 关闭创建儿童弹窗
   */
  closeCreateChildModal() {
    this.setData({ showCreateChildModal: false })
  },

  /**
   * 儿童表单输入
   */
  onChildInputChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`childFormData.${field}`]: value
    })
  },

  /**
   * 选择性别
   */
  selectGender(e) {
    const { gender } = e.currentTarget.dataset
    this.setData({
      'childFormData.gender': gender
    })
  },

  /**
   * 加入家庭
   */
  async joinFamily() {
    const { inviteCode, nickname } = this.data.familyFormData

    if (!inviteCode || !inviteCode.trim()) {
      wx.showToast({
        title: '请输入邀请码',
        icon: 'none'
      })
      return
    }

    if (!nickname || !nickname.trim()) {
      wx.showToast({
        title: '请输入您的昵称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({
        title: '加入中...'
      })

      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'joinFamily',
          inviteCode: inviteCode.trim().toUpperCase(),
          nickname: nickname.trim(),
          role: 'member'
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        wx.showToast({
          title: '申请已提交，等待审核',
          icon: 'success'
        })

        this.closeFamilyModals()
      } else {
        wx.showToast({
          title: res.result?.error || '加入失败',
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 加入家庭失败:', err)
      wx.showToast({
        title: '加入失败',
        icon: 'none'
      })
    }
  },

  /**
   * 加载国际化文本
   */
  loadI18n() {
    this.setData({
      i18n: {
        common: {
          confirm: t('common.confirm'),
          cancel: t('common.cancel')
        },
        family: {
          create: t('family.create'),
          join: t('family.join')
        },
        toast: {
          loading: t('toast.loading'),
          loginSuccess: t('toast.loginSuccess'),
          loadSuccess: t('common.success'),
          saveSuccess: t('toast.saveSuccess'),
          operationFailed: t('toast.operationFailed')
        },
        firstTimeFlow: {
          welcome: t('firstTimeFlow.welcome'),
          askLogin: t('firstTimeFlow.askLogin'),
          login: t('firstTimeFlow.login'),
          notLoginNow: t('firstTimeFlow.notLoginNow'),
          needLogin: t('firstTimeFlow.needLogin'),
          needLoginForInviteCode: t('firstTimeFlow.needLoginForInviteCode'),
          goLogin: t('firstTimeFlow.goLogin'),
          hasInviteCode: t('firstTimeFlow.hasInviteCode'),
          hasInviteCodeConfirm: t('firstTimeFlow.hasInviteCodeConfirm'),
          hasInviteCodeCancel: t('firstTimeFlow.hasInviteCodeCancel'),
          cloudDataExists: t('firstTimeFlow.cloudDataExists'),
          cloudAndLocalDataExists: t('firstTimeFlow.cloudAndLocalDataExists'),
          useCloudData: t('firstTimeFlow.useCloudData'),
          useLocalData: t('firstTimeFlow.useLocalData'),
          mergeData: t('firstTimeFlow.mergeData'),
          autoCreateFamily: t('firstTimeFlow.autoCreateFamily'),
          autoCreateConfirm: t('firstTimeFlow.autoCreateConfirm'),
          autoCreateCancel: t('firstTimeFlow.autoCreateCancel'),
          dataSyncPrompt: t('firstTimeFlow.dataSyncPrompt'),
          loginToSync: t('firstTimeFlow.loginToSync'),
          logoutConfirm: t('firstTimeFlow.logoutConfirm'),
          askDataRetention: t('firstTimeFlow.askDataRetention'),
          keepLocalData: t('firstTimeFlow.keepLocalData'),
          clearLocalData: t('firstTimeFlow.clearLocalData'),
          logoutSuccessKeep: t('firstTimeFlow.logoutSuccessKeep'),
          logoutSuccessClear: t('firstTimeFlow.logoutSuccessClear'),
          updatingData: t('firstTimeFlow.updatingData'),
          createFamily: t('firstTimeFlow.createFamily'),
          inputFamilyName: t('firstTimeFlow.inputFamilyName'),
          familyNamePlaceholder: t('firstTimeFlow.familyNamePlaceholder'),
          creating: t('firstTimeFlow.creating'),
          createSuccess: t('firstTimeFlow.createSuccess'),
          createFailed: t('firstTimeFlow.createFailed'),
          createChild: t('firstTimeFlow.createChild'),
          inputChildName: t('firstTimeFlow.inputChildName'),
          childNamePlaceholder: t('firstTimeFlow.childNamePlaceholder'),
          avatarOptional: t('firstTimeFlow.avatarOptional'),
          tapToChooseAvatar: t('firstTimeFlow.tapToChooseAvatar'),
          joinFamily: t('firstTimeFlow.joinFamily'),
          inputInviteCode: t('firstTimeFlow.inputInviteCode'),
          inviteCodePlaceholder: t('firstTimeFlow.inviteCodePlaceholder'),
          inviteCodeLength: t('firstTimeFlow.inviteCodeLength'),
          joining: t('firstTimeFlow.joining'),
          joinSuccess: t('firstTimeFlow.joinSuccess'),
          joinFailed: t('firstTimeFlow.joinFailed'),
          loginFailed: t('firstTimeFlow.loginFailed'),
          pleaseInputFamilyName: t('firstTimeFlow.pleaseInputFamilyName'),
          pleaseInputChildName: t('firstTimeFlow.pleaseInputChildName'),
          pleaseInputInviteCode: t('firstTimeFlow.pleaseInputInviteCode'),
          inputCreatorNickname: t('firstTimeFlow.inputCreatorNickname'),
          creatorNicknamePlaceholder: t('firstTimeFlow.creatorNicknamePlaceholder')
        }
      }
    })
  },

  // ========== 首次使用流程 ==========

  /**
   * 检查是否是首次使用
   */
  isFirstTimeUser() {
    console.log('[isFirstTimeUser] 开始检查是否首次使用')

    // 检查是否已经完成向导
    const hasCompletedWizard = wx.getStorageSync('hasCompletedWizard') || false
    console.log('[isFirstTimeUser] hasCompletedWizard:', hasCompletedWizard)
    if (hasCompletedWizard) {
      console.log('[isFirstTimeUser] 已完成向导，不是首次使用')
      return false
    }

    // 未登录
    const isLoggedIn = app.globalData.useCloudStorage
    console.log('[isFirstTimeUser] isLoggedIn:', isLoggedIn)
    if (isLoggedIn) {
      console.log('[isFirstTimeUser] 已登录，不是首次使用')
      return false
    }

    // 检查本地是否有家庭数据
    const localFamilies = wx.getStorageSync('localFamilies') || []
    const hasLocalFamilies = localFamilies.length > 0
    console.log('[isFirstTimeUser] localFamilies:', localFamilies)
    console.log('[isFirstTimeUser] hasLocalFamilies:', hasLocalFamilies)

    // 检查是否有当前家庭ID
    const currentFamilyId = app.getCurrentFamilyId()
    const hasCurrentFamily = !!currentFamilyId
    console.log('[isFirstTimeUser] currentFamilyId:', currentFamilyId)
    console.log('[isFirstTimeUser] hasCurrentFamily:', hasCurrentFamily)

    // 检查全局数据中是否有儿童
    const globalChildren = app.globalData.children || []
    const hasGlobalChildren = globalChildren.length > 0
    console.log('[isFirstTimeUser] globalChildren:', globalChildren)
    console.log('[isFirstTimeUser] hasGlobalChildren:', hasGlobalChildren)

    // 检查本地是否有儿童数据
    const currentFamilyId2 = app.getCurrentFamilyId()
    if (currentFamilyId2) {
      const localChildren = wx.getStorageSync(`localChildren_${currentFamilyId2}`) || []
      console.log('[isFirstTimeUser] localChildren:', localChildren)
      if (localChildren.length > 0) {
        console.log('[isFirstTimeUser] 有本地儿童数据，不是首次使用')
        return false
      }
    }

    const isFirstTime = !hasLocalFamilies && !hasCurrentFamily && !hasGlobalChildren

    // 特殊情况：如果有currentFamilyId但没有localFamilies，说明数据不一致，重置
    if (hasCurrentFamily && !hasLocalFamilies) {
      console.log('[isFirstTimeUser] 检测到数据不一致：有currentFamilyId但无localFamilies')
      console.log('[isFirstTimeUser] 重置currentFamilyId')
      app.globalData.currentFamilyId = null
      wx.removeStorageSync('currentFamilyId')
      return true  // 认为是首次使用
    }

    console.log('[isFirstTimeUser] 判断结果:', {
      hasLocalFamilies,
      hasCurrentFamily,
      hasGlobalChildren,
      isFirstTime
    })

    return isFirstTime
  },

  /**
   * 显示首次使用流程
   */
  showFirstTimeFlow() {
    console.log('[首次使用流程] 开始')

    // 步骤1：询问是否登录
    wx.showModal({
      title: '欢迎使用',
      content: '登录后可以同步数据到云端，多设备使用',
      confirmText: '登录',
      cancelText: '暂不登录',
      success: (res) => {
        console.log('[首次使用流程] 用户选择登录:', res.confirm)
        if (res.confirm) {
          // 选择登录
          this.performLogin()
        } else {
          // 选择不登录，继续步骤2
          console.log('[首次使用流程] 用户选择暂不登录，准备进入步骤2')
          setTimeout(() => {
            this.askAboutInviteCode()
          }, 300)
        }
      }
    })
  },

  /**
   * 执行登录流程
   */
  async performLogin() {
    console.log('[首次使用流程] 执行登录')

    try {
      // 先获取用户头像昵称
      const userProfile = await wx.getUserProfile({
        desc: '用于保存您的设置和历史记录'
      })

      wx.showLoading({
        title: '登录中...',
        mask: true
      })

      // 调用微信登录云函数
      const loginRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          userInfo: userProfile.userInfo
        }
      })

      wx.hideLoading()

      if (loginRes.result && loginRes.result.success) {
        const userInfo = loginRes.result.data

        // 保存用户信息
        app.globalData.useCloudStorage = true
        app.globalData.currentUserOpenid = userInfo.openid
        wx.setStorageSync('userInfo', userInfo)
        app.mergeUserSettingsAfterLogin(userInfo)
        if (typeof app.invalidateFamiliesListCache === 'function') {
          app.invalidateFamiliesListCache()
        }

        // 更新用户信息显示
        this.setData({
          userInfo: userInfo,
          isLoading: true  // 登录后立即显示加载状态
        })

        // 加载家庭和孩子数据
        try {
          const syncResult = await app.syncLocalDataToCloud()

          // 如果有冲突，让用户选择
          if (syncResult.status === 'conflict') {
            wx.hideLoading()
            const choice = await this.showConflictDialog(syncResult.localCount, syncResult.cloudCount)
            if (choice === 'cancel') {
              // 用户取消登录
              app.globalData.useCloudStorage = false
              app.globalData.currentUserOpenid = null
              wx.removeStorageSync('userInfo')
              wx.showToast({ title: '已取消登录', icon: 'none' })
              this.setData({ isLoading: false })
              return
            } else if (choice === 'cloud') {
              // 用云端覆盖本地
              wx.showLoading({ title: '同步中...', mask: true })
              await app.downloadCloudDataToLocal()
              await app.loadChildren(true)
            } else {
              // 用本地上传到云端
              wx.showLoading({ title: '同步中...', mask: true })
              await app.uploadLocalDataToCloud(
                wx.getStorageSync('localFamilies') || [],
                this.getLocalChildrenData()
              )
            }
            await new Promise(resolve => setTimeout(resolve, 500))
          }

          await this.loadAllFamilies()
          await app.loadChildren(true)  // 登录后强制刷新

          // 优先恢复上次选择的家庭
          const lastFamilyId = app.getCurrentFamilyId()
          const lastChildId = app.getCurrentChildId()

          if (lastFamilyId && this.data.allFamilies && this.data.allFamilies.length > 0) {
            // 检查上次选择的家庭是否还存在
            const familyExists = this.data.allFamilies.some(f => f.familyId === lastFamilyId)
            if (familyExists) {
              // 恢复上次选择的家庭
              app.saveCurrentFamilyId(lastFamilyId)
              console.log('[首次使用] 恢复上次选择的家庭:', lastFamilyId)

              // 恢复上次选择的儿童
              if (lastChildId) {
                const familyChildren = app.globalData.children || []
                const childExists = familyChildren.some(c => c.childId === lastChildId)
                if (childExists) {
                  app.setCurrentChildById(lastChildId)
                  console.log('[首次使用] 恢复上次选择的儿童:', lastChildId)
                }
              }
            } else {
              // 上次选择的家庭不存在，选择第一个家庭
              const firstFamily = this.data.allFamilies[0]
              app.saveCurrentFamilyId(firstFamily.familyId)
              console.log('[首次使用] 上次家庭不存在，选择第一个家庭:', firstFamily.name)
            }
          } else if (this.data.allFamilies && this.data.allFamilies.length > 0) {
            // 没有上次选择记录，选择第一个家庭
            const firstFamily = this.data.allFamilies[0]
            app.saveCurrentFamilyId(firstFamily.familyId)
            console.log('[首次使用] 无上次记录，选择第一个家庭:', firstFamily.name)
          }

          // 重新加载页面数据
          setTimeout(() => {
            this._justForceRefreshed = true  // 标记刚刚强制刷新过
            this.onShow()
          }, 300)
        } catch (err) {
          console.error('[首次使用] 加载数据失败:', err)
          // 加载失败，清除加载状态
          this.setData({ isLoading: false })
        }
      } else {
        wx.showToast({
          title: t('firstTimeFlow.loginFailed'),
          icon: 'none'
        })
        // 登录失败，继续步骤2
        this.askAboutInviteCode()
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首次使用] 登录失败:', err)

      // 用户取消授权
      if (err.errMsg && err.errMsg.includes('getUserProfile:fail')) {
        wx.showToast({
          title: '需要授权才能登录',
          icon: 'none'
        })
        // 继续步骤2
        setTimeout(() => {
          this.askAboutInviteCode()
        }, 1500)
      } else {
        wx.showToast({
          title: t('firstTimeFlow.loginFailed'),
          icon: 'none'
        })
        // 登录失败，继续步骤2
        this.askAboutInviteCode()
      }
    }
  },

  /**
   * 检查云端数据并同步
   */
  async checkCloudDataAndSync() {
    try {
      // 检查云端是否有家庭数据
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getFamilies'
        }
      })

      if (res.result && res.result.success && res.result.families && res.result.families.length > 0) {
        // 云端有家庭数据，直接加载并显示首页
        console.log('[首次使用] 云端有家庭数据，直接加载')
        // 直接加载页面数据，不触发向导
        this._justForceRefreshed = true
        await this.onShow()
      } else {
        // 云端无数据，触发向导流程
        console.log('[首次使用] 云端无家庭数据，触发向导')
        this.askAboutInviteCode()
      }
    } catch (err) {
      console.error('[首次使用] 检查云端数据失败:', err)
      // 出错，触发向导流程
      this.askAboutInviteCode()
    }
  },

  /**
   * 询问是否有邀请码
   */
  askAboutInviteCode() {
    console.log('[首次使用流程] 步骤2：询问邀请码')
    try {
      wx.showModal({
      title: '邀请码',
      content: '您是否有邀请码加入现有家庭？',
      confirmText: '有邀请码',
      cancelText: '无邀请码',
      success: (res) => {
        console.log('[首次使用流程] 用户选择有邀请码:', res.confirm)
        if (res.confirm) {
          // 有邀请码，检查登录状态
          if (app.globalData.useCloudStorage) {
            // 已登录，直接弹出加入家庭对话框
            console.log('[首次使用流程] 已登录，显示加入家庭对话框')
            this.showJoinFamilyModal()
          } else {
            // 未登录，要求先登录
            console.log('[首次使用流程] 未登录，要求登录')
            wx.showModal({
              title: '需要登录',
              content: '使用邀请码需要先登录账号',
              confirmText: '去登录',
              cancelText: '返回',
              success: (res2) => {
                console.log('[首次使用流程] 用户选择去登录:', res2.confirm)
                if (res2.confirm) {
                  // 同意登录，执行登录流程
                  this.performLoginForInviteCode()
                } else {
                  // 返回步骤2
                  console.log('[首次使用流程] 用户选择返回，重新显示步骤2')
                  setTimeout(() => {
                    this.askAboutInviteCode()
                  }, 300)
                }
              }
            })
          }
        } else {
          // 没有邀请码，询问是否跳过向导
          console.log('[首次使用流程] 用户选择无邀请码，询问是否跳过向导')
          wx.showModal({
            title: '提示',
            content: '是否要继续设置向导？',
            confirmText: '继续向导',
            cancelText: '跳过向导',
            success: (res2) => {
              if (res2.confirm) {
                // 继续向导，进入步骤3
                console.log('[首次使用流程] 用户选择继续向导')
                setTimeout(() => {
                  this.askAboutAutoCreate()
                }, 300)
              } else {
                // 跳过向导
                console.log('[首次使用流程] 用户选择跳过向导')
                this.exitWizardFlow()
              }
            }
          })
        }
      },
      fail: (err) => {
        console.error('[首次使用流程] 步骤2的 wx.showModal 失败:', err)
      }
    })
    } catch (error) {
      console.error('[首次使用流程] askAboutInviteCode 异常:', error)
    }
  },

  /**
   * 为邀请码执行登录
   */
  async performLoginForInviteCode() {
    console.log('[首次使用流程] 执行邀请码登录')
    wx.showLoading({
      title: '登录中...',
      mask: true
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {}
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        // 保存登录信息
        app.globalData.currentUserOpenid = res.result.openid
        app.globalData.useCloudStorage = true
        wx.setStorageSync('userInfo', res.result.userInfo)

        // 登录成功，弹出加入家庭对话框
        console.log('[首次使用流程] 登录成功，显示加入家庭对话框')
        this.showJoinFamilyModal()
      } else {
        wx.showToast({
          title: '登录失败',
          icon: 'none'
        })
        // 登录失败，继续步骤3
        this.askAboutAutoCreate()
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首次使用] 登录失败:', err)
      wx.showToast({
        title: '登录失败',
        icon: 'none'
      })
      // 登录失败，继续步骤3
      this.askAboutAutoCreate()
    }
  },

  /**
   * 询问是否自动创建
   */
  askAboutAutoCreate() {
    console.log('[首次使用流程] 步骤3：询问是否自动创建')
    try {
      wx.showModal({
        title: '创建家庭',
        content: '是否自动创建家庭和儿童？',
        confirmText: '自动创建',
        cancelText: '手动创建',
        success: (res) => {
          console.log('[首次使用流程] 用户选择自动创建:', res.confirm)
          if (res.confirm) {
            // 自动创建
            console.log('[首次使用流程] 调用 autoCreateFamilyAndChild')
            this.autoCreateFamilyAndChild()
          } else {
            // 手动创建
            console.log('[首次使用流程] 调用 startManualCreationFlow')
            this.startManualCreationFlow()
          }
        },
        fail: (err) => {
          console.error('[首次使用流程] wx.showModal 失败:', err)
        }
      })
    } catch (error) {
      console.error('[首次使用流程] askAboutAutoCreate 异常:', error)
    }
  },

  /**
   * 自动创建家庭和儿童
   */
  async autoCreateFamilyAndChild() {
    console.log('[首次使用流程] 开始自动创建家庭和儿童')
    wx.showLoading({
      title: '创建中...',
      mask: true
    })

    try {
      // 获取用户昵称
      let creatorNickname = '家长'
      if (app.globalData.useCloudStorage) {
        const userInfo = wx.getStorageSync('userInfo')
        if (userInfo && userInfo.nickName) {
          creatorNickname = userInfo.nickName
        }
      }

      // 未登录：创建本地家庭和儿童
      if (!app.globalData.useCloudStorage) {
        const familyId = `local_family_${Date.now()}`

        // 创建本地家庭
        const localFamily = {
          familyId: familyId,
          name: '我的家庭',
          inviteCode: null,
          role: 'creator',
          isCreator: true,
          createdAt: new Date().toISOString(),
          creatorNickname: creatorNickname
        }

        // 保存到本地家庭列表
        let localFamilies = wx.getStorageSync('localFamilies') || []
        localFamilies.push(localFamily)
        wx.setStorageSync('localFamilies', localFamilies)

        // 创建本地儿童
        const childId = `local_child_${Date.now()}`
        const newChild = {
          childId: childId,
          name: '宝宝',
          gender: 'male',
          age: 6,
          avatar: '',
          familyIds: [familyId],
          familyId: familyId,
          totalCoins: 0,
          completedTasks: 0,
          redeemedPrizes: 0,
          createdAt: new Date().toISOString()
        }

        // 保存到本地儿童列表
        const storageKey = `localChildren_${familyId}`
        wx.setStorageSync(storageKey, [newChild])
        wx.setStorageSync('localTasks_' + familyId, [])
        wx.setStorageSync('localPrizes_' + familyId, [])

        // 设置当前家庭和儿童
        app.saveCurrentFamilyId(familyId)
        app.globalData.children = [newChild]
        app.setCurrentChild(newChild)

        // 重新加载数据
        wx.hideLoading()
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        setTimeout(() => {
          console.log('[首次使用流程] 重新加载页面数据')
          this.onShow()
        }, 1500)
        return
      }

      // 已登录：调用云函数创建家庭
      console.log('[首次使用流程] 调用云函数创建家庭')

      const familyRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'createFamily',
          name: '我的家庭',
          creatorNickname: creatorNickname
        }
      })

      if (!familyRes.result || !familyRes.result.success) {
        console.error('[首次使用流程] 创建家庭失败:', familyRes.result)
        throw new Error('创建家庭失败')
      }

      const familyId = familyRes.result.family.familyId
      console.log('[首次使用流程] 家庭创建成功，familyId:', familyId)

      // 创建儿童
      console.log('[首次使用流程] 调用云函数创建儿童')
      const childRes = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'createChild',
          name: '宝宝',
          familyId: familyId
        }
      })

      wx.hideLoading()

      if (childRes.result && childRes.result.success) {
        console.log('[首次使用流程] 儿童创建成功')
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        // 设置当前儿童
        const newChild = childRes.result.child
        app.globalData.currentChildId = newChild.childId
        app.saveCurrentChildId(newChild.childId)

        // 重新加载儿童数据
        await app.loadChildren(true)

        // 重新加载数据
        setTimeout(() => {
          console.log('[首次使用流程] 重新加载页面数据')
          this.onShow()
        }, 500)
      } else {
        console.error('[首次使用流程] 创建儿童失败:', childRes.result)
        throw new Error('创建儿童失败')
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首次使用流程] 自动创建失败:', err)
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      })
    }
  },

  /**
   * 退出向导流程
   */
  exitWizardFlow() {
    console.log('[首次使用流程] 退出向导流程')

    // 标记已完成首次使用流程，避免再次触发
    app.globalData.hasCompletedWizard = true
    wx.setStorageSync('hasCompletedWizard', true)

    // 显示提示
    wx.showToast({
      title: '已跳过向导，可随时在设置中创建家庭和儿童',
      icon: 'none',
      duration: 2000
    })

    // 重新加载页面，显示正常首页
    setTimeout(() => {
      this.onShow()
    }, 2000)
  },

  /**
   * 开始手动创建流程
   */
  startManualCreationFlow() {
    // 标记：手动创建流程
    app.globalData.isManualCreationFlow = true

    // 保持在首页，弹出创建家庭对话框
    this.showCreateFamilyModal()
  },

  /**
   * 检查是否有本地数据
   */
  hasLocalData() {
    const localFamilies = wx.getStorageSync('localFamilies') || []
    return localFamilies.length > 0
  },

  /**
   * 获取本地儿童数据（用于上传到云端）
   */
  getLocalChildrenData() {
    const localFamilies = wx.getStorageSync('localFamilies') || []
    const localChildrenData = {}
    localFamilies.forEach(family => {
      const familyChildren = wx.getStorageSync(`localChildren_${family.familyId}`) || []
      if (familyChildren.length > 0) {
        localChildrenData[family.familyId] = familyChildren
      }
    })
    return localChildrenData
  },

  /**
   * 显示数据冲突对话框
   * @returns {Promise<'cloud'|'local'|'cancel'>}
   */
  showConflictDialog(localCount, cloudCount) {
    return new Promise((resolve) => {
      wx.showModal({
        title: '数据冲突',
        content: `检测到数据冲突：\n• 本地有 ${localCount} 个家庭\n• 云端有 ${cloudCount} 个家庭\n\n请选择保留哪边的数据？`,
        confirmText: '使用云端',
        cancelText: '使用本地',
        success: (res) => {
          if (res.confirm) {
            resolve('cloud')
          } else if (res.cancel) {
            // 用户选择了"使用本地"还是"取消"？
            // showModal 的 cancelText 默认是"取消"
            // 需要再次询问是"使用本地"还是"取消"
            wx.showModal({
              title: '确认',
              content: '确定要使用本地上传到云端吗？这将覆盖云端数据。',
              confirmText: '确定上传',
              cancelText: '取消',
              success: (res2) => {
                if (res2.confirm) {
                  resolve('local')
                } else {
                  resolve('cancel')
                }
              }
            })
          }
        },
        fail: () => {
          resolve('cancel')
        }
      })
    })
  },

  /**
   * 同步云端数据到本地
   */
  async syncCloudToLocal() {
    wx.showLoading({
      title: t('firstTimeFlow.updatingData'),
      mask: true
    })

    try {
      // 重新加载数据
      await app.loadFamilies()
      await app.loadChildren()

      wx.hideLoading()
      wx.showToast({
        title: t('toast.loadSuccess'),
        icon: 'success'
      })

      // 刷新页面
      setTimeout(() => {
        this.onShow()
      }, 1500)
    } catch (err) {
      wx.hideLoading()
      console.error('[首次使用] 同步失败:', err)
      wx.showToast({
        title: t('toast.operationFailed'),
        icon: 'none'
      })
    }
  },

  /**
   * 同步本地数据到云端
   */
  async syncLocalToCloud() {
    wx.showLoading({
      title: t('firstTimeFlow.updatingData'),
      mask: true
    })

    try {
      // 上传本地家庭数据到云端
      const localFamilies = wx.getStorageSync('localFamilies') || []

      for (const family of localFamilies) {
        await wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'createFamily',
            familyName: family.familyName
          }
        })
      }

      wx.hideLoading()
      wx.showToast({
        title: t('toast.saveSuccess'),
        icon: 'success'
      })

      // 刷新页面
      setTimeout(() => {
        this.onShow()
      }, 1500)
    } catch (err) {
      wx.hideLoading()
      console.error('[首次使用] 同步失败:', err)
      wx.showToast({
        title: t('toast.operationFailed'),
        icon: 'none'
      })
    }
  },

  // ========== 对话框相关方法 ==========

  /**
   * 显示创建家庭对话框
   */
  showCreateFamilyModal() {
    this.setData({
      showCreateFamilyInput: true,
      familyNameInput: '',
      creatorNicknameInput: ''
    })
  },

  /**
   * 家庭名称输入
   */
  onFamilyNameInput(e) {
    this.setData({
      familyNameInput: e.detail.value
    })
  },

  /**
   * 创建者昵称输入
   */
  onCreatorNicknameInput(e) {
    this.setData({
      creatorNicknameInput: e.detail.value
    })
  },

  /**
   * 选择男孩性别
   */
  onSelectMaleGender() {
    this.setData({
      childGenderInput: 'male'
    })
  },

  /**
   * 选择女孩性别
   */
  onSelectFemaleGender() {
    this.setData({
      childGenderInput: 'female'
    })
  },

  /**
   * 儿童年龄输入
   */
  onChildAgeInput(e) {
    this.setData({
      childAgeInput: e.detail.value
    })
  },

  /**
   * 儿童金币输入
   */
  onChildCoinsInput(e) {
    this.setData({
      childCoinsInput: e.detail.value
    })
  },

  /**
   * 创建家庭
   */
  async onCreateFamily() {
    const familyName = this.data.familyNameInput.trim()
    const creatorNickname = this.data.creatorNicknameInput.trim()

    if (!familyName) {
      wx.showToast({
        title: '请输入家庭名称',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '创建中...',
      mask: true
    })

    try {
      // 检查登录状态
      if (app.globalData.useCloudStorage) {
        // 已登录：调用云函数创建家庭
        const res = await wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'createFamily',
            name: familyName,
            creatorNickname: creatorNickname || '家长'
          }
        })

        wx.hideLoading()

        if (res.result && res.result.success) {
          const familyId = res.result.family.familyId
          console.log('[创建家庭] 家庭创建成功，familyId:', familyId)

          // 将新创建的家庭设置为当前家庭
          app.saveCurrentFamilyId(familyId)
          console.log('[创建家庭] 已设置为当前家庭')

          // 重新加载儿童数据
          await app.loadChildren(true)

          wx.showToast({
            title: '创建成功',
            icon: 'success'
          })

          this.setData({
            showCreateFamilyInput: false
          })

          // 如果是手动创建流程，继续创建第一个孩子
          if (app.globalData.isManualCreationFlow) {
            app.globalData.isManualCreationFlow = false
            setTimeout(() => {
              this.showCreateChildModal()
            }, 500)
          } else {
            // 重新加载家庭数据
            setTimeout(() => {
              this.onShow()
            }, 500)
          }
        } else {
          wx.showToast({
            title: res.result?.error || '创建失败',
            icon: 'none'
          })
        }
      } else {
        // 未登录：创建本地家庭
        const familyId = `local_family_${Date.now()}`
        const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

        const localFamily = {
          familyId: familyId,
          name: familyName,
          inviteCode: inviteCode,
          role: 'creator',
          isCreator: true,
          createdAt: new Date().toISOString(),
          creatorNickname: creatorNickname || '家长'
        }

        // 获取现有本地家庭列表
        let localFamilies = wx.getStorageSync('localFamilies') || []
        localFamilies.push(localFamily)

        // 保存到本地存储
        wx.setStorageSync('localFamilies', localFamilies)

        // 设置为当前家庭
        app.saveCurrentFamilyId(familyId)

        // 更新全局数据
        app.globalData.families = localFamilies

        wx.hideLoading()

        console.log('[创建家庭] 本地家庭创建成功，familyId:', familyId)

        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        this.setData({
          showCreateFamilyInput: false
        })

        // 如果是手动创建流程，继续创建第一个孩子
        if (app.globalData.isManualCreationFlow) {
          app.globalData.isManualCreationFlow = false
          setTimeout(() => {
            this.showCreateChildModal()
          }, 500)
        } else {
          // 重新加载家庭数据
          setTimeout(() => {
            this.onShow()
          }, 500)
        }
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 创建家庭失败:', err)
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      })
    }
  },

  /**
   * 取消创建家庭
   */
  onCancelCreateFamily() {
    // 直接关闭对话框
    this.setData({
      showCreateFamilyInput: false
    })
  },

  /**
   * 显示创建儿童对话框
   */
  showCreateChildModal() {
    this.setData({
      showCreateChildInput: true,
      childNameInput: '',
      childGenderInput: 'male',
      childAgeInput: '',
      childCoinsInput: '0',
      childAvatarInput: ''
    })
  },

  /**
   * 儿童名称输入
   */
  onChildNameInput(e) {
    this.setData({
      childNameInput: e.detail.value
    })
  },

  /**
   * 选择预设头像
   */
  onSelectPresetAvatar(e) {
    const avatar = e.currentTarget.dataset.avatar
    this.setData({
      childAvatarInput: avatar
    })
  },

  /**
   * 选择儿童头像（从相册）
   */
  onChooseChildAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.setData({
          childAvatarInput: tempFilePath
        })
      }
    })
  },

  /**
   * 创建儿童
   */
  async onCreateChild() {
    const childName = this.data.childNameInput.trim()
    const childGender = this.data.childGenderInput || 'male'
    const childAge = parseInt(this.data.childAgeInput) || 0
    const childCoins = parseInt(this.data.childCoinsInput) || 0
    const childAvatar = this.data.childAvatarInput

    if (!childName) {
      wx.showToast({
        title: '请输入儿童姓名',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '创建中...',
      mask: true
    })

    try {
      // 如果有头像，先上传
      let avatarUrl = ''
      if (childAvatar) {
        if (app.globalData.useCloudStorage) {
          // 上传到云端
          const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).substring(2, 11)}.jpg`
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: childAvatar
          })
          avatarUrl = uploadRes.fileID
        } else {
          // 保存在本地
          avatarUrl = childAvatar
        }
      }

      // 获取当前家庭ID
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        wx.hideLoading()
        wx.showToast({
          title: '请先创建家庭',
          icon: 'none'
        })
        return
      }

      // 已登录：调用云函数创建儿童
      if (app.globalData.useCloudStorage) {
        const res = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'createChild',
            name: childName,
            gender: childGender,
            age: childAge,
            avatar: avatarUrl,
            familyId: currentFamilyId,
            initialCoins: childCoins
          }
        })

        wx.hideLoading()

        if (res.result && res.result.success) {
          wx.showToast({
            title: '创建成功',
            icon: 'success'
          })

          // 设置当前儿童
          const newChild = res.result.child
          app.globalData.currentChildId = newChild.childId
          app.saveCurrentChildId(newChild.childId)

          // 重新加载儿童数据
          await app.loadChildren(true)

          this.setData({
            showCreateChildInput: false
          })

          // 重新加载页面数据
          setTimeout(() => {
            this.onShow()
          }, 500)
        } else {
          wx.showToast({
            title: res.result?.error || '创建失败',
            icon: 'none'
          })
        }
      } else {
        // 未登录：创建本地儿童
        const childId = `local_child_${Date.now()}`

        // 创建本地儿童对象
        const newChild = {
          childId: childId,
          name: childName,
          gender: childGender,
          age: childAge,
          avatar: avatarUrl,
          familyIds: [currentFamilyId],  // 使用数组以匹配 setCurrentChild 的预期格式
          familyId: currentFamilyId,      // 保留单个 familyId 以保持兼容性
          totalCoins: childCoins,
          completedTasks: 0,
          redeemedPrizes: 0,
          createdAt: new Date().toISOString()
        }

        // 保存到本地存储
        const storageKey = `localChildren_${currentFamilyId}`
        let familyChildren = wx.getStorageSync(storageKey) || []
        familyChildren.push(newChild)
        wx.setStorageSync(storageKey, familyChildren)

        // 更新全局数据
        app.globalData.children = familyChildren

        // 设置为当前儿童
        app.setCurrentChild(newChild)

        wx.hideLoading()
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })

        this.setData({
          showCreateChildInput: false
        })

        // 重新加载儿童数据
        setTimeout(() => {
          this.onShow()
        }, 500)

        // 询问是否登录同步
        setTimeout(() => {
          wx.showModal({
            title: '是否登录同步数据到云端？\n数据不同步，仅本设备可用',
            confirmText: '登录同步',
            cancelText: '暂不登录',
            success: (res) => {
              if (res.confirm) {
                this.performLoginAndSync()
              }
            }
          })
        }, 1000)
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 创建儿童失败:', err)
      wx.showToast({
        title: '创建失败',
        icon: 'none'
      })
    }
  },

  /**
   * 取消创建儿童
   */
  onCancelCreateChild() {
    // 如果是首次使用流程中的手动创建，取消时询问是否跳过向导
    if (app.globalData.isManualCreationFlow) {
      wx.showModal({
        title: '提示',
        content: '是否要跳过向导？',
        confirmText: '跳过向导',
        cancelText: '继续创建',
        success: (res) => {
          if (res.confirm) {
            // 跳过向导
            app.globalData.isManualCreationFlow = false
            this.exitWizardFlow()
          } else {
            // 继续创建，不关闭对话框
            console.log('[首次使用流程] 用户选择继续创建')
          }
        }
      })
    } else {
      // 非首次使用流程，直接关闭对话框
      this.setData({
        showCreateChildInput: false
      })
    }
  },

  /**
   * 显示加入家庭对话框
   */
  showJoinFamilyModal() {
    this.setData({
      showJoinFamilyInput: true,
      inviteCodeInput: ''
    })
  },

  /**
   * 邀请码输入
   */
  onInviteCodeInput(e) {
    this.setData({
      inviteCodeInput: e.detail.value
    })
  },

  /**
   * 加入家庭
   */
  async onJoinFamily() {
    const inviteCode = this.data.inviteCodeInput.trim()

    if (!inviteCode) {
      wx.showToast({
        title: t('firstTimeFlow.pleaseInputInviteCode'),
        icon: 'none'
      })
      return
    }

    if (inviteCode.length !== 6) {
      wx.showToast({
        title: t('firstTimeFlow.inviteCodeLength'),
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: t('firstTimeFlow.joining'),
      mask: true
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'joinFamily',
          inviteCode: inviteCode,
          nickname: app.globalData.userInfo?.nickName || '用户'
        }
      })

      wx.hideLoading()

      if (res.result && res.result.success) {
        wx.showToast({
          title: t('firstTimeFlow.joinSuccess'),
          icon: 'success'
        })

        this.setData({
          showJoinFamilyInput: false
        })

        // 重新加载家庭数据
        setTimeout(() => {
          this.onShow()
        }, 500)
      } else {
        wx.showToast({
          title: res.result?.error || t('firstTimeFlow.joinFailed'),
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 加入家庭失败:', err)
      wx.showToast({
        title: t('firstTimeFlow.joinFailed'),
        icon: 'none'
      })
    }
  },

  /**
   * 取消加入家庭
   */
  onCancelJoinFamily() {
    this.setData({
      showJoinFamilyInput: false
    })
  },

  /**
   * 空方法，用于阻止事件冒泡
   */
  doNothing() {
    // 阻止事件冒泡到遮罩层
  },

  /**
   * 启动向导
   */
  startWizard() {
    console.log('[首页] 启动向导')

    // 清除完成向导标记
    wx.removeStorageSync('hasCompletedWizard')
    app.globalData.hasCompletedWizard = false

    // 显示提示
    wx.showToast({
      title: '向导已启动',
      icon: 'success'
    })

    // 延迟后直接进入步骤3：询问是否自动创建
    setTimeout(() => {
      this.askAboutAutoCreate()
    }, 500)
  },

  /**
   * 登录并同步数据
   */
  async performLoginAndSync() {
    wx.showLoading({
      title: '登录中...',
      mask: true
    })

    try {
      const res = await wx.cloud.callFunction({
        name: 'login',
        data: {}
      })

      if (res.result && res.result.success) {
        // 保存登录信息
        app.globalData.currentUserOpenid = res.result.openid
        app.globalData.useCloudStorage = true
        wx.setStorageSync('userInfo', res.result.userInfo)

        // 上传本地数据到云端
        await this.syncLocalToCloud()

        wx.hideLoading()
        wx.showToast({
          title: t('toast.loginSuccess'),
          icon: 'success'
        })
      } else {
        wx.hideLoading()
        wx.showToast({
          title: t('firstTimeFlow.loginFailed'),
          icon: 'none'
        })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[首页] 登录失败:', err)
      wx.showToast({
        title: t('firstTimeFlow.loginFailed'),
        icon: 'none'
      })
    }
  }
})
