// cloudfunctions/manageRedemptions/index.js
// 兑换管理云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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

  console.log('[manageRedemptions] action:', action)
  console.log('[manageRedemptions] openid:', OPENID)

  try {
    // 获取兑换记录（包含完整奖品信息）
    if (action === 'getRedemptions') {
      const { childId, familyId, status, limit = 50, skip = 0 } = data || {}

      console.log('[manageRedemptions] getRedemptions called with familyId:', familyId, 'childId:', childId)

      // 必须提供 familyId
      if (!familyId) {
        return {
          success: false,
          error: '缺少家庭ID'
        }
      }

      let redemptions = []

      console.log('[manageRedemptions] 查询条件 - familyId:', familyId, 'childId:', childId, 'status:', status)

      // 1. 先查询按 familyId 的记录（新系统）
      let whereCondition = {
        familyId: familyId
      }

      if (childId) {
        whereCondition.childId = childId
      }

      if (status) {
        whereCondition.status = status
      }

      console.log('[manageRedemptions] 新系统查询条件:', JSON.stringify(whereCondition))

      const res = await db.collection('redemptions')
        .where(whereCondition)
        .orderBy('redeemedAt', 'desc')
        .limit(limit)
        .skip(skip)
        .get()

      redemptions = res.data

      console.log('[manageRedemptions] 新系统查询结果数量:', res.data.length)
      console.log('[manageRedemptions] 新系统查询结果:', JSON.stringify(res.data.map(r => ({
        _id: r._id,
        redemptionId: r.redemptionId,
        prizeId: r.prizeId,
        prizeName: r.prizeName,
        prizeImage: r.prizeImage,
        coinCost: r.coinCost,
        status: r.status,
        childId: r.childId,
        familyId: r.familyId
      }))))

      // 2. 如果新系统没有数据，兼容查询旧系统（基于 openid）
      if (redemptions.length === 0) {
        console.log('[manageRedemptions] 新系统无数据，查询旧系统兼容记录')
        console.log('[manageRedemptions] 旧系统查询 - openid:', OPENID, 'childId:', childId)

        whereCondition = {
          openid: OPENID
        }

        if (childId) {
          whereCondition.childId = childId
        }

        if (status) {
          whereCondition.status = status
        }

        console.log('[manageRedemptions] 旧系统查询条件:', JSON.stringify(whereCondition))

        const oldRes = await db.collection('redemptions')
          .where(whereCondition)
          .orderBy('redeemedAt', 'desc')
          .limit(limit)
          .skip(skip)
          .get()

        console.log('[manageRedemptions] 旧系统查询结果数量:', oldRes.data.length)
        console.log('[manageRedemptions] 旧系统查询结果:', JSON.stringify(oldRes.data))
        redemptions = oldRes.data
      }

      // 为每个兑换记录补充奖品的完整信息
      const redemptionsWithPrizeInfo = await Promise.all(
        redemptions.map(async (redemption) => {
          // 如果已经有图片，直接返回
          if (redemption.prizeImage) {
            return redemption
          }

          // 如果没有图片，从奖品表获取最新信息
          try {
            const prizeRes = await db.collection('prizes')
              .where({
                familyId: familyId,
                prizeId: redemption.prizeId
              })
              .get()

            if (prizeRes.data.length > 0) {
              const prize = prizeRes.data[0]
              return {
                ...redemption,
                prizeImage: prize.image || '',
                prizeName: prize.name || redemption.prizeName
              }
            }
          } catch (err) {
            console.error('[manageRedemptions] 获取奖品信息失败:', err)
          }

          return redemption
        })
      )

      return {
        success: true,
        redemptions: redemptionsWithPrizeInfo
      }
    }

    // 兑换奖品
    if (action === 'redeemPrize') {
      const { prizeId, childId } = data

      // 1. 获取奖品信息
      const prizeRes = await db.collection('prizes')
        .where({
          openid: OPENID,
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

      // 2. 获取孩子信息
      const childRes = await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .get()

      if (childRes.data.length === 0) {
        return {
          success: false,
          error: '孩子不存在'
        }
      }

      const child = childRes.data[0]

      // 3. 检查金币是否足够
      if (child.totalCoins < prize.coinCost) {
        return {
          success: false,
          error: '金币不足'
        }
      }

      // 4. 检查库存
      if (prize.stock !== -1 && prize.stock <= 0) {
        return {
          success: false,
          error: '库存不足'
        }
      }

      // 5. 扣除金币
      const newBalance = child.totalCoins - prize.coinCost
      await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .update({
          data: {
            totalCoins: newBalance
          }
        })

      // 6. 创建兑换记录
      const redemptionId = generateRedemptionId()
      await db.collection('redemptions').add({
        data: {
          openid: OPENID,
          redemptionId: redemptionId,
          prizeId: prizeId,
          prizeName: prize.name,
          prizeImage: prize.image,
          childId: childId,
          childName: child.name,
          coinCost: prize.coinCost,
          status: 'pending',
          redeemedAt: new Date(),
          completedAt: null,
          createdAt: new Date()
        }
      })

      // 7. 创建金币记录
      await db.collection('coin_records').add({
        data: {
          openid: OPENID,
          recordId: `coin_record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          childId: childId,
          childName: child.name,
          amount: -prize.coinCost,
          type: 'prize_redeem',
          relatedId: prizeId,
          description: `兑换"${prize.name}"`,
          balanceAfter: newBalance,
          createdAt: new Date()
        }
      })

      // 8. 更新奖品库存
      if (prize.stock !== -1) {
        await db.collection('prizes')
          .where({
            openid: OPENID,
            prizeId: prizeId
          })
          .update({
            data: {
              stock: prize.stock - 1
            }
          })
      }

      // 9. 更新孩子兑换统计
      await db.collection('children')
        .where({
          openid: OPENID,
          childId: childId
        })
        .update({
          data: {
            redeemedPrizes: child.redeemedPrizes + 1
          }
        })

      return {
        success: true,
        redemptionId: redemptionId,
        newBalance: newBalance
      }
    }

    // 确认兑换
    if (action === 'confirmRedemption') {
      const { redemptionId } = data

      const res = await db.collection('redemptions')
        .where({
          openid: OPENID,
          redemptionId: redemptionId
        })
        .update({
          data: {
            status: 'completed',
            completedAt: new Date()
          }
        })

      if (res.stats.updated === 0) {
        return {
          success: false,
          error: '兑换记录不存在或无权操作'
        }
      }

      return {
        success: true
      }
    }

    // 取消兑换
    if (action === 'cancelRedemption') {
      const { redemptionId } = data

      // 获取兑换记录
      const redemptionRes = await db.collection('redemptions')
        .where({
          openid: OPENID,
          redemptionId: redemptionId
        })
        .get()

      if (redemptionRes.data.length === 0) {
        return {
          success: false,
          error: '兑换记录不存在'
        }
      }

      const redemption = redemptionRes.data[0]

      // 只能取消待兑换状态的记录
      if (redemption.status !== 'pending') {
        return {
          success: false,
          error: '只能取消待兑换的记录'
        }
      }

      // 退还金币
      const childRes = await db.collection('children')
        .where({
          openid: OPENID,
          childId: redemption.childId
        })
        .get()

      if (childRes.data.length === 0) {
        return {
          success: false,
          error: '孩子不存在'
        }
      }

      const child = childRes.data[0]
      const newBalance = child.totalCoins + redemption.coinCost

      // 更新孩子金币
      await db.collection('children')
        .where({
          openid: OPENID,
          childId: redemption.childId
        })
        .update({
          data: {
            totalCoins: newBalance
          }
        })

      // 更新兑换记录状态
      await db.collection('redemptions')
        .where({
          openid: OPENID,
          redemptionId: redemptionId
        })
        .update({
          data: {
            status: 'cancelled'
          }
        })

      // 创建金币记录（退还）
      await db.collection('coin_records').add({
        data: {
          openid: OPENID,
          recordId: `coin_record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          childId: redemption.childId,
          childName: redemption.childName,
          amount: redemption.coinCost,
          type: 'prize_redeem_cancel',
          relatedId: redemption.prizeId,
          description: `取消兑换"${redemption.prizeName}"`,
          balanceAfter: newBalance,
          createdAt: new Date()
        }
      })

      // 恢复奖品库存
      if (redemption.coinCost > 0) {
        const prizeRes = await db.collection('prizes')
          .where({
            openid: OPENID,
            prizeId: redemption.prizeId
          })
          .get()

        if (prizeRes.data.length > 0 && prizeRes.data[0].stock !== -1) {
          await db.collection('prizes')
            .where({
              openid: OPENID,
              prizeId: redemption.prizeId
            })
            .update({
              data: {
                stock: prizeRes.data[0].stock + 1
              }
            })
        }
      }

      return {
        success: true,
        newBalance: newBalance
      }
    }

    // 使用奖品
    if (action === 'usePrize') {
      const { redemptionId } = data

      console.log('[manageRedemptions] usePrize - redemptionId:', redemptionId)

      // 获取兑换记录（先尝试新系统 familyId，再尝试旧系统 openid）
      let res = await db.collection('redemptions')
        .where({
          redemptionId: redemptionId
        })
        .get()

      if (res.data.length === 0) {
        console.error('[manageRedemptions] usePrize - 兑换记录不存在')
        return {
          success: false,
          error: '兑换记录不存在'
        }
      }

      const redemption = res.data[0]
      console.log('[manageRedemptions] usePrize - 找到兑换记录:', JSON.stringify(redemption))

      // 检查是否已使用
      if (redemption.usedAt) {
        return {
          success: false,
          error: '奖品已使用'
        }
      }

      // 检查状态：pending 或 completed 都可以使用
      // pending: 待家长确认，completed: 已确认
      if (redemption.status !== 'pending' && redemption.status !== 'completed') {
        return {
          success: false,
          error: '奖品状态异常'
        }
      }

      // 更新使用时间
      const updateRes = await db.collection('redemptions')
        .where({
          redemptionId: redemptionId
        })
        .update({
          data: {
            usedAt: new Date()
          }
        })

      console.log('[manageRedemptions] usePrize - 更新结果:', updateRes.stats)

      if (updateRes.stats.updated === 0) {
        console.error('[manageRedemptions] usePrize - 更新失败，没有记录被修改')
        return {
          success: false,
          error: '更新失败'
        }
      }

      console.log('[manageRedemptions] usePrize - 奖品使用成功')

      return {
        success: true
      }
    }

    return {
      success: false,
      error: '未知操作'
    }

  } catch (err) {
    console.error('[manageRedemptions] 操作失败:', err)
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
