const local: App.I18n.Schema = {
  system: {
    title: '数字家谱管理系统',
    updateTitle: '系统版本更新通知',
    updateContent: '检测到系统有新版本发布，是否立即刷新页面？',
    updateConfirm: '立即刷新',
    updateCancel: '稍后再说'
  },
  common: {
    action: '操作',
    add: '新增',
    addSuccess: '添加成功',
    backToHome: '返回首页',
    batchDelete: '批量删除',
    cancel: '取消',
    close: '关闭',
    check: '勾选',
    selectAll: '全选',
    expandColumn: '展开列',
    columnSetting: '列设置',
    config: '配置',
    confirm: '确认',
    delete: '删除',
    deleteSuccess: '删除成功',
    confirmDelete: '确认删除吗？',
    edit: '编辑',
    warning: '警告',
    error: '错误',
    index: '序号',
    keywordSearch: '请输入关键词搜索',
    logout: '退出登录',
    logoutConfirm: '确认退出登录吗？',
    lookForward: '敬请期待',
    modify: '修改',
    modifySuccess: '修改成功',
    noData: '无数据',
    operate: '操作',
    pleaseCheckValue: '请检查输入的值是否合法',
    refresh: '刷新',
    reset: '重置',
    search: '搜索',
    switch: '切换',
    tip: '提示',
    trigger: '触发',
    update: '更新',
    updateSuccess: '更新成功',
    userCenter: '个人中心',
    yesOrNo: {
      yes: '是',
      no: '否'
    }
  },
  request: {
    logout: '请求失败后登出用户',
    logoutMsg: '用户状态失效，请重新登录',
    logoutWithModal: '请求失败后弹出模态框再登出用户',
    logoutWithModalMsg: '用户状态失效，请重新登录',
    refreshToken: '请求的token已过期，刷新token',
    tokenExpired: 'token已过期'
  },
  theme: {
    themeDrawerTitle: '主题配置',
    tabs: {
      appearance: '外观',
      layout: '布局',
      general: '通用',
      preset: '预设'
    },
    appearance: {
      themeSchema: {
        title: '主题模式',
        light: '亮色模式',
        dark: '暗黑模式',
        auto: '跟随系统'
      },
      grayscale: '灰色模式',
      colourWeakness: '色弱模式',
      themeColor: {
        title: '主题颜色',
        primary: '主色',
        info: '信息色',
        success: '成功色',
        warning: '警告色',
        error: '错误色',
        followPrimary: '跟随主色'
      },
      themeRadius: {
        title: '主题圆角'
      },
      recommendColor: '应用推荐算法的颜色',
      recommendColorDesc: '推荐颜色的算法参照',
      preset: {
        title: '主题预设',
        apply: '应用',
        applySuccess: '预设应用成功',
        default: {
          name: '默认预设',
          desc: 'Soybean 默认主题预设'
        },
        dark: {
          name: '暗色预设',
          desc: '适用于夜间使用的暗色主题预设'
        },
        compact: {
          name: '紧凑型',
          desc: '适用于小屏幕的紧凑布局预设'
        },
        azir: {
          name: 'Azir的预设',
          desc: '是 Azir 比较喜欢的莫兰迪色系冷淡风'
        }
      }
    },
    layout: {
      layoutMode: {
        title: '布局模式',
        vertical: '左侧菜单模式',
        'vertical-mix': '左侧菜单混合模式',
        'vertical-hybrid-header-first': '左侧混合-顶部优先',
        horizontal: '顶部菜单模式',
        'top-hybrid-sidebar-first': '顶部混合-侧边优先',
        'top-hybrid-header-first': '顶部混合-顶部优先',
        vertical_detail: '左侧菜单布局，菜单在左，内容在右。',
        'vertical-mix_detail': '左侧双菜单布局，一级菜单在左侧深色区域，二级菜单在左侧浅色区域。',
        'vertical-hybrid-header-first_detail':
          '左侧混合布局，一级菜单在顶部，二级菜单在左侧深色区域，三级菜单在左侧浅色区域。',
        horizontal_detail: '顶部菜单布局，菜单在顶部，内容在下方。',
        'top-hybrid-sidebar-first_detail': '顶部混合布局，一级菜单在左侧，二级菜单在顶部。',
        'top-hybrid-header-first_detail': '顶部混合布局，一级菜单在顶部，二级菜单在左侧。'
      },
      tab: {
        title: '标签栏设置',
        visible: '显示标签栏',
        cache: '标签栏信息缓存',
        cacheTip: '离开页面后仍然保留标签栏信息',
        height: '标签栏高度',
        mode: {
          title: '标签栏风格',
          slider: '滑块风格',
          chrome: '谷歌风格',
          button: '按钮风格'
        },
        closeByMiddleClick: '鼠标中键关闭标签页',
        closeByMiddleClickTip: '启用后可以使用鼠标中键点击标签页进行关闭'
      },
      header: {
        title: '头部设置',
        height: '头部高度',
        breadcrumb: {
          visible: '显示面包屑',
          showIcon: '显示面包屑图标'
        }
      },
      sider: {
        title: '侧边栏设置',
        inverted: '深色侧边栏',
        width: '侧边栏宽度',
        collapsedWidth: '侧边栏折叠宽度',
        mixWidth: '混合布局侧边栏宽度',
        mixCollapsedWidth: '混合布局侧边栏折叠宽度',
        mixChildMenuWidth: '混合布局子菜单宽度',
        autoSelectFirstMenu: '自动选择第一个子菜单',
        autoSelectFirstMenuTip: '点击一级菜单时，自动选择并导航到第一个子菜单的最深层级'
      },
      footer: {
        title: '底部设置',
        visible: '显示底部',
        fixed: '固定底部',
        height: '底部高度',
        right: '底部居右'
      },
      content: {
        title: '内容区域设置',
        scrollMode: {
          title: '滚动模式',
          tip: '主题滚动仅 main 部分滚动，外层滚动可携带头部底部一起滚动',
          wrapper: '外层滚动',
          content: '主体滚动'
        },
        page: {
          animate: '页面切换动画',
          mode: {
            title: '页面切换动画类型',
            'fade-slide': '滑动',
            fade: '淡入淡出',
            'fade-bottom': '底部消退',
            'fade-scale': '缩放消退',
            'zoom-fade': '渐变',
            'zoom-out': '闪现',
            none: '无'
          }
        },
        fixedHeaderAndTab: '固定头部和标签栏'
      }
    },
    general: {
      title: '通用设置',
      watermark: {
        title: '水印设置',
        visible: '显示全屏水印',
        text: '自定义水印文本',
        enableUserName: '启用用户名水印',
        enableTime: '显示当前时间',
        timeFormat: '时间格式'
      },
      multilingual: {
        title: '多语言设置',
        visible: '显示多语言按钮'
      },
      globalSearch: {
        title: '全局搜索设置',
        visible: '显示全局搜索按钮'
      }
    },
    configOperation: {
      copyConfig: '复制配置',
      copySuccessMsg: '复制成功，请替换 src/theme/settings.ts 中的变量 themeSettings',
      resetConfig: '重置配置',
      resetSuccessMsg: '重置成功'
    }
  },
  route: {
    login: '登录',
    403: '无权限',
    404: '页面不存在',
    500: '服务器错误',
    'iframe-page': '外链页面',
    home: '首页',
    'mini-program': '小程序管理',
    'mini-program_overview': '小程序概览',
    'mini-program_members': '成员管理',
    'mini-program_family': '家族管理',
    'mini-program_family-tree': '家族树',
    'mini-program_generation-table': '字辈管理',
    'mini-program_content': '内容管理',
    'mini-program_surname': '姓氏管理',
    'mini-program_subscription': '订阅管理',
    'mini-program_worship': '祭祀管理',
    system: '系统管理',
    system_menu: '菜单管理',
    system_role: '角色管理',
    system_permission: '权限管理',
    system_admin: '管理员管理',
    system_settings: '系统设置'
  },
  page: {
    login: {
      common: {
        loginOrRegister: '登录 / 注册',
        userNamePlaceholder: '请输入用户名',
        phonePlaceholder: '请输入手机号',
        codePlaceholder: '请输入验证码',
        passwordPlaceholder: '请输入密码',
        confirmPasswordPlaceholder: '请再次输入密码',
        codeLogin: '验证码登录',
        confirm: '确定',
        back: '返回',
        validateSuccess: '验证成功',
        loginSuccess: '登录成功',
        welcomeBack: '欢迎回来，{userName} ！',
        captchaPlaceholder: '请输入验证码',
        refreshCaptcha: '点击刷新验证码',
        loading: '加载中...'
      },
      pwdLogin: {
        title: '密码登录',
        rememberMe: '记住我',
        forgetPassword: '忘记密码？',
        register: '注册账号',
        otherAccountLogin: '其他账号登录',
        otherLoginMode: '其他登录方式',
        superAdmin: '超级管理员',
        admin: '管理员',
        user: '普通用户'
      },
      codeLogin: {
        title: '验证码登录',
        getCode: '获取验证码',
        reGetCode: '{time}秒后重新获取',
        sendCodeSuccess: '验证码发送成功',
        imageCodePlaceholder: '请输入图片验证码'
      },
      register: {
        title: '注册账号',
        agreement: '我已经仔细阅读并接受',
        protocol: '《用户协议》',
        policy: '《隐私权政策》'
      },
      resetPwd: {
        title: '重置密码'
      },
      bindWeChat: {
        title: '绑定微信'
      }
    },
    miniProgram: {
      overview: {
        tip: '小程序管理后台已就绪',
        desc: '可用于成员管理、家谱维护、相册内容和系统配置等场景。',
        live: '实时'
      }
    },
    home: {
      title: '家谱管理系统',
      desc: '管理家族档案、成员信息、字辈序列与内容资产',
      memberCount: '成员总数',
      familyCount: '家族数量',
      photoCount: '相册总数',
      contentCount: '内容总数',
      contentBreakdown: '内容分类统计',
      dynamics: '动态',
      photos: '相册',
      documents: '文档',
      events: '事件',
      quickActions: '快捷操作',
      surnameDistribution: '姓氏分布统计',
      totalSurnames: '共 {n} 个姓氏',
      updatedAt: '更新于 {time}',
      noSurnameData: '暂无姓氏数据',
      surnameRanking: '姓氏排行',
      noData: '暂无数据',
      membersUnit: '{n} 人',
      memberTip: '成员总数：{n} 人',
      familyTip: '关联家族：{n} 个',
      chartMember: '成员总数',
      chartFamily: '关联家族',
      chartSurnameTip: '{name}姓'
    },
    systemSettings: {
      title: '系统设置',
      description: '管理系统基础参数、运行日志与安全策略',
      basic: '基础配置',
      log: '日志查看',
      security: '安全设置',
      save: '保存',
      saveSuccess: '保存成功',
      reset: '恢复默认',
      resetConfirm: '确定要恢复该配置的默认值吗？',
      resetSuccess: '已恢复默认值',
      verifyRequired: '该操作属于敏感操作，请先验证登录密码',
      verifyModalTitle: '二次验证',
      verifyPlaceholder: '请输入当前登录密码',
      verifySuccess: '验证通过',
      verifyFailed: '密码验证失败',
      configName: '配置名称',
      configValue: '配置值',
      remark: '说明',
      systemName: '系统名称',
      systemLogo: '系统 LOGO',
      logoUrl: 'LOGO 图片地址，留空使用默认',
      defaultLanguage: '默认语言',
      timezone: '时区',
      copyright: '版权信息',
      passwordPolicy: '密码策略',
      passwordMinLength: '密码最小长度',
      passwordRequireUpper: '必须包含大写字母',
      passwordRequireLower: '必须包含小写字母',
      passwordRequireNumber: '必须包含数字',
      passwordRequireSpecial: '必须包含特殊字符',
      passwordExpireDays: '密码有效期（天）',
      passwordExpireDaysTip: '0 表示不强制修改密码',
      loginSecurity: '登录安全',
      loginMaxAttempts: '登录失败锁定阈值（次）',
      loginLockoutMinutes: '锁定时长（分钟）',
      loginCaptchaEnabled: '启用登录图形验证码',
      loginTokenExpireDays: '令牌有效期（天）',
      ipRestriction: 'IP 访问限制',
      ipRestrictionEnabled: '启用 IP 访问限制',
      ipRestrictionMode: '限制模式',
      ipModeBlacklist: '黑名单（禁止以下 IP）',
      ipModeWhitelist: '白名单（仅允许以下 IP）',
      ipBlacklist: 'IP 黑名单',
      ipWhitelist: 'IP 白名单',
      ipListTip: '每行一个 IP，支持通配符（如 192.168.1.*）和 CIDR（如 10.0.0.0/8）',
      sensitiveVerify: '敏感操作二次验证',
      sensitiveVerifyEnabled: '启用敏感操作二次验证',
      sensitiveVerifyTimeout: '验证有效期（秒）',
      sensitiveVerifyTimeoutTip: '验证通过后在该时间内执行敏感操作无需重复验证',
      logType: '日志类型',
      logTypeOperation: '操作日志',
      logTypeError: '错误日志',
      logTypeAccess: '访问日志',
      module: '模块',
      action: '操作',
      method: '方法',
      path: '路径',
      operator: '操作人',
      ip: 'IP',
      status: '状态码',
      success: '结果',
      successYes: '成功',
      successNo: '失败',
      costTime: '耗时(ms)',
      createTime: '时间',
      detail: '详情',
      keyword: '关键词',
      keywordPlaceholder: '操作/路径/详情',
      timeRange: '时间范围',
      startTime: '开始时间',
      endTime: '结束时间',
      search: '查询',
      export: '导出',
      exportSuccess: '导出成功',
      exportFailed: '导出失败',
      clean: '清理',
      cleanConfirm: '确定要清理选中的日志吗？该操作不可恢复。',
      cleanSuccess: '日志清理完成',
      delete: '删除',
      deleteConfirm: '确定要删除该日志吗？',
      deleteSuccess: '删除成功',
      viewDetail: '查看详情',
      noPermission: '暂无访问权限',
      noPermissionTip: '当前账号没有该功能的访问权限，请联系管理员分配权限。',
      logAccessEnabled: '记录访问日志',
      logRetentionDays: '日志保留天数',
      logConfig: '日志配置',
      refresh: '刷新',
      empty: '暂无数据'
    }
  },
  form: {
    required: '不能为空',
    userName: {
      required: '请输入用户名',
      invalid: '用户名格式不正确'
    },
    phone: {
      required: '请输入手机号',
      invalid: '手机号格式不正确'
    },
    pwd: {
      required: '请输入密码',
      invalid: '密码格式不正确，6-18位字符，包含字母、数字、下划线'
    },
    confirmPwd: {
      required: '请输入确认密码',
      invalid: '两次输入密码不一致'
    },
    code: {
      required: '请输入验证码',
      invalid: '验证码格式不正确'
    },
    email: {
      required: '请输入邮箱',
      invalid: '邮箱格式不正确'
    }
  },
  dropdown: {
    closeCurrent: '关闭',
    closeOther: '关闭其它',
    closeLeft: '关闭左侧',
    closeRight: '关闭右侧',
    closeAll: '关闭所有',
    pin: '固定标签',
    unpin: '取消固定'
  },
  icon: {
    themeConfig: '主题配置',
    themeSchema: '主题模式',
    lang: '切换语言',
    fullscreen: '全屏',
    fullscreenExit: '退出全屏',
    reload: '刷新页面',
    collapse: '折叠菜单',
    expand: '展开菜单',
    pin: '固定',
    unpin: '取消固定'
  },
  datatable: {
    itemCount: '共 {total} 条',
    fixed: {
      left: '左固定',
      right: '右固定',
      unFixed: '取消固定'
    }
  }
};

export default local;
