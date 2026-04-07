// pages/family/family.js
const app = getApp()
const { t } = require('../../utils/i18n.js')
const { showToast, showLoading, hideLoading, showConfirm } = require('../../utils/util.js')

Page({
  data: {
    themeClass: 'theme-light',
    i18n: {},
    family: null,
    members: [],
    myMemberInfo: null,  // 我在当前家庭中的信息
    invitations: [],
    familyChildren: [],
    myChildren: [],
    currentChildIndex: -1,  // 当前选中的儿童索引
    showCreateModal: false,
    showJoinModal: false,
    showInviteActionSheet: false,  // 邀请选项弹窗
    showAssignChildModal: false,  // 分配儿童弹窗
    assigningChild: null,  // 正在分配的儿童
    assignFormData: {
      initialCoins: 0
    },
    formData: {
      familyName: '',
      inviteCode: '',
      nickname: '',
      creatorNickname: '',  // 创建家庭时的身份
      role: 'member'  // 默认为家人
    },
    isParentMode: false,
    showPasswordModal: false,
    isFirstTime: false
  },

  onLoad() {
    this.setData({ themeClass: app.globalData.themeClass })
    this.loadI18n()
  },

  onShow() {
    // 获取当前选中的家庭ID
    const currentFamilyId = app.getCurrentFamilyId()
    console.log('[家庭] 当前家庭ID:', currentFamilyId)

    if (currentFamilyId) {
      // 加载指定家庭的数据
      this.loadFamilyDataById(currentFamilyId)
    } else {
      // 如果没有选中家庭，加载用户的第一个家庭
      this.loadFamilyData()
    }
  },

  /**
   * 加载指定家庭的数据
   */
  async loadFamilyDataById(familyId) {
    showLoading()

    try {
      // 并行获取家庭信息和成员列表
      const [familyInfoRes, membersRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyInfo',
            data: { familyId }
          }
        }),
        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyMembers',
            data: { familyId }
          }
        })
      ])

      if (familyInfoRes.result.success && membersRes.result.success) {
        const family = familyInfoRes.result.family
        const members = membersRes.result.members || []

        console.log('[家庭] 加载到的家庭信息:', family)
        console.log('[家庭] 家庭名称:', family.name)

        // 找到当前用户在家庭中的信息
        const myMemberInfo = members.find(m => m.isMe)

        this.setData({
          family: family,
          members: members,
          myMemberInfo: myMemberInfo || { role: 'member', nickname: '' }
        }, () => {
          // setData 回调
          console.log('[家庭] setData 完成，当前 family:', this.data.family)
          console.log('[家庭] 导航栏标题应该是:', this.data.family ? this.data.family.name : '家庭')
        })

        await this.loadAdditionalData(familyId)
      }
    } catch (err) {
      console.error('[家庭] 加载失败:', err)
      showToast('加载失败')
    } finally {
      hideLoading()
    }
  },

  /**
   * 加载国际化文本
   */
  loadI18n() {
    this.setData({
      i18n: {
        family: {
          title: t('family.title'),
          createFamily: t('family.createFamily'),
          joinFamily: t('family.joinFamily'),
          familyName: t('family.familyName'),
          inviteCode: t('family.inviteCode'),
          nickname: t('family.nickname'),
          create: t('family.create'),
          join: t('family.join'),
          inviteMembers: t('family.inviteMembers'),
          inviteCodePlaceholder: t('family.inviteCodePlaceholder'),
          copyInviteCode: t('family.copyInviteCode'),
          regenInviteCode: t('family.regenInviteCode'),
          shareInviteCode: t('family.shareInviteCode'),
          pendingRequests: t('family.pendingRequests'),
          approve: t('family.approve'),
          reject: t('family.reject'),
          members: t('family.members'),
          removeMember: t('family.removeMember'),
          leaveFamily: t('family.leaveFamily'),
          assignChild: t('family.assignChild'),
          unassignChild: t('family.unassignChild'),
          noFamily: t('family.noFamily'),
          createFamilyTip: t('family.createFamilyTip'),
          joinFamilyTip: t('family.joinFamilyTip'),
          admin: t('family.admin'),
          member: t('family.member'),
          me: t('family.me')
        },
        common: {
          cancel: t('common.cancel'),
          confirm: t('common.confirm'),
          loading: t('common.loading')
        }
      }
    })
  },

  /**
   * 加载家庭数据
   */
  async loadFamilyData() {
    showLoading()

    try {
      const familyRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'getMyFamily'
        }
      })

      if (familyRes.result.success) {
        const { family, members } = familyRes.result

        console.log('[家庭] getMyFamily 返回的家庭信息:', family)

        // 更新当前家庭ID
        if (family) {
          app.saveCurrentFamilyId(family.familyId)
        }

        this.setData({
          family: family,
          members: members || []
        }, () => {
          console.log('[家庭] setData 完成，当前 family:', this.data.family)
          console.log('[家庭] 导航栏标题应该是:', this.data.family ? this.data.family.name : '家庭')
        })

        if (family) {
          await this.loadAdditionalData(family.familyId)
        }
      }
    } catch (err) {
      console.error('[家庭] 加载失败:', err)
      showToast(t('toast.operationFailed'))
    } finally {
      hideLoading()
    }
  },

  /**
   * 加载额外数据
   */
  async loadAdditionalData(familyId) {
    try {
      const [invitationsRes, familyChildrenRes, myChildrenRes] = await Promise.all([
        this.data.family && this.data.family.role === 'admin'
          ? wx.cloud.callFunction({
              name: 'manageFamilies',
              data: {
                action: 'getPendingInvitations',
                data: { familyId }
              }
            })
          : Promise.resolve({ result: { success: true, invitations: [] } }),

        wx.cloud.callFunction({
          name: 'manageFamilies',
          data: {
            action: 'getFamilyChildren',
            data: { familyId }
          }
        }),

        wx.cloud.callFunction({
          name: 'manageChildren',
          data: {
            action: 'getChildren'
          }
        })
      ])

      if (invitationsRes.result.success) {
        const invitations = (invitationsRes.result.invitations || []).map(inv => ({
          ...inv,
          createdAt: this.formatTime(inv.createdAt)
        }))
        this.setData({ invitations })
      }

      if (familyChildrenRes.result.success) {
        const children = familyChildrenRes.result.children || []
        this.setData({ familyChildren: children })

        // 查找当前选中的儿童
        const currentChildId = app.globalData.currentChildId
        if (currentChildId && children.length > 0) {
          const currentIndex = children.findIndex(c => c.childId === currentChildId)
          if (currentIndex >= 0) {
            this.setData({ currentChildIndex: currentIndex })
          }
        }
      }

      if (myChildrenRes.result.success) {
        // 过滤出未分配到当前家庭的儿童
        const myChildren = (myChildrenRes.result.children || []).filter(
          child => child.familyId !== familyId
        )
        this.setData({ myChildren: myChildren })
      }
    } catch (err) {
      console.error('[家庭] 加载额外数据失败:', err)
    }
  },

  /**
   * 修改家庭头像（仅创建者）
   */
  async changeFamilyAvatar() {
    if (!this.data.family || !this.data.family.isCreator) return

    try {
      const chooseRes = await wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera']
      })

      const tempFilePath = chooseRes.tempFilePaths[0]
      showLoading('正在上传...')

      // 上传图片到云存储
      const cloudPath = `family_avatars/${this.data.family.familyId}_${Date.now()}.jpg`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath
      })

      const fileID = uploadRes.fileID

      // 更新家庭头像记录
      const updateRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'updateFamilyAvatar',
          data: {
            familyId: this.data.family.familyId,
            avatar: fileID
          }
        }
      })

      if (updateRes.result.success) {
        showToast('家庭头像已更新')
        // 重新加载家庭数据以刷新头像
        this.loadFamilyDataById(this.data.family.familyId)
      } else {
        showToast(updateRes.result.error || '更新失败')
      }
    } catch (err) {
      if (err.errMsg !== 'chooseImage:fail cancel') {
        console.error('[家庭] 修改头像失败:', err)
        showToast('修改失败')
      }
    } finally {
      hideLoading()
    }
  },

  /**
   * 显示创建家庭模态框
   */
  showCreateModal() {
    this.setData({
      showCreateModal: true,
      'formData.familyName': '',
      'formData.creatorNickname': ''
    })
  },

  /**
   * 显示加入家庭模态框
   */
  showJoinModal() {
    this.setData({
      showJoinModal: true,
      'formData.inviteCode': '',
      'formData.nickname': ''
    })
  },

  closeModal() {
    this.setData({
      showCreateModal: false,
      showJoinModal: false,
      showInviteActionSheet: false,
      showAssignChildModal: false
    })
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset
    const value = e.detail.value
    this.setData({
      [`formData.${field}`]: value
    })
  },

  /**
   * 创建家庭
   */
  async createFamily() {
    const { familyName, creatorNickname } = this.data.formData

    if (!familyName.trim()) {
      showToast('请输入家庭名称')
      return
    }

    if (!creatorNickname.trim()) {
      showToast('请输入您的身份')
      return
    }

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'createFamily',
          data: {
            name: familyName,
            creatorNickname: creatorNickname.trim()
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast('家庭创建成功')
        this.setData({ showCreateModal: false })
        await this.loadFamilyData()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 创建失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 加入家庭
   */
  async joinFamily() {
    const { inviteCode, nickname, role } = this.data.formData

    if (!inviteCode.trim()) {
      showToast('请输入邀请码')
      return
    }

    if (!nickname.trim()) {
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
            inviteCode: inviteCode.trim(),
            nickname: nickname.trim(),
            role: role || 'member'
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message || '申请已提交')
        this.setData({ showJoinModal: false })
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 加入失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 显示邀请选项
   */
  showInviteOptions() {
    this.setData({ showInviteActionSheet: true })
  },

  /**
   * 关闭邀请选项弹窗
   */
  closeInviteActionSheet() {
    this.setData({ showInviteActionSheet: false })
  },

  /**
   * 选择身份
   */
  selectRole(e) {
    const { role } = e.currentTarget.dataset
    this.setData({
      'formData.role': role
    })
  },

  /**
   * 快捷选择身份（妈妈、爸爸等）
   */
  selectIdentity(e) {
    const { identity } = e.currentTarget.dataset
    // 判断是创建家庭还是加入家庭
    if (this.data.showCreateModal) {
      this.setData({
        'formData.creatorNickname': identity
      })
    } else if (this.data.showJoinModal) {
      this.setData({
        'formData.nickname': identity
      })
    }
  },

  /**
   * 分享给朋友
   */
  shareToFriend() {
    // 先准备好分享数据
    this.shareData = {
      title: `邀请你加入家庭「${this.data.family.name}」`,
      path: `/pages/index/index?action=joinFamily&familyId=${this.data.family.familyId}&inviteCode=${this.data.family.inviteCode}`,
      imageUrl: ''  // 可以设置分享图片
    }

    // 显示提示，引导用户点击右上角分享
    wx.showModal({
      title: '分享给朋友',
      content: '请点击右上角 ••• 按钮，选择"发送给朋友"',
      showCancel: false,
      success: () => {
        this.closeInviteActionSheet()
      }
    })
  },

  /**
   * 小程序分享配置
   */
  onShareAppMessage() {
    // 如果有待分享的数据，使用它
    if (this.shareData) {
      const data = this.shareData
      this.shareData = null
      return data
    }

    // 默认分享内容
    return {
      title: '妈妈表扬我 - 儿童任务奖励管理',
      path: '/pages/index/index'
    }
  },

  /**
   * 保存分享图片
   */
  async saveShareImage() {
    // TODO: 生成邀请卡片图片并保存到相册
    showToast('功能开发中')
    this.closeInviteActionSheet()
  },

  /**
   * 复制邀请码
   */
  copyInviteCode() {
    const { family } = this.data
    if (!family || !family.inviteCode) return

    wx.setClipboardData({
      data: family.inviteCode,
      success: () => {
        showToast('邀请码已复制')
        this.closeInviteActionSheet()
      }
    })
  },

  /**
   * 复制邀请码
   */
  copyInviteCode() {
    const { family } = this.data
    if (!family || !family.inviteCode) return

    wx.setClipboardData({
      data: family.inviteCode,
      success: () => {
        showToast('邀请码已复制')
      }
    })
  },

  /**
   * 重新生成邀请码
   */
  async regenInviteCode() {
    const confirm = await showConfirm('重新生成邀请码后，旧邀请码将失效，确定要重新生成吗？')
    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'regenerateInviteCode',
          data: { familyId: this.data.family.familyId }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast('邀请码已更新')
        this.setData({
          'family.inviteCode': res.result.inviteCode
        })
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 重新生成邀请码失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 审核申请
   */
  async reviewInvitation(e) {
    const { invitationid, approve } = e.currentTarget.dataset

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'reviewInvitation',
          data: {
            invitationId: invitationid,
            approve: approve
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message)
        await this.loadFamilyData()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 审核失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 移除成员
   */
  async removeMember(e) {
    const { memberopenid, nickname } = e.currentTarget.dataset

    const confirm = await showConfirm(`确定要将"${nickname}"移出家庭吗？`)
    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'removeMember',
          data: {
            familyId: this.data.family.familyId,
            memberOpenid: memberopenid
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message)
        await this.loadFamilyData()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 移除成员失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 检查家长权限
   */
  checkParentPermission() {
    if (!app.isParentMode()) {
      showToast('此功能需要家长权限')
      setTimeout(() => {
        this.setData({
          showPasswordModal: true,
          isFirstTime: !app.hasParentPassword()
        })
      }, 500)
      return false
    }
    return true
  },

  onPasswordSuccess() {
    this.setData({
      isParentMode: true,
      showPasswordModal: false
    })
    showToast('已进入家长模式')
  },

  onPasswordCancel() {
    this.setData({ showPasswordModal: false })
  },

  onPasswordClose() {
    this.setData({ showPasswordModal: false })
  },

  /**
   * 显示成员管理选项
   */
  showMemberOptions(e) {
    if (!this.checkParentPermission()) return
    const { memberopenid, nickname, role } = e.currentTarget.dataset

    const itemList = [
      role === 'admin' ? '取消管理员' : '设为管理员',
      '移除成员'
    ]

    wx.showActionSheet({
      itemList,
      itemColor: '#333333',
      success: async (res) => {
        if (res.tapIndex === 0) {
          // 修改角色
          const newRole = role === 'admin' ? 'member' : 'admin'
          this.changeMemberRole(memberopenid, nickname, newRole)
        } else if (res.tapIndex === 1) {
          // 移除成员
          this.doRemoveMember(memberopenid, nickname)
        }
      }
    })
  },

  /**
   * 修改成员角色
   */
  async changeMemberRole(memberOpenid, nickname, newRole) {
    const roleName = newRole === 'admin' ? '管理员' : '普通成员'
    const confirm = await showConfirm(`确定要将"${nickname}"设为${roleName}吗？`)
    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'setMemberRole',
          data: {
            familyId: this.data.family.familyId,
            memberOpenid: memberOpenid,
            role: newRole
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message || '设置成功')
        if (this.data.family && this.data.family.familyId) {
          await this.loadFamilyDataById(this.data.family.familyId)
        } else {
          await this.loadFamilyData()
        }
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 修改成员角色失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 实际执行移除
   */
  async doRemoveMember(memberOpenid, nickname) {
    const confirm = await showConfirm(`确定要将"${nickname}"移出家庭吗？`)
    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'removeMember',
          data: {
            familyId: this.data.family.familyId,
            memberOpenid: memberOpenid
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message)
        if (this.data.family && this.data.family.familyId) {
          await this.loadFamilyDataById(this.data.family.familyId)
        } else {
          await this.loadFamilyData()
        }
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 移除成员失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 退出家庭
   */
  async leaveFamily() {
    const confirm = await showConfirm('确定要退出家庭吗？退出后将无法管理家庭的任务和奖品。')
    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'leaveFamily',
          data: { familyId: this.data.family.familyId }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message)
        await this.loadFamilyData()
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 退出家庭失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 分配儿童到家庭
   */
  async assignChild(e) {
    const { childid } = e.currentTarget.dataset

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'assignChildToFamily',
          data: {
            familyId: this.data.family.familyId,
            childId: childid,
            initialCoins: this.data.assignFormData.initialCoins || 0
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message)
        this.setData({ showAssignChildModal: false })
        await this.loadAdditionalData(this.data.family.familyId)
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 分配儿童失败:', err)
      showToast(t('toast.operationFailed'))
    }
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
    if (!this.data.assigningChild) return

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
            familyId: this.data.family.familyId,
            childId: this.data.assigningChild.childId,
            initialCoins: initialCoins
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message)
        this.setData({ showAssignChildModal: false })
        await this.loadAdditionalData(this.data.family.familyId)
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 分配儿童失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 选择当前儿童
   */
  onCurrentChildChange(e) {
    const index = e.detail.value
    const child = this.data.familyChildren[index]
    if (child) {
      app.saveCurrentChildId(child.childId)
      this.setData({ currentChildIndex: index })
      showToast(`已切换到：${child.name}`)
    }
  },

  /**
   * 跳转到添加儿童页面
   */
  goToAddChild() {
    wx.navigateTo({
      url: '/pages/children/children'
    })
  },

  /**
   * 取消分配儿童
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
          data: {
            childId: childid,
            familyId: null
          }
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
          this.setData({ currentChildIndex: -1 })
        }

        await this.loadAdditionalData(this.data.family.familyId)
      } else {
        showToast(res.result.error || t('toast.operationFailed'))
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 移除儿童失败:', err)
      showToast(t('toast.operationFailed'))
    }
  },

  /**
   * 修改家庭名称
   */
  async updateFamilyName() {
    wx.showModal({
      title: '修改家庭名称',
      editable: true,
      placeholderText: this.data.family.name,
      success: async (res) => {
        if (res.confirm && res.content) {
          const newName = res.content.trim()
          if (!newName) {
            showToast('家庭名称不能为空')
            return
          }

          showLoading()

          try {
            const response = await wx.cloud.callFunction({
              name: 'manageFamilies',
              data: {
                action: 'updateFamilyName',
                data: {
                  familyId: this.data.family.familyId,
                  newName: newName
                }
              }
            })

            hideLoading()

            if (response.result.success) {
              showToast('家庭名称已更新')
              await this.loadFamilyData()
            } else {
              showToast(response.result.error || '操作失败')
            }
          } catch (err) {
            hideLoading()
            console.error('[家庭] 修改名称失败:', err)
            showToast('操作失败')
          }
        }
      }
    })
  },

  /**
   * 解散家庭
   */
  async disbandFamily() {
    const confirm = await showConfirm(
      '确定要解散家庭吗？\n\n' +
      '解散后：\n' +
      '• 所有成员将被移除\n' +
      '• 儿童将不再属于此家庭\n' +
      '• 儿童在此家庭获得的金币将被保留\n' +
      '• 家庭数据将被标记为已解散'
    )

    if (!confirm) return

    showLoading()

    try {
      const res = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'disbandFamily',
          data: {
            familyId: this.data.family.familyId
          }
        }
      })

      hideLoading()

      if (res.result.success) {
        showToast(res.result.message)
        // 清除当前家庭ID并返回家庭列表
        app.setCurrentFamily(null)
        wx.switchTab({
          url: '/pages/family-list/family-list'
        })
      } else {
        showToast(res.result.error || '操作失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭] 解散家庭失败:', err)
      showToast('操作失败')
    }
  },

  /**
   * 格式化时间
   */
  formatTime(timestamp) {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    const minute = date.getMinutes().toString().padStart(2, '0')

    return `${month}-${day} ${hour}:${minute}`
  },

  /**
   * 修改成员头像
   */
  async changeMemberAvatar() {
    if (!app.globalData.useCloudStorage) {
      showToast('请先登录')
      return
    }

    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        that.uploadMemberAvatar(filePath)
      }
    })
  },

  /**
   * 上传成员头像
   */
  async uploadMemberAvatar(filePath) {
    const that = this
    const cloudPath = `member_avatars/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`

    showLoading('上传中...')

    try {
      // 上传到云存储
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: filePath
      })

      const fileID = uploadRes.fileID
      console.log('[家庭详情] 头像上传成功，fileID:', fileID)

      // 更新到数据库
      const updateRes = await wx.cloud.callFunction({
        name: 'manageFamilies',
        data: {
          action: 'updateMemberAvatar',
          data: {
            familyId: that.data.family.familyId,
            avatar: fileID
          }
        }
      })

      hideLoading()

      if (updateRes.result.success) {
        showToast('头像修改成功')

        // 更新本地数据
        const updatedMember = {
          ...that.data.myMemberInfo,
          avatar: fileID
        }
        that.setData({ myMemberInfo: updatedMember })

        // 重新加载成员列表
        await that.loadFamilyDataById(that.data.family.familyId)
      } else {
        showToast(updateRes.result.error || '修改失败')
      }
    } catch (err) {
      hideLoading()
      console.error('[家庭详情] 上传头像失败:', err)
      showToast('上传失败，请重试')
    }
  },

  /**
   * 编辑成员昵称
   */
  editMemberNickname() {
    if (!app.globalData.useCloudStorage) {
      showToast('请先登录')
      return
    }

    wx.showModal({
      title: '修改称呼',
      editable: true,
      placeholderText: this.data.myMemberInfo?.nickname || '',
      success: async (res) => {
        if (res.confirm && res.content) {
          const newNickname = res.content.trim()

          if (!newNickname) {
            showToast('请输入称呼')
            return
          }

          showLoading()

          try {
            const updateRes = await wx.cloud.callFunction({
              name: 'manageFamilies',
              data: {
                action: 'updateMemberNickname',
                data: {
                  familyId: that.data.family.familyId,
                  nickname: newNickname
                }
              }
            })

            hideLoading()

            if (updateRes.result.success) {
              showToast('称呼修改成功')

              // 更新本地数据
              const updatedMember = {
                ...that.data.myMemberInfo,
                nickname: newNickname
              }
              that.setData({ myMemberInfo: updatedMember })

              // 重新加载成员列表
              await that.loadFamilyDataById(that.data.family.familyId)
            } else {
              showToast(updateRes.result.error || '修改失败')
            }
          } catch (err) {
            hideLoading()
            console.error('[家庭详情] 修改称呼失败:', err)
            showToast('修改失败')
          }
        }
      }
    })
  }
})
