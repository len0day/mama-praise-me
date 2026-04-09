// pages/children/children.js - 孩子管理页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm, generateId } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    children: [],
    currentChildId: null,
    showAddModal: false,
    editingChild: null,
    formData: {
      name: '',
      avatar: '',
      gender: 'male',
      age: 0
    }
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
    this.setData({ currentChildId: app.globalData.currentChildId })
    this.loadChildren()
  },

  /**
   * 加载孩子列表
   */
  async loadChildren() {
    showLoading()

    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      this.loadChildrenFromLocal()
      return
    }

    // 已登录：从云端加载
    await this.loadChildrenFromCloud()
  },

  /**
   * 从本地加载孩子
   */
  loadChildrenFromLocal() {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      let children = []

      if (currentFamilyId) {
        // 从当前家庭加载儿童
        children = wx.getStorageSync(`localChildren_${currentFamilyId}`) || []
      } else {
        // 没有选择家庭，尝试从旧位置加载（向后兼容）
        children = wx.getStorageSync('children') || []
      }

      app.globalData.children = children
      this.setData({ children: children })
    } catch (err) {
      console.error('[孩子管理] 加载失败:', err)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  /**
   * 从云端加载孩子
   */
  async loadChildrenFromCloud() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: { action: 'getChildren' }
      })

      if (res.result.success) {
        app.globalData.children = res.result.children
        this.setData({ children: res.result.children })
      }
    } catch (err) {
      console.error('[孩子管理] 加载失败:', err)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  /**
   * 切换当前孩子
   */
  switchChild(e) {
    const { childid } = e.currentTarget.dataset
    app.saveCurrentChildId(childid)
    this.setData({ currentChildId: childid })
    showToast(t('children.switchChild') + '成功')

    // 返回首页
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      })
    }, 500)
  },

  /**
   * 显示添加模态框
   */
  /**
   * 显示添加模态框
   */
  showAddModal() {
    // 未登录：检查是否有本地家庭
    if (!app.globalData.useCloudStorage) {
      const localFamilies = wx.getStorageSync('localFamilies') || []
      if (localFamilies.length === 0) {
        wx.showModal({
          title: '需要先创建家庭',
          content: '请先在"家庭"页面创建一个家庭，然后再添加儿童',
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({ url: '/pages/family-list/family-list' })
            }
          }
        })
        return
      }

      // 有本地家庭，继续添加
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        wx.showModal({
          title: '需要选择家庭',
          content: '请先在"家庭"页面选择一个家庭',
          success: (res) => {
            if (res.confirm) {
              wx.switchTab({ url: '/pages/family-list/family-list' })
            }
          }
        })
        return
      }

      this.setData({
        showAddModal: true,
        editingChild: null,
        formData: {
          name: '',
          avatar: '',
          gender: 'male',
          age: 0,
          familyId: currentFamilyId
        }
      })
      return
    }

    // 检查是否有家庭
    if (!app.globalData.currentFamilyId) {
      wx.showModal({
        title: '需要先加入家庭',
        content: '请先在"家庭"页面加入或创建一个家庭，然后再添加儿童',
        confirmText: '去添加',
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

    // 已登录且有家庭：直接显示添加表单
    this.setData({
      showAddModal: true,
      editingChild: null,
      formData: {
        name: '',
        avatar: '',
        gender: 'male',
        age: 0,
        familyId: app.globalData.currentFamilyId  // 默认使用当前家庭
      }
    })
  },

  /**
   * 显示登录引导对话框
   */
  showLoginGuide() {
    wx.showModal({
      title: '添加孩子',
      content: '您可以选择登录后保存到云端（多设备同步、家庭功能），或直接保存到本地（仅当前设备可用）',
      confirmText: '登录',
      cancelText: '取消',
      editable: false,
      success: (res) => {
        if (res.confirm) {
          // 点击"登录"按钮
          wx.switchTab({
            url: '/pages/settings/settings'
          })
        } else if (res.cancel) {
          // 点击"取消"按钮，显示"保存在本地"选项
          wx.showModal({
            title: '保存在本地',
            content: '数据将仅保存在本地，无法跨设备同步和使用家庭功能。确定要继续吗？',
            confirmText: '保存在本地',
            cancelText: '取消',
            success: (res2) => {
              if (res2.confirm) {
                // 点击"保存在本地"
                this.openAddChildForm()
              }
            }
          })
        }
      }
    })
  },

  /**
   * 打开添加孩子表单
   */
  openAddChildForm() {
    this.setData({
      showAddModal: true,
      editingChild: null,
      formData: {
        name: '',
        avatar: '',
        age: 0
      }
    })
  },

  /**
   * 编辑孩子
   */
  editChild(e) {
    const { childid } = e.currentTarget.dataset
    const child = this.data.children.find(c => c.childId === childid)

    if (child) {
      this.setData({
        showAddModal: true,
        editingChild: child,
        formData: {
          name: child.name,
          avatar: child.avatar,
          gender: child.gender || 'male',
          age: child.age,
          familyId: child.familyId  // 显示当前所属家庭
        }
      })
    }
  },

  /**
   * 删除孩子
   */
  async deleteChild(e) {
    const { childid } = e.currentTarget.dataset

    const confirm = await showConfirm('确定要删除这个孩子吗？')
    if (!confirm) return

    showLoading()

    // 未登录：从本地删除
    if (!app.globalData.useCloudStorage) {
      this.deleteChildFromLocal(childid)
      return
    }

    // 已登录：从云端删除
    await this.deleteChildFromCloud(childid)
  },

  /**
   * 从本地删除孩子
   */
  deleteChildFromLocal(childId) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      const storageKey = `localChildren_${currentFamilyId}`
      let children = wx.getStorageSync(storageKey) || []
      children = children.filter(c => c.childId !== childId)
      wx.setStorageSync(storageKey, children)

      // 更新全局数据
      app.globalData.children = children

      hideLoading()
      showToast('孩子已删除')
      this.loadChildren()

      // 如果删除的是当前孩子，清空当前孩子ID
      if (this.data.currentChildId === childId) {
        app.saveCurrentChildId('')
        this.setData({ currentChildId: '' })
      }
    } catch (err) {
      hideLoading()
      console.error('[孩子管理] 删除失败:', err)
      showToast('删除失败')
    }
  },

  /**
   * 从云端删除孩子
   */
  async deleteChildFromCloud(childId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'deleteChild',
          data: { childId: childId }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast('孩子已删除')
        await this.loadChildren()

        // 如果删除的是当前孩子，清空当前孩子ID
        if (this.data.currentChildId === childId) {
          app.saveCurrentChildId('')
          this.setData({ currentChildId: '' })
        }
      } else {
        showToast(res.result.error || '删除失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[孩子管理] 删除失败:', err)
      showToast('删除失败')
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
   * 选择性别
   */
  selectGender(e) {
    const { gender } = e.currentTarget.dataset
    this.setData({
      'formData.gender': gender
    })
  },

  /**
   * 选择预设头像
   */
  selectPresetAvatar(e) {
    const { avatar } = e.currentTarget.dataset
    this.setData({
      'formData.avatar': avatar
    })
  },

  /**
   * 从相册选择头像
   */
  chooseFromAlbum() {
    const that = this

    // 检查是否登录
    if (!app.globalData.useCloudStorage) {
      showToast('请先登录后再上传自定义头像')
      return
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        // 上传到云存储
        that.uploadAvatarToCloud(tempFilePath)
      }
    })
  },

  /**
   * 上传头像到云存储
   */
  uploadAvatarToCloud(filePath) {
    const that = this
    const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`

    showLoading('上传中...')

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: (res) => {
        hideLoading()
        // 直接保存fileID，这个ID在image组件中可以直接使用且不会过期
        that.setData({
          'formData.avatar': res.fileID
        })
        showToast('头像上传成功')
        console.log('[孩子管理] 头像fileID:', res.fileID)
      },
      fail: (err) => {
        hideLoading()
        console.error('[孩子管理] 头像上传失败:', err)
        showToast('头像上传失败，请重试')
      }
    })
  },

  /**
   * 保存孩子
   */
  async saveChild() {
    const { formData, editingChild } = this.data

    if (!formData.name.trim()) {
      showToast('请输入孩子姓名')
      return
    }

    showLoading()

    // 未登录：保存到本地
    if (!app.globalData.useCloudStorage) {
      this.saveChildToLocal(formData, editingChild)
      return
    }

    // 已登录：保存到云端
    await this.saveChildToCloud(formData, editingChild)
  },

  /**
   * 保存孩子到本地
   */
  saveChildToLocal(formData, editingChild) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      // 从当前家庭加载儿童
      const storageKey = `localChildren_${currentFamilyId}`
      let children = wx.getStorageSync(storageKey) || []

      if (editingChild) {
        // 更新
        const index = children.findIndex(c => c.childId === editingChild.childId)
        if (index !== -1) {
          children[index] = {
            ...children[index],
            ...formData,
            familyId: currentFamilyId,
            updatedAt: new Date().toISOString()
          }
        }
      } else {
        // 创建
        const newChild = {
          childId: `child_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: formData.name,
          avatar: formData.avatar || '',
          gender: formData.gender || 'male',
          age: formData.age || 0,
          familyId: currentFamilyId,
          completedTasks: 0,
          redeemedPrizes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        children.push(newChild)

        // 不初始化金币余额，因为金币以家庭为单位，在分配时设置
      }

      wx.setStorageSync(storageKey, children)

      // 更新全局数据
      app.globalData.children = children

      hideLoading()
      showToast(editingChild ? '孩子信息已更新' : '孩子添加成功')
      this.setData({ showAddModal: false })
      this.loadChildren()
    } catch (err) {
      hideLoading()
      console.error('[孩子管理] 保存失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 保存孩子到云端
   */
  async saveChildToCloud(formData, editingChild) {
    try {
      // 确保有家庭ID
      if (!formData.familyId) {
        showToast('请选择家庭')
        return
      }

      let res
      if (editingChild) {
        // 更新
        res = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'createChild',  // 使用 createChild 因为 updateChild 不支持修改 familyId
            data: {
              ...formData,
              childId: editingChild.childId  // 传递 childId 表示更新
            }
          }
        })
      } else {
        // 创建
        res = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'createChild',
            data: {
              ...formData,
              familyId: formData.familyId  // 明确传递 familyId
            }
          }
        })
      }

      hideLoading()

      if (res.result.success) {
        showToast(editingChild ? '孩子信息已更新' : '孩子添加成功')
        this.setData({ showAddModal: false })
        await this.loadChildren()
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[孩子管理] 保存失败:', err)
      showToast('操作失败')
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
   * 分享给朋友
   */
  onShareAppMessage() {
    return {
      title: '妈妈表扬我 - 管理孩子信息',
      path: '/pages/children/children',
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
