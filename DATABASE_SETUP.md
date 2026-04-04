# 云数据库集合创建脚本

## 在云开发控制台 → 数据库，依次创建以下集合：

### 1. children（孩子信息）
```
集合名称: children
权限设置: 仅创建者可读写
```

**数据结构示例**：
```json
{
  "_id": "auto_generated",
  "openid": "wx_openid",
  "childId": "child_xxx",
  "name": "小明",
  "avatar": "👦",
  "age": 8,
  "totalCoins": 150,
  "completedTasks": 45,
  "redeemedPrizes": 3,
  "createdAt": {"$date": "2026-03-31T10:00:00Z"},
  "updatedAt": {"$date": "2026-03-31T10:00:00Z"}
}
```

### 2. tasks（任务定义）
```
集合名称: tasks
权限设置: 仅创建者可读写
```

**数据结构示例**：
```json
{
  "_id": "auto_generated",
  "openid": "wx_openid",
  "taskId": "task_xxx",
  "title": "每天阅读30分钟",
  "description": "阅读任何书籍都可以",
  "coinReward": 10,
  "taskType": "daily",
  "weekStart": {"$date": "2026-03-27T00:00:00Z"},
  "weekEnd": {"$date": "2026-04-02T23:59:59Z"},
  "monthStart": "2026-03",
  "monthEnd": "2026-03",
  "targetChildId": null,
  "isActive": true,
  "createdAt": {"$date": "2026-03-31T10:00:00Z"},
  "updatedAt": {"$date": "2026-03-31T10:00:00Z"}
}
```

### 3. task_completions（任务完成记录）
```
集合名称: task_completions
权限设置: 仅创建者可读写
```

**数据结构示例**：
```json
{
  "_id": "auto_generated",
  "openid": "wx_openid",
  "completionId": "completion_xxx",
  "taskId": "task_xxx",
  "taskTitle": "每天阅读30分钟",
  "childId": "child_xxx",
  "childName": "小明",
  "coinEarned": 10,
  "completedAt": {"$date": "2026-03-31T10:00:00Z"},
  "completedDate": "2026-03-31",
  "completedWeek": "2026-W13",
  "completedMonth": "2026-03",
  "createdAt": {"$date": "2026-03-31T10:00:00Z"}
}
```

### 4. prizes（奖品定义）
```
集合名称: prizes
权限设置: 仅创建者可读写
```

**数据结构示例**：
```json
{
  "_id": "auto_generated",
  "openid": "wx_openid",
  "prizeId": "prize_xxx",
  "name": "乐高积木",
  "description": "大型乐高积木套装",
  "image": "https://example.com/lego.jpg",
  "coinCost": 100,
  "category": "toys",
  "stock": 5,
  "isActive": true,
  "createdAt": {"$date": "2026-03-31T10:00:00Z"},
  "updatedAt": {"$date": "2026-03-31T10:00:00Z"}
}
```

### 5. redemptions（兑换记录）
```
集合名称: redemptions
权限设置: 仅创建者可读写
```

**数据结构示例**：
```json
{
  "_id": "auto_generated",
  "openid": "wx_openid",
  "redemptionId": "redemption_xxx",
  "prizeId": "prize_xxx",
  "prizeName": "乐高积木",
  "prizeImage": "https://example.com/lego.jpg",
  "childId": "child_xxx",
  "childName": "小明",
  "coinCost": 100,
  "status": "pending",
  "redeemedAt": {"$date": "2026-03-31T10:00:00Z"},
  "completedAt": null,
  "createdAt": {"$date": "2026-03-31T10:00:00Z"}
}
```

### 6. coin_records（金币记录）
```
集合名称: coin_records
权限设置: 仅创建者可读写
```

**数据结构示例**：
```json
{
  "_id": "auto_generated",
  "openid": "wx_openid",
  "recordId": "coin_record_xxx",
  "childId": "child_xxx",
  "childName": "小明",
  "amount": 10,
  "type": "task_complete",
  "relatedId": "task_xxx",
  "description": "完成"每天阅读30分钟"",
  "balanceAfter": 150,
  "createdAt": {"$date": "2026-03-31T10:00:00Z"}
}
```

---

## 📝 创建步骤

1. 打开微信开发者工具
2. 点击工具栏的**云开发**按钮
3. 进入**数据库**标签
4. 点击**添加集合**
5. 输入集合名称（如：children）
6. 权限选择：**仅创建者可读写**
7. 点击**确定**
8. 重复步骤4-7，创建所有6个集合

---

## ⚠️ 注意事项

1. **集合名称必须完全一致**，区分大小写
2. **权限设置**必须选择"仅创建者可读写"，保证数据安全
3. 创建后不需要手动添加索引，云函数会自动处理
4. 创建后不需要添加记录，程序会自动创建

---

## 🔍 验证集合创建成功

在云开发控制台 → 数据库，应该能看到以下6个集合：

✅ children
✅ tasks
✅ task_completions
✅ prizes
✅ redemptions
✅ coin_records

如果都能看到，说明创建成功！
