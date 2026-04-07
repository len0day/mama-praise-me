// pages/index/index.js
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    currentChild: null,
    tasks: [],
    todayCompletions: [],
    isLoading: false,
    allFamilies: [],        // 所有家庭列表
    showFamilyPicker: false, // 显示家庭选择器
    currentFamilyId: null,   // 当前家庭ID
    currentFamilyChildren: [], // 当前家庭的儿童列表
    showChildPicker: false, // 显示儿童选择器
    currentFilter: 'all',   // 当前任务分类筛选
    allTasks: [],           // 所有任务（用于筛选）
    currentFamily: null      // 当前选中的家庭详情 (包含背景图)
  },

  onLoad() {
    this.setData({ themeClass: app.globalData.themeClass })
  },

  async onShow() {
    // 刷新TabBar主题
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
      this.getTabBar().applyTheme()
    }

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

    console.log('[首页] === 开始检查孩子数据 ===')
    console.log('[首页] app.globalData.currentFamilyId:', app.globalData.currentFamilyId)
    console.log('[首页] app.globalData.currentChildId:', app.globalData.currentChildId)
    console.log('[首页] app.globalData.children:', app.globalData.children)
    console.log('[首页] app.globalData.children.length:', app.globalData.children ? app.globalData.children.length : 0)

    // 获取当前孩子（会自动选择）
    let currentChild = app.getCurrentChild()
    console.log('[首页] getCurrentChild() 返回:', currentChild)

    // 如果没有选中的孩子，尝试自动选择当前家庭的儿童
    if (!currentChild) {
      const currentFamilyId = app.getCurrentFamilyId()
      const allChildren = app.globalData.children || []

      console.log('[首页] 没有选中的孩子，尝试自动选择')
      console.log('[首页] 当前家庭ID:', currentFamilyId)
      console.log('[首页] 所有儿童:', allChildren)
      console.log('[首页] 所有儿童数量:', allChildren.length)

      if (!currentFamilyId) {
        console.error('[首页] 当前家庭ID为空！')
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
        console.log('[首页] 检查儿童:', child.name, 'familyId:', child.familyId, '匹配:', childFamilyId === currentFamilyId)
        return childFamilyId === currentFamilyId
      })

      console.log('[首页] 当前家庭的儿童:', familyChildren)
      console.log('[首页] 当前家庭的儿童数量:', familyChildren.length)

      if (familyChildren.length > 0) {
        // 自动选择第一个儿童
        const firstChild = familyChildren[0]
        console.log('[首页] 选择第一个儿童:', firstChild)
        app.saveCurrentChildId(firstChild.childId)
        currentChild = firstChild
        console.log('[首页] 自动选择完成，currentChildId:', app.globalData.currentChildId)
      } else {
        console.warn('[首页] 当前家庭没有儿童！')
      }
    }

    console.log('[首页] 最终 currentChild:', currentChild)

    // 如果还是没有孩子，显示添加孩子提示
    if (!currentChild) {
      console.warn('[首页] 仍然没有孩子，显示添加提示')
      this.setData({
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
    console.log('[首页] enrichedChild:', enrichedChild)
    console.log('[首页] enrichedChild.familyName:', enrichedChild.familyName)
    console.log('[首页] enrichedChild.familyCoins:', enrichedChild.familyCoins)
    this.setData({ currentChild: enrichedChild, needFamily: false, currentFamilyId: app.getCurrentFamilyId() })
    console.log('[首页] setData completed')

    // 加载数据
    await this.loadData()
  },

  /**
   * 补充儿童信息（家庭名称和金币余额）
   */
  async enrichChildInfo(child) {
    try {
      // 获取当前家庭ID
      const currentFamilyId = app.getCurrentFamilyId()

      console.log('[首页] 当前家庭ID:', currentFamilyId)
      console.log('[首页] 儿童家庭ID:', child.familyId)

      // 确保 child 有 familyId
      const childWithFamilyId = {
        ...child,
        familyId: child.familyId || currentFamilyId
      }

      // 如果儿童的家庭ID和当前家庭ID不一致，不显示
      if (currentFamilyId && childWithFamilyId.familyId !== currentFamilyId) {
        console.warn('[首页] 儿童不属于当前家庭')
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

        console.log('[首页] 本地家庭名称:', familyName)
        console.log('[首页] 本地金币余额:', familyCoins, typeof familyCoins)

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

      console.log('[首页] 家庭名称:', familyName)
      console.log('[首页] 金币余额:', familyCoins, typeof familyCoins)

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

    if (!currentFamilyId || !currentChild) {
      // 没有家庭或孩子，显示空状态
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

        // 如果设置了最大完成次数，计算剩余次数
        if (task.maxCompletions && task.maxCompletions > 1) {
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

      return { ...task, completed: completed, taskStatus: taskStatus, taskClass: taskClass.join(' '), canComplete: canComplete, badgeText, badgeType }
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
    this.setData({
      allTasks: tasks,
      todayCompletions: todayCompletions,
      isLoading: false
    }, () => {
      this.filterTasks()
    })
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

            // 如果设置了最大完成次数，计算剩余次数
            if (task.maxCompletions && task.maxCompletions > 1) {
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

          return {
            ...task,
            completed: completed,
            taskStatus: taskStatus,
            taskClass: taskClass.join(' '),
            canComplete: canComplete,
            badgeText,
            badgeType
          }
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
      }

      // 保存所有任务并应用筛选
      this.setData({
        allTasks: tasks,
        todayCompletions: todayCompletions
      }, () => {
        this.filterTasks()
      })

    } catch (err) {
      console.error('[首页] 加载数据失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      this.setData({ isLoading: false })
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
   * 跳转到家庭页面
   */
  goToFamily() {
    wx.switchTab({
      url: '/pages/family-list/family-list'
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
    } else {
      // 其他视图：首先排除惩罚任务
      let normalTasks = allTasks.filter(task => task.taskType !== 'penalty_parent' && task.taskType !== 'penalty_child')

      if (currentFilter === 'all') {
        filteredTasks = normalTasks
      } else if (currentFilter === 'custom') {
        // 限时挑战：包括所有自定义任务
        filteredTasks = normalTasks.filter(task => task.taskType === 'custom')
      } else {
        // 其他筛选：daily, weekly, monthly
        filteredTasks = normalTasks.filter(task => task.taskType === currentFilter)
      }
    }

    this.setData({ tasks: filteredTasks })
    console.log('[首页] 筛选后任务数量:', filteredTasks.length)
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

    // 周期性任务
    switch (taskType) {
      case 'daily':
        return { badgeText: '每日任务', badgeType: 'daily' }
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
  }
})
