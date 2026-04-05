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
  const { action, data } = event

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
          inviteCode: null, // 不返回邀请码，需要单独查询
          role: 'admin'
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

      return {
        success: true,
        family: {
          familyId: family.familyId,
          name: family.name,
          inviteCode: member.role === 'admin' ? family.inviteCode : null,
          role: member.role,
          createdAt: family.createdAt
        }
      }
    }

    // 获取我的所有家庭
    if (action === 'getAllMyFamilies') {
      console.log('[getAllMyFamilies] 开始查询')

      // 1. 查找我是成员的家庭
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          status: 'active'
        })
        .get()

      console.log('[getAllMyFamilies] family_members 查询结果:', memberRes.data.length)
      const memberFamilyIds = memberRes.data.map(m => m.familyId)
      console.log('[getAllMyFamilies] memberFamilyIds:', memberFamilyIds)

      // 2. 查找我直接创建的家庭（兼容旧数据）
      const ownerRes = await db.collection('families')
        .where({
          openid: OPENID
        })
        .get()

      console.log('[getAllMyFamilies] families 查询结果:', ownerRes.data.length)
      const ownerFamilyIds = ownerRes.data.map(f => f.familyId)
      console.log('[getAllMyFamilies] ownerFamilyIds:', ownerFamilyIds)

      // 3. 合并所有家庭ID（去重）
      const allFamilyIds = [...new Set([...memberFamilyIds, ...ownerFamilyIds])]
      console.log('[getAllMyFamilies] 合并后的 familyIds:', allFamilyIds)

      if (allFamilyIds.length === 0) {
        console.log('[getAllMyFamilies] 没有找到任何家庭')
        return {
          success: true,
          families: []
        }
      }

      // 4. 获取所有家庭的详细信息
      const familiesRes = await db.collection('families')
        .where({
          familyId: _.in(allFamilyIds)
        })
        .get()

      console.log('[getAllMyFamilies] 最终家庭列表:', familiesRes.data.length)

      const families = familiesRes.data.map(family => {
        // 判断用户在该家庭中的角色
        const member = memberRes.data.find(m => m.familyId === family.familyId)
        const isOwner = ownerFamilyIds.includes(family.familyId)

        return {
          familyId: family.familyId,
          name: family.name,
          inviteCode: (member?.role === 'admin' || isOwner) ? family.inviteCode : null,
          role: member?.role || (isOwner ? 'admin' : 'member'),
          createdAt: family.createdAt
        }
      })

      console.log('[getAllMyFamilies] 返回家庭数据:', families)

      return {
        success: true,
        families: families
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
          createdAt: family.createdAt
        },
        members: allMembersRes.data.length > 0 ? allMembersRes.data.map(m => ({
          openid: m.openid,
          nickname: m.nickname,
          role: m.role,
          isMe: m.openid === OPENID
        })) : [{
          openid: OPENID,
          nickname: '创建者',
          role: 'admin',
          isMe: true
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

      // 检查儿童是否已经分配到该家庭
      const existingChild = childRes.data[0]
      if (existingChild.familyId === familyId) {
        return {
          success: false,
          error: '该儿童已经在该家庭中'
        }
      }

      // 更新儿童的家庭ID
      await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .update({
          data: {
            familyId: familyId
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

      // 获取所有分配到该家庭的儿童
      const childrenRes = await db.collection('children')
        .where({
          familyId: familyId
        })
        .get()

      // 获取这些儿童在该家庭的金币余额
      const childIds = childrenRes.data.map(c => c.childId)
      let coinsMap = {}

      console.log('[manageFamilies] getFamilyChildren - childIds:', childIds)

      if (childIds.length > 0) {
        const coinsRes = await db.collection('family_coin_balances')
          .where({
            familyId: familyId
          })
          .get()

        console.log('[manageFamilies] getFamilyChildren - 金币记录:', coinsRes.data.length)
        console.log('[manageFamilies] getFamilyChildren - 金币记录详情:', coinsRes.data.map(r => ({
          childId: r.childId,
          balance: r.balance
        })))

        // 建立 childId -> balance 的映射
        coinsRes.data.forEach(record => {
          coinsMap[record.childId] = record.balance
        })

        console.log('[manageFamilies] getFamilyChildren - coinsMap:', coinsMap)
      }

      // 为每个儿童添加 familyCoins 字段
      const enrichedChildren = childrenRes.data.map(child => ({
        ...child,
        familyCoins: coinsMap[child.childId] || 0
      }))

      console.log('[manageFamilies] getFamilyChildren - enrichedChildren:', enrichedChildren.map(c => ({
        name: c.name,
        childId: c.childId,
        familyCoins: c.familyCoins
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

      return {
        success: true,
        members: allMembersRes.data.map(m => ({
          openid: m.openid,
          nickname: m.nickname,
          role: m.role,
          isMe: m.openid === OPENID
        }))
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

      // 验证是否是家庭创建者
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId,
          creatorOpenid: OPENID
        })
        .get()

      if (familyRes.data.length === 0) {
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

      // 验证是否是家庭创建者
      const familyRes = await db.collection('families')
        .where({
          familyId: familyId,
          creatorOpenid: OPENID
        })
        .get()

      if (familyRes.data.length === 0) {
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

      // 更新所有成员状态为已解散
      for (const member of membersRes.data) {
        await db.collection('family_members')
          .where({
            memberId: member.memberId
          })
          .update({
            data: {
              status: 'disbanded',
              disbandedAt: new Date()
            }
          })
      }

      // 将所有儿童的 familyId 设为 null
      await db.collection('children')
        .where({
          familyId: familyId
        })
        .update({
          data: {
            familyId: null
          }
        })

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
