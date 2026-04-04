// cloudfunctions/managePrizes/index.js
// 奖品管理云函数（按家庭隔离）

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 辅助函数：生成奖品ID
 */
function generatePrizeId() {
  return `prize_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 辅助函数：生成兑换ID
 */
function generateRedemptionId() {
  return `redemption_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data } = event

  console.log('[managePrizes] action:', action)
  console.log('[managePrizes] openid:', OPENID)

  try {
    // 获取奖品列表
    if (action === 'getPrizes') {
      const { familyId } = data || {}

      // 必须提供 familyId
      if (!familyId) {
        return {
          success: false,
          error: '缺少家庭ID'
        }
      }

      // 验证用户是否是该家庭成员
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

      const res = await db.collection('prizes')
        .where({
          familyId: familyId,
          isActive: true
        })
        .orderBy('createdAt', 'desc')
        .get()

      return {
        success: true,
        prizes: res.data
      }
    }

    // 创建奖品
    if (action === 'createPrize') {
      const { familyId, name, description, image, coinCost, category, stock } = data

      if (!familyId) {
        return {
          success: false,
          error: '缺少家庭ID'
        }
      }

      // 验证用户是否是该家庭的管理员
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
          error: '只有管理员可以创建奖品'
        }
      }

      const prizeId = generatePrizeId()

      const prizeData = {
        familyId: familyId,
        prizeId: prizeId,
        name: name,
        description: description || '',
        image: image || '',
        coinCost: coinCost || 0,
        category: category || 'other',
        stock: stock !== undefined ? stock : -1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await db.collection('prizes').add({
        data: prizeData
      })

      return {
        success: true,
        prize: prizeData
      }
    }

    // 更新奖品
    if (action === 'updatePrize') {
      const { prizeId, ...updateData } = data

      const prizeRes = await db.collection('prizes')
        .where({
          prizeId: prizeId
        })
        .get()

      if (prizeRes.data.length === 0) {
        return {
          success: false,
          error: '奖品不存在'
        }
      }

      const prize = prizeRes.data[0]

      // 验证用户是否是该家庭的管理员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: prize.familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '只有管理员可以修改奖品'
        }
      }

      await db.collection('prizes')
        .where({
          prizeId: prizeId
        })
        .update({
          data: {
            ...updateData,
            updatedAt: new Date()
          }
        })

      return {
        success: true
      }
    }

    // 删除奖品
    if (action === 'deletePrize') {
      const { prizeId } = data

      const prizeRes = await db.collection('prizes')
        .where({
          prizeId: prizeId
        })
        .get()

      if (prizeRes.data.length === 0) {
        return {
          success: false,
          error: '奖品不存在'
        }
      }

      const prize = prizeRes.data[0]

      // 验证用户是否是该家庭的管理员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: prize.familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '只有管理员可以删除奖品'
        }
      }

      await db.collection('prizes')
        .where({
          prizeId: prizeId
        })
        .update({
          data: {
            isActive: false,
            updatedAt: new Date()
          }
        })

      return {
        success: true
      }
    }

    // 兑换奖品
    if (action === 'redeemPrize') {
      const { prizeId, childId, familyId } = data

      if (!childId || !familyId) {
        return {
          success: false,
          error: '缺少必要参数'
        }
      }

      // 获取奖品信息
      const prizeRes = await db.collection('prizes')
        .where({
          prizeId: prizeId,
          isActive: true
        })
        .get()

      if (prizeRes.data.length === 0) {
        return {
          success: false,
          error: '奖品不存在或已失效'
        }
      }

      const prize = prizeRes.data[0]

      // 验证奖品属于该家庭
      if (prize.familyId !== familyId) {
        return {
          success: false,
          error: '奖品不属于该家庭'
        }
      }

      // 获取儿童在该家庭的金币余额
      const coinsRes = await wx.cloud.callFunction({
        name: 'manageFamilyCoins',
        data: {
          action: 'getChildCoinsInFamily',
          data: {
            childId: childId,
            familyId: familyId
          }
        }
      })

      if (!coinsRes.result.success) {
        return {
          success: false,
          error: '获取金币余额失败'
        }
      }

      const currentBalance = coinsRes.result.balance

      // 检查金币是否足够
      if (currentBalance < prize.coinCost) {
        return {
          success: false,
          error: '金币不足',
          currentBalance: currentBalance
        }
      }

      // 检查库存
      if (prize.stock !== -1 && prize.stock <= 0) {
        return {
          success: false,
          error: '库存不足'
        }
      }

      // 扣除金币（按家庭隔离）
      const deductRes = await wx.cloud.callFunction({
        name: 'manageFamilyCoins',
        data: {
          action: 'deductCoins',
          data: {
            childId: childId,
            familyId: familyId,
            amount: prize.coinCost,
            prizeId: prizeId,
            prizeName: prize.name
          }
        }
      })

      if (!deductRes.result.success) {
        return {
          success: false,
          error: deductRes.result.error || '扣除金币失败'
        }
      }

      // 减少库存
      if (prize.stock !== -1) {
        await db.collection('prizes')
          .where({
            prizeId: prizeId
          })
          .update({
            data: {
              stock: prize.stock - 1
            }
          })
      }

      // 创建兑换记录
      const redemptionId = generateRedemptionId()
      await db.collection('redemptions').add({
        data: {
          redemptionId: redemptionId,
          prizeId: prizeId,
          prizeName: prize.name,
          prizeImage: prize.image,
          childId: childId,
          familyId: familyId,
          coinCost: prize.coinCost,
          status: 'pending',
          redeemedAt: new Date(),
          createdAt: new Date()
        }
      })

      return {
        success: true,
        newBalance: deductRes.result.newBalance
      }
    }

    // 获取兑换记录
    if (action === 'getRedemptions') {
      const { childId, familyId } = data || {}

      if (!familyId) {
        return {
          success: false,
          error: '缺少家庭ID'
        }
      }

      // 验证用户是否是该家庭成员
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

      let whereCondition = {
        familyId: familyId
      }

      if (childId) {
        whereCondition.childId = childId
      }

      const res = await db.collection('redemptions')
        .where(whereCondition)
        .orderBy('redeemedAt', 'desc')
        .get()

      return {
        success: true,
        redemptions: res.data
      }
    }

    return {
      success: false,
      error: '未知操作'
    }

  } catch (err) {
    console.error('[managePrizes] 操作失败:', err)
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
