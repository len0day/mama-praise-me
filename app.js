// app.js - 妈妈表扬我应用入口
const { initI18n } = require('./utils/i18n.js')

App({
  globalData: {
    // 孩子相关数据
    children: [],                    // 孩子列表
    currentChildId: null,            // 当前选中的孩子ID

    // 家庭相关数据
    currentFamilyId: null,            // 当前选中的家庭ID

    // 任务相关数据
    tasks: [],                       // 任务列表
    todayCompletions: [],            // 今日完成记录

    // 奖品相关数据
    prizes: [],                      // 奖品列表
    redemptions: [],                 // 兑换记录

    // 金币相关数据
    coinRecords: [],                 // 金币记录

    // 应用状态
    themeClass: 'theme-light',
    isParentMode: false,              // 当前是否为家长模式
    settings: {
      theme: 'light',
      fontSize: 'medium',
      locale: 'zh-CN',
      parentPassword: null            // 家长密码（null表示未设置）
    },

    // 云端存储
    useCloudStorage: false,
    currentUserOpenid: null,

    // 缓存系统
    CACHE_DURATION: {
      TASKS: 5 * 60 * 1000,          // 任务缓存5分钟
      PRIZES: 5 * 60 * 1000,         // 奖品缓存5分钟
      CHILDREN: 10 * 60 * 1000,      // 孩子信息缓存10分钟
      COIN_RECORDS: 1 * 60 * 1000    // 金币记录缓存1分钟
    }
  },

  onLaunch() {
    console.log('[妈妈表扬我] 应用启动')

    // 初始化国际化系统
    initI18n()
    this.globalData.settings.locale = require('./utils/i18n.js').getLocale()

    // 初始化云开发
    this.initCloud()

    // 加载本地数据
    this.loadSettingsFromStorage()
    this.loadCurrentChildId()
    this.loadCurrentFamilyId()  // 加载当前家庭ID

    // 应用主题
    this.applyTheme()
    this.registerThemeListener()

    // 检查登录状态
    this.checkLoginStatus()

    // 如果已登录，同步本地数据到云端
    if (this.globalData.useCloudStorage) {
      this.syncLocalDataToCloud()
    }
  },

  onShow() {
    console.log('[妈妈表扬我] 应用显示')
  },

  /**
   * 初始化云开发
   */
  initCloud() {
    if (!wx.cloud) {
      console.error('[妈妈表扬我] 请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      env: 'cloud1-4g50c2bp6d01c14d', // 新项目的云环境ID
      traceUser: true
    })

    console.log('[妈妈表扬我] 云开发初始化完成')
  },

  /**
   * 应用主题
   */
  applyTheme() {
    const theme = this.globalData.settings.theme || 'system'
    let themeClass = 'theme-light'

    if (theme === 'dark') {
      themeClass = 'theme-dark'
    } else if (theme === 'system') {
      try {
        const systemInfo = wx.getSystemInfoSync()
        if (systemInfo.theme !== undefined) {
          themeClass = systemInfo.theme === 'dark' ? 'theme-dark' : 'theme-light'
        }
      } catch (e) {
        console.error('[主题] 获取系统主题失败:', e)
      }
    }

    // 如果主题没变化，不执行更新
    if (this.globalData.themeClass === themeClass) {
      return
    }

    this.globalData.themeClass = themeClass

    // 立即更新导航栏颜色
    this.updateNavigationBarColor()

    // 只更新当前页面
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage && currentPage.setData) {
      currentPage.setData({ themeClass })
    }

    // 只更新 TabBar
    if (currentPage && typeof currentPage.getTabBar === 'function') {
      const tabbar = currentPage.getTabBar()
      if (tabbar && tabbar.setData) {
        tabbar.setData({ themeClass })
      }
    }
  },

  /**
   * 注册主题监听
   */
  registerThemeListener() {
    if (this.themeListenerRegistered || !wx.onThemeChange) return

    this.themeListenerRegistered = true
    wx.onThemeChange((res) => {
      if (this.globalData.settings.theme === 'system') {
        const newThemeClass = res.theme === 'dark' ? 'theme-dark' : 'theme-light'

        if (this.globalData.themeClass === newThemeClass) {
          return
        }

        this.globalData.themeClass = newThemeClass

        // 更新导航栏颜色
        if (newThemeClass === 'theme-dark') {
          wx.setNavigationBarColor({
            frontColor: '#ffffff',
            backgroundColor: '#1C1C1E'
          })
        } else {
          wx.setNavigationBarColor({
            frontColor: '#000000',
            backgroundColor: '#FF9800'
          })
        }

        // 更新当前页面
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]
        if (currentPage) {
          if (currentPage.setData) {
            currentPage.setData({ themeClass: newThemeClass })
          }
          if (typeof currentPage.getTabBar === 'function') {
            const tabbar = currentPage.getTabBar()
            if (tabbar && tabbar.applyTheme) {
              tabbar.applyTheme()
            }
          }
        }
      }
    })
  },

  /**
   * 更新导航栏颜色
   */
  updateNavigationBarColor() {
    const themeClass = this.globalData.themeClass || 'theme-light'

    if (themeClass === 'theme-dark') {
      wx.setNavigationBarColor({
        frontColor: '#ffffff',
        backgroundColor: '#1C1C1E'
      })
    } else {
      wx.setNavigationBarColor({
        frontColor: '#000000',
        backgroundColor: '#FF9800'
      })
    }
  },

  /**
   * 从本地存储加载设置
   */
  loadSettingsFromStorage() {
    try {
      const settings = wx.getStorageSync('appSettings')
      if (settings) {
        this.globalData.settings = {
          ...this.globalData.settings,
          ...settings
        }
        console.log('[妈妈表扬我] ✓ 加载设置成功')
      }
    } catch (e) {
      console.error('[妈妈表扬我] 加载设置失败:', e)
    }
  },

  /**
   * 保存设置到本地存储
   */
  saveSettingsToStorage() {
    try {
      wx.setStorageSync('appSettings', this.globalData.settings)
      console.log('[妈妈表扬我] ✓ 设置已保存到本地')

      // 如果已登录，同步到云端
      if (this.globalData.useCloudStorage && this.globalData.currentUserOpenid) {
        this.syncSettingsToCloud()
      }
    } catch (e) {
      console.error('[妈妈表扬我] 保存设置失败:', e)
    }
  },

  /**
   * 同步设置到云端
   */
  async syncSettingsToCloud() {
    if (!this.globalData.useCloudStorage || !this.globalData.currentUserOpenid) {
      return
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'updateUserSettings',
        data: {
          settings: this.globalData.settings
        }
      })

      if (res.result.success) {
        console.log('[妈妈表扬我] ✓ 设置已同步到云端')
      }
    } catch (err) {
      console.error('[妈妈表扬我] 同步设置到云端失败:', err)
    }
  },

  /**
   * 加载当前孩子ID
   */
  loadCurrentChildId() {
    try {
      const currentChildId = wx.getStorageSync('currentChildId')
      if (currentChildId) {
        this.globalData.currentChildId = currentChildId
        console.log('[妈妈表扬我] ✓ 加载当前孩子ID:', currentChildId)
      }
    } catch (e) {
      console.error('[妈妈表扬我] 加载当前孩子ID失败:', e)
    }
  },

  /**
   * 保存当前孩子ID
   */
  saveCurrentChildId(childId) {
    try {
      wx.setStorageSync('currentChildId', childId)
      this.globalData.currentChildId = childId
      console.log('[妈妈表扬我] ✓ 当前孩子ID已保存:', childId)
    } catch (e) {
      console.error('[妈妈表扬我] 保存当前孩子ID失败:', e)
    }
  },

  /**
   * 加载当前家庭ID
   */
  loadCurrentFamilyId() {
    try {
      const currentFamilyId = wx.getStorageSync('currentFamilyId')
      if (currentFamilyId) {
        this.globalData.currentFamilyId = currentFamilyId
        console.log('[妈妈表扬我] ✓ 加载当前家庭ID:', currentFamilyId)
      }
    } catch (e) {
      console.error('[妈妈表扬我] 加载当前家庭ID失败:', e)
    }
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    try {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo.openid) {
        this.globalData.currentUserOpenid = userInfo.openid
        this.globalData.useCloudStorage = true
        console.log('[妈妈表扬我] ✓ 用户已登录:', userInfo.openid)
      } else {
        console.log('[妈妈表扬我] 用户未登录')
      }
    } catch (e) {
      console.error('[妈妈表扬我] 检查登录状态失败:', e)
    }
  },

  /**
   * 保存当前家庭ID
   */
  saveCurrentFamilyId(familyId) {
    this.globalData.currentFamilyId = familyId
    wx.setStorageSync('currentFamilyId', familyId)
    console.log('[妈妈表扬我] ✓ 当前家庭ID已保存:', familyId)
  },

  /**
   * 获取当前家庭ID
   */
  getCurrentFamilyId() {
    return this.globalData.currentFamilyId
  },

  /**
   * 设置当前家庭（并自动选择该家庭的第一个孩子）
   */
  setCurrentFamily(familyId) {
    this.globalData.currentFamilyId = familyId
    wx.setStorageSync('currentFamilyId', familyId)

    console.log('[妈妈表扬我] ✓ 切换到家庭:', familyId)

    // 注意：不在这里自动选择儿童，避免循环调用
    // 让页面自己根据需要选择儿童
  },

  /**
   * 从云端加载孩子数据
   */
  /**
   * 加载孩子数据（根据登录状态从本地或云端加载）
   */
  async loadChildren() {
    // 未登录：从本地加载
    if (!this.globalData.useCloudStorage) {
      const localChildren = wx.getStorageSync('children') || []
      this.globalData.children = localChildren
      console.log('[妈妈表扬我] 从本地加载了', localChildren.length, '个孩子')
      return localChildren
    }

    // 已登录：从云端加载
    return await this.loadChildrenFromCloud()
  },

  /**
   * 从云端加载孩子数据（仅已登录时调用）
   */
  async loadChildrenFromCloud() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'getChildren'
        }
      })

      if (res.result.success) {
        this.globalData.children = res.result.children || []
        console.log('[妈妈表扬我] ✓ 从云端加载了', this.globalData.children.length, '个孩子')
        return this.globalData.children
      }
      return []
    } catch (err) {
      console.error('[妈妈表扬我] 加载孩子数据失败:', err)
      return []
    }
  },

  /**
   * 获取当前孩子信息
   */
  getCurrentChild() {
    // 如果本地没有孩子数据，返回null（页面应该显示空状态或引导用户添加）
    if (this.globalData.children.length === 0) {
      console.log('[妈妈表扬我] 没有孩子数据')
      return null
    }

    // 如果没有当前选中的孩子，尝试自动选择
    if (!this.globalData.currentChildId) {
      const currentFamilyId = this.globalData.currentFamilyId

      // 优先选择当前家庭的儿童
      if (currentFamilyId) {
        const familyChildren = this.globalData.children.filter(child => child.familyId === currentFamilyId)
        if (familyChildren.length > 0) {
          // 优先使用上次选择的孩子
          const savedChildId = wx.getStorageSync('currentChildId')
          const savedChild = familyChildren.find(child => child.childId === savedChildId)
          if (savedChild) {
            this.globalData.currentChildId = savedChild.childId
            wx.setStorageSync('currentChildId', savedChild.childId)
            console.log('[妈妈表扬我] ✓ 恢复上次选择的孩子:', savedChild.name)
            return savedChild
          }

          // 否则选择该家庭的第一个孩子
          const firstChild = familyChildren[0]
          this.globalData.currentChildId = firstChild.childId
          wx.setStorageSync('currentChildId', firstChild.childId)
          console.log('[妈妈表扬我] ✓ 自动选择该家庭的第一个孩子:', firstChild.name)
          return firstChild
        }
      }

      // 如果当前家庭没有儿童，选择所有孩子的第一个
      const savedChildId = wx.getStorageSync('currentChildId')
      if (savedChildId) {
        const found = this.globalData.children.find(child => child.childId === savedChildId)
        if (found) {
          this.globalData.currentChildId = savedChildId
          console.log('[妈妈表扬我] ✓ 恢复上次选择的孩子:', found.name)
          return found
        }
      }

      // 选择第一个孩子
      const firstChild = this.globalData.children[0]
      this.globalData.currentChildId = firstChild.childId
      wx.setStorageSync('currentChildId', firstChild.childId)
      console.log('[妈妈表扬我] ✓ 自动选择第一个孩子:', firstChild.name)
      return firstChild
    }

    // 查找当前选中的孩子
    const currentChild = this.globalData.children.find(child => child.childId === this.globalData.currentChildId)

    // 如果找到了孩子，检查孩子是否属于当前家庭
    if (currentChild) {
      const currentFamilyId = this.globalData.currentFamilyId

      // 如果有当前家庭，但孩子不属于该家庭（familyId为null或不匹配），则清除当前孩子选择
      if (currentFamilyId && currentChild.familyId !== currentFamilyId) {
        console.log('[妈妈表扬我] 当前孩子已离开当前家庭，清除选择')
        this.globalData.currentChildId = ''
        wx.removeStorageSync('currentChildId')

        // 重新选择当前家庭的孩子
        const familyChildren = this.globalData.children.filter(child => child.familyId === currentFamilyId)
        if (familyChildren.length > 0) {
          const firstChild = familyChildren[0]
          this.globalData.currentChildId = firstChild.childId
          wx.setStorageSync('currentChildId', firstChild.childId)
          console.log('[妈妈表扬我] ✓ 自动选择该家庭的第一个孩子:', firstChild.name)
          return firstChild
        }

        return null
      }

      return currentChild
    }

    return null
  },

  /**
   * 获取当前孩子的家庭ID
   */
  getCurrentChildFamilyId() {
    const currentChild = this.getCurrentChild()
    return currentChild ? currentChild.familyId : null
  },

  /**
   * 设置当前孩子（必须在当前家庭内）
   */
  setCurrentChild(child) {
    if (child) {
      // 验证孩子是否属于当前家庭
      const currentFamilyId = this.globalData.currentFamilyId
      if (currentFamilyId && child.familyId !== currentFamilyId) {
        console.warn('[妈妈表扬我] 警告：孩子不属于当前家庭，自动切换家庭')
        this.setCurrentFamily(child.familyId)
        return
      }

      this.globalData.currentChildId = child.childId
      wx.setStorageSync('currentChildId', child.childId)
      console.log('[妈妈表扬我] ✓ 切换到孩子:', child.name)
    }
  },

  /**
   * 进入家长模式
   * @param {string} password - 家长密码
   * @returns {boolean} - 是否成功
   */
  enterParentMode(password) {
    const storedPassword = this.globalData.settings.parentPassword

    // 如果还没有设置密码，第一次输入的密码将成为家长密码
    if (!storedPassword) {
      this.globalData.settings.parentPassword = password
      this.saveSettingsToStorage()
      console.log('[妈妈表扬我] ✓ 首次设置家长密码')
    } else if (storedPassword !== password) {
      console.error('[妈妈表扬我] ✗ 密码错误')
      return false
    }

    this.globalData.isParentMode = true
    console.log('[妈妈表扬我] ✓ 进入家长模式')
    return true
  },

  /**
   * 修改家长密码
   * @param {string} oldPassword - 旧密码
   * @param {string} newPassword - 新密码
   * @returns {boolean} - 是否成功
   */
  changeParentPassword(oldPassword, newPassword) {
    const storedPassword = this.globalData.settings.parentPassword

    // 如果还没有设置密码
    if (!storedPassword) {
      this.globalData.settings.parentPassword = newPassword
      this.saveSettingsToStorage()
      return true
    }

    if (storedPassword !== oldPassword) {
      console.error('[妈妈表扬我] ✗ 旧密码错误')
      return false
    }

    this.globalData.settings.parentPassword = newPassword
    this.saveSettingsToStorage()
    console.log('[妈妈表扬我] ✓ 密码修改成功')
    return true
  },

  /**
   * 退出家长模式
   */
  exitParentMode() {
    this.globalData.isParentMode = false
    console.log('[妈妈表扬我] ✓ 退出家长模式')
  },

  /**
   * 检查是否有家长密码
   * @returns {boolean}
   */
  hasParentPassword() {
    return !!this.globalData.settings.parentPassword
  },

  /**
   * 检查是否为家长模式
   * @returns {boolean}
   */
  isParentMode() {
    return this.globalData.isParentMode === true
  },

  /**
   * 检查家长密码是否已设置
   * @returns {boolean}
   */
  hasParentPassword() {
    return this.globalData.settings.parentPassword !== null
  },

  /**
   * 同步本地数据到云端（登录时调用）
   */
  async syncLocalDataToCloud() {
    try {
      // 检查是否有本地数据需要同步
      const localChildren = wx.getStorageSync('children')
      const localTasks = wx.getStorageSync('tasks')
      const localPrizes = wx.getStorageSync('prizes')

      if (!localChildren && !localTasks && !localPrizes) {
        console.log('[妈妈表扬我] 没有本地数据需要同步')
        return
      }

      console.log('[妈妈表扬我] 开始同步本地数据到云端')

      // 同步孩子数据
      if (localChildren && localChildren.length > 0) {
        await this.syncChildrenToCloud(localChildren)
      }

      // 同步任务数据
      if (localTasks && localTasks.length > 0) {
        await this.syncTasksToCloud(localTasks)
      }

      // 同步奖品数据
      if (localPrizes && localPrizes.length > 0) {
        await this.syncPrizesToCloud(localPrizes)
      }

      console.log('[妈妈表扬我] ✓ 本地数据同步完成')

      // 清除本地缓存（已同步到云端）
      wx.removeStorageSync('children')
      wx.removeStorageSync('tasks')
      wx.removeStorageSync('prizes')

      showToast('数据已同步到云端')
    } catch (err) {
      console.error('[妈妈表扬我] 数据同步失败:', err)
    }
  },

  /**
   * 同步孩子数据到云端
   */
  async syncChildrenToCloud(localChildren) {
    for (const child of localChildren) {
      try {
        await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'createChild',
            data: {
              name: child.name,
              avatar: child.avatar || '',
              age: child.age || 0
            }
          }
        })
        console.log('[妈妈表扬我] ✓ 同步孩子:', child.name)
      } catch (err) {
        console.error('[妈妈表扬我] 同步孩子失败:', child.name, err)
      }
    }
  },

  /**
   * 同步任务数据到云端
   */
  async syncTasksToCloud(localTasks) {
    // 获取第一个孩子（如果没有指定孩子）
    const children = this.globalData.children
    if (!children || children.length === 0) {
      console.log('[妈妈表扬我] 没有孩子，跳过任务同步')
      return
    }

    const targetChildId = children[0].childId

    for (const task of localTasks) {
      try {
        await wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'createTask',
            data: {
              title: task.title,
              description: task.description || '',
              coinReward: task.coinReward || 10,
              taskType: task.taskType || 'daily',
              targetChildId: targetChildId
            }
          }
        })
        console.log('[妈妈表扬我] ✓ 同步任务:', task.title)
      } catch (err) {
        console.error('[妈妈表扬我] 同步任务失败:', task.title, err)
      }
    }
  },

  /**
   * 同步奖品数据到云端
   */
  async syncPrizesToCloud(localPrizes) {
    for (const prize of localPrizes) {
      try {
        await wx.cloud.callFunction({
          name: 'managePrizes',
          data: {
            action: 'createPrize',
            data: {
              name: prize.name,
              description: prize.description || '',
              image: prize.image || '',
              coinCost: prize.coinCost || 100,
              category: prize.category || 'other',
              stock: prize.stock || -1
            }
          }
        })
        console.log('[妈妈表扬我] ✓ 同步奖品:', prize.name)
      } catch (err) {
        console.error('[妈妈表扬我] 同步奖品失败:', prize.name, err)
      }
    }
  }
})
