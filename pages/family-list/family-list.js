// pages/family-list/family-list.js
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    families: [],            // 用户所属的所有家庭
    myFamily: null,          // 当前选中的家庭
    familyMembers: [],       // 当前家庭的成员列表
    familyChildren: [],      // 当前家庭的儿童列表
    myChildren: [],          // 我创建的所有儿童
    showCreateModal: false,
    showJoinModal: false,
    showChildModal: false,    // 分配儿童弹窗
    showInviteModal: false,   // 邀请码弹窗
    showAssignChildModal: false,  // 分配单个儿童弹窗
    assigningChild: null,    // 正在分配的儿童
    assignFormData: {
      initialCoins: 0
    },
    currentFamilyId: null,    // 当前选中的家庭ID
    formData: {
      familyName: '',
      inviteCode: '',
      nickname: ''
    }
  },

  onLoad() {
    this.setData({ themeClass: app.globalData.themeClass })
  },

  onShow() {
    this.loadAllFamilies()
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
      this.getTabBar().applyTheme()
    }
  },

  /**
   * 加载所有家庭
   */
  async loadAllFamilies() {
    // 未登录：加载本地家庭
    if (!app.globalData.useCloudStorage) {
      console.log('[家庭列表] 用户未登录，加载本地家庭')
      const localFamilies = wx.getStorageSync('localFamilies') || []
      console.log('[家庭列表] 本地家庭数量:', localFamilies.length)

      this.setData({ families: localFamilies })

      if (localFamilies.length > 0) {
        const currentFamilyId = app.globalData.currentFamilyId
        const familyToSelect = localFamilies.find(f => f.familyId === currentFamilyId) || localFamilies[0]
        console.log('[家庭列表] 选择本地家庭:', familyToSelect)
        this.selectFamilyById(familyToSelect.familyId)
      } else {
        this.setData({
          myFamily: null,
          familyMembers: [],
          familyChildren: []
        })
      }
      return
    }

    // 已登录：从云端加载
    showLoading()

    try {
      console.log('[家庭列表] 开始加载所有家庭')
      const familiesRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getAllMyFamilies'
        }
      })

      console.log('[家庭列表] 云函数返回:', familiesRes)

      if (familiesRes.result.success) {
        const families = familiesRes.result.families || []
        console.log('[家庭列表] 获取到家庭数量:', families.length)
        console.log('[家庭列表] 家庭详细数据:', families)

        if (families.length > 0) {
          console.log('[家庭列表] 家庭列表:', families)

          this.setData({ families: families }, () => {
            console.log('[家庭列表] setData 完成')
            console.log('[家庭列表] 当前 data.families:', this.data.families)
            console.log('[家庭列表] 第一个家庭名称:', this.data.families[0].name)
          })

          const currentFamilyId = app.globalData.currentFamilyId
          const familyToSelect = families.find(f => f.familyId === currentFamilyId) || families[0]
          console.log('[家庭列表] 选择家庭:', familyToSelect)
          this.selectFamilyById(familyToSelect.familyId)
        } else {
          console.log('[家庭列表] 没有找到家庭')
          this.setData({
            families: [],
            myFamily: null,
            familyMembers: [],
            familyChildren: []
          })
        }
      } else {
        console.error('[家庭列表] 云函数返回失败:', familiesRes.result)
        showToast('加载失败: ' + (familiesRes.result.error || '未知错误'))
      }
    } catch (err) {
      console.error('[家庭列表] 加载失败:', err)
      showToast('加载失败: ' + err.message)
    } finally {
      hideLoading()
    }
  },

  /**
   * 选择家庭（从点击事件）
   */
  onFamilyTap(e) {
    const { familyid } = e.currentTarget.dataset
    if (familyid === this.data.currentFamilyId) {
      // 如果点击的是当前家庭，进入家庭详情页
      this.goToFamilyManage()
      return
    }

    // 选择新家庭
    this.selectFamilyById(familyid)
  },

  /**
   * 选择家庭（内部方法）
   */
  async selectFamilyById(familyId) {
    console.log('[家庭列表] 选择家庭:', familyId)
    this.setData({ currentFamilyId: familyId })
    app.setCurrentFamily(familyId)

    // 加载该家庭的详细信息
    await this.loadFamilyDetail(familyId)

    // 自动选择该家庭的第一个儿童
    if (this.data.familyChildren.length > 0) {
      const firstChild = this.data.familyChildren[0]
      app.saveCurrentChildId(firstChild.childId)
      console.log('[家庭列表] 自动选择儿童:', firstChild.name)
    }
  },

  /**
   * 加载家庭详情
   */
  async loadFamilyDetail(familyId) {
    try {
      // 从已加载的家庭列表中查找
      const family = this.data.families.find(f => f.familyId === familyId)
      if (!family) return

      this.setData({ myFamily: family })

      // 加载家庭成员和儿童
      await this.loadAdditionalData(familyId)
    } catch (err) {
      console.error('[家庭列表] 加载家庭详情失败:', err)
    }
  },

  /**
   * 加载额外数据（成员和儿童）
   */
  async loadAdditionalData(familyId) {
    // 未登录：从本地加载
    if (!app.globalData.useCloudStorage) {
      console.log('[家庭列表] 从本地加载家庭数据')
      const localChildren = wx.getStorageSync(`localChildren_${familyId}`) || []
      this.setData({
        familyChildren: localChildren,
        familyMembers: [{  // 本地模式只有创建者一个成员
          openid: 'local',
          nickname: this.data.myFamily.creatorNickname,
          role: 'admin',
          joinedAt: new Date().toISOString()
        }],
        myChildren: []
      })
      return
    }

    // 已登录：从云端加载
    try {
      const [familyChildrenRes, myChildrenRes, membersRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyChildren',
            data: { familyId: familyId }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'getChildren'
          }
        }),
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyMembers',
            data: { familyId: familyId }
          }
        })
      ])

      if (familyChildrenRes.result.success) {
        const children = familyChildrenRes.result.children || []
        console.log('[家庭列表] 家庭儿童原始数据:', familyChildrenRes.result)
        console.log('[家庭列表] 家庭儿童数据:', children.map(c => ({
          name: c.name,
          hasAvatar: !!c.avatar,
          avatar: c.avatar,
          familyCoins: c.familyCoins,
          allKeys: Object.keys(c)
        })))
        this.setData({ familyChildren: children })
      }

      if (myChildrenRes.result.success) {
        // 过滤出未分配到当前家庭的儿童
        const myChildren = (myChildrenRes.result.children || []).filter(
          child => child.familyId !== familyId
        )
        this.setData({ myChildren: myChildren })
      }

      if (membersRes.result.success) {
        this.setData({ familyMembers: membersRes.result.members || [] })
      }
    } catch (err) {
      console.error('[家庭列表] 加载额外数据失败:', err)
    }
  },

  /**
   * 选择家庭
   */
  async selectFamily(e) {
    const { familyid } = e.currentTarget.dataset
    if (familyid === this.data.currentFamilyId) {
      // 如果点击的是当前家庭，进入家庭详情页
      this.goToFamilyManage()
      return
    }

    await this.selectFamilyById(familyid)
  },

  /**
   * 进入家庭管理
   */
  goToFamilyManage() {
    if (!this.data.myFamily) {
      showToast('请先加入或创建家庭')
      return
    }
    wx.navigateTo({ url: '/pages/family/family' })
  },

  /**
   * 显示创建家庭弹窗
   */
  showCreateModal() {
    this.setData({
      showCreateModal: true,
      'formData.familyName': '',
      'formData.creatorNickname': ''
    })
  },

  /**
   * 显示加入家庭弹窗
   */
  showJoinModal() {
    // 未登录时不允许加入家庭
    if (!app.globalData.useCloudStorage) {
      wx.showModal({
        title: '需要登录',
        content: '加入其他家庭需要登录账号',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/settings/settings'
            })
          }
        }
      })
      return
    }

    this.setData({
      showJoinModal: true,
      'formData.inviteCode': '',
      'formData.nickname': ''
    })
  },

  /**
   * 显示分配儿童弹窗
   */
  showChildModal() {
    this.setData({ showChildModal: true })
  },

  /**
   * 显示邀请码弹窗
   */
  showInviteCode() {
    this.setData({ showInviteModal: true })
  },

  /**
   * 关闭所有弹窗
   */
  closeAllModals() {
    this.setData({
      showCreateModal: false,
      showJoinModal: false,
      showChildModal: false,
      showInviteModal: false,
      showAssignChildModal: false
    })
  },

  /**
   * 表单输入
   */
  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    this.setData({
      [`formData.${field}`]: e.detail.value
    })
  },

  /**
   * 创建家庭
   */
  async createFamily() {
    const { familyName, creatorNickname } = this.data.formData
    if (!familyName || !familyName.trim()) {
      showToast('请输入家庭名称')
      return
    }
    if (!creatorNickname || !creatorNickname.trim()) {
      showToast('请输入您的身份')
      return
    }

    showLoading()
    try {
      // 未登录：保存到本地
      if (!app.globalData.useCloudStorage) {
        const localFamilies = wx.getStorageSync('localFamilies') || []
        const newFamily = {
          familyId: `local_${Date.now()}`,
          name: familyName.trim(),
          creatorNickname: creatorNickname.trim(),
          role: 'admin',
          memberCount: 1,
          inviteCode: null,  // 本地家庭没有邀请码
          createdAt: new Date().toISOString()
        }

        localFamilies.push(newFamily)
        wx.setStorageSync('localFamilies', localFamilies)

        // 同时创建本地儿童和任务存储
        wx.setStorageSync(`localChildren_${newFamily.familyId}`, [])
        wx.setStorageSync(`localTasks_${newFamily.familyId}`, [])
        wx.setStorageSync(`localPrizes_${newFamily.familyId}`, [])

        hideLoading()
        showToast('家庭创建成功')
        this.closeAllModals()
        await this.loadAllFamilies()
        return
      }

      // 已登录：保存到云端
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'createFamily',
          data: {
            name: familyName.trim(),
            creatorNickname: creatorNickname.trim()
          }
        }
      })

      hideLoading()
      if (res.result.success) {
        showToast('家庭创建成功')
        this.closeAllModals()
        await this.loadAllFamilies()
      } else {
        showToast(res.result.error || '创建失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 加入家庭
   */
  async joinFamily() {
    const { inviteCode, nickname } = this.data.formData
    if (!inviteCode || !inviteCode.trim()) {
      showToast('请输入邀请码')
      return
    }
    if (!nickname || !nickname.trim()) {
      showToast('请输入昵称')
      return
    }

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'joinFamily',
          data: {
            inviteCode: inviteCode.trim().toUpperCase(),
            nickname: nickname.trim()
          }
        }
      })

      hideLoading()
      if (res.result.success) {
        showToast(res.result.message || '申请已提交')
        this.closeAllModals()
      } else {
        showToast(res.result.error || '加入失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 分配儿童到家庭
   */
  async assignChild(e) {
    const { childid } = e.currentTarget.dataset
    const child = this.data.myChildren.find(c => c.childId === childid)

    if (!child || !this.data.myFamily) return

    // 显示分配儿童弹窗
    this.setData({
      showAssignChildModal: true,
      assigningChild: child,
      'assignFormData.initialCoins': 0
    })
  },

  /**
   * 显示分配儿童弹窗
   */
  showAssignChildModal(e) {
    const { childid } = e.currentTarget.dataset
    const child = this.data.myChildren.find(c => c.childId === childid)

    if (child) {
      this.setData({
        showAssignChildModal: true,
        assigningChild: child,
        'assignFormData.initialCoins': 0
      })
    }
  },

  /**
   * 关闭分配儿童弹窗
   */
  closeAssignChildModal() {
    this.setData({
      showAssignChildModal: false,
      assigningChild: null,
      assignFormData: {
        initialCoins: 0
      }
    })
  },

  /**
   * 分配儿童表单输入
   */
  onAssignInputChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`assignFormData.${field}`]: value
    })
  },

  /**
   * 确认分配儿童
   */
  async confirmAssignChild() {
    if (!this.data.assigningChild || !this.data.myFamily) return

    const initialCoins = parseInt(this.data.assignFormData.initialCoins) || 0

    if (initialCoins < 0) {
      showToast('初始金币不能为负数')
      return
    }

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'assignChildToFamily',
          data: {
            familyId: this.data.myFamily.familyId,
            childId: this.data.assigningChild.childId,
            initialCoins: initialCoins
          }
        }
      })

      hideLoading()
      if (res.result.success) {
        showToast('儿童已添加到家庭')
        this.setData({ showAssignChildModal: false })
        await this.loadAdditionalData(this.data.myFamily.familyId)
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 从分配儿童弹窗跳转到儿童管理页面
   */
  goToAddChildFromModal() {
    // 关闭弹窗
    this.closeAllModals()
    // 跳转到儿童管理页面
    wx.navigateTo({
      url: '/pages/children/children'
    })
  },

  /**
   * 从家庭移除儿童
   */
  async unassignChild(e) {
    const { childid, childname } = e.currentTarget.dataset
    const confirm = await showConfirm(`确定要将"${childname}"从家庭中移除吗？`)
    if (!confirm) return

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageChildren',
        data: {
          action: 'updateChild',
          data: { childId: childid, familyId: null }
        }
      })

      hideLoading()
      if (res.result.success) {
        showToast('已移除')

        // 重新加载全局儿童数据，确保app.globalData.children是最新的
        await app.loadChildren()

        // 如果移除的是当前选中的儿童，清除选择
        if (app.globalData.currentChildId === childid) {
          app.saveCurrentChildId('')
        }

        await this.loadAdditionalData(this.data.myFamily.familyId)
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  },

  /**
   * 复制邀请码
   */
  copyInviteCode() {
    const { myFamily } = this.data
    if (!myFamily || !myFamily.inviteCode) return

    wx.setClipboardData({
      data: myFamily.inviteCode,
      success: () => showToast('邀请码已复制')
    })
  },

  /**
   * 重新生成邀请码
   */
  async regenInviteCode() {
    if (!this.data.myFamily) return
    const confirm = await showConfirm('重新生成邀请码后，旧邀请码将失效')
    if (!confirm) return

    showLoading()
    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'regenerateInviteCode',
          data: { familyId: this.data.myFamily.familyId }
        }
      })

      hideLoading()
      if (res.result.success) {
        showToast('邀请码已更新')
        this.setData({ 'myFamily.inviteCode': res.result.inviteCode })
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      showToast('操作失败')
    }
  }
})
