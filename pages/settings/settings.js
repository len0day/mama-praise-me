// pages/settings/settings.js - 设置页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    colorTone: 'girl',
    isParentMode: false,
    showPasswordModal: false,
    showChangePasswordModal: false,
    showEditNicknameModal: false,
    changePasswordForm: {
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    },
    editNicknameValue: '',
    showOldPassword: false,
    showNewPassword: false,
    showConfirmPassword: false,
    i18n: {},
    settings: {},
    stats: {},
    currentChild: null,
    userInfo: null,  // 用户登录信息
    isLoggedIn: false  // 登录状态
  },

  onLoad() {
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      isParentMode: app.isParentMode(),
      settings: app.globalData.settings
    })
    this.loadI18n()
    this.checkLoginStatus()
  },

  onShow() {
    const child = app.getCurrentChild()
    console.log('[设置] onShow - currentChild:', child)
    console.log('[设置] onShow - currentChild.name:', child ? child.name : 'null')

    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.setData({
      currentChild: child,
      childChar: child ? child.name.substring(0, 1) : '',
      isParentMode: app.isParentMode(),
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
      this.getTabBar().applyTheme()
    }
    this.loadStats()
    this.checkLoginStatus()
  },

  /**
   * 加载国际化文本
   */
  loadI18n() {
    this.setData({
      i18n: {
        settings: {
          title: t('settings.title'),
          dataStatistics: t('settings.dataStatistics'),
          theme: t('settings.theme'),
          lightTheme: t('settings.lightTheme'),
          darkTheme: t('settings.darkTheme'),
          systemTheme: t('settings.systemTheme'),
          language: t('settings.language'),
          management: t('settings.management'),
          childManagement: t('settings.childManagement'),
          taskManagement: t('settings.taskManagement'),
          prizeManagement: t('settings.prizeManagement'),
          logout: t('settings.logout'),
          logoutConfirm: t('settings.logoutConfirm'),
          logoutSuccess: t('toast.logoutSuccess')
        },
        common: {
          noChild: t('children.noChildren')
        },
        firstTimeFlow: {
          logoutConfirm: t('firstTimeFlow.logoutConfirm'),
          askDataRetention: t('firstTimeFlow.askDataRetention'),
          keepLocalData: t('firstTimeFlow.keepLocalData'),
          clearLocalData: t('firstTimeFlow.clearLocalData'),
          logoutSuccessKeep: t('firstTimeFlow.logoutSuccessKeep'),
          logoutSuccessClear: t('firstTimeFlow.logoutSuccessClear')
        }
      }
    })
  },

  /**
   * 加载统计数据
   */
  async loadStats() {
    const currentChild = app.getCurrentChild()
    if (!currentChild) {
      this.setData({ stats: { totalCoins: 0, completedTasks: 0, redeemedPrizes: 0 } })
      return
    }

    const currentFamilyId = app.getCurrentFamilyId()
    if (!currentFamilyId) {
      this.setData({ stats: { totalCoins: 0, completedTasks: 0, redeemedPrizes: 0 } })
      return
    }

    try {
      // 并行查询：金币余额、完成任务数、兑换奖品数
      const [coinsRes, tasksRes, redemptionsRes] = await Promise.all([
        // 获取家庭金币余额
        wx.cloud.callFunction({
          name: 'manageFamilyCoins',
          data: {
            action: 'getChildCoinsInFamily',
            childId: currentChild.childId,
            familyId: currentFamilyId
          }
        }),
        // 获取完成任务数
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getAllCompletions',
            childId: currentChild.childId,
            familyId: currentFamilyId
          }
        }),
        // 获取兑换奖品数
        wx.cloud.callFunction({
          name: 'manageRedemptions',
          data: {
            action: 'getRedemptions',
            childId: currentChild.childId,
            familyId: currentFamilyId
          }
        })
      ])

      // 统计数据
      const totalCoins = coinsRes.result.success ? (coinsRes.result.balance || 0) : 0
      const completedTasks = tasksRes.result.success ? (tasksRes.result.completions?.length || 0) : 0
      const redeemedPrizes = redemptionsRes.result.success ? (redemptionsRes.result.redemptions?.length || 0) : 0

      console.log('[设置] 统计数据:', { totalCoins, completedTasks, redeemedPrizes })

      this.setData({
        stats: {
          totalCoins,
          completedTasks,
          redeemedPrizes
        }
      })
    } catch (err) {
      console.error('[设置] 加载统计数据失败:', err)
      // 失败时使用儿童的基础数据
      this.setData({
        stats: {
          totalCoins: currentChild.familyCoins || 0,
          completedTasks: currentChild.completedTasks || 0,
          redeemedPrizes: currentChild.redeemedPrizes || 0
        }
      })
    }
  },

  /**
   * 切换主题风格
   */
  async switchThemeStyle(e) {
    const { style } = e.currentTarget.dataset

    this.setData({
      'settings.themeStyle': style
    })

    app.globalData.settings.themeStyle = style
    app.applyTheme()
    app.saveSettingsToStorage()

    // 更新当前页面主题
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(style)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: app.globalData.themeStyle,
      colorTone: app.globalData.colorTone,
      isFunTheme: isFunTheme
    })

    // 更新TabBar主题
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().applyTheme()
    }

    showToast('风格已切换')
  },

  /**
   * 切换语言
   */
  async switchLanguage(e) {
    const { locale } = e.currentTarget.dataset

    this.setData({
      'settings.locale': locale
    })

    app.globalData.settings.locale = locale
    app.saveSettingsToStorage()

    // 重新加载页面
    this.onLoad()
    this.onShow()

    showToast(t('settings.languageChanged'))
  },

  async checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    const isLoggedIn = !!userInfo
    
    let displayName = '点击登录账号'
    let displayChar = '👤'
    let avatarUrl = ''
    
    if (isLoggedIn) {
      displayName = userInfo.nickname || userInfo.nickName || '未设置昵称'
      displayChar = displayName.substring(0, 1)
      avatarUrl = userInfo.avatar || userInfo.avatarUrl || ''
      
      // 如果是云端ID，转换为临时URL
      if (avatarUrl && avatarUrl.startsWith('cloud://')) {
        try {
          const res = await wx.cloud.getTempFileURL({
            fileList: [avatarUrl]
          })
          if (res.fileList[0].status === 0) {
            avatarUrl = res.fileList[0].tempFileURL
          }
        } catch (err) {
          console.error('[设置] 转换头像URL失败:', err)
        }
      }
    }

    this.setData({
      userInfo: userInfo || null,
      isLoggedIn: isLoggedIn,
      displayName: displayName,
      displayChar: displayChar,
      userAvatarUrl: avatarUrl
    })
  },

  /**
   * 登录
   */
  async login() {
    try {
      const res = await wx.getUserProfile({
        desc: '用于保存您的设置和历史记录'
      })

      console.log('[设置] getUserProfile 成功:', res)

      // 调用云函数登录
      const cloudRes = await wx.cloud.callFunction({
        name: 'login',
        data: {
          userInfo: res.userInfo
        }
      })

      console.log('[设置] 云函数返回:', cloudRes)

      if (cloudRes.result.success) {
        const userData = cloudRes.result.data

        // 保存用户信息
        wx.setStorageSync('userInfo', userData)
        app.globalData.currentUserOpenid = userData.openid
        app.globalData.useCloudStorage = true

        // 合并云端设置（主题本地优先；本机未设家长密码时用云端，避免把云端密码冲掉）
        app.mergeUserSettingsAfterLogin(userData)
        if (typeof app.invalidateFamiliesListCache === 'function') {
          app.invalidateFamiliesListCache()
        }
        console.log('[设置] 已合并登录用户设置')

        this.checkLoginStatus()
        showToast('登录成功')

        // 检查数据同步情况
        setTimeout(async () => {
          console.log('[设置] 开始检查数据同步...')
          const syncResult = await app.syncLocalDataToCloud()
          console.log('[设置] 数据同步结果:', syncResult)

          if (syncResult === 'conflict') {
            // 数据冲突，让用户选择
            console.log('[设置] 显示数据冲突对话框')
            // 使用 nextTick 确保 UI 更新完成
            await new Promise(resolve => setTimeout(resolve, 100))
            this.showDataConflictDialog()
          } else {
            // 'sync', 'none', 'error' 都需要加载数据并自动选择
            console.log('[设置] 加载云端数据并自动选择')
            await app.loadChildren()
            await this.loadAndSelectFamily()

            // 刷新所有Tab页面
            const pages = getCurrentPages()
            pages.forEach(page => {
              if (page && page.onShow) {
                try {
                  page.onShow()
                } catch (e) {
                  console.error('[设置] 刷新页面失败:', e)
                }
              }
            })

            if (syncResult === 'sync') {
              showToast('本地数据已同步到云端')
            }
          }
        }, 800)
      } else {
        showToast('登录失败: ' + (cloudRes.result.error || '未知错误'))
      }
    } catch (err) {
      console.error('[设置] 登录失败:', err)
      if (err.errMsg && err.errMsg.includes('getUserProfile:fail')) {
        showToast('您取消了授权')
      } else {
        showToast('登录失败: ' + err.message)
      }
    }
  },

  /**
   * 加载并自动选择第一个家庭
   */
  async loadAndSelectFamily() {
    try {
      // 获取所有家庭
      const familiesRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getAllMyFamilies'
        }
      })

      if (familiesRes.result.success) {
        const families = familiesRes.result.families || []
        if (families.length > 0) {
          // 选择第一个家庭
          const firstFamily = families[0]
          app.saveCurrentFamilyId(firstFamily.familyId)

          // 加载该家庭的儿童
          const childrenRes = await wx.cloud.callFunction({
            name: 'manageFamilies',
            data: {
              action: 'getFamilyChildren',
              familyId: firstFamily.familyId
            }
          })

          if (childrenRes.result.success) {
            const children = childrenRes.result.children || []
            if (children.length > 0) {
              // 优先选择上次选择的儿童，否则选择第一个
              const familyConfig = wx.getStorageSync('familyConfig') || {}
              const savedChildId = familyConfig[firstFamily.familyId]?.currentChildId

              const childToSelect = savedChildId
                ? children.find(c => c.childId === savedChildId)
                : children[0]

              if (childToSelect) {
                app.saveCurrentChildId(childToSelect.childId)
                console.log('[设置] 自动选择家庭和儿童:', firstFamily.name, childToSelect.name)
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[设置] 自动选择家庭失败:', err)
    }
  },

  /**
   * 显示数据冲突对话框
   */
  showDataConflictDialog() {
    console.log('[设置] showDataConflictDialog 被调用')
    wx.hideToast() // 先隐藏可能存在的 toast

    setTimeout(() => {
      wx.showModal({
        title: '数据同步',
        content: '检测到本地和云端都有数据\n\n本地数据：将本地数据上传到云端，覆盖云端数据\n云端数据：清除本地数据，使用云端数据',
        confirmText: '本地数据',
        cancelText: '云端数据',
        editable: false,
        success: async (res) => {
          console.log('[设置] 用户选择结果:', res)
          if (res.confirm) {
            // 用户选择使用本地数据
            try {
              wx.showLoading({ title: '同步中...' })
              const localFamilies = wx.getStorageSync('localFamilies') || []

              // 从每个家庭中收集儿童数据
              const localChildrenData = {}
              localFamilies.forEach(family => {
                const familyChildren = wx.getStorageSync(`localChildren_${family.familyId}`) || []
                if (familyChildren.length > 0) {
                  localChildrenData[family.familyId] = familyChildren
                }
              })

              await app.uploadLocalDataToCloud(localFamilies, localChildrenData)
              wx.hideLoading()
              showToast('本地数据已同步到云端')
              await app.loadChildren()
              await this.loadAndSelectFamily()

              // 刷新所有Tab页面
              const pages = getCurrentPages()
              pages.forEach(page => {
                if (page && page.onShow) {
                  try {
                    page.onShow()
                  } catch (e) {
                    console.error('[设置] 刷新页面失败:', e)
                  }
                }
              })
            } catch (err) {
              wx.hideLoading()
              showToast('同步失败')
            }
          } else if (res.cancel) {
            // 用户点击取消（云端数据），显示确认对话框
            this.showCloudDataDialog()
          }
        },
        fail: (err) => {
          console.error('[设置] showModal 失败:', err)
        }
      })
    }, 300)
  },

  /**
   * 显示云端数据选项对话框
   */
  showCloudDataDialog() {
    wx.hideToast()

    setTimeout(() => {
      wx.showModal({
        title: '数据同步',
        content: '是否使用云端数据覆盖本地数据？\n\n本地数据将被清除。',
        confirmText: '云端数据',
        cancelText: '取消',
        success: async (res) => {
          if (res.confirm) {
            // 用户选择使用云端数据
            try {
              wx.showLoading({ title: '处理中...' })
              await app.downloadCloudDataToLocal()
              wx.hideLoading()
              showToast('已切换到云端数据')
              // 重新加载页面
              this.onLoad()
              this.onShow()
            } catch (err) {
              wx.hideLoading()
              showToast('操作失败')
            }
          }
        }
      })
    }, 300)
  },

  /**
   * 跳转到孩子管理
   */
  goToChildren() {
    wx.navigateTo({
      url: '/pages/children/children'
    })
  },

  /**
   * 跳转到任务管理
   */
  goToTasks() {
    // 检查是否已选择家庭
    const currentFamilyId = app.getCurrentFamilyId()

    if (!currentFamilyId) {
      wx.showModal({
        title: '需要选择家庭',
        content: '任务管理是以家庭为单位的，请先选择或创建一个家庭',
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

    // 已有家庭，直接进入
    wx.navigateTo({
      url: '/pages/tasks/tasks'
    })
  },

  /**
   * 跳转到家庭管理
   */
  goToFamily() {
    wx.switchTab({
      url: '/pages/family-list/family-list'
    })
  },

  /**
   * 跳转到奖品管理
   */
  goToPrizes() {
    // 检查是否已选择家庭
    const currentFamilyId = app.getCurrentFamilyId()

    if (!currentFamilyId) {
      wx.showModal({
        title: '需要选择家庭',
        content: '奖品管理是以家庭为单位的，请先选择或创建一个家庭',
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

    // 已有家庭，直接进入
    wx.navigateTo({
      url: '/pages/prize-management/prize-management'
    })
  },

  /**
   * 退出登录
   */
  async logout() {
    const confirm = await showConfirm(t('firstTimeFlow.logoutConfirm'))
    if (!confirm) return

    // 用户确认退出，询问数据处理
    this.askAboutDataRetention()
  },

  /**
   * 询问数据保留方式
   */
  askAboutDataRetention() {
    wx.hideToast()

    setTimeout(() => {
      wx.showModal({
        title: t('firstTimeFlow.askDataRetention'),
        confirmText: t('firstTimeFlow.keepLocalData'),
        cancelText: t('firstTimeFlow.clearLocalData'),
        success: (res) => {
          if (res.confirm) {
            // 保留本地数据
            this.performLogoutKeepData()
          } else {
            // 清空本地数据
            this.performLogoutClearData()
          }
        }
      })
    }, 300)
  },

  /**
   * 退出登录并保留数据
   */
  performLogoutKeepData() {
    // 保留所有本地数据，仅清除登录信息
    app.globalData.useCloudStorage = false
    app.globalData.currentUserOpenid = null
    if (typeof app.invalidateFamiliesListCache === 'function') {
      app.invalidateFamiliesListCache()
    }
    wx.removeStorageSync('userInfo')

    showToast(t('firstTimeFlow.logoutSuccessKeep'))

    setTimeout(() => {
      wx.reLaunch({
        url: '/pages/index/index'
      })
    }, 1500)
  },

  /**
   * 退出登录并清空数据
   */
  performLogoutClearData() {
    // 保存用户设置（主题、语言等）
    const savedSettings = wx.getStorageSync('appSettings')
    const savedTheme = wx.getStorageSync('theme')
    const savedLocale = wx.getStorageSync('locale')
    const savedParentPassword = wx.getStorageSync('parentPassword')
    const savedHasCompletedWizard = wx.getStorageSync('hasCompletedWizard')

    // 清空所有本地数据
    wx.clearStorageSync()

    // 恢复用户设置
    if (savedSettings) wx.setStorageSync('appSettings', savedSettings)
    if (savedTheme) wx.setStorageSync('theme', savedTheme)
    if (savedLocale) wx.setStorageSync('locale', savedLocale)
    if (savedParentPassword) wx.setStorageSync('parentPassword', savedParentPassword)
    if (savedHasCompletedWizard) wx.setStorageSync('hasCompletedWizard', savedHasCompletedWizard)

    // 重置全局状态
    app.globalData.useCloudStorage = false
    app.globalData.currentUserOpenid = null
    app.globalData.currentFamilyId = null
    app.globalData.currentChildId = null
    app.globalData.families = []
    app.globalData.children = []
    app.globalData.settings = savedSettings || app.globalData.settings
    if (typeof app.invalidateFamiliesListCache === 'function') {
      app.invalidateFamiliesListCache()
    }

    // 应用主题
    app.applyTheme()

    showToast(t('firstTimeFlow.logoutSuccessClear'))

    setTimeout(() => {
      wx.reLaunch({
        url: '/pages/index/index'
      })
    }, 1500)
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
      // 进入家长模式
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
   * 显示修改密码弹窗
   */
  showChangePasswordModal() {
    console.log('[设置] showChangePasswordModal 被调用')
    this.setData({
      showChangePasswordModal: true,
      changePasswordForm: {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      },
      showOldPassword: false,
      showNewPassword: false,
      showConfirmPassword: false
    })
    console.log('[设置] showChangePasswordModal 已设置为:', this.data.showChangePasswordModal)
  },

  /**
   * 关闭修改密码弹窗
   */
  closeChangePasswordModal() {
    this.setData({
      showChangePasswordModal: false
    })
  },

  /**
   * 修改密码表单输入
   */
  onChangePasswordInput(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`changePasswordForm.${field}`]: value
    })
  },

  /**
   * 切换旧密码可见性
   */
  toggleOldPasswordVisibility() {
    this.setData({
      showOldPassword: !this.data.showOldPassword
    })
  },

  /**
   * 切换新密码可见性
   */
  toggleNewPasswordVisibility() {
    this.setData({
      showNewPassword: !this.data.showNewPassword
    })
  },

  /**
   * 切换确认密码可见性
   */
  toggleConfirmPasswordVisibility() {
    this.setData({
      showConfirmPassword: !this.data.showConfirmPassword
    })
  },

  /**
   * 修复图片链接
   */
  async fixImageUrls() {
    const confirm = await showConfirm('此功能将检查并标记需要重新上传的图片（头像和奖品图片）。是否继续？')
    if (!confirm) return

    showLoading('检查中...')

    try {
      const res = await wx.cloud.callFunction({
        name: 'fixImageUrls',
        data: {
          action: 'checkImages'
        }
      })

      hideLoading()

      if (res.result.success) {
        const { needUpdate, count } = res.result

        if (count === 0) {
          showToast('所有图片链接正常')
          return
        }

        // 显示需要修复的图片列表
        const message = needUpdate.map(item => {
          const name = item.type === 'child' ? item.name : `奖品: ${item.name}`
          return `${name}\n当前: ${item.type === 'child' ? item.currentAvatar : item.currentImage}`
        }).join('\n\n')

        wx.showModal({
          title: `发现 ${count} 个图片需要修复`,
          content: `这些图片使用了临时链接或非云存储链接，请重新上传：\n\n${message.substring(0, 200)}...`,
          confirmText: '知道了',
          showCancel: false
        })
      } else {
        showToast('检查失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[设置] 检查图片失败:', err)
      showToast('检查失败')
    }
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止点击弹窗内容时触发关闭
  },

  /**
   * 确认修改密码
   */
  confirmChangePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data.changePasswordForm

    if (!oldPassword) {
      showToast('请输入旧密码')
      return
    }

    if (!newPassword || newPassword.length < 4) {
      showToast('新密码至少4位')
      return
    }

    if (newPassword !== confirmPassword) {
      showToast('两次输入的新密码不一致')
      return
    }

    const success = app.changeParentPassword(oldPassword, newPassword)

    if (success) {
      showToast('密码修改成功')
      this.closeChangePasswordModal()
    } else {
      showToast('旧密码错误')
    }
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '妈妈表扬我 - 儿童任务奖励管理小程序',
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
   * 修改用户头像
   */
  async changeUserAvatar() {
    if (!this.data.isLoggedIn) {
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
        that.uploadUserAvatar(filePath)
      }
    })
  },

  /**
   * 上传用户头像
   */
  async uploadUserAvatar(filePath) {
    const that = this
    const cloudPath = `user_avatars/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`

    wx.showLoading({ title: '上传中...' })

    try {
      // 上传到云存储
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })

      const fileID = uploadRes.fileID
      console.log('[设置] 头像上传成功，fileID:', fileID)

      // 更新到数据库
      const updateRes = await wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: {
          avatar: fileID
        }
      })

      wx.hideLoading()

      if (updateRes.result.success) {
        showToast('头像修改成功')

        // 更新本地存储
        const userInfo = that.data.userInfo
        userInfo.avatar = fileID
        wx.setStorageSync('userInfo', userInfo)

        // 更新页面数据
        that.checkLoginStatus()
      } else {
        showToast(updateRes.result.error || '修改失败')
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[设置] 上传头像失败:', err)
      showToast('上传失败，请重试')
    }
  },

  /**
   * 编辑昵称
   */
  editNickname() {
    if (!this.data.isLoggedIn) {
      showToast('请先登录')
      return
    }

    this.setData({
      showEditNicknameModal: true,
      editNicknameValue: this.data.userInfo?.nickname || ''
    })
  },

  /**
   * 关闭编辑昵称弹窗
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
      showToast('请输入昵称')
      return
    }

    wx.showLoading({ title: '保存中...' })

    try {
      const res = await wx.cloud.callFunction({
        name: 'updateUserInfo',
        data: {
          nickname: newNickname
        }
      })

      wx.hideLoading()

      if (res.result.success) {
        showToast('昵称修改成功')

        // 更新本地存储
        const userInfo = this.data.userInfo
        userInfo.nickname = newNickname
        wx.setStorageSync('userInfo', userInfo)
        this.checkLoginStatus()

        // 关闭弹窗
        this.closeEditNicknameModal()
      } else {
        showToast(res.result.error || '修改失败')
      }
    } catch (err) {
      wx.hideLoading()
      console.error('[设置] 修改昵称失败:', err)
      showToast('修改失败，请重试')
    }
  }
})
