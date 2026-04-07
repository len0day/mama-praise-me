// cloudfunctions/updateUserInfo/index.js
// 更新用户信息云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  console.log('[updateUserInfo] 云函数调用，OPENID:', OPENID)
  console.log('[updateUserInfo] event:', event)

  try {
    const { avatar, nickname } = event

    // 获取用户信息
    const userRes = await db.collection('users')
      .where({
        openid: OPENID
      })
      .get()

    if (userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      }
    }

    const user = userRes.data[0]
    const updateData = {}

    if (avatar !== undefined) {
      updateData.avatar = avatar
    }

    if (nickname !== undefined && nickname.trim()) {
      updateData.nickname = nickname.trim()
    }

    if (Object.keys(updateData).length === 0) {
      return {
        success: false,
        error: '没有要更新的字段'
      }
    }

    updateData.updatedAt = db.serverDate()

    // 更新用户信息
    await db.collection('users')
      .doc(user._id)
      .update({
        data: updateData
      })

    console.log('[updateUserInfo] 更新成功，updateData:', updateData)

    return {
      success: true,
      message: '更新成功'
    }
  } catch (err) {
    console.error('[updateUserInfo] 更新失败:', err)
    return {
      success: false,
      error: err.message || '更新失败'
    }
  }
}
