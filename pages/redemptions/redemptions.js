// pages/redemptions/redemptions.js - 已兑换奖品仓库页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    i18n: {},
    redemptions: [],
    currentChild: null,
    isLoading: false
  },

  onLoad() {
    this.setData({ themeClass: app.globalData.themeClass })
    this.loadI18n()
  },

  onShow() {
    this.setData({ currentChild: app.getCurrentChild() })
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
          useSuccess: t('redemptions.useSuccess')
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
    console.log('[奖品仓库] currentChildId:', currentChildId)

    if (!currentChildId) {
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
          data: { childId: currentChildId }  // 不指定 status，获取所有
        }
      })

      console.log('[奖品仓库] 云函数返回:', res.result)

      if (res.result.success) {
        const redemptions = res.result.redemptions || []
        console.log('[奖品仓库] 兑换记录数量:', redemptions.length)

        // 过滤掉已取消的，只显示 pending 和 completed
        const validRedemptions = redemptions.filter(r => r.status !== 'cancelled')

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

        console.log('[奖品仓库] 排序后:', sortedRedemptions)

        // 打印每个兑换记录的详细信息
        sortedRedemptions.forEach((r, index) => {
          console.log(`[奖品仓库] 记录${index}:`, {
            prizeName: r.prizeName,
            status: r.status,
            usedAt: r.usedAt,
            shouldShowButton: r.status === 'completed' && !r.usedAt
          })
        })

        this.setData({ redemptions: sortedRedemptions })
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

    const confirm = await showConfirm(
      t('redemptions.useConfirm') + '\n' + redemption.prizeName
    )
    if (!confirm) return

    showLoading()

    try {
      console.log('[奖品仓库] Calling cloud function with redemptionId:', redemptionid)
      const res = await wx.cloud.callFunction({
        name: 'manageRedemptions',
        data: {
          action: 'usePrize',
          data: { redemptionId: redemptionid }
        }
      })

      console.log('[奖品仓库] Cloud function response:', res)
      hideLoading()

      if (res.result.success) {
        showToast(t('redemptions.useSuccess'))
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
  }
})
