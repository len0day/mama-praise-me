// components/parent-password-modal/parent-password-modal.js
const app = getApp()

Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    isFirstTime: {
      type: Boolean,
      value: false
    }
  },

  data: {
    password: '',
    showPassword: false
  },

  methods: {
    /**
     * 密码输入
     */
    onPasswordInput(e) {
      this.setData({
        password: e.detail.value
      })
    },

    /**
     * 切换密码可见性
     */
    togglePasswordVisibility() {
      this.setData({
        showPassword: !this.data.showPassword
      })
    },

    /**
     * 确认
     */
    onConfirm() {
      const { password } = this.data

      if (!password || password.length < 4) {
        wx.showToast({
          title: '密码长度至少4位',
          icon: 'none'
        })
        return
      }

      const success = app.enterParentMode(password)

      if (success) {
        this.setData({
          password: '',
          showPassword: false
        })
        this.triggerEvent('success')
        this.closeModal()
      } else {
        wx.showToast({
          title: '密码错误',
          icon: 'none'
        })
      }
    },

    /**
     * 取消
     */
    onCancel() {
      this.setData({
        password: '',
        showPassword: false
      })
      this.triggerEvent('cancel')
      this.closeModal()
    },

    /**
     * 关闭弹窗
     */
    closeModal() {
      this.triggerEvent('close')
    }
  }
})
