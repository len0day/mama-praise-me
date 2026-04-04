// pages/prize-management/prize-management.js - 奖品管理页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    prizes: [],
    isLoading: false,
    showAddModal: false,
    editingPrize: null,
    showPasswordModal: false,
    isParentMode: false,
    formData: {
      name: '',
      description: '',
      image: '',
      coinCost: 100,
      category: 'other',
      stock: -1
    },
    categories: [
      { value: 'toys', label: '玩具' },
      { value: 'food', label: '食物' },
      { value: 'outings', label: '外出' },
      { value: 'other', label: '其他' }
    ]
  },

  onLoad() {
    this.setData({
      themeClass: app.globalData.themeClass,
      isParentMode: app.isParentMode()
    })
  },

  onShow() {
    this.setData({
      isParentMode: app.isParentMode()
    })
    this.loadPrizes()
  },

  /**
   * 加载奖品列表
   */
  async loadPrizes() {
    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'managePrizes',
        data: {
          action: 'getPrizes',
          data: {}
        }
      })

      if (res.result.success) {
        this.setData({ prizes: res.result.prizes })
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
    this.setData({
      showAddModal: true,
      editingPrize: null,
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
    const { prizeid } = e.currentTarget.dataset
    const prize = this.data.prizes.find(p => p.prizeId === prizeid)

    if (prize) {
      this.setData({
        showAddModal: true,
        editingPrize: prize,
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
  async deletePrize(e) {
    const { prizeid } = e.currentTarget.dataset

    const confirm = await showConfirm(t('prizes.deletePrizeConfirm'))
    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'managePrizes',
        data: {
          action: 'deletePrize',
          data: { prizeId: prizeid }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(t('prizes.prizeDeleted'))
        await this.loadPrizes()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[奖品管理] 删除失败:', err)
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
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        // 暂时只保存本地路径，实际使用时需要上传到云存储
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
    const index = e.detail.value
    const category = this.data.categories[index].value
    this.setData({
      'formData.category': category
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
          imageUrl = uploadRes.fileID
          console.log('[奖品管理] 图片上传成功:', imageUrl)
        } catch (uploadErr) {
          console.error('[奖品管理] 图片上传失败:', uploadErr)
          // 上传失败时继续保存，但没有图片
          imageUrl = ''
        }
      }

      // 准备要保存的数据
      const prizeData = {
        ...formData,
        image: imageUrl
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
    const item = this.data.categories.find(c => c.value === category)
    return item ? item.label : category
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
        showPasswordModal: true
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
   * 编辑奖品（家长模式验证）
   */
  editPrize(e) {
    if (!this.canEdit()) {
      return
    }

    const { prizeid } = e.currentTarget.dataset
    const prize = this.data.prizes.find(p => p.prizeId === prizeid)

    if (prize) {
      this.setData({
        showAddModal: true,
        editingPrize: prize,
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
   * 删除奖品（家长模式验证）
   */
  deletePrize(e) {
    if (!this.canEdit()) {
      return
    }

    const { prizeid } = e.currentTarget.dataset
    const prize = this.data.prizes.find(p => p.prizeId === prizeid)

    if (prize) {
      showConfirm(`确定要删除奖品“${prize.name}”吗？`).then(confirm => {
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
   * 显示添加模态框（家长模式验证）
   */
  showAddModal() {
    if (!this.canEdit()) {
      return
    }

    this.setData({
      showAddModal: true,
      editingPrize: null,
      formData: {
        name: '',
        description: '',
        image: '',
        coinCost: 100,
        category: 'other',
        stock: -1
      }
    })
  }
})
