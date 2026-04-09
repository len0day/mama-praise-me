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
      themeStyle: 'simple-light',    // boy / girl / cute / neutral / simple-light / simple-dark
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

    // 加载儿童数据后，如果没有选中的儿童，自动选择一个
    this.loadChildren().then(() => {
      this.autoSelectChildIfNeeded()
    })
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
    const themeStyle = this.globalData.settings.themeStyle || 'simple-light'
    let themeClass = 'theme-light'
    let colorTone = 'neutral'

    // 根据主题风格设置主题类和色调
    if (themeStyle === 'simple-dark') {
      themeClass = 'theme-dark'
      colorTone = 'neutral'
    } else if (themeStyle === 'simple-light') {
      themeClass = 'theme-light'
      colorTone = 'neutral'
    } else {
      // boy, girl, cute, neutral 都使用浅色主题
      themeClass = 'theme-light'
      colorTone = themeStyle
    }

    // 保存主题信息
    this.globalData.themeClass = themeClass
    this.globalData.themeStyle = themeStyle
    this.globalData.colorTone = colorTone
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.globalData.isFunTheme = isFunTheme

    console.log('[app] applyTheme:', { themeClass, themeStyle, colorTone, isFunTheme })

    // 立即更新导航栏颜色
    this.updateNavigationBarColor()

    // 只更新当前页面
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage && currentPage.setData) {
      currentPage.setData({ themeClass, themeStyle, colorTone, isFunTheme })
    }

    // 只更新 TabBar
    if (currentPage && typeof currentPage.getTabBar === 'function') {
      const tabbar = currentPage.getTabBar()
      if (tabbar && tabbar.setData) {
        tabbar.setData({ themeClass, themeStyle, colorTone, isFunTheme })
      }
    }
  },

  /**
   * 注册主题监听（已简化，不再支持系统主题跟随）
   */
  registerThemeListener() {
    // 不再支持系统主题跟随，移除监听
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
      console.log('[妈妈表扬我] 从存储加载设置:', settings)
      if (settings) {
        this.globalData.settings = {
          ...this.globalData.settings,
          ...settings
        }
        console.log('[妈妈表扬我] ✓ 加载设置成功 - 最终设置:', this.globalData.settings)
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
      const currentFamilyId = this.globalData.currentFamilyId
      if (currentFamilyId) {
        // 从家庭配置中获取该家庭对应的儿童ID
        const familyConfig = wx.getStorageSync('familyConfig') || {}
        const childId = familyConfig[currentFamilyId]?.currentChildId
        if (childId) {
          this.globalData.currentChildId = childId
          console.log('[妈妈表扬我] ✓ 加载当前家庭的孩子ID:', childId)
        }
      } else {
        // 如果没有当前家庭，使用旧的存储方式（向后兼容）
        const currentChildId = wx.getStorageSync('currentChildId')
        if (currentChildId) {
          this.globalData.currentChildId = currentChildId
          console.log('[妈妈表扬我] ✓ 加载当前孩子ID（旧方式）:', currentChildId)
        }
      }
    } catch (e) {
      console.error('[妈妈表扬我] 加载当前孩子ID失败:', e)
    }
  },

  /**
   * 保存当前孩子ID（保存到对应家庭的配置中）
   */
  saveCurrentChildId(childId) {
    try {
      const currentFamilyId = this.globalData.currentFamilyId

      if (currentFamilyId) {
        // 保存到家庭配置中
        const familyConfig = wx.getStorageSync('familyConfig') || {}
        if (!familyConfig[currentFamilyId]) {
          familyConfig[currentFamilyId] = {}
        }
        familyConfig[currentFamilyId].currentChildId = childId
        wx.setStorageSync('familyConfig', familyConfig)
        console.log('[妈妈表扬我] ✓ 孩子ID已保存到家庭配置:', currentFamilyId, childId)
      } else {
        // 如果没有当前家庭，使用旧的存储方式（向后兼容）
        wx.setStorageSync('currentChildId', childId)
        console.log('[妈妈表扬我] ✓ 孩子ID已保存（旧方式）:', childId)
      }

      this.globalData.currentChildId = childId
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
      // 获取所有本地家庭
      const localFamilies = wx.getStorageSync('localFamilies') || []
      const allChildren = []

      // 从每个家庭中收集儿童数据
      localFamilies.forEach(family => {
        const familyChildren = wx.getStorageSync(`localChildren_${family.familyId}`) || []
        allChildren.push(...familyChildren)
      })

      this.globalData.children = allChildren
      console.log('[妈妈表扬我] 从本地加载了', allChildren.length, '个孩子（来自', localFamilies.length, '个家庭）')
      return allChildren
    }

    // 已登录：从云端加载
    return await this.loadChildrenFromCloud()
  },

  /**
   * 从云端加载孩子数据（仅已登录时调用）
   */
  async loadChildrenFromCloud() {
    try {
      // 加载我创建的所有儿童
      const myChildrenRes = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'getChildren'
        }
      })

      const allChildren = []
      const childIds = new Set() // 用于去重

      if (myChildrenRes.result.success) {
        const myChildren = myChildrenRes.result.children || []
        console.log('[妈妈表扬我] 我创建的儿童数据样例:', myChildren.map(c => ({
          name: c.name,
          hasAvatar: !!c.avatar,
          avatarPrefix: c.avatar ? c.avatar.substring(0, 50) : null,
          avatarType: typeof c.avatar
        })))
        myChildren.forEach(child => {
          if (!childIds.has(child.childId)) {
            childIds.add(child.childId)
            allChildren.push(child)
          }
        })
        console.log('[妈妈表扬我] ✓ 从云端加载了我创建的', myChildren.length, '个孩子')
      }

      // 如果有当前家庭，也加载该家庭的孩子（包括其他成员创建的）
      const currentFamilyId = this.globalData.currentFamilyId
      if (currentFamilyId) {
        try {
          const familyChildrenRes = await wx.cloud.callFunction({
            name: 'manageFamilies',
            data: {
              action: 'getFamilyChildren',
              data: { familyId: currentFamilyId }
            }
          })

          if (familyChildrenRes.result.success) {
            const familyChildren = familyChildrenRes.result.children || []
            console.log('[妈妈表扬我] 家庭儿童数据样例:', familyChildren.map(c => ({
              name: c.name,
              hasAvatar: !!c.avatar,
              avatarPrefix: c.avatar ? c.avatar.substring(0, 50) : null,
              avatarType: typeof c.avatar
            })))
            familyChildren.forEach(child => {
              if (!childIds.has(child.childId)) {
                childIds.add(child.childId)
                allChildren.push(child)
              }
            })
            console.log('[妈妈表扬我] ✓ 从云端加载了当前家庭的', familyChildren.length, '个孩子')
          }
        } catch (err) {
          console.warn('[妈妈表扬我] 加载家庭孩子失败（可能还没加入家庭）:', err)
        }
      }

      this.globalData.children = allChildren
      console.log('[妈妈表扬我] ✓ 总共加载了', allChildren.length, '个孩子')
      return allChildren
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

    // 如果没有当前选中的孩子，返回null（让页面显示空状态或引导用户选择）
    if (!this.globalData.currentChildId) {
      console.log('[妈妈表扬我] 没有选中的孩子')
      return null
    }

    // 查找当前选中的孩子
    const currentChild = this.globalData.children.find(child => child.childId === this.globalData.currentChildId)

    // 如果找到了孩子，检查孩子是否属于当前家庭
    if (currentChild) {
      const currentFamilyId = this.globalData.currentFamilyId

      // 如果有当前家庭，但孩子不属于该家庭，返回null（让用户重新选择）
      if (currentFamilyId && currentChild.familyId !== currentFamilyId) {
        console.log('[妈妈表扬我] 当前孩子不属于当前家庭')
        return null
      }

      console.log('[妈妈表扬我] ✓ 当前孩子:', currentChild.name)
      return currentChild
    }

    // 如果找不到孩子（可能被删除），返回null
    console.log('[妈妈表扬我] 找不到当前选中的孩子')
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
   * 如果需要，自动选择一个儿童（仅在应用启动时调用）
   */
  autoSelectChildIfNeeded() {
    // 如果已经有选中的儿童，不需要自动选择
    if (this.globalData.currentChildId) {
      console.log('[妈妈表扬我] 已有选中的儿童，跳过自动选择')
      return
    }

    // 如果没有儿童数据，不需要自动选择
    if (this.globalData.children.length === 0) {
      console.log('[妈妈表扬我] 没有儿童数据，跳过自动选择')
      return
    }

    const currentFamilyId = this.globalData.currentFamilyId

    // 优先选择当前家庭的儿童
    if (currentFamilyId) {
      const familyChildren = this.globalData.children.filter(child => child.familyId === currentFamilyId)
      if (familyChildren.length > 0) {
        // 从家庭配置中获取该家庭上次选择的儿童ID
        const familyConfig = wx.getStorageSync('familyConfig') || {}
        const savedChildId = familyConfig[currentFamilyId]?.currentChildId

        if (savedChildId) {
          const savedChild = familyChildren.find(child => child.childId === savedChildId)
          if (savedChild) {
            this.globalData.currentChildId = savedChild.childId
            console.log('[妈妈表扬我] ✓ 恢复上次选择的儿童:', savedChild.name)
            return
          }
        }

        // 如果没有保存的记录或孩子不存在，选择第一个
        const firstChild = familyChildren[0]
        this.globalData.currentChildId = firstChild.childId
        this.saveCurrentChildId(firstChild.childId)
        console.log('[妈妈表扬我] ✓ 自动选择该家庭的第一个儿童:', firstChild.name)
        return
      }
    }

    // 如果当前家庭没有儿童，选择所有孩子的第一个（并切换到该孩子的家庭）
    const firstChild = this.globalData.children[0]
    this.globalData.currentChildId = firstChild.childId
    this.globalData.currentFamilyId = firstChild.familyId
    this.saveCurrentChildId(firstChild.childId)
    this.saveCurrentFamilyId(firstChild.familyId)
    console.log('[妈妈表扬我] ✓ 自动选择第一个儿童及其家庭:', firstChild.name)
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
   * 返回值：'none' 无数据，'sync' 自动同步，'conflict' 需要用户选择，'cancel' 用户取消
   */
  async syncLocalDataToCloud() {
    try {
      console.log('[妈妈表扬我] ===== 开始检查数据同步 =====')

      // 检查本地数据
      const localFamilies = wx.getStorageSync('localFamilies') || []
      console.log('[妈妈表扬我] 本地家庭列表:', localFamilies)

      // 从每个家庭中收集儿童数据
      const localChildrenData = {}
      let localChildrenCount = 0

      localFamilies.forEach(family => {
        const familyChildren = wx.getStorageSync(`localChildren_${family.familyId}`) || []
        console.log(`[妈妈表扬我] 家庭 ${family.name} (${family.familyId}) 的儿童数量:`, familyChildren.length)
        if (familyChildren.length > 0) {
          localChildrenData[family.familyId] = familyChildren
          localChildrenCount += familyChildren.length
        }
      })

      console.log('[妈妈表扬我] 本地数据统计 - 家庭:', localFamilies.length, '儿童:', localChildrenCount)

      // 如果没有本地数据，直接返回
      if (localFamilies.length === 0 && localChildrenCount === 0) {
        console.log('[妈妈表扬我] 没有本地数据需要同步，返回 none')
        return 'none'
      }

      // 检查云端是否有数据
      console.log('[妈妈表扬我] 开始检查云端数据...')
      const cloudFamiliesRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: { action: 'getAllMyFamilies' }
      })

      console.log('[妈妈表扬我] 云函数返回结果:', cloudFamiliesRes)

      const cloudFamilies = cloudFamiliesRes.result.success ? (cloudFamiliesRes.result.families || []) : []
      console.log('[妈妈表扬我] 云端数据统计 - 家庭:', cloudFamilies.length)

      // 如果云端没有数据，自动同步本地数据到云端
      if (cloudFamilies.length === 0) {
        console.log('[妈妈表扬我] 云端无数据，自动同步本地数据')
        await this.uploadLocalDataToCloud(localFamilies, localChildrenData)
        return 'sync'
      }

      // 如果两边都有数据，需要用户选择
      console.log('[妈妈表扬我] ✓ 检测到数据冲突，需要用户选择，返回 conflict')
      return 'conflict'

    } catch (err) {
      console.error('[妈妈表扬我] 检查数据同步失败:', err)
      return 'error'
    }
  },

  /**
   * 上传本地数据到云端
   */
  async uploadLocalDataToCloud(localFamilies, localChildrenData) {
    try {
      console.log('[妈妈表扬我] 开始上传本地数据到云端')

      // 1. 上传家庭
      for (const family of localFamilies) {
        await wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'createFamily',
            data: {
              name: family.name,
              creatorNickname: family.creatorNickname
            }
          }
        })
      }

      // 重新获取创建的家庭（获取新的 familyId）
      const familiesRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: { action: 'getAllMyFamilies' }
      })

      if (familiesRes.result.success) {
        const cloudFamilies = familiesRes.result.families || []

        // 2. 上传儿童（使用新的 familyId）
        for (let i = 0; i < cloudFamilies.length; i++) {
          const cloudFamily = cloudFamilies[i]
          const localFamilyId = localFamilies[i]?.familyId

          if (localFamilyId && localChildrenData[localFamilyId]) {
            for (const child of localChildrenData[localFamilyId]) {
              await wx.cloud.callFunction({
                name: 'manageChildren',
                data: {
                  action: 'createChild',
                  data: {
                    ...child,
                    familyId: cloudFamily.familyId
                  }
                }
              })
            }
          }
        }
      }

      console.log('[妈妈表扬我] ✓ 本地数据上传完成')

      // 清除本地数据
      wx.removeStorageSync('localFamilies')
      localFamilies.forEach(family => {
        wx.removeStorageSync(`localChildren_${family.familyId}`)
        wx.removeStorageSync(`localTasks_${family.familyId}`)
        wx.removeStorageSync(`localPrizes_${family.familyId}`)
      })

    } catch (err) {
      console.error('[妈妈表扬我] 上传本地数据失败:', err)
      throw err
    }
  },

  /**
   * 用云端数据覆盖本地数据
   */
  async downloadCloudDataToLocal() {
    try {
      console.log('[妈妈表扬我] 开始下载云端数据到本地')

      // 清除所有本地数据
      wx.clearStorageSync()

      // 重新保存必要的配置
      this.saveSettingsToStorage()

      console.log('[妈妈表扬我] ✓ 本地数据已清除，将使用云端数据')

    } catch (err) {
      console.error('[妈妈表扬我] 清除本地数据失败:', err)
      throw err
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
