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
    confirmPassword: '',  // 确认密码（首次设置时使用）
    showPassword: false,
    showConfirmPassword: false,  // 确认密码可见性
    step: 1  // 首次设置时的步骤：1=输入密码，2=确认密码
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
     * 确认密码输入（首次设置时）
     */
    onConfirmPasswordInput(e) {
      this.setData({
        confirmPassword: e.detail.value
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
     * 切换确认密码可见性
     */
    toggleConfirmPasswordVisibility() {
      this.setData({
        showConfirmPassword: !this.data.showConfirmPassword
      })
    },

    /**
     * 确认
     */
    onConfirm() {
      const { password, confirmPassword, isFirstTime, step } = this.data

      // 首次设置密码，第一步
      if (isFirstTime && step === 1) {
        if (!password || password.length < 4) {
          wx.showToast({
            title: '密码长度至少4位',
            icon: 'none'
          })
          return
        }

        // 进入第二步：确认密码
        this.setData({
          step: 2,
          password: password,
          showPassword: false
        })
        return
      }

      // 首次设置密码，第二步（确认密码）
      if (isFirstTime && step === 2) {
        if (confirmPassword !== password) {
          wx.showToast({
            title: '两次输入的密码不一致',
            icon: 'none'
          })
          this.setData({
            confirmPassword: '',
            showConfirmPassword: false
          })
          return
        }

        const success = app.enterParentMode(password)

        if (success) {
          this.setData({
            password: '',
            confirmPassword: '',
            showPassword: false,
            showConfirmPassword: false,
            step: 1
          })
          this.triggerEvent('success')
          this.closeModal()
        }
        return
      }

      // 非首次设置，直接验证密码
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
        confirmPassword: '',
        showPassword: false,
        showConfirmPassword: false,
        step: 1
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
