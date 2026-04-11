// cloudfunctions/manageCoins/index.js
// 金币管理云函数

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
  const { action, ...data } = event

  console.log('[manageCoins] action:', action)
  console.log('[manageCoins] openid:', OPENID)

  try {
    // 获取金币历史记录
    if (action === 'getCoinRecords') {
      const { childId, limit = 50, skip = 0 } = data || {}

      const whereCondition = {
        openid: OPENID
      }

      if (childId) {
        whereCondition.childId = childId
      }

      const res = await db.collection('coin_records')
        .where(whereCondition)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .skip(skip)
        .get()

      return {
        success: true,
        records: res.data
      }
    }

    // 获取孩子当前金币
    if (action === 'getChildCoins') {
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
        totalCoins: res.data[0].totalCoins
      }
    }

    // 手动调整金币
    if (action === 'adjustCoins') {
      const { childId, amount, reason } = data

      // 获取孩子信息
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
      const newBalance = child.totalCoins + amount

      // 更新孩子金币
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

      // 创建金币记录
      await db.collection('coin_records').add({
        data: {
          openid: OPENID,
          recordId: `coin_record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          childId: childId,
          childName: child.name,
          amount: amount,
          type: 'manual_adjust',
          relatedId: null,
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

    return {
      success: false,
      error: '未知操作'
    }

  } catch (err) {
    console.error('[manageCoins] 操作失败:', err)
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
