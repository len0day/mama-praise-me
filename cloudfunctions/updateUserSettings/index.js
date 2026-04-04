// cloudfunctions/updateUserSettings/index.js
// 更新用户设置云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { settings } = event

  console.log('[updateUserSettings] openid:', OPENID)
  console.log('[updateUserSettings] settings:', settings)

  try {
    // 查询用户
    const userRes = await db.collection('users').where({
      openid: OPENID
    }).get()

    if (userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      }
    }

    const user = userRes.data[0]

    // 更新用户设置（合并现有设置）
    const updatedSettings = {
      ...(user.settings || {}),
      ...settings
    }

    await db.collection('users').doc(user._id).update({
      data: {
        settings: updatedSettings,
        updatedAt: db.serverDate()
      }
    })

    console.log('[updateUserSettings] 设置更新成功')

    return {
      success: true,
      settings: updatedSettings
    }

  } catch (err) {
    console.error('[updateUserSettings] 更新失败:', err)
    return {
      success: false,
      error: err.message || '更新失败'
    }
  }
}
