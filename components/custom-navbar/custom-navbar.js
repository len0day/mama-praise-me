// components/custom-navbar/custom-navbar.js
const app = getApp()

Component({
  options: {
    multipleSlots: true,
    styleIsolation: 'shared'  // 共享样式，让页面样式可以影响组件，组件样式也可以影响slot
  },

  /**
   * 组件的属性列表
   */
  properties: {
    title: {
      type: String,
      value: '',
      observer(newTitle) {
        // 当 title 属性变化时，不需要额外操作
        // WXML 中直接使用 {{title}} 会自动更新
        console.log('[custom-navbar] title 已更新:', newTitle)
      }
    },
    showBack: {
      type: Boolean,
      value: false
    },
    showHome: {
      type: Boolean,
      value: false
    },
    showSettings: {
      type: Boolean,
      value: false
    },
    backgroundColor: {
      type: String,
      value: ''
    },
    transparent: {
      type: Boolean,
      value: false
    },
    // 使用左侧slot时，是否保持透明背景（让slot内容的样式显示）
    transparentWithSlot: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    // 提供默认值，防止初始渲染时高度为0
    statusBarHeight: 44,  // 默认状态栏高度
    navigationBarHeight: 44,  // 默认导航栏高度
    totalHeight: 88,  // 默认总高度（44+44）
    themeClass: 'theme-light',
    currentBackgroundColor: '#007AFF'
  },

  lifetimes: {
    attached() {
      try {
        // 获取系统信息
        const systemInfo = wx.getSystemInfoSync()
        const statusBarHeight = systemInfo.statusBarHeight || 44
        const navigationBarHeight = systemInfo.platform === 'ios' ? 44 : 48
        const totalHeight = statusBarHeight + navigationBarHeight

        this.setData({
          statusBarHeight,
          navigationBarHeight,
          totalHeight
        })

        // 通知父组件导航栏高度
        this.triggerEvent('navbarchange', {
          totalHeight
        })
      } catch (e) {
        console.error('[custom-navbar] 获取系统信息失败:', e)
        // 使用默认值，不抛出错误
      }

      // 应用主题
      this.applyTheme()
    },

    detached() {
      // 清理定时器
      this.clearThemeTimer()
    }
  },

  pageLifetimes: {
    show() {
      // 页面显示时立即应用主题
      this.applyTheme()
      // 不启动定时器监听，改为通过父组件通知
    },

    hide() {
      // 页面隐藏时清理定时器
      this.clearThemeTimer()
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 启动主题监听
     */
    startThemeObserver() {
      // 先清理已有的定时器
      this.clearThemeTimer()

      // 使用定时器检查主题变化（每2秒检查一次，进一步降低频率）
      this.themeTimer = setInterval(() => {
        try {
          const currentTheme = app.globalData.themeClass || 'theme-light'
          if (currentTheme !== this.data.themeClass) {
            this.applyTheme()
          }
        } catch (e) {
          console.error('[custom-navbar] 主题检查失败:', e)
          // 发生错误时清理定时器，防止继续出错
          this.clearThemeTimer()
        }
      }, 2000)  // 从1000ms改为2000ms，进一步减少频率
    },

    /**
     * 清理主题定时器
     */
    clearThemeTimer() {
      if (this.themeTimer) {
        clearInterval(this.themeTimer)
        this.themeTimer = null
      }
    },

    /**
     * 应用主题
     */
    applyTheme() {
      try {
        const themeClass = app.globalData.themeClass || 'theme-light'
        const backgroundColor = this.properties.backgroundColor

        let currentBackgroundColor = ''
        let navBackgroundColor = ''

        // 如果没有指定背景色，使用主题默认色
        if (!backgroundColor) {
          if (themeClass === 'theme-dark') {
            currentBackgroundColor = '#1C1C1E'
            navBackgroundColor = 'rgba(28, 28, 30, 0.95)'
          } else {
            currentBackgroundColor = '#007AFF'
            navBackgroundColor = 'rgba(245, 245, 245, 0.95)'
          }
        } else {
          currentBackgroundColor = backgroundColor
          navBackgroundColor = backgroundColor
        }

        this.setData({
          themeClass,
          currentBackgroundColor,
          navBackgroundColor
        })
      } catch (e) {
        console.error('[custom-navbar] 应用主题失败:', e)
      }
    },

    /**
     * 返回上一页
     */
    goBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({
          url: '/pages/index/index'
        })
      }
    },

    /**
     * 返回首页
     */
    goHome() {
      wx.switchTab({
        url: '/pages/index/index'
      })
    },

    /**
     * 跳转到设置页面
     */
    goToSettings() {
      wx.navigateTo({
        url: '/pages/settings/settings'
      })
    }
  }
})
