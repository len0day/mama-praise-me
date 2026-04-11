// cloudfunctions/manageChildren/index.js
// 孩子管理云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 辅助函数：生成孩子ID
 */
function generateChildId() {
  return `child_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, ...data } = event

  console.log('[manageChildren] action:', action)
  console.log('[manageChildren] openid:', OPENID)
  console.log('[manageChildren] event:', JSON.stringify(event))

  try {
    // 获取孩子列表
    if (action === 'getChildren') {
      const res = await db.collection('children')
        .where({
          openid: OPENID
        })
        .orderBy('createdAt', 'asc')
        .get()

      // 处理返回的儿童数据，收集所有fileID
      const fileList = []
      const childrenWithAvatar = res.data.map(child => {
        const result = {
          childId: child.childId,
          name: child.name,
          gender: child.gender,
          age: child.age,
          familyIds: child.familyIds || [],  // 返回所有家庭ID数组
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
          console.log('[manageChildren] getChildren - 临时URL转换结果:', tempUrlRes)

          // 建立fileID -> tempURL的映射
          tempUrlRes.fileList.forEach((item, index) => {
            if (item.status === 0) {
              tempUrlMap[fileList[index]] = item.tempFileURL
            }
          })
        } catch (err) {
          console.error('[manageChildren] getChildren - 临时URL转换失败:', err)
        }
      }

      // 确保所有儿童都有有效的头像URL
      const processedChildren = childrenWithAvatar.map(child => {
        if (child.avatar && tempUrlMap[child.avatar]) {
          return {
            ...child,
            avatar: tempUrlMap[child.avatar]
          };
        } else {
          return {
            ...child,
            avatar: '' // 使用空字符串作为默认值，前端按是否存在来决定显示图片或占位文字
          };
        }
      })

      return {
        success: true,
        children: processedChildren
      }
    }

    // 创建孩子
    if (action === 'createChild') {
      const { name, avatar, gender, age, familyId, childId } = data

      // 移除家庭ID的强制验证
      // if (!familyId) {
      //   return {
      //     success: false,
      //     error: '儿童必须加入一个家庭'
      //   }
      // }

      // 验证家庭ID（如果提供了家庭ID，则进行验证）
      if (familyId) {
        const memberRes = await db.collection('family_members')
          .where({
            openid: OPENID,
            familyId: familyId,
            status: 'active'
          })
          .get();

        if (memberRes.data.length === 0) {
          return {
            success: false,
            error: '您不是该家庭成员，无法添加儿童'
          };
        }
      }

      // 如果提供了 childId，说明是更新（从 familyId null 改为有值）
      if (childId) {
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
            error: '儿童不存在或无权修改'
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
              familyIds: [familyId],  // 使用数组存储
              name: name,
              avatar: avatar || '',
              gender: gender || 'male',
              age: age || 0,
              updatedAt: new Date()
            }
          })

        // 返回更新后的儿童信息
        const updatedChild = await db.collection('children')
          .where({
            openid: OPENID,
            childId: childId
          })
          .get()

        return {
          success: true,
          child: updatedChild.data[0]
        }
      }

      // 创建新儿童
      const newChildId = generateChildId()

      const childData = {
        openid: OPENID,
        childId: newChildId,
        familyIds: familyId ? [familyId] : [],  // 使用数组存储多个家庭ID
        name: name,
        avatar: avatar || '',
        gender: gender || 'male',
        age: age || 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // 先创建儿童记录
      const childRes = await db.collection('children').add({
        data: childData
      })

      // 如果提供了家庭ID，创建该儿童在此家庭的金币余额记录
      if (familyId) {
        try {
          await db.collection('family_coin_balances').add({
            data: {
              childId: newChildId,
              familyId: familyId,
              balance: 0,
              totalEarned: 0,
              totalSpent: 0,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          })
        } catch (balanceErr) {
          console.error('[manageChildren] 创建金币余额记录失败:', balanceErr)
          // 如果金币余额记录创建失败，删除已创建的儿童记录（回滚）
          await db.collection('children').doc(childRes._id).remove()
          return {
            success: false,
            error: '创建金币余额记录失败，请重试'
          }
        }
      }

      return {
        success: true,
        child: childData
      }
    }

    // 更新孩子
    if (action === 'updateChild') {
      const { childId, ...updateData } = data

      const res = await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .update({
          data: {
            ...updateData,
            updatedAt: new Date()
          }
        })

      if (res.stats.updated === 0) {
        return {
          success: false,
          error: '孩子不存在或无权修改'
        }
      }

      return {
        success: true
      }
    }

    // 删除孩子
    if (action === 'deleteChild') {
      const { childId } = data

      // 先删除该孩子在所有家庭的金币余额记录
      try {
        const balancesRes = await db.collection('family_coin_balances')
          .where({
            childId: childId
          })
          .remove()

        console.log('[deleteChild] 删除儿童', childId, '的金币余额记录，删除数:', balancesRes.stats.removed)
      } catch (balanceErr) {
        console.error('[deleteChild] 删除金币余额记录失败:', balanceErr)
        // 继续删除孩子记录
      }

      // 删除孩子记录
      const res = await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .remove()

      if (res.stats.removed === 0) {
        return {
          success: false,
          error: '孩子不存在或无权删除'
        }
      }

      return {
        success: true
      }
    }

    // 获取单个孩子信息
    if (action === 'getChild') {
      const { childId } = data

      const res = await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .get()

      if (res.data.length === 0) {
        return {
          success: false,
          error: '孩子不存在'
        }
      }

      return {
        success: true,
        child: res.data[0]
      }
    }

    // 将孩子加入家庭
    if (action === 'assignChildToFamily') {
      const { childId, familyId } = data

      console.log('[assignChildToFamily] 开始处理 - childId:', childId, 'familyId:', familyId)

      // 验证家庭是否存在且用户是成员
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
          error: '您不是该家庭成员，无法添加儿童'
        }
      }

      // 验证儿童是否存在且属于当前用户
      const childRes = await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .get()

      if (childRes.data.length === 0) {
        return {
          success: false,
          error: '儿童不存在或无权修改'
        }
      }

      // 检查该儿童是否已经在这个家庭中（通过 familyIds 数组）
      const childData = childRes.data[0]
      const currentFamilyIds = childData.familyIds || []

      console.log('[assignChildToFamily] 儿童', childId, '当前的家庭IDs:', currentFamilyIds)

      if (currentFamilyIds.includes(familyId)) {
        // 已经在这个家庭中
        console.log('[assignChildToFamily] 儿童', childId, '已在家庭', familyId, '中')
        return {
          success: false,
          error: '该儿童已在此家庭中'
        }
      }

      // 添加家庭ID到数组
      currentFamilyIds.push(familyId)
      console.log('[assignChildToFamily] 更新后的familyIds:', currentFamilyIds)

      const updateRes = await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .update({
          data: {
            familyIds: currentFamilyIds,
            updatedAt: new Date()
          }
        })

      console.log('[assignChildToFamily] 更新children结果:', updateRes.stats)

      if (updateRes.stats.updated === 0) {
        console.error('[assignChildToFamily] 更新children失败！')
      }

      // 创建该儿童在新家庭的金币余额记录
      console.log('[assignChildToFamily] 准备为儿童', childId, '创建家庭', familyId, '的金币余额记录')
      const balanceRes = await db.collection('family_coin_balances').add({
        data: {
          childId: childId,
          familyId: familyId,
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })

      console.log('[assignChildToFamily] 金币余额记录创建结果:', balanceRes._id)

      return {
        success: true
      }
    }

    // 获取孩子的最后更新时间
    if (action === 'getChildLastUpdateTime') {
      const { childId, familyId } = data

      // 验证权限：必须是该家庭的成员
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

      // 获取儿童的最后更新时间（不再需要查询 familyId，因为孩子可以属于多个家庭）
      const childRes = await db.collection('children')
        .where({
          childId: childId
        })
        .field({
          updatedAt: true
        })
        .get()

      if (childRes.data.length === 0) {
        return {
          success: false,
          error: '儿童不存在'
        }
      }

      const child = childRes.data[0]
      const lastUpdateTime = child.updatedAt ? new Date(child.updatedAt).getTime() : 0

      return {
        success: true,
        lastUpdateTime: lastUpdateTime
      }
    }

    // 更新儿童时间戳
    if (action === 'updateChildTimestamp') {
      const { childId, familyId, timestamp } = data

      // 验证权限：必须是该家庭的成员
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

      // 更新儿童的 updatedAt 时间戳（不再需要查询 familyId）
      const updateDate = timestamp ? new Date(timestamp) : new Date()
      const res = await db.collection('children')
        .where({
          childId: childId
        })
        .update({
          data: {
            updatedAt: updateDate
          }
        })

      if (res.stats.updated === 0) {
        return {
          success: false,
          error: '儿童不存在或无权修改'
        }
      }

      return {
        success: true
      }
    }

    // 获取家庭的儿童列表（通过 children.familyIds 数组）
    if (action === 'getFamilyChildrenById') {
      const { familyId } = data

      console.log('[getFamilyChildrenById] familyId:', familyId)

      if (!familyId) {
        console.error('[getFamilyChildrenById] familyId为空')
        return {
          success: false,
          error: '家庭ID不能为空'
        }
      }

      console.log('[getFamilyChildrenById] 开始查询家庭', familyId, '的儿童')

      // 验证权限：必须是该家庭的成员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: familyId,
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        console.log('[getFamilyChildrenById] 用户不是该家庭成员')
        return {
          success: false,
          error: '您不是该家庭成员'
        }
      }

      // 直接查询 children 集合，找到 familyIds 数组中包含该家庭ID的儿童
      const childrenRes = await db.collection('children')
        .where({
          familyIds: db.command.eq(familyId)
        })
        .orderBy('createdAt', 'asc')
        .get()

      console.log('[getFamilyChildrenById] 查询到的儿童数:', childrenRes.data.length)

      // 处理头像URL
      const fileList = []
      const childrenWithAvatar = childrenRes.data.map(child => {
        const result = {
          childId: child.childId,
          name: child.name,
          gender: child.gender,
          age: child.age,
          familyIds: child.familyIds || [],  // 返回完整的家庭ID数组
          createdAt: child.createdAt,
          updatedAt: child.updatedAt
        }

        if (child.avatar && child.avatar.startsWith('cloud://')) {
          result.avatar = child.avatar
          fileList.push(child.avatar)
        }

        return result
      })

      // 转换头像URL
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
          console.error('[manageChildren] getFamilyChildrenById - 头像URL转换失败:', err)
        }
      }

      const processedChildren = childrenWithAvatar.map(child => {
        if (child.avatar && tempUrlMap[child.avatar]) {
          return {
            ...child,
            avatar: tempUrlMap[child.avatar]
          }
        } else {
          return {
            ...child,
            avatar: '/images/default-avatar.png' // 设置默认头像
          }
        }
      })

      return {
        success: true,
        children: processedChildren
      }
    }

    // 获取单个儿童在当前家庭下的数据（用于客户端合并 globalData）
    if (action === 'getChildData') {
      const { childId, familyId } = data

      if (!childId || !familyId) {
        return {
          success: false,
          error: '儿童ID与家庭ID不能为空'
        }
      }

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

      const cRes = await db.collection('children')
        .where({ childId: childId })
        .limit(1)
        .get()

      if (cRes.data.length === 0) {
        return {
          success: false,
          error: '儿童不存在'
        }
      }

      const c = cRes.data[0]
      const ids = c.familyIds || []
      const inFamily = ids.includes(familyId) || c.familyId === familyId
      if (!inFamily) {
        return {
          success: false,
          error: '该儿童不属于该家庭'
        }
      }

      const childData = {
        childId: c.childId,
        name: c.name,
        gender: c.gender,
        age: c.age,
        familyIds: c.familyIds || [],
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      }

      if (c.avatar && c.avatar.startsWith('cloud://')) {
        try {
          const tempUrlRes = await cloud.getTempFileURL({ fileList: [c.avatar] })
          if (tempUrlRes.fileList[0] && tempUrlRes.fileList[0].status === 0) {
            childData.avatar = tempUrlRes.fileList[0].tempFileURL
          } else {
            childData.avatar = c.avatar
          }
        } catch (err) {
          childData.avatar = c.avatar
        }
      } else if (c.avatar) {
        childData.avatar = c.avatar
      }

      return {
        success: true,
        childData
      }
    }

    return {
      success: false,
      error: '未知操作'
    }

  } catch (err) {
    console.error('[manageChildren] 操作失败:', err)
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
