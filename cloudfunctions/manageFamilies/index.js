// cloudfunctions/manageFamilies/index.js
// 家庭管理云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 辅助函数：生成家庭ID
 */
function generateFamilyId() {
  return `family_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 辅助函数：生成邀请码（6位随机字母数字）
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 排除易混淆字符
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, ...data } = event

  console.log('[manageFamilies] action:', action)
  console.log('[manageFamilies] openid:', OPENID)

  try {
    // 创建家庭
    if (action === 'createFamily') {
      const { name, creatorNickname } = data

      if (!name || !name.trim()) {
        return {
          success: false,
          error: '家庭名称不能为空'
        }
      }

      const familyId = generateFamilyId()

      // 创建家庭记录
      await db.collection('families').add({
        data: {
          openid: OPENID,
          creatorOpenid: OPENID, // 明确标注创建者
          familyId: familyId,
          name: name.trim(),
          inviteCode: generateInviteCode(),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })

      // 创建者自动成为管理员，使用自定义昵称
      await db.collection('family_members').add({
        data: {
          openid: OPENID,
          familyId: familyId,
          role: 'admin', // admin, member
          nickname: creatorNickname?.trim() || '创建者',
          status: 'active',
          createdAt: new Date()
        }
      })

      return {
        success: true,
        family: {
          familyId: familyId,
          name: name.trim(),
          inviteCode: null,
          role: 'admin',
          isCreator: true
        }
      }
    }

    // 获取家庭信息（通过familyId）
    if (action === 'getFamilyInfo') {
      const { familyId } = data

      // 验证是否是家庭成员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      // 获取家庭信息
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId
        })
        .get()

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '家庭不存在'
        }
      }

      const family = familyRes.data[0]
      const member = memberRes.data[0]
      
      let avatarUrl = family.avatar || ''
      if (avatarUrl && avatarUrl.startsWith('cloud://')) {
        try {
          const res = await cloud.getTempFileURL({ fileList: [avatarUrl] })
          if (res.fileList[0].status === 0) {
            avatarUrl = res.fileList[0].tempFileURL
          }
        } catch (err) {
          console.error('[manageFamilies] getFamilyInfo - 转换家庭头像URL失败:', err)
        }
      }

      return {
        success: true,
        family: {
          familyId: family.familyId,
          name: family.name,
          avatar: avatarUrl,
          inviteCode: member.role === 'admin' ? family.inviteCode : null,
          role: member.role,
          isCreator: family.creatorOpenid === OPENID || family.openid === OPENID,
          createdAt: family.createdAt
        }
      }
    }

    // 获取我的所有家庭
    if (action === 'getAllMyFamilies') {
      console.log('[getAllMyFamilies] 开始查询')
      console.log('[getAllMyFamilies] 当前用户 OPENID:', OPENID)

      // 1. 查找我是成员的活跃家庭
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          status: 'active'
        })
        .get()

      console.log('[getAllMyFamilies] family_members 查询结果:', memberRes.data.length)
      const memberFamilyIds = memberRes.data.map(m => m.familyId)
      console.log('[getAllMyFamilies] memberFamilyIds:', memberFamilyIds)

      // 2. 查找我创建的所有家庭（包括已解散的）
      // 使用 creatorOpenid 或 openid 匹配
      const creatorRes = await db.collection('families')
        .where(
          _.or(
            { creatorOpenid: OPENID },
            { openid: OPENID }
          )
        )
        .get()

      console.log('[getAllMyFamilies] 作为创建者的家庭查询结果:', creatorRes.data.length)
      creatorRes.data.forEach(f => {
        console.log('[getAllMyFamilies] 创建者家庭:', f.familyId, f.name, 'status:', f.status, 'creatorOpenid:', f.creatorOpenid, 'openid:', f.openid)
      })
      const creatorFamilyIds = creatorRes.data.map(f => f.familyId)
      console.log('[getAllMyFamilies] creatorFamilyIds:', creatorFamilyIds)

      // 3. 合并所有家庭ID（去重）
      const allFamilyIds = [...new Set([...memberFamilyIds, ...creatorFamilyIds])]
      console.log('[getAllMyFamilies] 合并后的 familyIds:', allFamilyIds)

      if (allFamilyIds.length === 0) {
        console.log('[getAllMyFamilies] 没有找到任何家庭')
        return {
          success: true,
          families: [],
          deletedFamilies: []
        }
      }

      // 4. 获取所有家庭的详细信息
      const familiesRes = await db.collection('families')
        .where({
          familyId: _.in(allFamilyIds)
        })
        .get()

      console.log('[getAllMyFamilies] 最终家庭列表:', familiesRes.data.length)

      // 获取所有家庭的任务、奖品、成员和儿童数量
      const familyIds = familiesRes.data.map(f => f.familyId)
      console.log('[getAllMyFamilies] 查询的家庭IDs:', familyIds)

      const [tasksRes, prizesRes, membersRes, childrenRes] = await Promise.all([
        db.collection('tasks').where({ familyId: _.in(familyIds), isActive: true }).get(),
        db.collection('prizes').where({ familyId: _.in(familyIds), isActive: true }).get(),
        db.collection('family_members').where({ familyId: _.in(familyIds), status: 'active' }).get(),
        // 查询所有儿童，然后在内存中过滤（因为 familyIds 是数组）
        db.collection('children').get()
      ])

      console.log('[getAllMyFamilies] 任务查询结果:', tasksRes.data.length)
      console.log('[getAllMyFamilies] 奖品查询结果:', prizesRes.data.length)
      console.log('[getAllMyFamilies] 成员查询结果:', membersRes.data.length)
      console.log('[getAllMyFamilies] 儿童查询结果:', childrenRes.data.length)

      // 建立familyId -> 数量的映射
      const taskCountMap = {}
      tasksRes.data.forEach(task => {
        taskCountMap[task.familyId] = (taskCountMap[task.familyId] || 0) + 1
      })

      const prizeCountMap = {}
      prizesRes.data.forEach(prize => {
        prizeCountMap[prize.familyId] = (prizeCountMap[prize.familyId] || 0) + 1
      })

      // 统计每个家庭的儿童数量
      const childCountMap = {}
      childrenRes.data.forEach(child => {
        if (child.familyIds && Array.isArray(child.familyIds)) {
          // familyIds 是数组，遍历统计
          child.familyIds.forEach(fid => {
            // 只统计我们查询的家庭
            if (familyIds.includes(fid)) {
              childCountMap[fid] = (childCountMap[fid] || 0) + 1
            }
          })
        } else if (child.familyId && familyIds.includes(child.familyId)) {
          // 兼容旧数据：familyId 是单个值
          childCountMap[child.familyId] = (childCountMap[child.familyId] || 0) + 1
        }
      })

      console.log('[getAllMyFamilies] 每个家庭的儿童数量:', childCountMap)

      const parentCountMap = {}
      membersRes.data.forEach(member => {
        parentCountMap[member.familyId] = (parentCountMap[member.familyId] || 0) + 1
      })

      console.log('[getAllMyFamilies] 统计映射:', {
        taskCountMap,
        prizeCountMap,
        childCountMap,
        parentCountMap
      })

      // 提取家庭详情中的 avatar 并转换为临时URL
      const fileList = []
      familiesRes.data.forEach(f => {
        if (f.avatar && f.avatar.startsWith('cloud://')) {
          fileList.push(f.avatar)
        }
      })

      let tempUrlMap = {}
      if (fileList.length > 0) {
        try {
          const tempUrlRes = await cloud.getTempFileURL({ fileList })
          tempUrlRes.fileList.forEach((item, index) => {
            if (item.status === 0) {
              tempUrlMap[fileList[index]] = item.tempFileURL
            }
          })
        } catch (err) {
          console.error('[manageFamilies] getAllMyFamilies - 转换图片URL失败:', err)
        }
      }

      const families = familiesRes.data.map(family => {
        // 判断用户在该家庭中的角色
        const member = memberRes.data.find(m => m.familyId === family.familyId)
        const isCreator = creatorFamilyIds.includes(family.familyId)
        const isDeleted = family.status === 'disbanded'

        return {
          familyId: family.familyId,
          name: family.name,
          avatar: (family.avatar && tempUrlMap[family.avatar]) ? tempUrlMap[family.avatar] : (family.avatar || ''),
          inviteCode: (member?.role === 'admin' || isCreator) && !isDeleted ? family.inviteCode : null,
          role: member?.role || (isCreator ? 'admin' : 'member'),
          isCreator: isCreator,
          myNickname: member?.nickname || null,
          taskCount: isDeleted ? 0 : (taskCountMap[family.familyId] || 0),
          prizeCount: isDeleted ? 0 : (prizeCountMap[family.familyId] || 0),
          childCount: isDeleted ? 0 : (childCountMap[family.familyId] || 0),
          parentCount: isDeleted ? 0 : (parentCountMap[family.familyId] || 0),
          status: family.status || 'active',
          disbandedAt: family.disbandedAt,
          createdAt: family.createdAt
        }
      })

      // 分离活跃家庭和已解散家庭
      const activeFamilies = families.filter(f => f.status === 'active')
      const deletedFamilies = families.filter(f => f.status === 'disbanded')

      console.log('[getAllMyFamilies] 活跃家庭数量:', activeFamilies.length)
      console.log('[getAllMyFamilies] 已解散家庭数量:', deletedFamilies.length)
      if (deletedFamilies.length > 0) {
        deletedFamilies.forEach(f => {
          console.log('[getAllMyFamilies] 已解散家庭:', f.familyId, f.name, 'disbandedAt:', f.disbandedAt)
        })
      }

      return {
        success: true,
        families: activeFamilies,
        deletedFamilies: deletedFamilies  // 仅创建者可见的已解散家庭
      }
    }

    // 获取我的家庭信息（返回第一个，用于兼容）
    if (action === 'getMyFamily') {
      // 1. 查找我是成员的家庭
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          status: 'active'
        })
        .get()

      const memberFamilyIds = memberRes.data.map(m => m.familyId)

      // 2. 查找我直接创建的家庭（兼容旧数据）
      const ownerRes = await db.collection('families')
        .where({
          openid: OPENID
        })
        .get()

      const ownerFamilyIds = ownerRes.data.map(f => f.familyId)

      // 3. 合并所有家庭ID
      const allFamilyIds = [...new Set([...memberFamilyIds, ...ownerFamilyIds])]

      if (allFamilyIds.length === 0) {
        return {
          success: true,
          family: null,
          members: []
        }
      }

      // 4. 返回第一个家庭
      const firstFamilyId = allFamilyIds[0]
      const family = ownerRes.data.find(f => f.familyId === firstFamilyId) ||
                     (await db.collection('families').where({ familyId: firstFamilyId }).get()).data[0]

      if (!family) {
        return {
          success: true,
          family: null,
          members: []
        }
      }

      // 获取所有家庭成员
      const allMembersRes = await db.collection('family_members')
        .where({
          familyId: firstFamilyId,
          status: 'active'
        })
        .get()

      const member = memberRes.data.find(m => m.familyId === firstFamilyId)
      const isOwner = ownerFamilyIds.includes(firstFamilyId)

      return {
        success: true,
        family: {
          familyId: family.familyId,
          name: family.name,
          inviteCode: (member?.role === 'admin' || isOwner) ? family.inviteCode : null,
          role: member?.role || (isOwner ? 'admin' : 'member'),
          isCreator: isOwner,
          createdAt: family.createdAt
        },
        members: allMembersRes.data.length > 0 ? allMembersRes.data.map(m => ({
          openid: m.openid,
          nickname: m.nickname,
          role: m.role,
          isMe: m.openid === OPENID,
          isCreator: m.openid === (family.creatorOpenid || family.openid)
        })) : [{
          openid: OPENID,
          nickname: '创建者',
          role: 'admin',
          isMe: true,
          isCreator: true
        }]
      }
    }

    // 获取家庭邀请码（仅管理员）
    if (action === 'getInviteCode') {
      const { familyId } = data

      // 验证权限
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '无权限获取邀请码'
        }
      }

      // 获取家庭信息
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId
        })
        .get()

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '家庭不存在'
        }
      }

      return {
        success: true,
        inviteCode: familyRes.data[0].inviteCode
      }
    }

    // 重新生成邀请码（仅管理员）
    if (action === 'regenerateInviteCode') {
      const { familyId } = data

      // 验证权限
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '无权限修改邀请码'
        }
      }

      const newCode = generateInviteCode()

      await db.collection('families')
        .where({
          familyId: familyId
        })
        .update({
          data: {
            inviteCode: newCode,
            updatedAt: new Date()
          }
        })

      return {
        success: true,
        inviteCode: newCode
      }
    }

    // 申请加入家庭
    if (action === 'joinFamily') {
      const { inviteCode, nickname, role } = data

      if (!inviteCode || !inviteCode.trim()) {
        return {
          success: false,
          error: '邀请码不能为空'
        }
      }

      if (!nickname || !nickname.trim()) {
        return {
          success: false,
          error: '昵称不能为空'
        }
      }

      // 查找使用此邀请码的家庭
      const familyRes = await db.collection('families')
        .where({
          inviteCode: inviteCode.trim().toUpperCase()
        })
        .get()

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '邀请码无效'
        }
      }

      const family = familyRes.data[0]

      // 检查是否已经是家庭成员
      const existingMemberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: family.familyId
        })
        .get()

      if (existingMemberRes.data.length > 0) {
        const existing = existingMemberRes.data[0]
        if (existing.status === 'active') {
          return {
            success: false,
            error: '您已经是该家庭成员'
          }
        } else if (existing.status === 'pending') {
          return {
            success: false,
            error: '您已经申请加入，等待审核'
          }
        }
      }

      // 获取用户微信信息
      let userInfo = null
      try {
        const userRes = await db.collection('users').where({
          openid: OPENID
        }).get()

        if (userRes.data.length > 0) {
          userInfo = userRes.data[0].userInfo || null
        }
      } catch (err) {
        console.error('[manageFamilies] 获取用户信息失败:', err)
      }

      // 创建加入申请
      await db.collection('family_invitations').add({
        data: {
          invitationId: `invitation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          familyId: family.familyId,
          familyName: family.name,
          applicantOpenid: OPENID,
          applicantNickname: nickname.trim(),
          applicantRole: role || 'member', // 申请的角色：admin 或 member
          applicantUserInfo: userInfo, // 微信用户信息（头像、昵称等）
          status: 'pending', // pending, approved, rejected
          createdAt: new Date()
        }
      })

      return {
        success: true,
        message: '申请已提交，等待家庭管理员审核'
      }
    }

    // 获取待审核申请（仅管理员）
    if (action === 'getPendingInvitations') {
      const { familyId } = data

      // 验证权限
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '无权限查看申请'
        }
      }

      // 获取待审核申请
      const invitationsRes = await db.collection('family_invitations')
        .where({
          familyId: familyId,
          status: 'pending'
        })
        .orderBy('createdAt', 'desc')
        .get()

      return {
        success: true,
        invitations: invitationsRes.data
      }
    }

    // 审核申请（仅管理员）
    if (action === 'reviewInvitation') {
      const { invitationId, approve } = data

      // 获取申请信息
      const invitationRes = await db.collection('family_invitations')
        .where({
          invitationId: invitationId
        })
        .get()

      if (invitationRes.data.length === 0) {
        return {
          success: false,
          error: '申请不存在'
        }
      }

      const invitation = invitationRes.data[0]

      // 验证权限
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: invitation.familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '无权限审核申请'
        }
      }

      if (approve) {
        // 批准：创建成员记录，使用申请时的角色
        await db.collection('family_members').add({
          data: {
            openid: invitation.applicantOpenid,
            familyId: invitation.familyId,
            role: invitation.applicantRole || 'member', // 使用申请时选择的角色
            nickname: invitation.applicantNickname,
            status: 'active',
            createdAt: new Date()
          }
        })

        // 更新申请状态
        await db.collection('family_invitations')
          .where({
            invitationId: invitationId
          })
          .update({
            data: {
              status: 'approved',
              reviewedAt: new Date(),
              reviewedBy: OPENID
            }
          })

        return {
          success: true,
          message: '已批准加入申请'
        }
      } else {
        // 拒绝：更新申请状态
        await db.collection('family_invitations')
          .where({
            invitationId: invitationId
          })
          .update({
            data: {
              status: 'rejected',
              reviewedAt: new Date(),
              reviewedBy: OPENID
            }
          })

        return {
          success: true,
          message: '已拒绝加入申请'
        }
      }
    }

    // 移除家庭成员（仅管理员）
    if (action === 'removeMember') {
      const { familyId, memberOpenid } = data

      // 验证权限
      const adminRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (adminRes.data.length === 0) {
        return {
          success: false,
          error: '无权限移除成员'
        }
      }

      // 不能移除自己
      if (memberOpenid === OPENID) {
        return {
          success: false,
          error: '不能移除自己，请使用退出家庭功能'
        }
      }

      // 移除成员
      await db.collection('family_members')
        .where({
          openid: memberOpenid,
          familyId: familyId
        })
        .update({
          data: {
            status: 'removed',
            removedAt: new Date()
          }
        })

      return {
        success: true,
        message: '已移除成员'
      }
    }

    // 设置成员角色（仅管理员）
    if (action === 'setMemberRole') {
      const { familyId, memberOpenid, role } = data

      // 验证权限
      const adminRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (adminRes.data.length === 0) {
        return {
          success: false,
          error: '无权限修改成员角色'
        }
      }

      // 自己不能修改自己的角色
      if (memberOpenid === OPENID) {
        return {
          success: false,
          error: '不能修改自己的角色'
        }
      }

      if (!['admin', 'member'].includes(role)) {
        return {
          success: false,
          error: '无效的角色'
        }
      }

      await db.collection('family_members')
        .where({
          openid: memberOpenid,
          familyId: familyId
        })
        .update({
          data: {
            role: role,
            updatedAt: new Date()
          }
        })

      return {
        success: true,
        message: '角色已更新'
      }
    }

    // 退出家庭
    if (action === 'leaveFamily') {
      const { familyId } = data

      // 检查是否是管理员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      const member = memberRes.data[0]

      // 如果是管理员，检查是否还有其他管理员
      if (member.role === 'admin') {
        const otherAdminsRes = await db.collection('family_members')
          .where({
            familyId: familyId,
            role: 'admin',
            status: 'active'
          })
          .get()

        // 如果只有自己一个管理员，不能退出
        if (otherAdminsRes.data.length <= 1) {
          return {
            success: false,
            error: '您是唯一的管理员，无法退出。请先转让管理员或解散家庭'
          }
        }
      }

      // 移除成员
      await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId
        })
        .update({
          data: {
            status: 'left',
            leftAt: new Date()
          }
        })

      return {
        success: true,
        message: '已退出家庭'
      }
    }

    // 分配儿童到家庭
    if (action === 'assignChildToFamily') {
      const { familyId, childId, initialCoins } = data

      console.log('[manageFamilies] assignChildToFamily - familyId:', familyId, 'childId:', childId, 'initialCoins:', initialCoins)

      // 验证是否是家庭成员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      // 验证儿童是否属于当前用户
      const childRes = await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .get()

      if (childRes.data.length === 0) {
        return {
          success: false,
          error: '儿童不存在或无权操作'
        }
      }

      // 检查儿童是否已经分配到该家庭（通过 familyIds 数组）
      const existingChild = childRes.data[0]
      const currentFamilyIds = existingChild.familyIds || []
      if (currentFamilyIds.includes(familyId)) {
        return {
          success: false,
          error: '该儿童已经在该家庭中'
        }
      }

      // 更新儿童的家庭ID列表
      currentFamilyIds.push(familyId)
      await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .update({
          data: {
            familyIds: currentFamilyIds
          }
        })

      // 创建或更新该儿童在此家庭的金币余额记录
      const existingBalanceRes = await db.collection('family_coin_balances')
        .where({
          childId: childId,
          familyId: familyId
        })
        .get()

      const coins = parseInt(initialCoins) || 0
      console.log('[manageFamilies] assignChildToFamily - coins to set:', coins)

      if (existingBalanceRes.data.length > 0) {
        // 更新现有记录
        await db.collection('family_coin_balances')
          .where({
            childId: childId,
            familyId: familyId
          })
          .update({
            data: {
              balance: coins,
              totalEarned: coins,
              updatedAt: new Date()
            }
          })
        console.log('[manageFamilies] assignChildToFamily - updated existing balance')
      } else {
        // 创建新记录
        await db.collection('family_coin_balances').add({
          data: {
            childId: childId,
            familyId: familyId,
            balance: coins,
            totalEarned: coins,
            totalSpent: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })
        console.log('[manageFamilies] assignChildToFamily - created new balance')
      }

      return {
        success: true,
        message: '儿童已分配到家庭'
      }
    }

    // 获取家庭的儿童列表
    if (action === 'getFamilyChildren') {
      const { familyId } = data

      // 验证是否是家庭成员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      // 直接查询 children 集合，找到 familyIds 数组中包含该家庭ID的儿童
      const childrenRes = await db.collection('children')
        .where({
          familyIds: _.eq(familyId)
        })
        .orderBy('createdAt', 'asc')
        .get()

      console.log('[manageFamilies] getFamilyChildren - 查询到的儿童数:', childrenRes.data.length)

      // 获取这些儿童在该家庭的金币余额
      const childIds = childrenRes.data.map(c => c.childId)
      let coinsMap = {}

      if (childIds.length > 0) {
        const coinsRes = await db.collection('family_coin_balances')
          .where({
            familyId: familyId,
            childId: _.in(childIds)
          })
          .get()

        console.log('[manageFamilies] getFamilyChildren - 金币记录:', coinsRes.data.length)

        // 建立 childId -> balance 的映射
        coinsRes.data.forEach(record => {
          coinsMap[record.childId] = record.balance
        })
      }

      // 为每个儿童添加 familyCoins 字段，并处理头像URL
      const fileList = []
      const childrenWithAvatar = childrenRes.data.map(child => {
        const result = {
          childId: child.childId,
          name: child.name,
          gender: child.gender,
          age: child.age,
          familyIds: child.familyIds || [],  // 返回完整的家庭ID数组
          familyCoins: coinsMap[child.childId] || 0,
          createdAt: child.createdAt,
          updatedAt: child.updatedAt
        }

        // 收集所有fileID
        if (child.avatar && child.avatar.startsWith('cloud://')) {
          result.avatar = child.avatar
          fileList.push(child.avatar)
        }

        return result
      })

      // 使用getTempFileURL将fileID转换为临时下载URL（2小时有效）
      let tempUrlMap = {}
      if (fileList.length > 0) {
        try {
          const tempUrlRes = await cloud.getTempFileURL({
            fileList: fileList
          })
          console.log('[manageFamilies] getFamilyChildren - 临时URL转换结果:', tempUrlRes)

          // 建立fileID -> tempURL的映射
          tempUrlRes.fileList.forEach((item, index) => {
            if (item.status === 0) {
              tempUrlMap[fileList[index]] = item.tempFileURL
            }
          })
        } catch (err) {
          console.error('[manageFamilies] getFamilyChildren - 临时URL转换失败:', err)
        }
      }

      // 替换头像URL为临时URL
      const enrichedChildren = childrenWithAvatar.map(child => {
        if (child.avatar && tempUrlMap[child.avatar]) {
          return {
            ...child,
            avatar: tempUrlMap[child.avatar]
          }
        }
        return child
      })

      console.log('[manageFamilies] getFamilyChildren - enrichedChildren:', enrichedChildren.map(c => ({
        name: c.name,
        childId: c.childId,
        familyCoins: c.familyCoins,
        hasAvatar: !!c.avatar,
        avatarPrefix: c.avatar ? c.avatar.substring(0, 50) : null
      })))

      return {
        success: true,
        children: enrichedChildren
      }
    }

    // 获取家庭成员列表
    if (action === 'getFamilyMembers') {
      const { familyId } = data

      // 验证是否是家庭成员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      // 获取所有家庭成员
      const allMembersRes = await db.collection('family_members')
        .where({
          familyId: familyId,
          status: 'active'
        })
        .get()

      // 获取家庭信息以确定创建者
      const familyRes = await db.collection('families')
        .where({ familyId: familyId })
        .get()
      const creatorOpenid = familyRes.data.length > 0 ? (familyRes.data[0].creatorOpenid || familyRes.data[0].openid) : null

      // 为成员提取fileID并转换为临时URL
      const fileList = []
      allMembersRes.data.forEach(m => {
        if (m.avatar && m.avatar.startsWith('cloud://')) {
          fileList.push(m.avatar)
        }
      })

      let tempUrlMap = {}
      if (fileList.length > 0) {
        try {
          const tempUrlRes = await cloud.getTempFileURL({
            fileList: fileList
          })
          tempUrlRes.fileList.forEach((item, index) => {
            if (item.status === 0) {
              tempUrlMap[fileList[index]] = item.tempFileURL
            }
          })
        } catch (err) {
          console.error('[manageFamilies] getFamilyMembers - 临时URL转换失败:', err)
        }
      }

      return {
        success: true,
        members: allMembersRes.data.map(m => ({
          openid: m.openid,
          nickname: m.nickname,
          role: m.role,
          avatar: (m.avatar && tempUrlMap[m.avatar]) ? tempUrlMap[m.avatar] : m.avatar,
          isMe: m.openid === OPENID,
          isCreator: m.openid === creatorOpenid
        }))
      }
    }

    // 更新成员头像
    if (action === 'updateMemberAvatar') {
      const { familyId, avatar } = data

      if (!avatar) {
        return {
          success: false,
          error: '头像不能为空'
        }
      }

      // 验证是否是家庭成员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      // 更新头像
      await db.collection('family_members')
        .doc(memberRes.data[0]._id)
        .update({
          data: {
            avatar: avatar
          }
        })

      return {
        success: true
      }
    }

    // 更新成员昵称
    if (action === 'updateMemberNickname') {
      const { familyId, nickname } = data

      if (!nickname || !nickname.trim()) {
        return {
          success: false,
          error: '称呼不能为空'
        }
      }

      // 验证是否是家庭成员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      // 更新昵称
      await db.collection('family_members')
        .doc(memberRes.data[0]._id)
        .update({
          data: {
            nickname: nickname.trim()
          }
        })

      return {
        success: true
      }
    }

    // 修改家庭名称（仅创建者）
    if (action === 'updateFamilyName') {
      const { familyId, newName } = data

      if (!newName || !newName.trim()) {
        return {
          success: false,
          error: '家庭名称不能为空'
        }
      }

      // 验证是否是家庭创建者（兼容旧数据，同时检查 creatorOpenid 和 openid）
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId
        })
        .get()

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '家庭不存在'
        }
      }

      const family = familyRes.data[0]
      const isCreator = family.creatorOpenid === OPENID || family.openid === OPENID

      if (!isCreator) {
        return {
          success: false,
          error: '只有家庭创建者可以修改家庭名称'
        }
      }

      // 更新家庭名称
      await db.collection('families')
        .where({
          familyId: familyId
        })
        .update({
          data: {
            name: newName.trim(),
            updatedAt: new Date()
          }
        })

      return {
        success: true,
        message: '家庭名称已更新'
      }
    }

    // 解散家庭（仅创建者，保留金币数据）
    if (action === 'disbandFamily') {
      const { familyId } = data

      if (!familyId || String(familyId).trim() === '') {
        return {
          success: false,
          error: '家庭ID无效'
        }
      }

      console.log('[disbandFamily] familyId:', familyId)
      console.log('[disbandFamily] OPENID:', OPENID)

      // 验证是否是家庭创建者（兼容旧数据，同时检查 creatorOpenid 和 openid）
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId
        })
        .get()

      console.log('[disbandFamily] 查询到家庭数:', familyRes.data.length)
      if (familyRes.data.length > 0) {
        console.log('[disbandFamily] 家庭 creatorOpenid:', familyRes.data[0].creatorOpenid)
        console.log('[disbandFamily] 家庭 openid:', familyRes.data[0].openid)
      }

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '家庭不存在'
        }
      }

      const family = familyRes.data[0]
      const isCreator = family.creatorOpenid === OPENID || family.openid === OPENID

      console.log('[disbandFamily] isCreator:', isCreator)

      if (!isCreator) {
        return {
          success: false,
          error: '只有家庭创建者可以解散家庭'
        }
      }

      // 获取所有家庭成员
      const membersRes = await db.collection('family_members')
        .where({
          familyId: familyId,
          status: 'active'
        })
        .get()

      // 更新所有成员状态为已解散（成员记录无 memberId 字段，必须用 _id）
      for (const member of membersRes.data) {
        if (!member._id) continue
        await db.collection('family_members')
          .doc(member._id)
          .update({
            data: {
              status: 'disbanded',
              disbandedAt: new Date()
            }
          })
      }

      // 儿童：familyIds 数组包含该家庭，或旧数据仅有 familyId
      const childrenRes = await db.collection('children')
        .where(
          _.or(
            { familyIds: _.eq(familyId) },
            { familyId: familyId }
          )
        )
        .get()

      console.log('[disbandFamily] 找到需要移除家庭ID的儿童数:', childrenRes.data.length)

      for (const child of childrenRes.data) {
        if (!child._id) continue
        const newFamilyIds = (child.familyIds || []).filter(id => id !== familyId)
        const updateData = {
          familyIds: newFamilyIds
        }
        if (child.familyId === familyId) {
          updateData.familyId = _.remove()
        }
        await db.collection('children')
          .doc(child._id)
          .update({
            data: updateData
          })
      }

      // 标记家庭为已解散（保留数据和金币记录）
      await db.collection('families')
        .where({
          familyId: familyId
        })
        .update({
          data: {
            status: 'disbanded',
            disbandedAt: new Date(),
            updatedAt: new Date()
          }
        })

      return {
        success: true,
        message: '家庭已解散，金币数据已保留'
      }
    }

    // 修改家庭头像（仅创建者）
    if (action === 'updateFamilyAvatar') {
      const { familyId, avatar } = data

      if (!avatar) {
        return {
          success: false,
          error: '头像地址不能为空'
        }
      }

      // 验证是否是家庭创建者（兼容旧数据，同时检查 creatorOpenid 和 openid）
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId
        })
        .get()

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '家庭不存在'
        }
      }

      const family = familyRes.data[0]
      const isCreator = family.creatorOpenid === OPENID || family.openid === OPENID

      if (!isCreator) {
        return {
          success: false,
          error: '只有家庭创建者可以修改家庭头像'
        }
      }

      // 更新头像
      await db.collection('families')
        .where({
          familyId: familyId
        })
        .update({
          data: {
            avatar: avatar,
            updatedAt: new Date()
          }
        })

      return {
        success: true,
        message: '家庭头像已更新'
      }
    }

    // 获取已解散的家庭列表（仅创建者可见）
    if (action === 'getDeletedFamilies') {
      const ownerRes = await db.collection('families')
        .where({
          creatorOpenid: OPENID,
          status: 'disbanded'
        })
        .orderBy('disbandedAt', 'desc')
        .get()

      // 兼容旧数据（只有 openid 没有 creatorOpenid）
      const oldOwnerRes = await db.collection('families')
        .where({
          creatorOpenid: db.command.exists(false),
          openid: OPENID,
          status: 'disbanded'
        })
        .orderBy('disbandedAt', 'desc')
        .get()

      // 合并结果
      const allDeletedFamilies = [...ownerRes.data, ...oldOwnerRes.data]
      // 去重（基于 familyId）
      const uniqueDeletedFamilies = []
      const seenFamilyIds = new Set()
      for (const family of allDeletedFamilies) {
        if (!seenFamilyIds.has(family.familyId)) {
          seenFamilyIds.add(family.familyId)
          uniqueDeletedFamilies.push(family)
        }
      }

      return {
        success: true,
        families: uniqueDeletedFamilies.map(f => ({
          familyId: f.familyId,
          name: f.name,
          avatar: f.avatar || '',
          disbandedAt: f.disbandedAt,
          createdAt: f.createdAt
        }))
      }
    }

    // 恢复已解散的家庭
    if (action === 'restoreFamily') {
      const { familyId } = data

      if (!familyId) {
        return {
          success: false,
          error: '缺少家庭ID'
        }
      }

      // 验证是否是家庭创建者
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId,
          status: 'disbanded'
        })
        .get()

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '家庭不存在或未解散'
        }
      }

      const family = familyRes.data[0]
      const isCreator = family.creatorOpenid === OPENID || family.openid === OPENID

      if (!isCreator) {
        return {
          success: false,
          error: '只有家庭创建者可以恢复家庭'
        }
      }

      // 恢复家庭状态
      await db.collection('families')
        .where({
          familyId: familyId
        })
        .update({
          data: {
            status: 'active',
            restoredAt: new Date(),
            updatedAt: new Date()
          }
        })

      // 创建者自动成为管理员（如果成员记录不存在或已解散）
      const existingMemberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId
        })
        .get()

      if (existingMemberRes.data.length === 0) {
        // 创建新成员记录
        await db.collection('family_members').add({
          data: {
            openid: OPENID,
            familyId: familyId,
            role: 'admin',
            nickname: '创建者',
            status: 'active',
            createdAt: new Date()
          }
        })
      } else {
        // 恢复现有成员记录
        await db.collection('family_members')
          .doc(existingMemberRes.data[0]._id)
          .update({
            data: {
              status: 'active',
              role: 'admin',
              restoredAt: new Date()
            }
          })
      }

      return {
        success: true,
        message: '家庭已恢复'
      }
    }

    // 彻底删除家庭（仅创建者，且家庭必须已解散）
    if (action === 'permanentlyDeleteFamily') {
      const { familyId } = data

      if (!familyId) {
        return {
          success: false,
          error: '缺少家庭ID'
        }
      }

      // 验证是否是家庭创建者且家庭已解散
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId,
          status: 'disbanded'
        })
        .get()

      if (familyRes.data.length === 0) {
        return {
          success: false,
          error: '家庭不存在或未解散'
        }
      }

      const family = familyRes.data[0]
      const isCreator = family.creatorOpenid === OPENID || family.openid === OPENID

      if (!isCreator) {
        return {
          success: false,
          error: '只有家庭创建者可以彻底删除家庭'
        }
      }

      // 辅助函数：安全删除集合（忽略集合不存在的错误）
      const safeRemove = async (collectionName, whereCondition) => {
        try {
          await db.collection(collectionName).where(whereCondition).remove()
          console.log(`[permanentlyDeleteFamily] 已删除 ${collectionName} 的数据`)
        } catch (err) {
          if (err.errCode === -502005) {
            // 集合不存在，忽略错误
            console.log(`[permanentlyDeleteFamily] ${collectionName} 集合不存在，跳过`)
          } else {
            // 其他错误，记录但不中断
            console.error(`[permanentlyDeleteFamily] 删除 ${collectionName} 失败:`, err)
          }
        }
      }

      // 删除所有家庭成员记录
      await safeRemove('family_members', { familyId: familyId })

      // 删除家庭的所有任务
      await safeRemove('tasks', { familyId: familyId })

      // 删除家庭的所有奖品
      await safeRemove('prizes', { familyId: familyId })

      // 删除家庭的所有金币记录
      await safeRemove('family_coin_balances', { familyId: familyId })

      // 删除家庭的所有任务完成记录
      await safeRemove('task_completions', { familyId: familyId })

      // 删除家庭的所有奖品兑换记录（尝试两个可能的集合名）
      await safeRemove('prize_redemptions', { familyId: familyId })
      await safeRemove('redemptions', { familyId: familyId })

      // 删除家庭记录本身
      await db.collection('families')
        .where({
          familyId: familyId
        })
        .remove()

      return {
        success: true,
        message: '家庭已彻底删除'
      }
    }

    return {
      success: false,
      error: '未知操作'
    }

  } catch (err) {
    console.error('[manageFamilies] 操作失败:', err)
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
