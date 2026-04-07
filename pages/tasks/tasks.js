// pages/tasks/tasks.js - 任务管理页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    isParentMode: false,
    showPasswordModal: false,
    tasks: [],
    isLoading: false,
    showAddModal: false,
    editingTask: null,
    currentFamily: null,  // 当前家庭
    currentChild: null,   // 当前儿童
    allFamilies: [],      // 所有家庭列表
    showFamilyPicker: false,  // 显示家庭选择器
    currentFamilyChildren: [], // 当前家庭的儿童列表
    showChildPicker: false,   // 显示儿童选择器
    taskTypeOptions: ['每日任务', '每周任务', '每月任务', '自定义任务', '惩罚家长', '惩罚小孩'],
    taskTypeIndex: 3,  // 默认选择"自定义任务"
    formData: {
      title: '',
      description: '',
      coinReward: 10,
      taskType: 'custom',
      maxCompletions: null,  // 最大完成次数，null=无限
      startDate: '',  // 开始日期 YYYY-MM-DD
      endDate: '',    // 结束日期 YYYY-MM-DD
      weekStart: '',
      weekEnd: '',
      monthStart: '',
      monthEnd: '',
      targetChildId: null
    }
  },

  onLoad() {
    this.setData({
      themeClass: app.globalData.themeClass,
      isParentMode: app.isParentMode()
    })
  },

  onShow() {
    this.setData({
      isParentMode: app.isParentMode()
    })
    this.loadFamilyAndChild()
    this.loadTasks()
  },

  /**
   * 加载家庭和儿童信息
   */
  async loadFamilyAndChild() {
    // 先尝试加载儿童数据（如果还没有的话）
    if (app.globalData.children.length === 0) {
      await app.loadChildren()
    }

    const currentFamilyId = app.getCurrentFamilyId()
    const currentChild = app.getCurrentChild()

    if (!currentFamilyId || !currentChild) {
      this.setData({
        currentFamily: null,
        currentChild: null,
        allFamilies: []
      })
      return
    }

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      const family = localFamilies.find(f => f.familyId === currentFamilyId)

      if (family) {
        // 加载当前家庭的儿童
        const localChildren = wx.getStorageSync(`localChildren_${currentFamilyId}`) || []

        this.setData({
          currentFamily: family,
          currentChild: currentChild,
          allFamilies: localFamilies,
          currentFamilyChildren: localChildren
        })
      } else {
        this.setData({
          currentFamily: null,
          currentChild: null,
          allFamilies: []
        })
      }
      return
    }

    // 已登录：从云端加载
    try {
      // 并行获取：当前家庭信息和所有家庭列表
      const [familyRes, familiesRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyInfo',
            data: { familyId: currentFamilyId }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getAllMyFamilies'
          }
        })
      ])

      if (familyRes.result.success) {
        const family = familyRes.result.family
        const allFamilies = familiesRes.result.success ? (familiesRes.result.families || []) : []

        // 筛选当前家庭的儿童
        const currentFamilyId = app.getCurrentFamilyId()
        const allChildren = app.globalData.children || []
        const familyChildren = allChildren.filter(child => child.familyId === currentFamilyId)

        this.setData({
          currentFamily: family,
          currentChild: currentChild,
          allFamilies: allFamilies,
          currentFamilyChildren: familyChildren
        })
      }
    } catch (err) {
      console.error('[任务管理] 加载家庭信息失败:', err)
    }
  },

  /**
   * 加载任务列表
   */
  async loadTasks() {
    // 检查是否有家庭
    const currentFamilyId = app.getCurrentFamilyId()
    if (!currentFamilyId) {
      showToast('请先加入家庭')
      return
    }

    // 获取当前儿童
    const currentChild = app.getCurrentChild()
    if (!currentChild) {
      showToast('请先添加儿童')
      return
    }

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      this.loadTasksFromLocal(currentFamilyId, currentChild)
      return
    }

    // 已登录：从云端加载
    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageTasks',
        data: {
          action: 'getTasks',
          data: {
            familyId: currentFamilyId,
            childId: currentChild.childId
          }
        }
      })

      if (res.result.success) {
        const tasks = res.result.tasks.map(task => {
          const badgeMap = {
            'daily': '📅',
            'weekly': '📆',
            'monthly': '🗓️',
            'permanent': '♾️',
            'penalty_parent': '🎁',
            'penalty_child': '⚠️'
          }
          return {
            ...task,
            taskTypeBadge: badgeMap[task.taskType] || '📅'
          }
        })
        this.setData({ tasks })
      } else {
        showToast(res.result.error || '加载失败')
      }
    } catch (err) {
      console.error('[任务管理] 加载失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      hideLoading()
    }
  },

  /**
   * 从本地加载任务
   */
  loadTasksFromLocal(familyId, currentChild) {
    try {
      const localTasks = wx.getStorageSync(`localTasks_${familyId}`) || []

      // 过滤出适用于当前孩子的任务
      const childTasks = localTasks.filter(task =>
        !task.targetChildId || task.targetChildId === currentChild.childId
      )

      const badgeMap = {
        'daily': '📅',
        'weekly': '📆',
        'monthly': '🗓️',
        'permanent': '♾️',
        'penalty_parent': '🎁',
        'penalty_child': '⚠️'
      }

      const tasks = childTasks.map(task => ({
        ...task,
        taskTypeBadge: badgeMap[task.taskType] || '📅'
      }))

      this.setData({ tasks })
    } catch (err) {
      console.error('[任务管理] 加载本地任务失败:', err)
      showToast('加载失败')
    }
  },

  /**
   * 显示添加模态框
   */
  showAddModal() {
    // 检查家长模式权限
    if (!this.checkParentPermission()) return

    const today = new Date()
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)

    this.setData({
      showAddModal: true,
      editingTask: null,
      taskTypeIndex: 3,  // 默认选择"自定义任务"
      formData: {
        title: '',
        description: '',
        coinReward: 10,
        taskType: 'custom',
        maxCompletions: null,
        startDate: '',
        endDate: '',
        weekStart: this.formatDate(today),
        weekEnd: this.formatDate(weekEnd),
        monthStart: today.toISOString().substring(0, 7),
        monthEnd: today.toISOString().substring(0, 7),
        targetChildId: null
      }
    })
  },

  /**
   * 编辑任务
   */
  editTask(e) {
    // 检查家长模式权限
    if (!this.checkParentPermission()) return

    const { taskid } = e.currentTarget.dataset
    const task = this.data.tasks.find(t => t.taskId === taskid)

    if (task) {
      // 计算任务类型索引
      const taskTypes = ['daily', 'weekly', 'monthly', 'custom', 'penalty_parent', 'penalty_child']
      const taskTypeIndex = taskTypes.indexOf(task.taskType)

      this.setData({
        showAddModal: true,
        editingTask: task,
        taskTypeIndex: taskTypeIndex >= 0 ? taskTypeIndex : 3,
        formData: {
          title: task.title,
          description: task.description,
          coinReward: task.coinReward,
          taskType: task.taskType,
          maxCompletions: task.maxCompletions || null,
          startDate: task.startDate || '',
          endDate: task.endDate || '',
          weekStart: task.weekStart || '',
          weekEnd: task.weekEnd || '',
          monthStart: task.monthStart || '',
          monthEnd: task.monthEnd || '',
          targetChildId: task.targetChildId
        }
      })
    }
  },

  /**
   * 删除任务
   */
  async deleteTask(e) {
    // 检查家长模式权限
    if (!this.checkParentPermission()) return

    const { taskid } = e.currentTarget.dataset

    const confirm = await showConfirm(t('tasks.deleteTaskConfirm'))
    if (!confirm) return

    showLoading()

    // 未登录：从本地删除
    if (!app.globalData.useCloudStorage) {
      this.deleteTaskFromLocal(taskid)
      return
    }

    // 已登录：从云端删除
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageTasks',
        data: {
          action: 'deleteTask',
          data: { taskId: taskid }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(t('tasks.taskDeleted'))
        await this.loadTasks()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[任务管理] 删除失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 从本地删除任务
   */
  deleteTaskFromLocal(taskId) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      const storageKey = `localTasks_${currentFamilyId}`
      let tasks = wx.getStorageSync(storageKey) || []
      tasks = tasks.filter(t => t.taskId !== taskId)
      wx.setStorageSync(storageKey, tasks)

      hideLoading()
      showToast(t('tasks.taskDeleted'))
      this.loadTasks()
    } catch (err) {
      hideLoading()
      console.error('[任务管理] 删除失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 表单输入
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value
    })
  },

  /**
   * 任务类型切换
   */
  onTaskTypeChange(e) {
    const index = parseInt(e.detail.value)
    const taskTypes = ['daily', 'weekly', 'monthly', 'custom', 'penalty_parent', 'penalty_child']
    const taskType = taskTypes[index]
    this.setData({
      taskTypeIndex: index,
      'formData.taskType': taskType
    })
  },

  /**
   * 日期选择
   */
  onDateChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value
    })
  },

  /**
   * 保存任务
   */
  async saveTask() {
    // 检查家长模式权限
    if (!this.checkParentPermission()) return

    const { formData, editingTask } = this.data

    if (!formData.title.trim()) {
      showToast('请输入任务名称')
      return
    }

    if (formData.coinReward < 0) {
      showToast('金币奖励不能为负数')
      return
    }

    showLoading()

    // 未登录：保存到本地
    if (!app.globalData.useCloudStorage) {
      this.saveTaskToLocal(formData, editingTask)
      return
    }

    // 已登录：保存到云端
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      // 确保 coinReward 是数字类型
      const taskData = {
        ...formData,
        coinReward: parseInt(formData.coinReward) || 0
      }

      let res
      if (editingTask) {
        // 更新
        res = await wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'updateTask',
            data: {
              familyId: currentFamilyId,
              taskId: editingTask.taskId,
              ...taskData
            }
          }
        })
      } else {
        // 创建
        res = await wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'createTask',
            data: {
              familyId: currentFamilyId,
              ...taskData
            }
          }
        })
      }

      hideLoading()

      if (res.result.success) {
        showToast(editingTask ? t('tasks.taskUpdated') : t('tasks.taskCreated'))
        this.setData({ showAddModal: false })
        await this.loadTasks()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[任务管理] 保存失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 保存任务到本地
   */
  saveTaskToLocal(formData, editingTask) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      const storageKey = `localTasks_${currentFamilyId}`
      let tasks = wx.getStorageSync(storageKey) || []

      if (editingTask) {
        // 更新
        const index = tasks.findIndex(t => t.taskId === editingTask.taskId)
        if (index !== -1) {
          tasks[index] = {
            ...tasks[index],
            ...formData,
            familyId: currentFamilyId,
            updatedAt: new Date().toISOString()
          }
        }
      } else {
        // 创建
        const newTask = {
          taskId: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          familyId: currentFamilyId,
          title: formData.title,
          description: formData.description,
          coinReward: parseInt(formData.coinReward) || 0,  // 确保是数字类型
          taskType: formData.taskType,
          maxCompletions: formData.maxCompletions ? parseInt(formData.maxCompletions) : null,
          startDate: formData.startDate || null,
          endDate: formData.endDate || null,
          weekStart: formData.weekStart,
          weekEnd: formData.weekEnd,
          monthStart: formData.monthStart,
          monthEnd: formData.monthEnd,
          targetChildId: formData.targetChildId,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        tasks.push(newTask)
      }

      wx.setStorageSync(storageKey, tasks)

      hideLoading()
      showToast(editingTask ? '任务已更新' : '任务创建成功')
      this.setData({ showAddModal: false })
      this.loadTasks()
    } catch (err) {
      hideLoading()
      console.error('[任务管理] 保存失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 关闭模态框
   */
  closeModal() {
    this.setData({ showAddModal: false })
  },

  /**
   * 显示儿童选择器
   */
  showChildPicker() {
    // 获取儿童信息元素的位置
    const query = wx.createSelectorQuery().in(this)
    query.select('.info-item.with-arrow').boundingClientRect()
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
        this.setData({ currentChild: newChild })

        // 重新加载任务列表
        await this.loadTasks()

        hideLoading()
        this.hideChildPicker()
        showToast(`已切换到${newChild.name}`)
      } else {
        hideLoading()
        showToast('切换失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[任务管理] 切换儿童失败:', err)
      showToast('切换失败')
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止点击事件冒泡到 modal-mask
  },

  /**
   * 格式化日期
   */
  formatDate(date) {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 获取任务类型文本
   */
  getTaskTypeText(type) {
    const types = {
      'daily': '每日任务',
      'weekly': '每周任务',
      'monthly': '每月任务',
      'permanent': '无期限任务',
      'penalty_parent': '惩罚家长',
      'penalty_child': '惩罚小孩'
    }
    return types[type] || type
  },

  /**
   * 切换家长模式
   */
  toggleParentMode() {
    if (this.data.isParentMode) {
      // 退出家长模式
      app.exitParentMode()
      this.setData({ isParentMode: false })
      showToast('已退出家长模式')
    } else {
      // 进入家长模式前先检查家庭
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        wx.showModal({
          title: '需要选择家庭',
          content: '任务管理是以家庭为单位的，请先在家庭页面选择或创建一个家庭',
          confirmText: '去选择',
          cancelText: '取消',
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({
                url: '/pages/family-list/family-list'
              })
            }
          }
        })
        return
      }

      // 有家庭，显示密码弹窗
      this.setData({
        showPasswordModal: true,
        isFirstTime: !app.hasParentPassword()
      })
    }
  },

  /**
   * 密码验证成功
   */
  onPasswordSuccess() {
    this.setData({
      isParentMode: true,
      showPasswordModal: false
    })
    showToast('已进入家长模式')
  },

  /**
   * 取消密码验证
   */
  onPasswordCancel() {
    this.setData({
      showPasswordModal: false
    })
  },

  /**
   * 关闭密码弹窗
   */
  onPasswordClose() {
    this.setData({
      showPasswordModal: false
    })
  },

  /**
   * 检查家长权限
   * @returns {boolean} - 是否有权限
   */
  checkParentPermission() {
    if (!app.isParentMode()) {
      showToast('此功能需要家长权限')
      // 延迟显示密码弹窗，让用户先看到提示
      setTimeout(() => {
        this.setData({
          showPasswordModal: true,
          isFirstTime: !app.hasParentPassword()
        })
      }, 500)
      return false
    }
    return true
  },

  /**
   * 跳转到家庭列表
   */
  goToFamily() {
    wx.switchTab({
      url: '/pages/family-list/family-list'
    })
  },

  /**
   * 跳转到添加儿童页面
   */
  goToAddChild() {
    wx.navigateTo({
      url: '/pages/children/children'
    })
  },

  /**
   * 显示家庭选择器
   */
  async showFamilyPicker() {
    // 获取家庭信息元素的位置
    const query = wx.createSelectorQuery().in(this)
    query.select('.info-value-with-arrow').boundingClientRect()
    query.exec((res) => {
      if (res && res[0]) {
        const rect = res[0]
        // 选择器显示在箭头下方
        const pickerTop = rect.bottom + 8
        this.setData({
          pickerTop: pickerTop
        })
      }
    })

    // 未登录：从本地加载家庭列表
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      // 补充 isCreator 标记
      const processedLocalFamilies = localFamilies.map(f => ({
        ...f,
        isCreator: f.isCreator !== undefined ? f.isCreator : (f.role === 'admin')
      }))
      this.setData({
        allFamilies: processedLocalFamilies,
        showFamilyPicker: true
      })
      return
    }

    // 已登录：从云端加载所有家庭
    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getAllMyFamilies'
        }
      })

      hideLoading()

      if (res.result.success) {
        this.setData({
          allFamilies: res.result.families || [],
          showFamilyPicker: true
        })
      } else {
        showToast(res.result.error || '加载家庭列表失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[任务管理] 加载家庭列表失败:', err)
      showToast('加载失败')
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
    if (familyid === this.data.currentFamily?.familyId) {
      this.hideFamilyPicker()
      return
    }

    // 切换家庭
    hideLoading()
    try {
      // 保存选择的家庭
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
          this.hideFamilyPicker()
          wx.navigateTo({
            url: '/pages/children/children'
          })
          return
        }

        // 选择第一个儿童
        const firstChild = children[0]
        app.saveCurrentChildId(firstChild.childId)

        // 刷新页面数据
        await this.loadFamilyAndChild()
        await this.loadTasks()

        this.hideFamilyPicker()
        showToast(`已切换到${this.data.currentFamily?.name}`)
      } else {
        showToast('加载儿童失败')
      }
    } catch (err) {
      console.error('[任务管理] 切换家庭失败:', err)
      showToast('切换失败')
    }

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      const family = localFamilies.find(f => f.familyId === familyid)

      if (family) {
        const localChildren = wx.getStorageSync(`localChildren_${familyid}`) || []

        if (localChildren.length === 0) {
          this.hideFamilyPicker()
          wx.navigateTo({
            url: '/pages/children/children'
          })
          return
        }

        const firstChild = localChildren[0]
        app.saveCurrentChildId(firstChild.childId)

        await this.loadFamilyAndChild()
        await this.loadTasks()

        this.hideFamilyPicker()
        showToast(`已切换到${family.name}`)
      }
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止点击事件冒泡
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '妈妈表扬我 - 创建和管理孩子的每日任务',
      path: '/pages/tasks/tasks',
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
