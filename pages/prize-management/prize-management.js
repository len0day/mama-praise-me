// pages/prize-management/prize-management.js - 奖品管理页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    prizes: [],
    isLoading: false,
    showAddModal: false,
    editingPrize: null,
    showPasswordModal: false,
    isParentMode: false,
    isFirstTime: false,
    modalTrigger: null,
    pendingPrizeId: null,
    formData: {
      name: '',
      description: '',
      image: '',
      coinCost: 100,
      category: 'other',
      stock: -1
    },
    categoryIndex: 4,  // 默认选中"其他"（索引4）
    categoryDisplayName: '其他',  // 分类显示名称
    categories: [
      { value: 'toys', label: '玩具' },
      { value: 'food', label: '食物' },
      { value: 'outings', label: '外出' },
      { value: 'entertainment', label: '娱乐' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad() {
    console.log('[奖品管理] onLoad called')
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      isParentMode: app.isParentMode()
    })
  },

  onShow() {
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    console.log('[奖品管理] onShow called, isParentMode:', app.isParentMode())
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme,
      isParentMode: app.isParentMode()
    })

    // 检查是否为家长模式，不是则要求验证
    if (!app.isParentMode()) {
      this.setData({
        showPasswordModal: true,
        isFirstTime: !app.hasParentPassword()
      })
      console.log('[奖品管理] Require parent mode verification, isFirstTime:', !app.hasParentPassword())
    } else {
      this.loadPrizes()
    }
  },

  /**
   * 加载奖品列表
   */
  async loadPrizes() {
    showLoading()

    try {
      const currentFamilyId = app.getCurrentFamilyId()
      const res = await wx.cloud.callFunction({
        name: 'managePrizes',
        data: {
          action: 'getPrizes',
          data: { familyId: currentFamilyId }
        }
      })

      if (res.result.success) {
        const prizes = res.result.prizes || []
        // 为每个奖品添加分类名称
        const prizesWithCategoryName = prizes.map(prize => ({
          ...prize,
          categoryName: this.getCategoryName(prize.category)
        }))
        this.setData({ prizes: prizesWithCategoryName })
      }
    } catch (err) {
      console.error('[奖品管理] 加载失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      hideLoading()
    }
  },

  /**
   * 显示添加模态框
   */
  showAddModal() {
    console.log('[奖品管理] showAddModal called, isParentMode:', this.data.isParentMode)
    if (!this.data.isParentMode) {
      this.setData({
        showPasswordModal: true,
        isFirstTime: !app.hasParentPassword(),
        modalTrigger: 'add'
      })
      console.log('[奖品管理] showPasswordModal set to true, isFirstTime:', !app.hasParentPassword())
      return
    }

    this.setData({
      showAddModal: true,
      editingPrize: null,
      categoryIndex: 3,  // 默认"其他"
      categoryDisplayName: '其他',
      formData: {
        name: '',
        description: '',
        image: '',
        coinCost: 100,
        category: 'other',
        stock: -1
      }
    })
  },

  /**
   * 编辑奖品
   */
  editPrize(e) {
    console.log('[奖品管理] editPrize called, isParentMode:', this.data.isParentMode)
    if (!this.data.isParentMode) {
      this.setData({
        showPasswordModal: true,
        isFirstTime: !app.hasParentPassword(),
        modalTrigger: 'edit',
        pendingPrizeId: e.currentTarget.dataset.prizeid
      })
      console.log('[奖品管理] showPasswordModal set to true, isFirstTime:', !app.hasParentPassword())
      return
    }

    const { prizeid } = e.currentTarget.dataset
    const prize = this.data.prizes.find(p => p.prizeId === prizeid)

    if (prize) {
      // 找到分类对应的索引
      const categoryIndex = this.data.categories.findIndex(c => c.value === prize.category)
      const categoryName = categoryIndex >= 0 ? this.data.categories[categoryIndex].label : '其他'
      console.log('[奖品管理] 编辑奖品 - category:', prize.category, 'index:', categoryIndex, 'name:', categoryName)

      this.setData({
        showAddModal: true,
        editingPrize: prize,
        categoryIndex: categoryIndex >= 0 ? categoryIndex : 3,  // 找不到则默认"其他"
        categoryDisplayName: categoryName,
        formData: {
          name: prize.name,
          description: prize.description,
          image: prize.image || '',
          coinCost: prize.coinCost,
          category: prize.category,
          stock: prize.stock
        }
      })
    }
  },

  /**
   * 删除奖品
   */
  deletePrize(e) {
    console.log('[奖品管理] deletePrize called, isParentMode:', this.data.isParentMode)
    if (!this.data.isParentMode) {
      this.setData({
        showPasswordModal: true,
        isFirstTime: !app.hasParentPassword(),
        modalTrigger: 'delete',
        pendingPrizeId: e.currentTarget.dataset.prizeid
      })
      console.log('[奖品管理] showPasswordModal set to true, isFirstTime:', !app.hasParentPassword())
      return
    }

    const { prizeid } = e.currentTarget.dataset
    const prize = this.data.prizes.find(p => p.prizeId === prizeid)

    if (prize) {
      showConfirm(`确定要删除奖品”${prize.name}”吗？`).then(confirm => {
        if (confirm) {
          this.deletePrizeConfirmed(prizeid)
        }
      })
    }
  },

  /**
   * 删除奖品（确认后）
   */
  async deletePrizeConfirmed(prizeId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'managePrizes',
        data: {
          action: 'deletePrize',
          data: { prizeId }
        }
      })

      if (res.result.success) {
        showToast('删除成功')
        await this.loadPrizes()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      console.error('[奖品管理] 删除奖品失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 表单输入
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value
    })
  },

  /**
   * 选择图片
   */
  chooseImage() {
    console.log('[奖品管理] chooseImage called')
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.setData({
          'formData.image': res.tempFiles[0].tempFilePath
        })
      },
      fail: (err) => {
        console.error('[奖品管理] 选择图片失败:', err)
      }
    })
  },

  /**
   * 删除已选图片
   */
  removeImage() {
    this.setData({
      'formData.image': ''
    })
  },

  /**
   * 分类选择
   */
  onCategoryChange(e) {
    const index = parseInt(e.detail.value)
    const category = this.data.categories[index].value
    const categoryName = this.data.categories[index].label
    console.log('[奖品管理] 分类选择 - index:', index, 'category:', category, 'name:', categoryName)
    this.setData({
      'formData.category': category,
      categoryIndex: index,
      categoryDisplayName: categoryName
    })
  },

  /**
   * 库存类型切换
   */
  onStockTypeChange(e) {
    const value = e.detail.value
    if (value === 'unlimited') {
      this.setData({
        'formData.stock': -1
      })
    }
  },

  /**
   * 保存奖品
   */
  async savePrize() {
    const { formData, editingPrize } = this.data

    if (!formData.name.trim()) {
      showToast('请输入奖品名称')
      return
    }

    if (formData.coinCost < 0) {
      showToast('所需金币不能为负数')
      return
    }

    showLoading()

    try {
      // 如果选择了本地图片，先上传到云存储
      let imageUrl = formData.image || ''
      if (imageUrl && imageUrl.startsWith('wxfile://')) {
        try {
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath: `prize_images/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`,
            filePath: imageUrl
          })
          // 直接保存fileID，这个ID在image组件中可以直接使用且不会过期
          imageUrl = uploadRes.fileID
          console.log('[奖品管理] 图片上传成功，fileID:', imageUrl)
        } catch (uploadErr) {
          console.error('[奖品管理] 图片上传失败:', uploadErr)
          imageUrl = ''
        }
      }

      // 准备要保存的数据
      const prizeData = {
        ...formData,
        image: imageUrl,
        familyId: app.getCurrentFamilyId()
      }

      let res
      if (editingPrize) {
        // 更新
        res = await wx.cloud.callFunction({
          name: 'managePrizes',
          data: {
            action: 'updatePrize',
            data: {
              prizeId: editingPrize.prizeId,
              ...prizeData
            }
          }
        })
      } else {
        // 创建
        res = await wx.cloud.callFunction({
          name: 'managePrizes',
          data: {
            action: 'createPrize',
            data: prizeData
          }
        })
      }

      hideLoading()

      if (res.result.success) {
        showToast(editingPrize ? t('prizes.prizeUpdated') : t('prizes.prizeCreated'))
        this.setData({ showAddModal: false })
        await this.loadPrizes()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[奖品管理] 保存失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 关闭模态框
   */
  closeModal() {
    this.setData({ showAddModal: false })
  },

  /**
   * 阻止事件冒泡
   */
  stopPropagation() {
    // 阻止点击事件冒泡到 modal-mask
  },

  /**
   * 获取分类名称
   */
  getCategoryName(category) {
    console.log('[奖品管理] getCategoryName - category:', category)
    console.log('[奖品管理] getCategoryName - categories:', this.data.categories)
    const item = this.data.categories.find(c => c.value === category)
    console.log('[奖品管理] getCategoryName - found item:', item)
    const result = item ? item.label : category
    console.log('[奖品管理] getCategoryName - result:', result)
    return result
  },

  /**
   * 切换家长模式
   */
  toggleParentMode() {
    console.log('[奖品管理] toggleParentMode called')
    if (this.data.isParentMode) {
      // 退出家长模式
      app.exitParentMode()
      this.setData({ isParentMode: false })
      showToast('已退出家长模式')
    } else {
      // 进入家长模式
      this.setData({
        showPasswordModal: true,
        isFirstTime: !app.hasParentPassword(),
        modalTrigger: 'toggle'
      })
      console.log('[奖品管理] showPasswordModal set to true, isFirstTime:', !app.hasParentPassword())
    }
  },

  /**
   * 密码验证成功
   */
  onPasswordSuccess() {
    console.log('[奖品管理] onPasswordSuccess called')
    this.setData({
      isParentMode: true,
      showPasswordModal: false
    })
    showToast('已进入家长模式')

    // 如果有触发的操作，继续执行
    const { modalTrigger, pendingPrizeId } = this.data
    if (modalTrigger === 'add') {
      setTimeout(() => this.showAddModal(), 100)
    } else if (modalTrigger === 'edit' && pendingPrizeId) {
      setTimeout(() => this.editPrize({ currentTarget: { dataset: { prizeid: pendingPrizeId } } }), 100)
    } else if (modalTrigger === 'delete' && pendingPrizeId) {
      setTimeout(() => this.deletePrize({ currentTarget: { dataset: { prizeid: pendingPrizeId } } }), 100)
    }

    // 清除触发器
    this.setData({ modalTrigger: null, pendingPrizeId: null })
  },

  /**
   * 取消密码验证
   */
  onPasswordCancel() {
    console.log('[奖品管理] onPasswordCancel called')
    this.setData({
      showPasswordModal: false
    })
  },

  /**
   * 关闭密码弹窗
   */
  onPasswordClose() {
    console.log('[奖品管理] onPasswordClose called')
    this.setData({
      showPasswordModal: false
    })
  },

  /**
   * 检查是否可以编辑/删除
   */
  canEdit() {
    if (!this.data.isParentMode) {
      this.setData({ showPasswordModal: true })
      return false
    }
    return true
  },

  /**
   * 分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '妈妈表扬我 - 管理奖品库',
      path: '/pages/prize-management/prize-management',
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

