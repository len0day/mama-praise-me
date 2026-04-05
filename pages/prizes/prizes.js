const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    currentChild: null,
    prizes: [],
    affordablePrizes: [],
    childCoins: 0,
    coinRecords: [],  // 金币历史记录
    showCoinHistory: false,  // 是否显示金币历史
    isLoading: false,
    currentCategory: 'all',
    categories: [
      { value: 'all', label: '全部' },
      { value: 'toys', label: '玩具' },
      { value: 'food', label: '食物' },
      { value: 'outings', label: '外出' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad() {
    this.setData({ themeClass: app.globalData.themeClass })
  },

  async onShow() {
    console.log('[奖品商城] onShow 开始')
    const child = app.getCurrentChild()
    console.log('[奖品商城] onShow - currentChild:', child)
    console.log('[奖品商城] onShow - currentChild.name:', child ? child.name : 'null')

    // 检查是否有家庭
    if (!app.getCurrentFamilyId()) {
      this.setData({
        currentChild: null,
        prizes: [],
        childCoins: 0,
        needFamily: true
      })
      return
    }

    // 加载孩子数据（根据登录状态自动选择本地或云端）
    await app.loadChildren()

    // 获取当前孩子
    const currentChild = app.getCurrentChild()
    console.log('[奖品商城] 当前孩子:', currentChild)

    // 补充家庭信息和金币余额
    if (currentChild && currentChild.familyId) {
      const enrichedChild = await this.enrichChildInfo(currentChild)
      console.log('[奖品商城] 补充后的孩子信息:', enrichedChild)
      console.log('[奖品商城] 补充后的金币:', enrichedChild.familyCoins)
      this.setData({
        currentChild: enrichedChild,
        childCoins: enrichedChild.familyCoins || 0,
        needFamily: false
      })
    } else {
      this.setData({ currentChild, needFamily: false })
    }

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
      this.getTabBar().applyTheme()
    }
    this.loadPrizes()
  },

  /**
   * 补充儿童信息（家庭名称和金币余额）
   */
  async enrichChildInfo(child) {
    try {
      // 获取当前家庭ID
      const currentFamilyId = app.getCurrentFamilyId()

      // 如果儿童的家庭ID和当前家庭ID不一致，不显示
      if (currentFamilyId && child.familyId !== currentFamilyId) {
        console.warn('[奖品] 儿童不属于当前家庭')
        return null
      }

      let familyName = '家庭'
      let familyCoins = 0

      // 未登录：从本地获取
      if (!app.globalData.useCloudStorage) {
        const localFamilies = wx.getStorageSync('localFamilies') || []
        const family = localFamilies.find(f => f.familyId === currentFamilyId)
        if (family) {
          familyName = family.name
        }

        // 从本地获取金币
        const localCoinBalances = wx.getStorageSync(`localCoinBalances_${currentFamilyId}`) || {}
        familyCoins = parseInt(localCoinBalances[child.childId]) || 0

        return {
          ...child,
          familyName: familyName,
          familyCoins: familyCoins
        }
      }

      // 已登录：从云端获取
      const [familyRes, coinsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyInfo',
            data: { familyId: child.familyId }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageFamilyCoins',
          data: {
            action: 'getChildCoinsInFamily',
            data: {
              childId: child.childId,
              familyId: child.familyId
            }
          }
        })
      ])

      familyName = familyRes.result.success ? familyRes.result.family.name : '家庭'
      familyCoins = coinsRes.result.success ? parseInt(coinsRes.result.balance) || 0 : 0

      console.log('[奖品] enrichedChild.familyCoins:', familyCoins, typeof familyCoins)

      return {
        ...child,
        familyName: familyName,
        familyCoins: familyCoins
      }
    } catch (err) {
      console.error('[奖品] 补充儿童信息失败:', err)
      return child
    }
  },

  async loadPrizes() {
    const currentChild = app.getCurrentChild()
    if (!currentChild) {
      this.setData({ prizes: [], affordablePrizes: [], childCoins: 0, coinRecords: [] })
      return
    }

    this.setData({ isLoading: true })

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      this.loadPrizesFromLocal(currentChild)
      return
    }

    // 已登录：从云端加载
    await this.loadPrizesFromCloud(currentChild.childId)
  },

  /**
   * 从本地加载奖品
   */
  loadPrizesFromLocal(currentChild) {
    const currentFamilyId = app.getCurrentFamilyId()
    if (!currentFamilyId) {
      this.setData({ prizes: [], affordablePrizes: [], childCoins: 0, coinRecords: [] })
      return
    }

    const localPrizes = wx.getStorageSync(`localPrizes_${currentFamilyId}`) || []

    // 从本地家庭金币余额中获取金币
    const localCoinBalances = wx.getStorageSync(`localCoinBalances_${currentFamilyId}`) || {}
    const childCoins = localCoinBalances[currentChild.childId] || 0

    // 为每个奖品添加 affordable 标记
    const prizesWithAffordable = localPrizes.map(prize => ({
      ...prize,
      affordable: childCoins >= prize.coinCost
    }))

    const affordablePrizes = prizesWithAffordable.filter(p => p.affordable)

    this.setData({
      prizes: prizesWithAffordable,
      affordablePrizes: affordablePrizes,
      childCoins: childCoins,
      coinRecords: [],
      isLoading: false
    })
  },

  /**
   * 从云端加载奖品
   */
  async loadPrizesFromCloud(currentChildId) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        this.setData({ prizes: [], affordablePrizes: [], childCoins: 0, coinRecords: [] })
        return
      }

      const [prizesRes, coinsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'managePrizes',
          data: {
            action: 'getPrizes',
            data: { familyId: currentFamilyId }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageFamilyCoins',
          data: {
            action: 'getCoinRecords',
            data: { childId: currentChildId, limit: 10 }
          }
        })
      ])

      if (prizesRes.result.success) {
        const prizes = prizesRes.result.prizes || []
        console.log('[奖品商城] 加载到', prizes.length, '个奖品')
        console.log('[奖品商城] 奖品数据样例:', prizes.map(p => ({
          name: p.name,
          hasImage: !!p.image,
          image: p.image,
          coinCost: p.coinCost,
          affordable: p.affordable
        })))

        // 获取当前孩子的金币余额（与首页相同的方法）
        let childCoins = 0
        const currentChild = app.getCurrentChild()
        console.log('[奖品商城] currentChild:', currentChild)

        if (currentChild) {
          try {
            const enrichedChild = await this.enrichChildInfo(currentChild)
            childCoins = enrichedChild.familyCoins || 0
            console.log('[奖品商城] enrichedChild.familyCoins:', enrichedChild.familyCoins)
            console.log('[奖品商城] 最终 childCoins:', childCoins)
          } catch (e) {
            console.error('[奖品商城] 获取金币余额失败:', e)
            childCoins = 0
          }
        }

        console.log('[奖品商城] childCoins:', childCoins)
        console.log('[奖品商城] 奖品列表:', prizes.map(p => `${p.name} - ${p.coinCost}金币`))

        // 为每个奖品添加 affordable 标记
        const prizesWithAffordable = prizes.map(prize => ({
          ...prize,
          affordable: childCoins >= prize.coinCost
        }))

        const affordablePrizes = prizesWithAffordable.filter(p => p.affordable)
        console.log('[奖品商城] 可兑换奖品:', affordablePrizes.map(p => p.name))

        this.setData({
          prizes: prizesWithAffordable,
          affordablePrizes: affordablePrizes,
          childCoins: childCoins
        })
      }

      if (coinsRes.result.success) {
        this.setData({ coinRecords: coinsRes.result.records })
      }
    } catch (err) {
      console.error('[奖品商城] 加载失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      this.setData({ isLoading: false })
    }
  },

  filterByCategory(e) {
    const { category } = e.currentTarget.dataset
    this.setData({ currentCategory: category })
  },

  /**
   * 获取当前选中分类的显示名称
   */
  getCurrentCategoryLabel() {
    const category = this.data.categories.find(c => c.value === this.data.currentCategory)
    return category ? category.label : '全部'
  },

  async redeemPrize(e) {
    const { prizeid } = e.currentTarget.dataset
    const currentChild = app.getCurrentChild()

    if (!currentChild) {
      showToast(t('auth.loginRequired'))
      return
    }

    const prize = this.data.prizes.find(p => p.prizeId === prizeid)
    if (!prize) return

    // 检查金币是否足够（使用当前显示的金币数）
    if (this.data.childCoins < prize.coinCost) {
      showToast('金币不足，无法兑换')
      return
    }

    const confirm = await showConfirm(
      '确定要兑换"' + prize.name + '"吗？\n需要消耗 ' + prize.coinCost + ' 金币'
    )
    if (!confirm) return

    showLoading(t('toast.processing'))

    try {
      const currentFamilyId = app.getCurrentFamilyId()
      console.log('[奖品商城] 开始兑换 - prizeId:', prizeid, 'childId:', currentChild.childId, 'familyId:', currentFamilyId)

      const res = await wx.cloud.callFunction({
        name: 'managePrizes',
        data: {
          action: 'redeemPrize',
          data: {
            prizeId: prizeid,
            childId: currentChild.childId,
            familyId: currentFamilyId
          }
        }
      })

      console.log('[奖品商城] 兑换结果:', res.result)
      hideLoading()

      if (res.result.success) {
        showToast(t('prizes.redeemSuccess'))
        await this.loadPrizes()
        // 更新全局孩子数据
        const index = app.globalData.children.findIndex(c => c.childId === currentChild.childId)
        if (index !== -1) {
          app.globalData.children[index].totalCoins = res.result.newBalance
          this.setData({ childCoins: res.result.newBalance })
        }
      } else {
        console.error('[奖品商城] 兑换失败:', res.result.error)
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[奖品商城] 兑换失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  getCategoryName(category) {
    const item = this.data.categories.find(c => c.value === category)
    return item ? item.label : category
  },

  /**
   * 跳转到我的奖品页
   */
  goToMyPrizes() {
    wx.navigateTo({
      url: '/pages/redemptions/redemptions'
    })
  },

  /**
   * 跳转到奖品管理页
   */
  goToPrizeManagement() {
    wx.navigateTo({
      url: '/pages/prize-management/prize-management'
    })
  },

  /**
   * 跳转到家庭列表
   */
  goToFamily() {
    wx.switchTab({
      url: '/pages/family-list/family-list'
    })
  },

  /**
   * 切换金币历史显示
   */
  toggleCoinHistory() {
    this.setData({
      showCoinHistory: !this.data.showCoinHistory
    })
  },

  /**
   * 格式化金币记录类型
   */
  formatCoinType(type) {
    const types = {
      'task_complete': '任务奖励',
      'prize_redeem': '奖品兑换',
      'manual_adjust': '手动调整'
    }
    return types[type] || type
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')
    return `${month}-${day} ${hour}:${minute}`
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    const currentChild = app.getCurrentChild()
    return {
      title: currentChild
        ? `我在用"妈妈表扬我"为${currentChild.name}设置奖励`
        : '妈妈表扬我 - 儿童任务奖励兑换',
      path: '/pages/prizes/prizes',
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
