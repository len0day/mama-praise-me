// cloudfunctions/manageTasks/index.js
// 任务管理云函数（按家庭隔离）

const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 辅助函数：生成任务ID
 */
function generateTaskId() {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 辅助函数：获取ISO周标识
 */
function getWeekIdentifier(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  const weekNumber = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
  return `${d.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`
}

/**
 * 辅助函数：获取月份标识
 */
function getMonthIdentifier(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data } = event

  console.log('[manageTasks] action:', action)
  console.log('[manageTasks] openid:', OPENID)

  try {
    // 获取任务列表
    if (action === 'getTasks') {
      const { childId, familyId } = data || {}

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

      // 构建查询条件：按家庭过滤
      let whereCondition = {
        familyId: familyId,
        isActive: true
      }

      // 如果指定了孩子，查询该孩子的任务或所有孩子的任务
      if (childId) {
        whereCondition = _.or({
          familyId: familyId,
          isActive: true,
          targetChildId: childId
        }, {
          familyId: familyId,
          isActive: true,
          targetChildId: db.command.eq(null)  // 明确查询 targetChildId 为 null 的任务
        })
      }

      const res = await db.collection('tasks')
        .where(whereCondition)
        .orderBy('createdAt', 'desc')
        .get()

      return {
        success: true,
        tasks: res.data
      }
    }

    // 创建任务
    if (action === 'createTask') {
      const { familyId, title, description, coinReward, taskType, weekStart, weekEnd, monthStart, monthEnd, targetChildId } = data

      // 验证家庭ID
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
          error: '只有管理员可以创建任务'
        }
      }

      const taskId = generateTaskId()

      const taskData = {
        familyId: familyId,  // 按家庭隔离
        taskId: taskId,
        title: title,
        description: description || '',
        coinReward: coinReward || 0,
        taskType: taskType || 'daily',  // daily, weekly, monthly
        weekStart: weekStart || null,
        weekEnd: weekEnd || null,
        monthStart: monthStart || null,
        monthEnd: monthEnd || null,
        targetChildId: targetChildId || null,  // null表示适用于所有儿童
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await db.collection('tasks').add({
        data: taskData
      })

      return {
        success: true,
        task: taskData
      }
    }

    // 更新任务
    if (action === 'updateTask') {
      const { taskId, ...updateData } = data

      // 获取任务信息
      const taskRes = await db.collection('tasks')
        .where({
          taskId: taskId
        })
        .get()

      if (taskRes.data.length === 0) {
        return {
          success: false,
          error: '任务不存在'
        }
      }

      const task = taskRes.data[0]

      // 验证用户是否是该家庭的管理员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: task.familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '只有管理员可以修改任务'
        }
      }

      await db.collection('tasks')
        .where({
          taskId: taskId
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

    // 删除任务
    if (action === 'deleteTask') {
      const { taskId } = data

      // 获取任务信息
      const taskRes = await db.collection('tasks')
        .where({
          taskId: taskId
        })
        .get()

      if (taskRes.data.length === 0) {
        return {
          success: false,
          error: '任务不存在'
        }
      }

      const task = taskRes.data[0]

      // 验证用户是否是该家庭的管理员
      const memberRes = await db.collection('family_members')
        .where({
          openid: OPENID,
          familyId: task.familyId,
          role: 'admin',
          status: 'active'
        })
        .get()

      if (memberRes.data.length === 0) {
        return {
          success: false,
          error: '只有管理员可以删除任务'
        }
      }

      await db.collection('tasks')
        .where({
          taskId: taskId
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

    // 完成任务
    if (action === 'completeTask') {
      const { taskId, childId, familyId } = data

      if (!childId || !familyId) {
        return {
          success: false,
          error: '缺少必要参数'
        }
      }

      // 获取任务信息
      const taskRes = await db.collection('tasks')
        .where({
          taskId: taskId,
          isActive: true
        })
        .get()

      if (taskRes.data.length === 0) {
        return {
          success: false,
          error: '任务不存在或已失效'
        }
      }

      const task = taskRes.data[0]

      // 验证任务属于该家庭
      if (task.familyId !== familyId) {
        return {
          success: false,
          error: '任务不属于该家庭'
        }
      }

      // 获取儿童信息
      const childRes = await db.collection('children')
        .where({
          childId: childId,
          familyId: familyId
        })
        .get()

      if (childRes.data.length === 0) {
        return {
          success: false,
          error: '该儿童不属于该家庭'
        }
      }

      const today = new Date().toISOString().split('T')[0]
      const currentWeek = getWeekIdentifier(today)
      const currentMonth = getMonthIdentifier(today)

      // 检查是否已完成
      const completedRes = await db.collection('task_completions')
        .where({
          taskId: taskId,
          childId: childId,
          familyId: familyId  // 添加家庭ID
        })
        .get()

      // 根据任务类型检查是否已完成
      let alreadyCompleted = false
      if (task.taskType === 'daily') {
        alreadyCompleted = completedRes.data.some(c => c.completedDate === today)
      } else if (task.taskType === 'weekly') {
        alreadyCompleted = completedRes.data.some(c => c.completedWeek === currentWeek)
      } else if (task.taskType === 'monthly') {
        alreadyCompleted = completedRes.data.some(c => c.completedMonth === currentMonth)
      }

      if (alreadyCompleted) {
        return {
          success: false,
          error: '任务已完成'
        }
      }

      // 创建完成记录
      await db.collection('task_completions').add({
        data: {
          completionId: `completion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          taskId: taskId,
          taskTitle: task.title,
          childId: childId,
          familyId: familyId,  // 添加家庭ID
          coinEarned: task.coinReward,
          completedAt: new Date(),
          completedDate: today,
          completedWeek: currentWeek,
          completedMonth: currentMonth
        }
      })

      // 增加金币（使用 manageFamilyCoins，按家庭隔离）
      const coinsRes = await wx.cloud.callFunction({
        name: 'manageFamilyCoins',
        data: {
          action: 'addCoins',
          data: {
            childId: childId,
            familyId: familyId,
            amount: task.coinReward,
            taskId: taskId,
            taskTitle: task.title
          }
        }
      })

      if (!coinsRes.result.success) {
        return {
          success: false,
          error: '增加金币失败'
        }
      }

      return {
        success: true,
        coinEarned: task.coinReward,
        newBalance: coinsRes.result.newBalance
      }
    }

    // 获取任务完成记录
    if (action === 'getAllCompletions') {
      const { childId, familyId } = data || {}

      if (!childId || !familyId) {
        return {
          success: false,
          error: '缺少必要参数'
        }
      }

      const res = await db.collection('task_completions')
        .where({
          childId: childId,
          familyId: familyId  // 按家庭过滤
        })
        .orderBy('completedAt', 'desc')
        .get()

      return {
        success: true,
        completions: res.data
      }
    }

    return {
      success: false,
      error: '未知操作'
    }

  } catch (err) {
    console.error('[manageTasks] 操作失败:', err)
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
