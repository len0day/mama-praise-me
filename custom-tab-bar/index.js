// custom-tab-bar/index.js
const app = getApp()
const { t } = require('../utils/i18n.js')

Component({
  data: {
    selected: 0,
    color: "#666666",
    selectedColor: "#FF9800",
    list: [],
    themeClass: 'theme-light'
  },

  lifetimes: {
    attached() {
      this.loadTabBarText()
      this.applyTheme()
    }
  },

  methods: {
    /**
     * 加载TabBar文本（支持多语言）
     */
    loadTabBarText() {
      const list = [
        {
          pagePath: "/pages/index/index",
          icon: "📋",
          selectedIcon: "📋",
          text: t('tabBar.tasks')
        },
        {
          pagePath: "/pages/prizes/prizes",
          icon: "🎁",
          selectedIcon: "🎁",
          text: t('tabBar.prizes')
        },
        {
          pagePath: "/pages/family-list/family-list",
          icon: "👨‍👩‍👧‍👦",
          selectedIcon: "👨‍👩‍👧‍👦",
          text: "家庭"
        },
        {
          pagePath: "/pages/settings/settings",
          icon: "⚙️",
          selectedIcon: "⚙️",
          text: t('tabBar.settings')
        }
      ]

      this.setData({ list })
    },

    /**
     * 应用主题
     */
    applyTheme() {
      const themeClass = app.globalData.themeClass || 'theme-light'
      this.setData({ themeClass })
    },

    /**
     * 切换Tab
     */
    switchTab(e) {
      const data = e.currentTarget.dataset
      const url = data.path

      wx.switchTab({
        url: url
      })
    }
  }
})
