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
  const { action, ...data } = event

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

      // 处理返回的奖品数据，收集所有fileID
      const fileList = []
      const prizesWithImage = res.data.map(prize => {
        const result = {
          prizeId: prize.prizeId,
          name: prize.name,
          description: prize.description,
          coinCost: prize.coinCost,
          category: prize.category,
          stock: prize.stock,
          familyId: prize.familyId,
          isActive: prize.isActive,
          createdAt: prize.createdAt,
          updatedAt: prize.updatedAt
        }

        // 收集所有fileID
        if (prize.image && prize.image.startsWith('cloud://')) {
          result.image = prize.image
          fileList.push(prize.image)
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
          console.log('[managePrizes] getPrizes - 临时URL转换结果:', tempUrlRes)

          // 建立fileID -> tempURL的映射
          tempUrlRes.fileList.forEach((item, index) => {
            if (item.status === 0) {
              tempUrlMap[fileList[index]] = item.tempFileURL
            }
          })
        } catch (err) {
          console.error('[managePrizes] getPrizes - 临时URL转换失败:', err)
        }
      }

      // 替换图片URL为临时URL
      const processedPrizes = prizesWithImage.map(prize => {
        if (prize.image && tempUrlMap[prize.image]) {
          return {
            ...prize,
            image: tempUrlMap[prize.image]
          }
        }
        return prize
      })

      console.log('[managePrizes] getPrizes - 返回奖品数据:', processedPrizes.map(p => ({
        name: p.name,
        hasImage: !!p.image,
        imagePrefix: p.image ? p.image.substring(0, 50) : null
      })))

      return {
        success: true,
        prizes: processedPrizes
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

      // 硬删除：先删除奖品的兑换记录（使用容错处理）
      try {
        await db.collection('redemptions')
          .where({
            prizeId: prizeId
          })
          .remove()
      } catch (err) {
        if (err.errCode !== -502005) {
          console.error('[managePrizes] 删除兑换记录失败:', err)
        }
      }

      // 硬删除：删除奖品本身
      await db.collection('prizes')
        .where({
          prizeId: prizeId
        })
        .remove()

      return {
        success: true
      }
    }

    // 兑换奖品
    if (action === 'redeemPrize') {
      const { prizeId, childId, familyId, quantity = 1 } = data

      console.log('[managePrizes] redeemPrize - prizeId:', prizeId, 'childId:', childId, 'familyId:', familyId, 'quantity:', quantity)

      if (!childId || !familyId) {
        return {
          success: false,
          error: '缺少必要参数'
        }
      }

      if (quantity < 1 || !Number.isInteger(quantity)) {
        return {
          success: false,
          error: '兑换数量必须大于等于1'
        }
      }

      // 获取奖品信息
      const prizeRes = await db.collection('prizes')
        .where({
          prizeId: prizeId,
          isActive: true
        })
        .get()

      console.log('[managePrizes] 奖品查询结果:', prizeRes.data.length)

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
      const coinsRes = await cloud.callFunction({
        name: 'manageFamilyCoins',
        data: {
          action: 'getChildCoinsInFamily',
          childId: childId,
          familyId: familyId
        }
      })

      if (!coinsRes.result.success) {
        return {
          success: false,
          error: '获取金币余额失败'
        }
      }

      const currentBalance = coinsRes.result.balance
      const totalCost = prize.coinCost * quantity

      // 检查金币是否足够
      if (currentBalance < totalCost) {
        return {
          success: false,
          error: '金币不足',
          currentBalance: currentBalance,
          required: totalCost
        }
      }

      // 检查库存
      if (prize.stock !== -1 && prize.stock < quantity) {
        return {
          success: false,
          error: `库存不足，当前库存: ${prize.stock}`
        }
      }

      // 扣除金币（按家庭隔离）
      const deductRes = await cloud.callFunction({
        name: 'manageFamilyCoins',
        data: {
          action: 'deductCoins',
          childId: childId,
          familyId: familyId,
          amount: totalCost,
          prizeId: prizeId,
          prizeName: prize.name
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
              stock: prize.stock - quantity
            }
          })
      }

      // 创建兑换记录（支持数量）
      const redemptionId = generateRedemptionId()
      const redemptionData = {
        redemptionId: redemptionId,
        prizeId: prizeId,
        prizeName: prize.name,
        prizeImage: prize.image,
        childId: childId,
        familyId: familyId,
        coinCost: prize.coinCost,
        quantity: quantity,
        remainingQuantity: quantity,
        status: 'pending',
        redeemedAt: new Date(),
        createdAt: new Date()
      }

      console.log('[managePrizes] 创建兑换记录:', JSON.stringify(redemptionData))

      await db.collection('redemptions').add({
        data: redemptionData
      })

      console.log('[managePrizes] 兑换记录创建成功, redemptionId:', redemptionId)

      return {
        success: true,
        newBalance: deductRes.result.newBalance,
        redemptionId: redemptionId,
        quantity: quantity
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

      // 处理返回的兑换数据，收集所有fileID
      const fileList = []
      const redemptionsWithImage = res.data.map(redemption => {
        // 收集所有fileID
        if (redemption.prizeImage && redemption.prizeImage.startsWith('cloud://')) {
          fileList.push(redemption.prizeImage)
        }
        return redemption
      })

      // 使用getTempFileURL将fileID转换为临时下载URL
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
          console.error('[managePrizes] getRedemptions - 临时URL转换失败:', err)
        }
      }

      // 替换图片URL为临时URL
      const processedRedemptions = redemptionsWithImage.map(redemption => {
        if (redemption.prizeImage && tempUrlMap[redemption.prizeImage]) {
          return {
            ...redemption,
            prizeImage: tempUrlMap[redemption.prizeImage]
          }
        }
        return redemption
      })

      return {
        success: true,
        redemptions: processedRedemptions
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
