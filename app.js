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
      themeStyle: 'boy',             // boy / girl / cute / neutral / simple-light / simple-dark（默认男孩主题）
      fontSize: 'medium',
      locale: 'zh-CN',
      parentPassword: null            // 家长密码（null表示未设置）
    },

    // 云端存储
    useCloudStorage: false,
    currentUserOpenid: null,

    // 家庭列表短缓存（减轻 getAllMyFamilies 高频调用；切换 Tab 时复用）
    familiesListCacheAt: 0,
    familiesListCacheData: null,
    FAMILIES_LIST_CACHE_TTL_MS: 90 * 1000,

    // 任务缓存（基于家庭和儿童）
    tasksCache: {},  // 格式: { "familyId_childId": { at: timestamp, data: tasks } }

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

    // 检查并清理旧格式的家庭列表缓存
    const cached = this.getFamiliesListCache()
    if (cached && Array.isArray(cached)) {
      console.log('[妈妈表扬我] 检测到旧格式缓存，清除中...')
      this.invalidateFamiliesListCache()
    }

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

  /** @returns {Object|null} 未过期则返回上次 getAllMyFamilies 结果 {families, deletedFamilies} */
  getFamiliesListCache() {
    const ttl = this.globalData.FAMILIES_LIST_CACHE_TTL_MS
    const at = this.globalData.familiesListCacheAt
    if (!at || !this.globalData.familiesListCacheData) return null
    if (Date.now() - at > ttl) return null
    return this.globalData.familiesListCacheData
  },

  /**
   * 设置家庭列表缓存（包括活跃家庭和已解散家庭）
   * @param {Array} families - 活跃家庭列表
   * @param {Array} deletedFamilies - 已解散家庭列表（可选）
   */
  setFamiliesListCache(families, deletedFamilies = []) {
    this.globalData.familiesListCacheAt = Date.now()
    this.globalData.familiesListCacheData = {
      families: families ? [...families] : [],
      deletedFamilies: deletedFamilies ? [...deletedFamilies] : []
    }
  },

  invalidateFamiliesListCache() {
    this.globalData.familiesListCacheAt = 0
    this.globalData.familiesListCacheData = null
  },

  /**
   * 获取任务缓存（基于家庭和儿童）
   * @param {string} familyId - 家庭ID
   * @param {string} childId - 儿童ID
   * @returns {Array|null} 未过期则返回缓存的任务列表
   */
  getTasksCache(familyId, childId) {
    const cacheKey = `${familyId}_${childId}`
    const cacheEntry = this.globalData.tasksCache?.[cacheKey]
    if (!cacheEntry) return null

    const ttl = this.globalData.CACHE_DURATION.TASKS
    if (Date.now() - cacheEntry.at > ttl) return null

    return cacheEntry.data
  },

  /**
   * 设置任务缓存
   * @param {string} familyId - 家庭ID
   * @param {string} childId - 儿童ID
   * @param {Array} tasks - 任务列表
   */
  setTasksCache(familyId, childId, tasks) {
    if (!this.globalData.tasksCache) {
      this.globalData.tasksCache = {}
    }
    const cacheKey = `${familyId}_${childId}`
    this.globalData.tasksCache[cacheKey] = {
      at: Date.now(),
      data: tasks ? [...tasks] : []
    }
  },

  /**
   * 清除任务缓存
   * @param {string} familyId - 家庭ID（可选）
   * @param {string} childId - 儿童ID（可选）
   */
  invalidateTasksCache(familyId, childId) {
    if (!this.globalData.tasksCache) return

    if (familyId && childId) {
      // 清除特定家庭的特定儿童的任务缓存
      const cacheKey = `${familyId}_${childId}`
      delete this.globalData.tasksCache[cacheKey]
    } else if (familyId) {
      // 清除特定家庭的所有任务缓存
      Object.keys(this.globalData.tasksCache).forEach(key => {
        if (key.startsWith(`${familyId}_`)) {
          delete this.globalData.tasksCache[key]
        }
      })
    } else {
      // 清除所有任务缓存
      this.globalData.tasksCache = {}
    }
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
    const themeStyle = this.globalData.settings.themeStyle || 'boy'  // 默认男孩主题
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
   * 登录成功后合并云端用户设置：本地主题与其它本地项优先；
   * 家长密码仅在本设备尚未设置（空/null）时采用云端，避免本地默认值覆盖云端已存密码并被反写清空。
   */
  mergeUserSettingsAfterLogin(userData) {
    if (!userData || !userData.settings) return
    const cloudSettings = userData.settings
    const localThemeStyle = this.globalData.settings.themeStyle
    const localPw = this.globalData.settings.parentPassword
    const cloudPw = cloudSettings.parentPassword
    const hasLocalPw = localPw != null && String(localPw).trim() !== ''
    let resolvedPassword = null
    if (hasLocalPw) {
      resolvedPassword = localPw
    } else if (cloudPw != null && String(cloudPw).trim() !== '') {
      resolvedPassword = cloudPw
    }

    this.globalData.settings = {
      ...cloudSettings,
      ...this.globalData.settings,
      themeStyle: localThemeStyle,
      parentPassword: resolvedPassword
    }
    this.saveSettingsToStorage()
    console.log('[妈妈表扬我] ✓ 已合并登录用户设置（家长密码:', hasLocalPw ? '本机' : (resolvedPassword ? '云端' : '未设置'), ')')
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
   * 获取当前孩子ID
   */
  getCurrentChildId() {
    return this.globalData.currentChildId
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
   * @param {boolean} forceRefresh - 是否强制刷新
   */
  async loadChildren(forceRefresh = false) {
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

    // 已登录：仅强制刷新或家庭级缓存过期时请求云端（checkDataFreshness 不再内置拉取，避免重复请求）
    if (!forceRefresh && !this.isFamilyChildrenCacheStale(false)) {
      console.log('[妈妈表扬我] 数据新鲜，使用缓存')
      return this.globalData.children || []
    }

    console.log('[妈妈表扬我] 数据过期或强制刷新，从云端加载')
    const children = await this.loadChildrenFromCloud()

    const now = Date.now()
    const currentFamilyId = this.globalData.currentFamilyId
    if (currentFamilyId) {
      wx.setStorageSync(`lastUpdate_${currentFamilyId}`, now)
    }

    return children
  },

  /**
   * 从云端加载孩子数据（仅已登录时调用）
   */
  async loadChildrenFromCloud() {
    try {
      const currentFamilyId = this.globalData.currentFamilyId

      if (!currentFamilyId) {
        // 没有选择家庭，返回空数组
        this.globalData.children = []
        console.log('[妈妈表扬我] 没有选择家庭，不加载儿童')
        return []
      }

      // 使用新的 getFamilyChildrenById 操作加载当前家庭的儿童
      const familyChildrenRes = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'getFamilyChildrenById',
          familyId: currentFamilyId
        }
      })

      if (familyChildrenRes.result.success) {
        const familyChildren = familyChildrenRes.result.children || []
        this.globalData.children = familyChildren
        console.log('[妈妈表扬我] ✓ 从云端加载了当前家庭的', familyChildren.length, '个孩子')
        return familyChildren
      } else {
        console.error('[妈妈表扬我] 加载家庭儿童失败:', familyChildrenRes.result.error)
        this.globalData.children = []
        return []
      }
    } catch (err) {
      console.error('[妈妈表扬我] 加载孩子数据失败:', err)
      this.globalData.children = []
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

      // 如果有当前家庭，检查孩子是否属于该家庭（通过 familyIds 数组）
      if (currentFamilyId) {
        const familyIds = currentChild.familyIds || []
        if (!familyIds.includes(currentFamilyId)) {
          console.log('[妈妈表扬我] 当前孩子不属于当前家庭')
          return null
        }
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
      const familyChildren = this.globalData.children.filter(child => {
        const familyIds = child.familyIds || []
        return familyIds.includes(currentFamilyId)
      })
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

    // 如果当前家庭没有儿童，选择所有孩子的第一个（并切换到该孩子的第一个家庭）
    const firstChild = this.globalData.children[0]
    const firstFamilyId = (firstChild.familyIds && firstChild.familyIds.length > 0) ? firstChild.familyIds[0] : null
    this.globalData.currentChildId = firstChild.childId
    this.globalData.currentFamilyId = firstFamilyId
    this.saveCurrentChildId(firstChild.childId)
    this.saveCurrentFamilyId(firstFamilyId)
    console.log('[妈妈表扬我] ✓ 自动选择第一个儿童及其家庭:', firstChild.name)
  },

  /**
   * 设置当前孩子（必须在当前家庭内）
   */
  setCurrentChild(child) {
    if (child) {
      // 验证孩子是否属于当前家庭
      const currentFamilyId = this.globalData.currentFamilyId
      const familyIds = child.familyIds || []
      if (currentFamilyId && !familyIds.includes(currentFamilyId)) {
        console.warn('[妈妈表扬我] 警告：孩子不属于当前家庭，自动切换到该孩子的第一个家庭')
        const firstFamilyId = familyIds.length > 0 ? familyIds[0] : null
        if (firstFamilyId) {
          this.setCurrentFamily(firstFamilyId)
        }
        return
      }

      this.globalData.currentChildId = child.childId
      wx.setStorageSync('currentChildId', child.childId)
      console.log('[妈妈表扬我] ✓ 切换到孩子:', child.name)
    }
  },
  /**
   * 当前是否视为「已设置家长密码」（与 hasParentPassword 一致：非空且 trim 后非空）
   */
  getEffectiveParentPassword() {
    const p = this.globalData.settings.parentPassword
    if (p == null) return null
    const t = String(p).trim()
    return t !== '' ? t : null
  },

  /**
   * 进入家长模式
   * @param {string} password - 家长密码
   * @returns {boolean} - 是否成功
   */
  enterParentMode(password) {
    const storedEff = this.getEffectiveParentPassword()
    const inputEff = password != null ? String(password).trim() : ''

    // 如果还没有有效密码，第一次输入的密码将成为家长密码
    if (!storedEff) {
      if (inputEff.length < 4) {
        return false
      }
      this.globalData.settings.parentPassword = inputEff
      this.saveSettingsToStorage()
      console.log('[妈妈表扬我] ✓ 首次设置家长密码')
    } else if (storedEff !== inputEff) {
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
    const storedEff = this.getEffectiveParentPassword()
    const oldEff = oldPassword != null ? String(oldPassword).trim() : ''
    const newEff = newPassword != null ? String(newPassword).trim() : ''

    // 如果还没有有效密码，直接设新密码
    if (!storedEff) {
      if (newEff.length < 4) {
        return false
      }
      this.globalData.settings.parentPassword = newEff
      this.saveSettingsToStorage()
      return true
    }

    if (storedEff !== oldEff) {
      console.error('[妈妈表扬我] ✗ 旧密码错误')
      return false
    }

    if (newEff.length < 4) {
      return false
    }

    this.globalData.settings.parentPassword = newEff
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
   * 检查是否已设置家长密码（非空字符串）
   * @returns {boolean}
   */
  hasParentPassword() {
    return this.getEffectiveParentPassword() != null
  },

  /**
   * 检查是否为家长模式
   * @returns {boolean}
   */
  isParentMode() {
    return this.globalData.isParentMode === true
  },

  /**
   * 同步本地数据到云端（登录时调用）
   * 返回值：{ status: 'none'|'sync'|'conflict'|'error', localCount: number, cloudCount: number }
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
        return { status: 'none', localCount: 0, cloudCount: 0 }
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
        return { status: 'sync', localCount: localFamilies.length, cloudCount: 0 }
      }

      // 如果两边都有数据，需要用户选择
      console.log('[妈妈表扬我] ✓ 检测到数据冲突，需要用户选择，返回 conflict')
      return { status: 'conflict', localCount: localFamilies.length, cloudCount: cloudFamilies.length }

    } catch (err) {
      console.error('[妈妈表扬我] 检查数据同步失败:', err)
      return { status: 'error', localCount: 0, cloudCount: 0 }
    }
  },

  /**
   * 上传本地数据到云端
   * @param {Array} localFamilies - 本地家庭列表
   * @param {Object} localChildrenData - 本地儿童数据 { [familyId]: childrenArray }
   * @param {boolean} clearLocal - 是否清除本地数据（默认true）
   */
  async uploadLocalDataToCloud(localFamilies, localChildrenData, clearLocal = true) {
    try {
      console.log('[妈妈表扬我] 开始上传本地数据到云端, clearLocal:', clearLocal)

      // 1. 上传家庭
      for (const family of localFamilies) {
        await wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'createFamily',
            name: family.name,
            creatorNickname: family.creatorNickname
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
                  ...child,
                  familyId: cloudFamily.familyId
                }
              })
            }
          }
        }
      }

      console.log('[妈妈表扬我] ✓ 本地数据上传完成')

      // 清除本地数据（仅当明确要求时）
      if (clearLocal) {
        wx.removeStorageSync('localFamilies')
        localFamilies.forEach(family => {
          wx.removeStorageSync(`localChildren_${family.familyId}`)
          wx.removeStorageSync(`localTasks_${family.familyId}`)
          wx.removeStorageSync(`localPrizes_${family.familyId}`)
        })
      }

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

      // 1. 获取云端所有家庭
      const familiesRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: { action: 'getAllMyFamilies' }
      })

      if (!familiesRes.result || !familiesRes.result.success) {
        throw new Error('获取云端家庭失败')
      }

      const cloudFamilies = familiesRes.result.families || []
      console.log('[妈妈表扬我] 云端家庭数量:', cloudFamilies.length)

      // 2. 清除所有旧本地数据（但保留用户设置）
      const savedSettings = wx.getStorageSync('appSettings')
      const savedUserInfo = wx.getStorageSync('userInfo')
      const savedHasCompletedWizard = wx.getStorageSync('hasCompletedWizard')
      const savedParentPassword = wx.getStorageSync('parentPassword')
      const savedTheme = wx.getStorageSync('theme')
      const savedLocale = wx.getStorageSync('locale')
      wx.clearStorageSync()

      // 恢复必要的用户设置
      if (savedSettings) wx.setStorageSync('appSettings', savedSettings)
      if (savedUserInfo) wx.setStorageSync('userInfo', savedUserInfo)
      if (savedHasCompletedWizard) wx.setStorageSync('hasCompletedWizard', savedHasCompletedWizard)
      if (savedParentPassword) wx.setStorageSync('parentPassword', savedParentPassword)
      if (savedTheme) wx.setStorageSync('theme', savedTheme)
      if (savedLocale) wx.setStorageSync('locale', savedLocale)

      // 3. 保存云端家庭到本地
      const localFamilies = cloudFamilies.map(f => ({
        familyId: f.familyId,
        name: f.name,
        role: f.role,
        isCreator: f.isCreator,
        inviteCode: f.inviteCode,
        createdAt: f.createdAt
      }))
      wx.setStorageSync('localFamilies', localFamilies)

      // 4. 获取并保存每个家庭的儿童数据
      for (const family of cloudFamilies) {
        const childrenRes = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'getFamilyChildren',
            familyId: family.familyId
          }
        })

        if (childrenRes.result && childrenRes.result.success) {
          const children = childrenRes.result.children || []
          wx.setStorageSync(`localChildren_${family.familyId}`, children)
          console.log('[妈妈表扬我] 家庭', family.name, '的儿童数量:', children.length)
        }

        // 获取该家庭的任务
        const tasksRes = await wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getTasks',
            familyId: family.familyId,
            childId: null  // 获取所有任务
          }
        })

        if (tasksRes.result && tasksRes.result.success) {
          const tasks = tasksRes.result.tasks || []
          wx.setStorageSync(`localTasks_${family.familyId}`, tasks)
        }

        // 获取该家庭的奖品
        const prizesRes = await wx.cloud.callFunction({
          name: 'managePrizes',
          data: {
            action: 'getPrizes',
            familyId: family.familyId
          }
        })

        if (prizesRes.result && prizesRes.result.success) {
          const prizes = prizesRes.result.prizes || []
          wx.setStorageSync(`localPrizes_${family.familyId}`, prizes)
        }
      }

      // 5. 保存当前家庭ID（选择第一个家庭）
      if (cloudFamilies.length > 0) {
        this.saveCurrentFamilyId(cloudFamilies[0].familyId)
      }

      console.log('[妈妈表扬我] ✓ 云端数据已下载到本地')

    } catch (err) {
      console.error('[妈妈表扬我] 下载云端数据失败:', err)
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
            name: child.name,
            avatar: child.avatar || '',
            age: child.age || 0
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
            title: task.title,
            description: task.description || '',
            coinReward: task.coinReward || 10,
            taskType: task.taskType || 'daily',
            targetChildId: targetChildId
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
            name: prize.name,
            description: prize.description || '',
            image: prize.image || '',
            coinCost: prize.coinCost || 100,
            category: prize.category || 'other',
            stock: prize.stock || -1
          }
        })
        console.log('[妈妈表扬我] ✓ 同步奖品:', prize.name)
      } catch (err) {
        console.error('[妈妈表扬我] 同步奖品失败:', prize.name, err)
      }
    }
  },

  // ========== 数据新鲜度检查机制 ==========

  /**
   * 当前家庭的孩子列表缓存是否过期（仅读本地时间戳，不发起网络请求）
   * 与 loadChildren 成功写入的 lastUpdate_${familyId}、updateChildTimestamp 一致
   */
  isFamilyChildrenCacheStale(forceRefresh = false) {
    if (!this.globalData.useCloudStorage) {
      return false
    }
    if (forceRefresh) {
      return true
    }
    const familyId = this.globalData.currentFamilyId
    if (!familyId) {
      return false
    }
    const localLastUpdateTime = wx.getStorageSync(`lastUpdate_${familyId}`) || 0
    const tenMinutes = 10 * 60 * 1000
    return (Date.now() - localLastUpdateTime) > tenMinutes
  },

  /**
   * 孩子列表是否需要从云端刷新（不在这里拉取云端，避免与 loadChildren 重复请求）
   * @returns {Promise<boolean>} 是否与 isFamilyChildrenCacheStale 一致
   */
  async checkDataFreshness(forceRefresh = false) {
    const stale = this.isFamilyChildrenCacheStale(forceRefresh)
    if (!stale) {
      console.log('[数据新鲜度] 数据新鲜，无需更新')
    }
    return stale
  },

  /**
   * 更新云端时间戳
   * 在任何数据更新操作后调用此方法
   */
  async updateChildTimestamp() {
    if (!this.globalData.useCloudStorage) {
      return
    }

    const currentFamilyId = this.globalData.currentFamilyId
    const currentChildId = this.globalData.currentChildId

    if (!currentFamilyId || !currentChildId) {
      return
    }

    try {
      await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'updateChildTimestamp',
          familyId: currentFamilyId,
          childId: currentChildId,
          timestamp: Date.now()
        }
      })

      // 同时更新本地时间戳（基于家庭）
      const localLastUpdateKey = `lastUpdate_${currentFamilyId}`
      wx.setStorageSync(localLastUpdateKey, Date.now())

      console.log('[时间戳] ✓ 已更新云端和本地时间戳')
    } catch (e) {
      console.error('[时间戳] ✗ 更新失败:', e)
    }
  },

  /**
   * 从云端同步儿童数据
   * @param {string} familyId - 家庭ID
   * @param {string} childId - 儿童ID
   */
  async syncChildDataFromCloud(familyId, childId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'getChildData',
          familyId: familyId,
          childId: childId
        }
      })

      if (res.result && res.result.success && res.result.childData) {
        // 更新本地数据
        this.updateLocalChildData(res.result.childData)
        console.log('[数据同步] ✓ 儿童数据已从云端同步')
      }
    } catch (e) {
      console.error('[数据同步] ✗ 同步失败:', e)
    }
  },

  /**
   * 更新本地儿童数据
   * @param {Object} childData - 儿童数据
   */
  updateLocalChildData(childData) {
    // 更新全局数据中的儿童信息
    const index = this.globalData.children.findIndex(c => c.childId === childData.childId)
    if (index !== -1) {
      this.globalData.children[index] = { ...this.globalData.children[index], ...childData }
    }

    // 触发页面更新事件
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    if (currentPage && currentPage.onChildDataUpdated) {
      currentPage.onChildDataUpdated(childData)
    }
  }
})
