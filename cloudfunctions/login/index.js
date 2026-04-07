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
          settings: {
            parentPassword: null,  // 家长密码
            theme: 'light',
            fontSize: 'medium',
            locale: 'zh-CN'
          },
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
        settings: {
          parentPassword: null,
          theme: 'light',
          fontSize: 'medium',
          locale: 'zh-CN'
        },
        createdAt: new Date(), // 使用当前时间作为近似值
        updatedAt: new Date()
      }

    } else {
      user = userRes.data[0]

      // ✅ 优化：仅在必要时更新updatedAt，且不需要等待结果
      db.collection('users').doc(user._id).update({
        data: {
          updatedAt: db.serverDate()
        }
      }).catch(err => {
        console.warn('更新登录时间失败（可忽略）:', err)
      })

      console.log('[login] 老用户登录，命中记录:', user._id)
    }

    // 统一字段优先级：优先使用用户在设置中自定义的 nickname 和 avatar
    const finalNickname = user.nickname || user.nickName || '新用户'
    const finalAvatar = user.avatar || user.customAvatarUrl || user.avatarUrl || ''

    return {
      success: true,
      data: {
        openid: user.openid,
        userId: user._id,
        nickname: finalNickname, // 使用统一的 nickname 字段
        nickName: finalNickname, // 兼容旧代码
        avatar: finalAvatar,     // 使用统一的 avatar 字段
        avatarUrl: finalAvatar,  // 兼容旧代码
        gender: user.gender,
        totalDownloads: user.totalDownloads,
        lastDownloadTime: user.lastDownloadTime,
        settings: user.settings || {
          parentPassword: null,
          theme: 'light',
          fontSize: 'medium',
          locale: 'zh-CN'
        },
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
