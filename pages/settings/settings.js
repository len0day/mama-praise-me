// pages/settings/settings.js - 设置页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    isParentMode: false,
    showPasswordModal: false,
    showChangePasswordModal: false,
    changePasswordForm: {
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    },
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
    this.setData({
      themeClass: app.globalData.themeClass,
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

    this.setData({
      currentChild: child,
      isParentMode: app.isParentMode()
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
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
            data: {
              childId: currentChild.childId,
              familyId: currentFamilyId
            }
          }
        }),
        // 获取完成任务数
        wx.cloud.callFunction({
          name: 'manageTasks',
          data: {
            action: 'getAllCompletions',
            data: {
              childId: currentChild.childId,
              familyId: currentFamilyId
            }
          }
        }),
        // 获取兑换奖品数
        wx.cloud.callFunction({
          name: 'manageRedemptions',
          data: {
            action: 'getRedemptions',
            data: {
              childId: currentChild.childId,
              familyId: currentFamilyId
            }
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
   * 切换主题
   */
  async switchTheme(e) {
    const { theme } = e.currentTarget.dataset

    this.setData({
      'settings.theme': theme
    })

    app.globalData.settings.theme = theme
    app.applyTheme()
    app.saveSettingsToStorage()

    // 更新当前页面主题
    this.setData({ themeClass: app.globalData.themeClass })

    // 更新TabBar主题
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().applyTheme()
    }

    showToast(t('settings.themeChanged'))
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

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    this.setData({
      userInfo: userInfo || null,
      isLoggedIn: !!userInfo
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

        // 加载用户设置（包括家长密码）
        if (userData.settings) {
          app.globalData.settings = {
            ...app.globalData.settings,
            ...userData.settings
          }
          app.saveSettingsToStorage()
          console.log('[设置] 已从云端加载用户设置，包括家长密码')
        }

        this.setData({
          userInfo: userData,
          isLoggedIn: true
        })

        showToast('登录成功，正在同步数据...')

        // 同步本地数据到云端
        setTimeout(() => {
          app.syncLocalDataToCloud()
        }, 500)
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
    const confirm = await showConfirm('退出登录后，数据将保存在本地，无法使用家庭功能和云端同步。确定要退出吗？')
    if (!confirm) return

    wx.removeStorageSync('userInfo')
    app.globalData.currentUserOpenid = null
    app.globalData.useCloudStorage = false

    this.setData({
      userInfo: null,
      isLoggedIn: false
    })

    showToast('已退出登录，数据将保存在本地')

    setTimeout(() => {
      wx.reLaunch({
        url: '/pages/index/index'
      })
    }, 500)
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
  }
})
