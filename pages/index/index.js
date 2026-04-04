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
    isLoading: false
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

    // 获取当前孩子（会自动选择）
    const currentChild = app.getCurrentChild()

    // 补充家庭信息和金币余额
    if (currentChild && currentChild.familyId) {
      // 加载家庭名称和金币余额
      const enrichedChild = await this.enrichChildInfo(currentChild)
      this.setData({ currentChild: enrichedChild, needFamily: false })
    } else {
      this.setData({ currentChild, needFamily: false })
    }

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

      // 如果儿童的家庭ID和当前家庭ID不一致，不显示
      if (currentFamilyId && child.familyId !== currentFamilyId) {
        console.warn('[首页] 儿童不属于当前家庭')
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
        familyCoins = localCoinBalances[child.childId] || 0

        console.log('[首页] 本地家庭名称:', familyName)
        console.log('[首页] 本地金币余额:', familyCoins)

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
      familyCoins = coinsRes.result.success ? coinsRes.result.balance : 0

      console.log('[首页] 家庭名称:', familyName)
      console.log('[首页] 金币余额:', familyCoins)

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
   * 加载数据
   */
  async loadData() {
    // 获取当前孩子（会自动选择逻辑）
    const currentChild = app.getCurrentChild()

    if (!currentChild) {
      // 没有孩子，显示空状态
      this.setData({
        tasks: [],
        todayCompletions: [],
        currentChild: null,
        isLoading: false
      })
      return
    }

    this.setData({ currentChild, isLoading: true })

    // 未登录：从本地加载数据
    if (!app.globalData.useCloudStorage) {
      this.loadDataFromLocal(currentChild)
      return
    }

    // 已登录：从云端加载数据
    await this.loadDataFromCloud(currentChild)
  },

  /**
   * 从本地加载数据
   */
  loadDataFromLocal(currentChild) {
    const currentFamilyId = app.getCurrentFamilyId()
    if (!currentFamilyId) {
      this.setData({
        tasks: [],
        todayCompletions: [],
        isLoading: false
      })
      return
    }

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

    // 检查今日完成状态
    const today = new Date().toISOString().split('T')[0]
    const tasks = childTasks.map(task => {
      const completedToday = childCompletions.some(c =>
        c.taskId === task.taskId && c.completedDate === today
      )
      return { ...task, completed: completedToday }
    })

    const todayCompletions = childCompletions.filter(c => c.completedDate === today)

    this.setData({
      tasks: tasks,
      todayCompletions: todayCompletions,
      isLoading: false
    })
  },

  /**
   * 从云端加载数据
   */
  async loadDataFromCloud(currentChild) {
    try {
      // 获取任务列表和所有完成记录
      const [tasksRes, completionsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getTasks',
            data: { childId: currentChild.childId }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getAllCompletions',
            data: { childId: currentChild.childId }
          }
        })
      ])

      let tasks = []
      let todayCompletions = []

      if (tasksRes.result.success && completionsRes.result.success) {
        const today = new Date().toISOString().split('T')[0]
        const currentWeek = this.getWeekIdentifier(today)
        const currentMonth = this.getMonthIdentifier(today)
        const allCompletions = completionsRes.result.completions || []

        // 过滤今日完成记录
        todayCompletions = allCompletions.filter(c => c.completedDate === today)

        // 根据任务类型检查是否已完成
        tasks = tasksRes.result.tasks.map(task => {
          let completed = false

          if (task.taskType === 'daily') {
            // 每日任务：检查今天是否完成
            completed = allCompletions.some(c =>
              c.taskId === task.taskId && c.completedDate === today
            )
          } else if (task.taskType === 'weekly') {
            // 每周任务：检查本周是否完成
            completed = allCompletions.some(c =>
              c.taskId === task.taskId && c.completedWeek === currentWeek
            )
          } else if (task.taskType === 'monthly') {
            // 每月任务：检查本月是否完成
            completed = allCompletions.some(c =>
              c.taskId === task.taskId && c.completedMonth === currentMonth
            )
          }

          return {
            ...task,
            completed: completed
          }
        })
      }

      this.setData({ tasks, todayCompletions })

    } catch (err) {
      console.error('[首页] 加载数据失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      this.setData({ isLoading: false })
    }
  },

  /**
   * 获取ISO周标识
   */
  getWeekIdentifier(date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
    const week1 = new Date(d.getFullYear(), 0, 4)
    const weekNumber = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
    return `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`
  },

  /**
   * 获取月份标识
   */
  getMonthIdentifier(date) {
    const d = new Date(date)
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
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

    const confirm = await showConfirm('确定完成任务吗？')
    if (!confirm) return

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

      // 保存完成记录到本地
      const storageKey = `localCompletions_${currentFamilyId}`
      const completions = wx.getStorageSync(storageKey) || []
      const completion = {
        completionId: `completion_${Date.now()}`,
        taskId: taskId,
        taskTitle: task.title,
        childId: this.data.currentChild.childId,
        childName: this.data.currentChild.name,
        coinEarned: task.coinReward,
        completedAt: new Date().toISOString(),
        completedDate: new Date().toISOString().split('T')[0]
      }
      completions.push(completion)
      wx.setStorageSync(storageKey, completions)

      // 更新该儿童在该家庭的金币余额
      const coinBalanceKey = `localCoinBalances_${currentFamilyId}`
      const coinBalances = wx.getStorageSync(coinBalanceKey) || {}
      const childId = this.data.currentChild.childId
      const currentBalance = coinBalances[childId] || 0
      const newBalance = currentBalance + task.coinReward
      coinBalances[childId] = newBalance
      wx.setStorageSync(coinBalanceKey, coinBalances)

      hideLoading()
      showToast('任务完成！获得 ' + task.coinReward + ' 金币')

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
            childId: this.data.currentChild.childId
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
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'getChild',
          data: { childId: this.data.currentChild.childId }
        }
      })

      if (res.result.success) {
        // 更新全局数据
        const index = app.globalData.children.findIndex(
          c => c.childId === res.result.child.childId
        )
        if (index !== -1) {
          app.globalData.children[index] = res.result.child
        }

        this.setData({ currentChild: res.result.child })
      }
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
  }
})
