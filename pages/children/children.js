// pages/children/children.js - 孩子管理页
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm, generateId } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    themeStyle: 'default',
    children: [],
    otherChildren: [],  // 其他家庭的儿童
    orphanChildren: [],  // 无家庭的儿童
    currentChildId: null,
    currentFamilyName: '',  // 当前家庭名称
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

  async onShow() {
    const themeStyle = app.globalData.settings.themeStyle || 'simple-light'
    const isFunTheme = ['boy', 'girl', 'cute', 'neutral'].includes(themeStyle)
    this.setData({
      themeClass: app.globalData.themeClass,
      themeStyle: themeStyle,
      colorTone: app.globalData.colorTone || 'neutral',
      isFunTheme: isFunTheme
    })
    this.setData({ currentChildId: app.globalData.currentChildId })

    // 加载当前家庭名称
    const currentFamilyId = app.getCurrentFamilyId()
    if (currentFamilyId) {
      if (!app.globalData.useCloudStorage) {
        // 本地家庭
        const localFamilies = wx.getStorageSync('localFamilies') || []
        const currentFamily = localFamilies.find(f => f.familyId === currentFamilyId)
        if (currentFamily) {
          this.setData({ currentFamilyName: currentFamily.name })
        }
      } else {
        // 云端家庭 - 优先从全局数据获取
        const globalFamilies = app.globalData.families || []
        let currentFamily = globalFamilies.find(f => f.familyId === currentFamilyId)

        // 如果全局数据中没有，再从页面数据获取
        if (!currentFamily && this.data.allFamilies) {
          currentFamily = this.data.allFamilies.find(f => f.familyId === currentFamilyId)
        }

        if (currentFamily) {
          this.setData({ currentFamilyName: currentFamily.name })
        } else {
          // 如果还是找不到，尝试从云函数加载
          this.loadCurrentFamilyName(currentFamilyId)
        }
      }
    }

    await this.loadChildren()
  },

  /**
   * 如果儿童没有头像，使用当前用户头像作为默认值
   */
  _applyUserAvatarAsDefault(list) {
    const storageUser = wx.getStorageSync && wx.getStorageSync('userInfo')
    const userAvatar = (app.globalData.userInfo && app.globalData.userInfo.avatarUrl) || (storageUser && storageUser.avatarUrl) || ''
    if (!Array.isArray(list)) return list
    return list.map(child => ({
      ...child,
      avatar: child.avatar || userAvatar
    }))
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
      let familyChildren = []
      let otherChildren = []

      if (currentFamilyId) {
        // 从主儿童列表加载所有儿童
        const allChildren = wx.getStorageSync('allChildren') || []

        // 获取所有本地家庭
        const localFamilies = wx.getStorageSync('localFamilies') || []

        // 分类：当前家庭的儿童 vs 可加入当前家庭的儿童
        allChildren.forEach(child => {
          // 检查儿童是否在当前家庭
          const storageKey = `localChildren_${currentFamilyId}`
          const currentFamilyChildren = wx.getStorageSync(storageKey) || []
          const isInCurrentFamily = currentFamilyChildren.find(c => c.childId === child.childId)

          if (isInCurrentFamily) {
            // 在当前家庭，可编辑
            familyChildren.push(child)
          } else {
            // 不在当前家庭，但可以加入（儿童可以属于多个家庭）
            otherChildren.push(child)
          }
        })
      } else {
        // 没有选择家庭，显示所有儿童
        familyChildren = wx.getStorageSync('allChildren') || []
      }

      // 更新全局数据（只包含当前家庭的儿童）
      app.globalData.children = familyChildren

      // 为没有头像的儿童应用用户头像作为默认头像
      familyChildren = this._applyUserAvatarAsDefault(familyChildren)
      otherChildren = this._applyUserAvatarAsDefault(otherChildren)

      this.setData({
        children: familyChildren,
        otherChildren: otherChildren,
        orphanChildren: []  // 不再需要单独的孤儿列表，因为所有儿童都在 allChildren 中
      })

      console.log('[孩子管理] 当前家庭儿童:', familyChildren.length)
      console.log('[孩子管理] 可加入当前家庭的儿童:', otherChildren.length)
      console.log('[孩子管理] 所有儿童总数:', familyChildren.length + otherChildren.length)
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
      const currentFamilyId = app.getCurrentFamilyId()
      console.log('[孩子管理] loadChildrenFromCloud - 当前家庭ID:', currentFamilyId)

      if (!currentFamilyId) {
        // 没有选择家庭，显示所有儿童
        const res = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: { action: 'getChildren' }
        })

        if (res.result.success) {
          const allChildren = res.result.children || []
          app.globalData.children = []
          // 将用户头像作为默认头像填充到无头像的儿童
          const filled = this._applyUserAvatarAsDefault(allChildren)
          this.setData({
            children: [],
            otherChildren: filled
          })
        }
        hideLoading()
        return
      }

      // 获取当前家庭的儿童（通过 family_coin_balances）
      console.log('[孩子管理] 准备查询家庭', currentFamilyId, '的儿童')
      const familyRes = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'getFamilyChildrenById',
          familyId: currentFamilyId
        }
      })

      console.log('[孩子管理] 家庭儿童查询结果:', familyRes.result)

      // 获取我创建的所有儿童
      const allRes = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: { action: 'getChildren' }
      })

      let familyChildren = []
      let otherChildren = []

      if (familyRes.result.success) {
        familyChildren = familyRes.result.children || []
      }

      if (allRes.result.success) {
        const allChildren = allRes.result.children || []
        const familyChildIds = new Set(familyChildren.map(c => c.childId))

        // 找出不在当前家庭的儿童
        otherChildren = allChildren.filter(child => !familyChildIds.has(child.childId))
      }

      // 更新全局数据（只包含当前家庭的儿童）
      app.globalData.children = familyChildren

      // 为没有头像的儿童应用用户头像作为默认头像
      familyChildren = this._applyUserAvatarAsDefault(familyChildren)
      otherChildren = this._applyUserAvatarAsDefault(otherChildren)

      this.setData({
        children: familyChildren,
        otherChildren: otherChildren
      })

      console.log('[孩子管理] 当前家庭儿童:', familyChildren.length)
      console.log('[孩子管理] 可加入当前家庭的儿童:', otherChildren.length)
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
  showAddModal() {
    // 直接显示添加表单，不需要检查家庭
    // 创建的儿童不会自动加入任何家庭
    this.setData({
      showAddModal: true,
      editingChild: null,
      formData: {
        name: '',
        avatar: '',
        gender: 'male',
        age: 0,
        familyId: null  // 不自动加入任何家庭
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
    // 同时在当前家庭儿童和可加入儿童中查找
    const child = this.data.children.find(c => c.childId === childid) ||
                   this.data.otherChildren.find(c => c.childId === childid)

    if (child) {
      this.setData({
        showAddModal: true,
        editingChild: child,
        formData: {
          name: child.name,
          avatar: child.avatar,
          gender: child.gender || 'male',
          age: child.age,
          familyId: child.familyIds && child.familyIds.length > 0 ? child.familyIds[0] : null  // 使用第一个家庭ID
        }
      })
    }
  },

  /**
   * 将孩子加入当前家庭
   */
  async joinChildToFamily(e) {
    const { childid } = e.currentTarget.dataset

    showLoading()

    // 未登录：加入本地家庭
    if (!app.globalData.useCloudStorage) {
      this.joinChildToLocalFamily(childid)
      return
    }

    // 已登录：加入云端家庭
    await this.joinChildToCloudFamily(childid)
  },

  /**
   * 将孩子加入本地家庭
   */
  joinChildToLocalFamily(childId) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      // 从主儿童列表中获取儿童信息
      const allChildren = wx.getStorageSync('allChildren') || []
      const childInfo = allChildren.find(c => c.childId === childId)

      if (!childInfo) {
        hideLoading()
        showToast('儿童信息不存在')
        return
      }

      // 获取当前家庭的儿童列表
      const storageKey = `localChildren_${currentFamilyId}`
      let familyChildren = wx.getStorageSync(storageKey) || []

      // 检查是否已经在当前家庭
      const alreadyInFamily = familyChildren.find(c => c.childId === childId)
      if (alreadyInFamily) {
        hideLoading()
        showToast('该儿童已在当前家庭')
        return
      }

      // 为当前家庭创建独立的儿童数据副本
      // 使用相同的 childId，但重置家庭相关的数据
      const familyChild = {
        childId: childId,  // 保持相同的 childId
        name: childInfo.name,  // 保留基本信息
        avatar: childInfo.avatar || '',
        gender: childInfo.gender || 'male',
        age: childInfo.age || 0,
        familyId: currentFamilyId,  // 设置当前家庭ID
        completedTasks: 0,  // 重置任务完成数（每个家庭独立）
        redeemedPrizes: 0,  // 重置兑换奖品数（每个家庭独立）
        totalCoins: 0,  // 重置金币数（每个家庭独立）
        createdAt: childInfo.createdAt,  // 保留创建时间（第一次创建的时间）
        joinedAt: new Date().toISOString(),  // 记录加入当前家庭的时间
        updatedAt: new Date().toISOString()
      }

      // 添加到当前家庭的儿童列表
      familyChildren.push(familyChild)
      wx.setStorageSync(storageKey, familyChildren)

      // 更新全局数据
      app.globalData.children = familyChildren

      hideLoading()
      showToast('儿童已加入当前家庭')
      this.loadChildren()

      console.log('[孩子管理] 儿童已加入当前家庭，数据独立计算:', familyChild.name)
    } catch (err) {
      hideLoading()
      console.error('[孩子管理] 加入家庭失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 将孩子加入云端家庭
   */
  async joinChildToCloudFamily(childId) {
    try {
      const currentFamilyId = app.getCurrentFamilyId()
      if (!currentFamilyId) {
        hideLoading()
        showToast('请先选择家庭')
        return
      }

      // 调用云函数将儿童加入家庭
      console.log('[孩子管理] 准备加入家庭 - childId:', childId, 'familyId:', currentFamilyId)
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'assignChildToFamily',
          childId: childId,
          familyId: currentFamilyId
        }
      })

      console.log('[孩子管理] 云函数返回结果:', res.result)

      hideLoading()

      if (res.result && res.result.success) {
        // 更新时间戳（关键！）
        await app.updateChildTimestamp()

        // 清除家庭列表缓存（儿童数可能已变化）
        app.invalidateFamiliesListCache()

        showToast('儿童已加入当前家庭')

        // 重新加载页面数据
        await this.loadChildren()

        // 延迟后返回首页，让用户看到变化
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }, 500)
      } else {
        const errorMsg = res.result ? (res.result.error || '操作失败') : '操作失败'
        console.error('[孩子管理] 加入家庭失败:', errorMsg)
        showToast(errorMsg)
      }
    } catch (err) {
      hideLoading()
      console.error('[孩子管理] 加入家庭失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 从云函数加载当前家庭名称
   */
  async loadCurrentFamilyName(familyId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getFamilyInfo',
          familyId: familyId
        }
      })

      if (res.result.success && res.result.family) {
        this.setData({ currentFamilyName: res.result.family.name })
      }
    } catch (err) {
      console.error('[孩子管理] 加载家庭名称失败:', err)
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

      // 检查儿童是否在当前家庭
      const storageKey = `localChildren_${currentFamilyId}`
      let familyChildren = wx.getStorageSync(storageKey) || []
      const isInCurrentFamily = familyChildren.find(c => c.childId === childId)

      if (isInCurrentFamily) {
        // 儿童在当前家庭：从当前家庭移除，保留在主列表
        familyChildren = familyChildren.filter(c => c.childId !== childId)
        wx.setStorageSync(storageKey, familyChildren)

        // 更新全局数据
        app.globalData.children = familyChildren

        hideLoading()
        showToast('孩子已从当前家庭移除')
      } else {
        // 儿童不在当前家庭：完全删除
        // 1. 从主列表删除
        let allChildren = wx.getStorageSync('allChildren') || []
        allChildren = allChildren.filter(c => c.childId !== childId)
        wx.setStorageSync('allChildren', allChildren)

        // 2. 从所有家庭列表删除
        const localFamilies = wx.getStorageSync('localFamilies') || []
        localFamilies.forEach(family => {
          const familyStorageKey = `localChildren_${family.familyId}`
          let children = wx.getStorageSync(familyStorageKey) || []
          children = children.filter(c => c.childId !== childId)
          wx.setStorageSync(familyStorageKey, children)
        })

        // 3. 从已移除列表删除
        const removedKey = `removedChildren_${currentFamilyId}`
        let removedChildren = wx.getStorageSync(removedKey) || []
        removedChildren = removedChildren.filter(c => c.childId !== childId)
        wx.setStorageSync(removedKey, removedChildren)

        hideLoading()
        showToast('孩子已删除')
      }

      this.loadChildren()

      // 如果删除的是当前孩子，清空当前孩子ID
      if (this.data.currentChildId === childId) {
        app.saveCurrentChildId('')
        this.setData({ currentChildId: '' })
      }

      console.log('[孩子管理] 删除完成')
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
          childId: childId
        }
      })

      hideLoading()

      if (res.result.success) {
        // 清除家庭列表缓存（儿童数可能已变化）
        app.invalidateFamiliesListCache()

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

      // 加载主儿童列表（所有创建的儿童）
      let allChildren = wx.getStorageSync('allChildren') || []

      if (editingChild) {
        // 编辑模式：更新主列表中的儿童信息
        const allIndex = allChildren.findIndex(c => c.childId === editingChild.childId)
        if (allIndex !== -1) {
          const updatedChild = {
            ...allChildren[allIndex],
            ...formData,
            updatedAt: new Date().toISOString()
          }
          allChildren[allIndex] = updatedChild

          // 如果儿童在当前家庭，也更新家庭列表中的信息
          const storageKey = `localChildren_${currentFamilyId}`
          let familyChildren = wx.getStorageSync(storageKey) || []
          const familyIndex = familyChildren.findIndex(c => c.childId === editingChild.childId)
          if (familyIndex !== -1) {
            familyChildren[familyIndex] = {
              ...familyChildren[familyIndex],
              ...formData,
              familyId: currentFamilyId,
              updatedAt: new Date().toISOString()
            }
            wx.setStorageSync(storageKey, familyChildren)
          }

          // 更新全局数据
          app.globalData.children = wx.getStorageSync(`localChildren_${currentFamilyId}`) || []
        }
      } else {
        // 创建新儿童（只添加到主列表，不自动加入任何家庭）
        const newChild = {
          childId: `child_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          name: formData.name,
          avatar: formData.avatar || '',
          gender: formData.gender || 'male',
          age: formData.age || 0,
          familyIds: [],  // 不自动加入任何家庭，使用空数组
          completedTasks: 0,
          redeemedPrizes: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        // 只添加到主列表，不添加到家庭列表
        allChildren.push(newChild)

        console.log('[孩子管理] 新儿童已添加到主列表，未加入任何家庭:', newChild.name)
      }

      // 保存主列表
      wx.setStorageSync('allChildren', allChildren)

      // 更新全局数据（只包含当前家庭的儿童）
      const storageKey = `localChildren_${currentFamilyId}`
      app.globalData.children = wx.getStorageSync(storageKey) || []

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
      let res
      if (editingChild) {
        // 更新：不修改家庭ID
        res = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'createChild',  // 使用 createChild 因为 updateChild 不支持修改 familyId
            ...formData,
            childId: editingChild.childId,  // 传递 childId 表示更新
            familyId: editingChild.familyId  // 保持原有的家庭ID
          }
        })
      } else {
        // 创建新儿童：不自动加入家庭
        res = await wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'createChild',
            ...formData
            // 不传familyId，云函数会设置为空数组
          }
        })
      }

      hideLoading()

      if (res.result.success) {
        // 更新时间戳（关键！）
        await app.updateChildTimestamp()

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
  },

  /**
   * 查看儿童详情
   */
  viewChildDetail(e) {
    const childId = e.currentTarget.dataset.childid
    const child = this.data.children.find(c => c.childId === childId)
    if (child) {
      // 可以在这里显示儿童详情弹窗
      console.log('[孩子管理] 查看儿童详情:', child)
    }
  }
})
