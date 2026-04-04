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
    formData: {
      title: '',
      description: '',
      coinReward: 10,
      taskType: 'daily',
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
    const currentFamilyId = app.getCurrentFamilyId()
    const currentChild = app.getCurrentChild()

    if (!currentFamilyId || !currentChild) {
      this.setData({
        currentFamily: null,
        currentChild: null
      })
      return
    }

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      const family = localFamilies.find(f => f.familyId === currentFamilyId)

      if (family) {
        this.setData({
          currentFamily: family,
          currentChild: currentChild
        })
      } else {
        this.setData({
          currentFamily: null,
          currentChild: null
        })
      }
      return
    }

    // 已登录：从云端加载
    try {
      // 获取家庭信息
      const familyRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getFamilyInfo',
          data: { familyId: currentFamilyId }
        }
      })

      if (familyRes.result.success) {
        const family = familyRes.result.family
        this.setData({
          currentFamily: family,
          currentChild: currentChild
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
        this.setData({ tasks: res.result.tasks })
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

      this.setData({ tasks: childTasks })
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
      formData: {
        title: '',
        description: '',
        coinReward: 10,
        taskType: 'daily',
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
      this.setData({
        showAddModal: true,
        editingTask: task,
        formData: {
          title: task.title,
          description: task.description,
          coinReward: task.coinReward,
          taskType: task.taskType,
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
    const taskType = e.detail.value
    this.setData({
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
      let res
      if (editingTask) {
        // 更新
        res = await wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'updateTask',
            data: {
              taskId: editingTask.taskId,
              ...formData
            }
          }
        })
      } else {
        // 创建
        res = await wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'createTask',
            data: formData
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
          coinReward: formData.coinReward,
          taskType: formData.taskType,
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
      'monthly': '每月任务'
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
  }
})
