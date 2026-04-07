// cloudfunctions/fixImageUrls/index.js
// 修复图片URL：检查并标记需要重新上传的图片

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
  const { action } = event

  try {
    if (action === 'checkImages') {
      // 检查所有儿童的头像
      const childrenRes = await db.collection('children').where({
        _openid: OPENID
      }).get()

      const needUpdate = []

      childrenRes.data.forEach(child => {
        if (child.avatar && !child.avatar.startsWith('cloud://') && !/^[\p{Emoji}]/u.test(child.avatar)) {
          needUpdate.push({
            id: child._id,
            name: child.name,
            currentAvatar: child.avatar,
            type: 'child'
          })
        }
      })

      // 检查所有奖品的图片
      const prizesRes = await db.collection('prizes').where({
        _openid: OPENID
      }).get()

      prizesRes.data.forEach(prize => {
        if (prize.image && !prize.image.startsWith('cloud://') && !/^[\p{Emoji}]/u.test(prize.image)) {
          needUpdate.push({
            id: prize._id,
            name: prize.name,
            currentImage: prize.image,
            type: 'prize'
          })
        }
      })

      return {
        success: true,
        needUpdate: needUpdate,
        count: needUpdate.length
      }
    }

    return {
      success: false,
      error: '未知操作'
    }
  } catch (err) {
    console.error('[fixImageUrls] 操作失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
