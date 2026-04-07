// cloudfunctions/getFileURL/index.js
// 获取云存储文件的永久下载URL

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { fileIds } = event

  try {
    const result = await cloud.getTempFileURL({
      fileList: fileIds
    })

    return {
      success: true,
      fileList: result.fileList
    }
  } catch (err) {
    console.error('[getFileURL] 获取文件URL失败:', err)
    return {
      success: false,
      error: err.message
    }
  }
}
