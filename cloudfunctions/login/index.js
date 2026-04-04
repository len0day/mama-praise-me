// cloudfunctions/login/index.js
// 微信登录云函数

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 云函数入口
 * 处理用户登录逻辑
 */
exports.main = async (event, context) => {
  const { userInfo, encryptedData, iv } = event

  try {
    // 1. 获取微信用户信息
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    if (!openid) {
      return {
        success: false,
        error: '获取用户信息失败'
      }
    }

    console.log('登录请求 userInfo:', userInfo)

    // 2. 查询用户是否已存在
    // ✅ 使用 limit(1) 优化查询，只返回第一条匹配记录
    const userRes = await db.collection('users').where({
      openid: openid
    }).limit(1).get()

    let user = null
    let isNewUser = false

    if (userRes.data.length === 0) {
      // 新用户，创建用户记录
      isNewUser = true
      const createResult = await db.collection('users').add({
        data: {
          openid: openid,
          nickName: userInfo.nickName || '新用户',
          avatarUrl: userInfo.avatarUrl || '',
          customAvatarUrl: '',  // 自定义头像URL（初始为空）
          gender: userInfo.gender || 0,
          totalDownloads: 0, // 总下载次数
          lastDownloadTime: null, // 最后下载时间
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      })

      console.log('新用户创建成功:', createResult)

      // ✅ 优化：直接使用创建时返回的数据，避免再次查询
      user = {
        _id: createResult._id,
        openid: openid,
        nickName: userInfo.nickName || '新用户',
        avatarUrl: userInfo.avatarUrl || '',
        customAvatarUrl: '',
        gender: userInfo.gender || 0,
        totalDownloads: 0,
        lastDownloadTime: null,
        createdAt: new Date(), // 使用当前时间作为近似值
        updatedAt: new Date()
      }

    } else {
      // 老用户，只更新最后登录时间，不覆盖自定义昵称和头像
      user = userRes.data[0]

      // ✅ 优化：仅在必要时更新updatedAt，且不需要等待结果
      db.collection('users').doc(user._id).update({
        data: {
          updatedAt: db.serverDate()
        }
      }).catch(err => {
        console.warn('更新登录时间失败（可忽略）:', err)
      })

      console.log('老用户登录，数据库中的头像:', user.avatarUrl)
      console.log('老用户登录，自定义头像:', user.customAvatarUrl)
    }

    // 返回用户信息（不返回敏感信息）
    // 优先使用自定义头像，如果没有则使用微信头像
    const finalAvatarUrl = user.customAvatarUrl || user.avatarUrl

    console.log('返回给前端的头像:', finalAvatarUrl)

    return {
      success: true,
      data: {
        openid: user.openid,
        userId: user._id,
        nickName: user.nickName,
        avatarUrl: finalAvatarUrl,  // 优先返回自定义头像
        gender: user.gender,
        totalDownloads: user.totalDownloads,
        lastDownloadTime: user.lastDownloadTime,
        createdAt: user.createdAt,
        isNewUser: isNewUser
      }
    }

  } catch (error) {
    console.error('登录失败:', error)
    return {
      success: false,
      error: error.message || '登录失败，请重试'
    }
  }
}
