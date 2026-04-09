// cloudfunctions/manageFamilyCoins/index.js
// 家庭金币管理云函数（按家庭分别存储儿童的金币）

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data } = event

  console.log('[manageFamilyCoins] action:', action)
  console.log('[manageFamilyCoins] openid:', OPENID)

  try {
    // 获取儿童在指定家庭的金币余额
    if (action === 'getChildCoinsInFamily') {
      const { childId, familyId } = data

      const res = await db.collection('family_coin_balances')
        .where({
          childId: childId,
          familyId: familyId
        })
        .get()

      if (res.data.length === 0) {
        // 如果没有记录，返回初始余额0
        return {
          success: true,
          balance: 0,
          totalEarned: 0,
          totalSpent: 0
        }
      }

      const balance = res.data[0]
      return {
        success: true,
        balance: balance.balance || 0,
        totalEarned: balance.totalEarned || 0,
        totalSpent: balance.totalSpent || 0
      }
    }

    // 增加金币（完成任务、手动调整等）
    if (action === 'addCoins') {
      const { childId, familyId, amount, taskId, taskTitle, prizeId, prizeName, recordType, recordDescription } = data

      // 确保 amount 是数字类型
      const amountNum = parseInt(amount) || 0

      // 获取或创建金币余额记录
      const balanceRes = await db.collection('family_coin_balances')
        .where({
          childId: childId,
          familyId: familyId
        })
        .get()

      let currentBalance = 0
      let totalEarned = 0

      if (balanceRes.data.length > 0) {
        currentBalance = parseInt(balanceRes.data[0].balance) || 0
        totalEarned = parseInt(balanceRes.data[0].totalEarned) || 0
      }

      const newBalance = currentBalance + amountNum
      const newTotalEarned = totalEarned + amountNum

      if (balanceRes.data.length > 0) {
        // 更新现有记录
        await db.collection('family_coin_balances')
          .where({
            childId: childId,
            familyId: familyId
          })
          .update({
            data: {
              balance: newBalance,
              totalEarned: newTotalEarned,
              updatedAt: new Date()
            }
          })
      } else {
        // 创建新记录
        await db.collection('family_coin_balances').add({
          data: {
            childId: childId,
            familyId: familyId,
            balance: newBalance,
            totalEarned: newTotalEarned,
            totalSpent: 0,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })
      }

      // 记录金币变动历史
      await db.collection('coin_records').add({
        data: {
          recordId: `coin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          childId: childId,
          familyId: familyId,
          amount: amountNum,
          type: recordType || (taskId ? 'task_complete' : 'manual_adjust'),
          relatedId: taskId || prizeId || null,
          description: recordDescription || taskTitle || prizeName || '获得金币',
          balanceAfter: newBalance,
          createdAt: new Date()
        }
      })

      return {
        success: true,
        newBalance: newBalance
      }
    }

    // 扣除金币（兑换奖品）
    if (action === 'deductCoins') {
      const { childId, familyId, amount, prizeId, prizeName } = data

      // 确保 amount 是数字类型
      const amountNum = parseInt(amount) || 0

      // 获取当前余额
      const balanceRes = await db.collection('family_coin_balances')
        .where({
          childId: childId,
          familyId: familyId
        })
        .get()

      if (balanceRes.data.length === 0) {
        return {
          success: false,
          error: '余额不足',
          currentBalance: 0
        }
      }

      const currentBalance = parseInt(balanceRes.data[0].balance) || 0
      const totalSpent = parseInt(balanceRes.data[0].totalSpent) || 0

      if (currentBalance < amountNum) {
        return {
          success: false,
          error: '余额不足',
          currentBalance: currentBalance
        }
      }

      const newBalance = currentBalance - amountNum
      const newTotalSpent = totalSpent + amountNum

      // 更新余额
      await db.collection('family_coin_balances')
        .where({
          childId: childId,
          familyId: familyId
        })
        .update({
          data: {
            balance: newBalance,
            totalSpent: newTotalSpent,
            updatedAt: new Date()
          }
        })

      // 记录金币变动历史
      await db.collection('coin_records').add({
        data: {
          recordId: `coin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          childId: childId,
          familyId: familyId,
          amount: -amountNum,
          type: 'prize_redeem',
          relatedId: prizeId,
          description: prizeName || '兑换奖品',
          balanceAfter: newBalance,
          createdAt: new Date()
        }
      })

      return {
        success: true,
        newBalance: newBalance,
        previousBalance: currentBalance
      }
    }

    // 手动调整金币（仅管理员）
    if (action === 'adjustCoins') {
      const { childId, familyId, amount, reason } = data

      // 确保 amount 是数字类型
      const amountNum = parseInt(amount) || 0

      // 验证是否是该家庭的管理员
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
          error: '无权限操作'
        }
      }

      // 获取或创建金币余额记录
      const balanceRes = await db.collection('family_coin_balances')
        .where({
          childId: childId,
          familyId: familyId
        })
        .get()

      let currentBalance = 0

      if (balanceRes.data.length > 0) {
        currentBalance = parseInt(balanceRes.data[0].balance) || 0
      }

      const newBalance = currentBalance + amountNum

      if (balanceRes.data.length > 0) {
        // 更新现有记录
        await db.collection('family_coin_balances')
          .where({
            childId: childId,
            familyId: familyId
          })
          .update({
            data: {
              balance: newBalance,
              updatedAt: new Date()
            }
          })
      } else {
        // 创建新记录
        await db.collection('family_coin_balances').add({
          data: {
            childId: childId,
            familyId: familyId,
            balance: newBalance,
            totalEarned: amountNum > 0 ? amountNum : 0,
            totalSpent: amountNum < 0 ? Math.abs(amountNum) : 0,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        })
      }

      // 记录金币变动历史
      await db.collection('coin_records').add({
        data: {
          recordId: `coin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          childId: childId,
          familyId: familyId,
          amount: amountNum,
          type: 'manual_adjust',
          description: reason || '手动调整',
          balanceAfter: newBalance,
          createdAt: new Date()
        }
      })

      return {
        success: true,
        newBalance: newBalance
      }
    }

    // 获取金币记录列表
    if (action === 'getCoinRecords') {
      const { childId, familyId, limit = 50 } = data

      const res = await db.collection('coin_records')
        .where({
          childId: childId,
          familyId: familyId
        })
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get()

      return {
        success: true,
        records: res.data
      }
    }

    return {
      success: false,
      error: '未知操作'
    }

  } catch (err) {
    console.error('[manageFamilyCoins] 操作失败:', err)
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
