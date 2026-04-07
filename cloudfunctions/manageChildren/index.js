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
  const { action, data } = event

  console.log('[manageChildren] action:', action)
  console.log('[manageChildren] openid:', OPENID)

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
          familyId: child.familyId,
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

      // 替换头像URL为临时URL
      const processedChildren = childrenWithAvatar.map(child => {
        if (child.avatar && tempUrlMap[child.avatar]) {
          return {
            ...child,
            avatar: tempUrlMap[child.avatar]
          }
        }
        return child
      })

      return {
        success: true,
        children: processedChildren
      }
    }

    // 创建孩子
    if (action === 'createChild') {
      const { name, avatar, gender, age, familyId, childId } = data

      // 验证必须有家庭ID
      if (!familyId) {
        return {
          success: false,
          error: '儿童必须加入一个家庭'
        }
      }

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
              familyId: familyId,
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
        familyId: familyId,  // 必须有家庭ID
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

      // 再创建该儿童在此家庭的金币余额记录（初始为0）
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

      // 注意：这里保留相关的任务完成记录、兑换记录、金币记录
      // 这些记录作为历史数据保留

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
