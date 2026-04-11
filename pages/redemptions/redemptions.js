// pages/redemptions/redemptions.js - 已兑换奖品仓库页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    i18n: {},
    redemptions: [],
    currentChild: null,
    isLoading: false,
    showUseModal: false,  // 使用数量选择弹窗
    selectedRedemption: null,  // 选中的兑换记录
    useQuantity: 1,  // 使用数量
    showHistoryModal: false,  // 使用历史弹窗
    historyRedemption: null,  // 查看历史的兑换记录
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
    const child = app.getCurrentChild()
    console.log('[奖品仓库] onShow - currentChild:', child)
    console.log('[奖品仓库] onShow - currentChild.name:', child ? child.name : 'null')
    this.setData({ currentChild: child })
    this.loadRedemptions()
  },

  /**
   * 加载国际化文本
   */
  loadI18n() {
    this.setData({
      i18n: {
        redemptions: {
          title: t('redemptions.title'),
          myPrizes: t('redemptions.myPrizes'),
          used: t('redemptions.used'),
          notUsed: t('redemptions.notUsed'),
          useConfirm: t('redemptions.useConfirm'),
          usedAt: t('redemptions.usedAt'),
          noPrizes: t('redemptions.noPrizes'),
          useSuccess: t('redemptions.useSuccess'),
          pending: t('redemptions.pending'),
          use: t('redemptions.use')
        },
        common: {
          noChild: t('children.noChildren'),
          loading: t('common.loading')
        }
      }
    })
  },

  async loadRedemptions() {
    const currentChildId = app.globalData.currentChildId
    const currentFamilyId = app.getCurrentFamilyId()
    console.log('[奖品仓库] currentChildId:', currentChildId)
    console.log('[奖品仓库] currentFamilyId:', currentFamilyId)

    if (!currentChildId || !currentFamilyId) {
      this.setData({ redemptions: [] })
      return
    }

    this.setData({ isLoading: true })

    try {
      // 获取所有兑换记录（包括 pending 和 completed）
      const res = await wx.cloud.callFunction({
        name: 'manageRedemptions',
        data: {
          action: 'getRedemptions',
          childId: currentChildId,
          familyId: currentFamilyId  // ✅ 添加 familyId 参数
        }
      })

      console.log('[奖品仓库] 云函数返回:', res.result)

      if (res.result.success) {
        const redemptions = res.result.redemptions || []
        console.log('[奖品仓库] 兑换记录数量:', redemptions.length)
        console.log('[奖品仓库] 兑换记录详情:', redemptions.map(r => ({
          redemptionId: r.redemptionId,
          _id: r._id,
          prizeName: r.prizeName,
          prizeImage: r.prizeImage,
          coinCost: r.coinCost,
          status: r.status
        })))

        // 为每条记录添加 redemptionId（如果不存在则使用 _id）
        const redemptionsWithId = redemptions.map(r => ({
          ...r,
          redemptionId: r.redemptionId || r._id
        }))

        // 过滤掉已取消的，只显示 pending 和 completed
        const validRedemptions = redemptionsWithId.filter(r => r.status !== 'cancelled')

        // 按状态和时间排序：pending和未使用的在前，已使用的在后
        const sortedRedemptions = validRedemptions.sort((a, b) => {
          // 待兑换的最前
          if (a.status === 'pending' && b.status !== 'pending') return -1
          if (a.status !== 'pending' && b.status === 'pending') return 1

          // 已兑换但未使用的在前
          if (a.status === 'completed' && !a.usedAt && (b.status !== 'completed' || b.usedAt)) return -1
          if ((a.status !== 'completed' || a.usedAt) && b.status === 'completed' && !b.usedAt) return 1

          // 按时间倒序
          return new Date(b.redeemedAt) - new Date(a.redeemedAt)
        })

        console.log('[奖品仓库] 排序后:', sortedRedemptions.map(r => ({
          redemptionId: r.redemptionId,
          prizeName: r.prizeName,
          hasPrizeImage: !!r.prizeImage,
          coinCost: r.coinCost,
          status: r.status
        })))

        // 打印每个兑换记录的详细信息
        sortedRedemptions.forEach((r, index) => {
          console.log(`[奖品仓库] 记录${index}:`, {
            prizeName: r.prizeName,
            status: r.status,
            usedAt: r.usedAt,
            shouldShowButton: r.status === 'completed' && !r.usedAt
          })
        })

        // 预处理数据：格式化时间和设置默认值
        const processedRedemptions = sortedRedemptions.map(r => ({
          ...r,
          // 兼容旧数据：如果没有 quantity 字段，默认为 1
          quantity: r.quantity || 1,
          // 兼容旧数据：如果没有 remainingQuantity 字段，根据 usedAt 判断
          remainingQuantity: r.remainingQuantity !== undefined ? r.remainingQuantity : (r.usedAt ? 0 : (r.quantity || 1)),
          formattedRedeemedAt: this.formatTime(r.redeemedAt),
          formattedUsedAt: r.usedAt ? this.formatTime(r.usedAt) : ''
        }))

        this.setData({ redemptions: processedRedemptions })

        // 打印最终的数据结构
        console.log('[奖品仓库] setData 后的 redemptions:', this.data.redemptions.map(r => ({
          redemptionId: r.redemptionId,
          prizeName: r.prizeName,
          prizeImage: r.prizeImage,
          coinCost: r.coinCost,
          status: r.status,
          redeemedAt: r.redeemedAt,
          formattedRedeemedAt: r.formattedRedeemedAt
        })))

        // 打印 i18n 数据
        console.log('[奖品仓库] i18n 数据:', this.data.i18n)

        // 检查 currentChild
        console.log('[奖品仓库] currentChild:', this.data.currentChild)
      } else {
        console.error('[奖品仓库] 获取失败:', res.result.error)
        showToast(res.result.error || '获取失败')
      }
    } catch (err) {
      console.error('[奖品仓库] 加载失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      this.setData({ isLoading: false })
    }
  },

  /**
   * 使用奖品
   */
  async usePrize(e) {
    console.log('[奖品仓库] usePrize called, event:', e)
    console.log('[奖品仓库] dataset:', e.currentTarget.dataset)

    const { redemptionid } = e.currentTarget.dataset
    console.log('[奖品仓库] redemptionid:', redemptionid)

    const redemption = this.data.redemptions.find(r => r.redemptionId === redemptionid)
    console.log('[奖品仓库] found redemption:', redemption)

    if (!redemption) {
      console.error('[奖品仓库] Redemption not found for id:', redemptionid)
      showToast('兑换记录不存在')
      return
    }

    // 检查是否有剩余数量
    const remainingQuantity = redemption.remainingQuantity || redemption.quantity || 1

    if (remainingQuantity > 1) {
      // 如果有多个，显示数量选择弹窗
      this.setData({
        selectedRedemption: redemption,
        useQuantity: 1,
        showUseModal: true
      })
    } else {
      // 只有一个，直接使用
      this.confirmUsePrize(redemption, 1)
    }
  },

  /**
   * 关闭使用弹窗
   */
  closeUseModal() {
    this.setData({
      showUseModal: false,
      selectedRedemption: null,
      useQuantity: 1
    })
  },

  /**
   * 增加使用数量
   */
  increaseUseQuantity() {
    const maxQuantity = this.data.selectedRedemption.remainingQuantity || this.data.selectedRedemption.quantity || 1
    if (this.data.useQuantity < maxQuantity) {
      this.setData({
        useQuantity: this.data.useQuantity + 1
      })
    } else {
      showToast(`最多只能使用 ${maxQuantity} 个`)
    }
  },

  /**
   * 减少使用数量
   */
  decreaseUseQuantity() {
    if (this.data.useQuantity > 1) {
      this.setData({
        useQuantity: this.data.useQuantity - 1
      })
    }
  },

  /**
   * 使用数量输入
   */
  onUseQuantityInput(e) {
    const value = parseInt(e.detail.value) || 1
    const maxQuantity = this.data.selectedRedemption.remainingQuantity || this.data.selectedRedemption.quantity || 1

    if (value < 1) {
      this.setData({ useQuantity: 1 })
    } else if (value > maxQuantity) {
      this.setData({ useQuantity: maxQuantity })
      showToast(`最多只能使用 ${maxQuantity} 个`)
    } else {
      this.setData({ useQuantity: value })
    }
  },

  /**
   * 快捷选择使用数量
   */
  quickSelectUseQuantity(e) {
    const qty = parseInt(e.currentTarget.dataset.qty)
    const maxQuantity = this.data.selectedRedemption.remainingQuantity || this.data.selectedRedemption.quantity || 1

    if (qty > maxQuantity) {
      showToast(`最多只能使用 ${maxQuantity} 个`)
      return
    }

    this.setData({ useQuantity: qty })
  },

  /**
   * 确认使用奖品（从弹窗调用）
   */
  async confirmUseFromModal() {
    const { selectedRedemption, useQuantity } = this.data
    await this.confirmUsePrize(selectedRedemption, useQuantity)
  },

  /**
   * 确认使用奖品
   */
  async confirmUsePrize(redemption, quantity) {
    const confirm = await showConfirm(
      `确定要使用 ${quantity} 个"${redemption.prizeName}"吗？`
    )
    if (!confirm) {
      this.closeUseModal()
      return
    }

    showLoading()

    try {
      console.log('[奖品仓库] Calling cloud function with redemptionId:', redemption.redemptionId, 'quantity:', quantity)
      const res = await wx.cloud.callFunction({
        name: 'manageRedemptions',
        data: {
          action: 'usePrize',
          redemptionId: redemption.redemptionId,
          quantity: quantity
        }
      })

      console.log('[奖品仓库] Cloud function response:', res)
      hideLoading()

      if (res.result.success) {
        showToast(t('redemptions.useSuccess'))
        this.closeUseModal()
        await this.loadRedemptions()
      } else {
        console.error('[奖品仓库] Cloud function error:', res.result.error)
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[奖品仓库] 使用失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 查看使用历史
   */
  viewHistory(e) {
    const { redemptionid } = e.currentTarget.dataset
    const redemption = this.data.redemptions.find(r => r.redemptionId === redemptionid)

    if (!redemption) {
      showToast('兑换记录不存在')
      return
    }

    this.setData({
      historyRedemption: redemption,
      showHistoryModal: true
    })
  },

  /**
   * 关闭历史弹窗
   */
  closeHistoryModal() {
    this.setData({
      showHistoryModal: false,
      historyRedemption: null
    })
  },

  /**
   * 格式化使用历史时间
   */
  formatHistoryTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    // 小于1小时
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000)
      return minutes === 0 ? '刚刚' : `${minutes}分钟前`
    }

    // 小于24小时
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000)
      return `${hours}小时前`
    }

    // 小于7天
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000)
      return `${days}天前`
    }

    // 其他情况显示完整日期
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
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
        ? `${currentChild.name}的奖励兑换记录`
        : '妈妈表扬我 - 奖励兑换记录',
      path: '/pages/redemptions/redemptions',
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
