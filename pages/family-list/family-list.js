// pages/family-list/family-list.js
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    colorTone: 'girl',
    families: [],            // 用户所属的所有家庭
    deletedFamilies: [],     // 已解散的家庭（仅创建者可见）
    myFamily: null,          // 当前选中的家庭
    familyMembers: [],       // 当前家庭的成员列表
    familyChildren: [],      // 当前家庭的儿童列表
    myChildren: [],          // 我创建的所有儿童
    currentMemberInfo: null, // 当前用户在当前家庭中的信息
    showCreateModal: false,
    showJoinModal: false,
    showChildModal: false,    // 分配儿童弹窗
    showInviteModal: false,   // 邀请码弹窗
    showAssignChildModal: false,  // 分配单个儿童弹窗
    showEditNicknameModal: false,  // 修改称呼弹窗
    assigningChild: null,    // 正在分配的儿童
    assignFormData: {
      initialCoins: 0
    },
    editNicknameValue: '',   // 正在编辑的称呼值
    currentFamilyId: null,    // 当前选中的家庭ID
    expandedFamilyId: null,   // 当前展开的家庭ID
    formData: {
      familyName: '',
      inviteCode: '',
      nickname: ''
    }
  },

  onLoad() {
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme
    })
  },

  onShow() {
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      // 先设置当前家庭ID，避免 selectFamilyById 误判为切换
      currentFamilyId: app.globalData.currentFamilyId
    })
    this.loadAllFamilies()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
      this.getTabBar().applyTheme()
    }
  },

  /**
   * 加载所有家庭
   */
  async loadAllFamilies() {
    // 未登录：加载本地家庭
    if (!app.globalData.useCloudStorage) {
      console.log('[家庭列表] 用户未登录，加载本地家庭')
      const localFamilies = wx.getStorageSync('localFamilies') || []
      console.log('[家庭列表] 本地家庭数量:', localFamilies.length)

      // 补充 isCreator 标记和 childCount（兼容旧本地数据）
      const processedLocalFamilies = localFamilies.map(f => {
        // 计算该家庭的儿童数量
        const storageKey = `localChildren_${f.familyId}`
        const familyChildren = wx.getStorageSync(storageKey) || []

        return {
          ...f,
          isCreator: f.isCreator !== undefined ? f.isCreator : (f.role === 'admin'),
          childCount: familyChildren.length,
          parentCount: 1  // 本地模式只有一个家长（创建者）
        }
      })

      this.setData({ families: processedLocalFamilies })

      if (localFamilies.length > 0) {
        const currentFamilyId = app.globalData.currentFamilyId
        const familyToSelect = localFamilies.find(f => f.familyId === currentFamilyId) || localFamilies[0]
        console.log('[家庭列表] 选择本地家庭:', familyToSelect)
        // 页面加载时不返回首页
        this.selectFamilyById(familyToSelect.familyId, false)
      } else {
        this.setData({
          myFamily: null,
          familyMembers: [],
          familyChildren: []
        })
      }
      return
    }

    // 已登录：从云端加载（使用缓存机制）
    // 先检查缓存
    const cachedData = app.getFamiliesListCache()
    if (cachedData) {
      console.log('[家庭列表] 使用缓存的家庭列表')

      let families = []
      let deletedFamilies = []

      // 兼容旧格式（数组）和新格式（对象）
      if (Array.isArray(cachedData)) {
        // 旧格式：直接是数组
        families = cachedData
      } else {
        // 新格式：对象包含 families 和 deletedFamilies
        families = cachedData.families || []
        deletedFamilies = cachedData.deletedFamilies || []
      }

      console.log('[家庭列表] 缓存数据 - 活跃家庭:', families.length, '已解散家庭:', deletedFamilies.length)

      // 格式化已解散家庭的日期
      const formattedDeletedFamilies = deletedFamilies.map(f => ({
        ...f,
        disbandedAtFormatted: this.formatDate(f.disbandedAt)
      }))

      this.setData({
        families: families,
        deletedFamilies: formattedDeletedFamilies
      })

      const currentFamilyId = app.globalData.currentFamilyId
      if (families.length > 0) {
        const familyToSelect = families.find(f => f.familyId === currentFamilyId) || families[0]
        console.log('[家庭列表] 选择家庭:', familyToSelect)
        // 页面加载时不返回首页
        await this.selectFamilyById(familyToSelect.familyId, false)
      }
      return
    }

    // 缓存过期，从云端加载
    showLoading()

    try {
      console.log('[家庭列表] 缓存过期，开始加载所有家庭')
      const familiesRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getAllMyFamilies'
        }
      })

      console.log('[家庭列表] 云函数返回:', familiesRes)

      if (familiesRes.result.success) {
        const families = familiesRes.result.families || []
        const deletedFamilies = familiesRes.result.deletedFamilies || []
        console.log('[家庭列表] 获取到家庭数量:', families.length)
        console.log('[家庭列表] 获取到已解散家庭数量:', deletedFamilies.length)
        console.log('[家庭列表] 家庭详细数据:', families)

        // 格式化已解散家庭的日期
        const formattedDeletedFamilies = deletedFamilies.map(f => ({
          ...f,
          disbandedAtFormatted: this.formatDate(f.disbandedAt)
        }))

        console.log('[家庭列表] 格式化后的已解散家庭:', formattedDeletedFamilies)

        // 总是设置数据（包括已解散家庭）
        this.setData({
          families: families,
          deletedFamilies: formattedDeletedFamilies
        }, () => {
          console.log('[家庭列表] setData 完成')
          console.log('[家庭列表] 当前 data.families:', this.data.families)
          console.log('[家庭列表] 当前 data.deletedFamilies:', this.data.deletedFamilies)
        })

        if (families.length > 0) {
          // 检测是否有新加入的家庭（上次访问时没有的家庭）
          const lastFamilyIds = wx.getStorageSync('lastFamilyIds_before') || []
          const currentFamilyIds = families.map(f => f.familyId)
          const newFamilies = families.filter(f => !lastFamilyIds.includes(f.familyId))

          // 保存到缓存（同时保存活跃家庭和已解散家庭）
          app.setFamiliesListCache(families, formattedDeletedFamilies)

          const currentFamilyId = app.globalData.currentFamilyId

          // 如果有新加入的家庭，优先选择它
          if (newFamilies.length > 0) {
            const newFamily = newFamilies[0]
            console.log('[家庭列表] 检测到新加入的家庭:', newFamily.name)

            // 自动选择新家庭（页面加载时不返回首页）
            await this.selectFamilyById(newFamily.familyId, false)

            // 保存当前家庭ID列表
            wx.setStorageSync('lastFamilyIds_before', currentFamilyIds)
          } else {
            // 没有新家庭，选择当前家庭或第一个家庭
            const familyToSelect = families.find(f => f.familyId === currentFamilyId) || families[0]
            console.log('[家庭列表] 选择家庭:', familyToSelect)
            // 页面加载时不返回首页
            await this.selectFamilyById(familyToSelect.familyId, false)

            // 保存当前家庭ID列表
            wx.setStorageSync('lastFamilyIds_before', currentFamilyIds)
          }
        } else {
          console.log('[家庭列表] 没有找到活跃家庭')
          // 清空当前家庭相关数据，但保留已解散家庭（已经在前面设置过了）
          this.setData({
            myFamily: null,
            familyMembers: [],
            familyChildren: [],
            currentMemberInfo: null
          })
        }
      } else {
        console.error('[家庭列表] 云函数返回失败:', familiesRes.result)
        showToast('加载失败: ' + (familiesRes.result.error || '未知错误'))
      }
    } catch (err) {
      console.error('[家庭列表] 加载失败:', err)
      showToast('加载失败: ' + err.message)
    } finally {
      hideLoading()
    }
  },

  /**
   * 选择家庭（从点击事件）
   */
  onFamilyTap(e) {
    const { familyid } = e.currentTarget.dataset
    if (familyid === this.data.currentFamilyId) {
      // 如果点击的是当前家庭，进入家庭详情页
      this.goToFamilyManage()
      return
    }

    // 选择新家庭（不返回首页，用户可以继续查看家庭列表）
    this.selectFamilyById(familyid, false)
  },

  /**
   * 切换家庭详情展开/折叠
   */
  toggleFamilyDetail(e) {
    const { familyid } = e.currentTarget.dataset
    const currentExpanded = this.data.expandedFamilyId

    if (currentExpanded === familyid) {
      // 折叠
      this.setData({ expandedFamilyId: null })
    } else {
      // 展开
      this.setData({ expandedFamilyId: familyid })
    }
  },

  /**
   * 分享家庭
   */
  shareFamily(e) {
    const { familyid } = e.currentTarget.dataset
    const family = this.data.families.find(f => f.familyId === familyid)

    if (!family || !family.inviteCode) {
      showToast('该家庭没有邀请码')
      return
    }

    // 复制邀请码到剪贴板
    wx.setClipboardData({
      data: family.inviteCode,
      success: () => {
        showToast('邀请码已复制')
      }
    })
  },

  /**
   * 选择家庭（内部方法）
   * @param {string} familyId - 家庭ID
   * @param {boolean} shouldReturnHome - 是否返回首页（默认true）
   */
  async selectFamilyById(familyId, shouldReturnHome = true) {
    console.log('[家庭列表] 选择家庭:', familyId, 'shouldReturnHome:', shouldReturnHome)

    // 检查是否真的是切换家庭（与当前家庭不同）
    const previousFamilyId = this.data.currentFamilyId
    const isActuallySwitching = familyId !== previousFamilyId

    console.log('[家庭列表] 是否真正切换家庭:', isActuallySwitching, '从', previousFamilyId, '到', familyId)

    this.setData({ currentFamilyId: familyId })
    app.saveCurrentFamilyId(familyId)
    await app.loadChildren()

    // 加载该家庭的详细信息
    await this.loadFamilyDetail(familyId)

    // 检查是否有儿童
    if (this.data.familyChildren.length === 0) {
      console.log('[家庭列表] 该家庭没有儿童')

      // 显示提示，询问是否添加儿童
      const family = this.data.myFamily
      wx.showModal({
        title: '添加儿童',
        content: `您已加入"${family ? family.name : '新家庭'}"，是否现在添加儿童？`,
        confirmText: '立即添加',
        cancelText: '稍后再说',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/children/children'
            })
          }
        }
      })
      return
    }

    // 自动选择该家庭的儿童（优先选择上次选择的）
    // 从家庭配置中获取上次选择的儿童ID
    const familyConfig = wx.getStorageSync('familyConfig') || {}
    const savedChildId = familyConfig[familyId]?.currentChildId

    let childToSelect
    if (savedChildId) {
      // 尝试找到上次选择的儿童
      childToSelect = this.data.familyChildren.find(c => c.childId === savedChildId)
    }

    // 如果没有保存的记录或找不到该儿童，选择第一个
    if (!childToSelect) {
      childToSelect = this.data.familyChildren[0]
    }

    app.saveCurrentChildId(childToSelect.childId)
    console.log('[家庭列表] 自动选择儿童:', childToSelect.name)

    // 根据参数决定是否返回首页
    console.log('[家庭列表] shouldReturnHome:', shouldReturnHome, 'isActuallySwitching:', isActuallySwitching)

    if (shouldReturnHome) {
      // 切换家庭后自动返回首页，让首页显示新家庭的数据
      console.log('[家庭列表] 执行 switchTab 到首页')
      wx.switchTab({
        url: '/pages/index/index'
      })
    } else {
      // 不返回首页
      // 只有在真正切换家庭时才显示提示
      if (isActuallySwitching) {
        console.log('[家庭列表] 真正切换了家庭，显示提示')
        showToast(`已切换到${this.data.myFamily?.name || '新家庭'}`)
      } else {
        console.log('[家庭列表] 家庭没有变化，不显示提示')
      }
    }
  },

  /**
   * 加载家庭详情
   */
  async loadFamilyDetail(familyId) {
    try {
      // 从已加载的家庭列表中查找
      const family = this.data.families.find(f => f.familyId === familyId)
      if (!family) return

      this.setData({ myFamily: family })

      // 加载家庭成员和儿童
      await this.loadAdditionalData(familyId)
    } catch (err) {
      console.error('[家庭列表] 加载家庭详情失败:', err)
    }
  },

  /**
   * 加载额外数据（成员和儿童）
   */
  async loadAdditionalData(familyId) {
    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      console.log('[家庭列表] 从本地加载家庭数据')
      const localChildren = wx.getStorageSync(`localChildren_${familyId}`) || []
      this.setData({
        familyChildren: localChildren,
        familyMembers: [{  // 本地模式只有创建者一个成员
          openid: 'local',
          nickname: this.data.myFamily.creatorNickname,
          role: 'admin',
          joinedAt: new Date().toISOString()
        }],
        myChildren: []
      })
      return
    }

    // 已登录：从云端加载
    try {
      // 改为顺序执行，提高在高并发下的稳定性
      const familyChildrenRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getFamilyChildren',
          familyId: familyId
        }
      })

      const myChildrenRes = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'getChildren'
        }
      })

      const membersRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getFamilyMembers',
          familyId: familyId
        }
      })

      if (familyChildrenRes.result.success) {
        const children = familyChildrenRes.result.children || []
        console.log('[家庭列表] 家庭儿童原始数据:', familyChildrenRes.result)
        console.log('[家庭列表] 家庭儿童数据:', children.map(c => ({
          name: c.name,
          hasAvatar: !!c.avatar,
          avatar: c.avatar,
          familyCoins: c.familyCoins,
          allKeys: Object.keys(c)
        })))
        this.setData({ familyChildren: children })
      }

      if (myChildrenRes.result.success) {
        // 过滤出未分配到当前家庭的儿童
        const myChildren = (myChildrenRes.result.children || []).filter(child => {
          const familyIds = child.familyIds || []
          return !familyIds.includes(familyId)
        })
        this.setData({ myChildren: myChildren })
      }

      if (membersRes.result.success) {
        const members = membersRes.result.members || []
        this.setData({ familyMembers: members })

        // 找到当前用户在该家庭中的信息
        const currentUserMember = members.find(m => m.openid === app.globalData.currentUserOpenid)
        if (currentUserMember) {
          this.setData({ currentMemberInfo: currentUserMember })
          console.log('[家庭列表] 当前用户在家庭中的信息:', currentUserMember)
        }
      }
    } catch (err) {
      console.error('[家庭列表] 加载额外数据失败:', err)
    }
  },

  /**
   * 选择家庭
   */
  async selectFamily(e) {
    const { familyid } = e.currentTarget.dataset
    if (familyid === this.data.currentFamilyId) {
      // 如果点击的是当前家庭，进入家庭详情页
      this.goToFamilyManage()
      return
    }

    // 选择新家庭（不返回首页，用户可以继续查看家庭列表）
    await this.selectFamilyById(familyid, false)
  },

  /**
   * 进入家庭管理
   */
  goToFamilyManage() {
    if (!this.data.myFamily) {
      showToast('请先加入或创建家庭')
      return
    }
    wx.navigateTo({ url: '/pages/family/family' })
  },

  /**
   * 显示创建家庭弹窗
   */
  showCreateModal() {
    this.setData({
      showCreateModal: true,
      'formData.familyName': '',
      'formData.creatorNickname': ''
    })
  },

  /**
   * 显示加入家庭弹窗
   */
  showJoinModal() {
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
      showJoinModal: true,
      'formData.inviteCode': '',
      'formData.nickname': ''
    })
  },

  /**
   * 显示分配儿童弹窗
   */
  showChildModal() {
    this.setData({ showChildModal: true })
  },

  /**
   * 显示邀请码弹窗
   */
  showInviteCode() {
    this.setData({ showInviteModal: true })
  },

  /**
   * 关闭所有弹窗
   */
  closeAllModals() {
    this.setData({
      showCreateModal: false,
      showJoinModal: false,
      showChildModal: false,
      showInviteModal: false,
      showAssignChildModal: false
    })
  },

  /**
   * 表单输入
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`formData.${field}`]: e.detail.value
    })
  },

  /**
   * 创建家庭
   */
  async createFamily() {
    const { familyName, creatorNickname } = this.data.formData
    if (!familyName || !familyName.trim()) {
      showToast('请输入家庭名称')
      return
    }
    if (!creatorNickname || !creatorNickname.trim()) {
      showToast('请输入您的身份')
      return
    }

    showLoading()
    try {
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

        // 同时创建本地儿童和任务存储
        wx.setStorageSync(`localChildren_${newFamily.familyId}`, [])
        wx.setStorageSync(`localTasks_${newFamily.familyId}`, [])
        wx.setStorageSync(`localPrizes_${newFamily.familyId}`, [])

        hideLoading()
        showToast('家庭创建成功')
        this.closeAllModals()

        // 自动选择新创建的家庭
        app.saveCurrentFamilyId(newFamily.familyId)
        await app.loadChildren()

        await this.loadAllFamilies()

        // 检查是否有儿童，没有则跳转到添加儿童页面
        const localChildren = wx.getStorageSync(`localChildren_${newFamily.familyId}`) || []
        if (localChildren.length === 0) {
          // 跳转到添加儿童页面
          wx.navigateTo({
            url: '/pages/children/children'
          })
        }
        return
      }

      // 已登录：保存到云端
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'createFamily',
          name: familyName.trim(),
          creatorNickname: creatorNickname.trim()
        }
      })

      hideLoading()
      if (res.result.success) {
        const family = res.result.family

        showToast('家庭创建成功')
        this.closeAllModals()

        // 使缓存失效
        app.invalidateFamiliesListCache()

        // 自动选择新创建的家庭
        app.saveCurrentFamilyId(family.familyId)
        await app.loadChildren()

        await this.loadAllFamilies()

        // 检查是否有儿童，没有则跳转到添加儿童页面
        try {
          const childrenRes = await wx.cloud.callFunction({
            name: 'manageFamilies',
            data: {
              action: 'getFamilyChildren',
              familyId: family.familyId
            }
          })

          if (childrenRes.result.success) {
            const children = childrenRes.result.children || []
            if (children.length === 0) {
              // 跳转到添加儿童页面
              wx.navigateTo({
                url: '/pages/children/children'
              })
            }
          }
        } catch (err) {
          console.error('[家庭列表] 检查儿童失败:', err)
        }
      } else {
        showToast(res.result.error || '创建失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 加入家庭
   */
  async joinFamily() {
    const { inviteCode, nickname } = this.data.formData
    if (!inviteCode || !inviteCode.trim()) {
      showToast('请输入邀请码')
      return
    }
    if (!nickname || !nickname.trim()) {
      showToast('请输入昵称')
      return
    }

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'joinFamily',
          inviteCode: inviteCode.trim().toUpperCase(),
          nickname: nickname.trim()
        }
      })

      hideLoading()
      if (res.result.success) {
        // 使缓存失效
        app.invalidateFamiliesListCache()

        showToast(res.result.message || '申请已提交')
        this.closeAllModals()

        // 重新加载家庭列表
        await this.loadAllFamilies()
      } else {
        showToast(res.result.error || '加入失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 分配儿童到家庭
   */
  async assignChild(e) {
    const { childid } = e.currentTarget.dataset
    const child = this.data.myChildren.find(c => c.childId === childid)

    if (!child || !this.data.myFamily) return

    // 显示分配儿童弹窗
    this.setData({
      showAssignChildModal: true,
      assigningChild: child,
      'assignFormData.initialCoins': 0
    })
  },

  /**
   * 显示分配儿童弹窗
   */
  showAssignChildModal(e) {
    const { childid } = e.currentTarget.dataset
    const child = this.data.myChildren.find(c => c.childId === childid)

    if (child) {
      this.setData({
        showAssignChildModal: true,
        assigningChild: child,
        'assignFormData.initialCoins': 0
      })
    }
  },

  /**
   * 关闭分配儿童弹窗
   */
  closeAssignChildModal() {
    this.setData({
      showAssignChildModal: false,
      assigningChild: null,
      assignFormData: {
        initialCoins: 0
      }
    })
  },

  /**
   * 分配儿童表单输入
   */
  onAssignInputChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`assignFormData.${field}`]: value
    })
  },

  /**
   * 确认分配儿童
   */
  async confirmAssignChild() {
    if (!this.data.assigningChild || !this.data.myFamily) return

    const initialCoins = parseInt(this.data.assignFormData.initialCoins) || 0

    if (initialCoins < 0) {
      showToast('初始金币不能为负数')
      return
    }

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'assignChildToFamily',
          familyId: this.data.myFamily.familyId,
          childId: this.data.assigningChild.childId,
          initialCoins: initialCoins
        }
      })

      hideLoading()
      if (res.result.success) {
        // 清除家庭列表缓存（儿童数可能已变化）
        app.invalidateFamiliesListCache()

        showToast('儿童已添加到家庭')
        this.setData({ showAssignChildModal: false })
        await this.loadAdditionalData(this.data.myFamily.familyId)
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 从分配儿童弹窗跳转到儿童管理页面
   */
  goToAddChildFromModal() {
    // 关闭弹窗
    this.closeAllModals()
    // 跳转到儿童管理页面
    wx.navigateTo({
      url: '/pages/children/children'
    })
  },

  /**
   * 从家庭移除儿童
   */
  async unassignChild(e) {
    const { childid, childname } = e.currentTarget.dataset
    const confirm = await showConfirm(`确定要将"${childname}"从家庭中移除吗？`)
    if (!confirm) return

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'updateChild',
          childId: childid,
          familyIds: []  // 从所有家庭移除
        }
      })

      hideLoading()
      if (res.result.success) {
        showToast('已移除')

        // 重新加载全局儿童数据，确保app.globalData.children是最新的
        await app.loadChildren()

        // 如果移除的是当前选中的儿童，清除选择
        if (app.globalData.currentChildId === childid) {
          app.saveCurrentChildId('')
        }

        await this.loadAdditionalData(this.data.myFamily.familyId)
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 复制邀请码
   */
  copyInviteCode() {
    const { myFamily } = this.data
    if (!myFamily || !myFamily.inviteCode) return

    wx.setClipboardData({
      data: myFamily.inviteCode,
      success: () => showToast('邀请码已复制')
    })
  },

  /**
   * 重新生成邀请码
   */
  async regenInviteCode() {
    if (!this.data.myFamily) return
    const confirm = await showConfirm('重新生成邀请码后，旧邀请码将失效')
    if (!confirm) return

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'regenerateInviteCode',
          familyId: this.data.myFamily.familyId
        }
      })

      hideLoading()
      if (res.result.success) {
        showToast('邀请码已更新')
        this.setData({ 'myFamily.inviteCode': res.result.inviteCode })
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
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
   * 分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '妈妈表扬我 - 邀请家人一起管理孩子的任务和奖励',
      path: '/pages/family-list/family-list',
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
   * 修改成员头像
   */
  async changeMemberAvatar() {
    if (!app.globalData.useCloudStorage) {
      showToast('请先登录')
      return
    }

    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        that.uploadMemberAvatar(filePath)
      }
    })
  },

  /**
   * 上传成员头像
   */
  async uploadMemberAvatar(filePath) {
    const that = this
    const cloudPath = `member_avatars/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`

    showLoading('上传中...')

    try {
      // 上传到云存储
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })

      const fileID = uploadRes.fileID
      console.log('[家庭列表] 头像上传成功，fileID:', fileID)

      // 更新到数据库
      const updateRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'updateMemberAvatar',
          familyId: that.data.currentFamilyId,
          avatar: fileID
        }
      })

      hideLoading()

      if (updateRes.result.success) {
        showToast('头像修改成功')

        // 更新本地数据
        const updatedMember = {
          ...that.data.currentMemberInfo,
          avatar: fileID
        }
        that.setData({ currentMemberInfo: updatedMember })

        // 重新加载成员列表
        await that.loadAdditionalData(that.data.currentFamilyId)
      } else {
        showToast(updateRes.result.error || '修改失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭列表] 上传头像失败:', err)
      showToast('上传失败，请重试')
    }
  },

  /**
   * 编辑成员昵称
   */
  editMemberNickname() {
    if (!app.globalData.useCloudStorage) {
      showToast('请先登录')
      return
    }

    this.setData({
      showEditNicknameModal: true,
      editNicknameValue: this.data.currentMemberInfo?.nickname || ''
    })
  },

  /**
   * 关闭修改昵称弹窗
   */
  closeEditNicknameModal() {
    this.setData({
      showEditNicknameModal: false,
      editNicknameValue: ''
    })
  },

  /**
   * 昵称输入变化
   */
  onNicknameInputChange(e) {
    this.setData({
      editNicknameValue: e.detail.value
    })
  },

  /**
   * 确认修改昵称
   */
  async confirmEditNickname() {
    const newNickname = this.data.editNicknameValue.trim()

    if (!newNickname) {
      showToast('请输入称呼')
      return
    }

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'updateMemberNickname',
          familyId: this.data.currentFamilyId,
          nickname: newNickname
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast('称呼修改成功')

        // 更新本地数据
        const updatedMember = {
          ...this.data.currentMemberInfo,
          nickname: newNickname
        }
        this.setData({ currentMemberInfo: updatedMember })

        // 关闭弹窗
        this.closeEditNicknameModal()

        // 重新加载成员列表
        await this.loadAdditionalData(this.data.currentFamilyId)
      } else {
        showToast(res.result.error || '修改失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭列表] 修改昵称失败:', err)
      showToast('修改失败，请重试')
    }
  },

  /**
   * 格式化日期
   */
  formatDate(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  /**
   * 点击已解散家庭
   */
  onDeletedFamilyTap(e) {
    const { familyname } = e.currentTarget.dataset
    showToast(`"${familyname}" 已解散，请点击下方按钮恢复或彻底删除`)
  },

  /**
   * 恢复家庭
   */
  async restoreFamily(e) {
    const { familyid } = e.currentTarget.dataset

    const confirm = await showConfirm('确定要恢复这个家庭吗？恢复后您将自动成为该家庭的管理员。')
    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'restoreFamily',
          familyId: familyid
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message || '家庭已恢复')

        // 清除缓存并重新加载
        app.invalidateFamiliesListCache()
        await this.loadAllFamilies()
      } else {
        showToast(res.result.error || '恢复失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭列表] 恢复家庭失败:', err)
      showToast('恢复失败，请重试')
    }
  },

  /**
   * 彻底删除家庭
   */
  async permanentlyDeleteFamily(e) {
    const { familyid, familyname } = e.currentTarget.dataset

    const confirm = await showConfirm(
      `确定要彻底删除家庭"${familyname}"吗？\n\n` +
      `此操作不可撤销，将会删除：\n` +
      `• 家庭的所有任务\n` +
      `• 家庭的所有奖品\n` +
      `• 家庭的所有金币记录\n` +
      `• 家庭的所有成员信息\n` +
      `• 家庭记录本身`
    )
    if (!confirm) return

    // 二次确认
    const secondConfirm = await showConfirm('请再次确认：此操作无法撤销，确定要彻底删除吗？')
    if (!secondConfirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'permanentlyDeleteFamily',
          familyId: familyid
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message || '家庭已彻底删除')

        // 清除缓存（确保数据一致性）
        app.invalidateFamiliesListCache()

        // 从本地列表中移除
        const updatedDeletedFamilies = this.data.deletedFamilies.filter(f => f.familyId !== familyid)
        this.setData({ deletedFamilies: updatedDeletedFamilies })
      } else {
        showToast(res.result.error || '删除失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭列表] 彻底删除家庭失败:', err)
      showToast('删除失败，请重试')
    }
  }
})
