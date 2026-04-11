// pages/coins/coins.js - 金币历史页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, formatDate } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    i18n: {},
    records: [],
    currentChild: null,
    isLoading: false,
    totalEarned: 0,
    totalSpent: 0
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
    this.loadI18n()
  },

  onShow() {
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme
    })
    this.setData({ currentChild: app.getCurrentChild() })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
      this.getTabBar().applyTheme()
    }
    this.loadRecords()
  },

  /**
   * 加载国际化文本
   */
  loadI18n() {
    this.setData({
      i18n: {
        coins: {
          title: t('coins.title'),
          myCoins: t('coins.myCoins'),
          totalEarned: t('coins.totalEarned'),
          totalSpent: t('coins.totalSpent'),
          currentBalance: t('coins.currentBalance'),
          coinHistory: t('coins.coinHistory'),
          earned: t('coins.earned'),
          spent: t('coins.spent'),
          taskComplete: t('coins.taskComplete'),
          prizeRedeem: t('coins.prizeRedeem'),
          prizeRedeemCancel: t('coins.prizeRedeemCancel'),
          manualAdjust: t('coins.manualAdjust'),
          noRecords: t('coins.noRecords')
        },
        common: {
          addChild: t('children.addChild'),
          loading: t('common.loading')
        },
        toast: {
          operationFailed: t('toast.operationFailed')
        }
      }
    })
  },

  async loadRecords() {
    const currentChildId = app.globalData.currentChildId
    if (!currentChildId) {
      this.setData({ records: [], totalEarned: 0, totalSpent: 0 })
      return
    }

    this.setData({ isLoading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageCoins',
        data: {
          action: 'getCoinRecords',
          childId: currentChildId,
          limit: 100
        }
      })

      if (res.result.success) {
        const records = res.result.records

        // 计算总获得和总消耗
        let earned = 0
        let spent = 0
        records.forEach(record => {
          if (record.amount > 0) {
            earned += record.amount
          } else {
            spent += Math.abs(record.amount)
          }
        })

        this.setData({
          records: records,
          totalEarned: earned,
          totalSpent: spent
        })
      }
    } catch (err) {
      console.error('[金币历史] 加载失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      this.setData({ isLoading: false })
    }
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    // 如果是今天，显示时间
    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
      return date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    // 否则显示日期
    return formatDate(date, 'MM-DD HH:mm')
  },

  /**
   * 获取记录类型文本
   */
  getRecordTypeText(type) {
    return t('coins.' + type) || type
  },

  /**
   * 获取记录类型图标
   */
  getRecordTypeIcon(type) {
    const icons = {
      'task_complete': '✅',
      'prize_redeem': '🎁',
      'prize_redeem_cancel': '↩️',
      'manual_adjust': '✏️'
    }
    return icons[type] || '🪙'
  },

  /**
   * 获取记录类型颜色类
   */
  getRecordTypeClass(type) {
    if (type === 'task_complete' || type === 'prize_redeem_cancel') {
      return 'earned'
    } else if (type === 'prize_redeem') {
      return 'spent'
    }
    return ''
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
   * 分享给朋友
   */
  onShareAppMessage() {
    const currentChild = app.getCurrentChild()
    return {
      title: currentChild
        ? `${currentChild.name}的金币记录`
        : '妈妈表扬我 - 金币记录',
      path: '/pages/coins/coins',
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
