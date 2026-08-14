const local: App.I18n.Schema = {
  system: {
    title: 'SoybeanAdmin',
    updateTitle: 'System Version Update Notification',
    updateContent: 'A new version of the system has been detected. Do you want to refresh the page immediately?',
    updateConfirm: 'Refresh immediately',
    updateCancel: 'Later'
  },
  common: {
    action: 'Action',
    add: 'Add',
    addSuccess: 'Add Success',
    backToHome: 'Back to home',
    batchDelete: 'Batch Delete',
    cancel: 'Cancel',
    close: 'Close',
    check: 'Check',
    selectAll: 'Select All',
    expandColumn: 'Expand Column',
    columnSetting: 'Column Setting',
    config: 'Config',
    confirm: 'Confirm',
    delete: 'Delete',
    deleteSuccess: 'Delete Success',
    confirmDelete: 'Are you sure you want to delete?',
    edit: 'Edit',
    warning: 'Warning',
    error: 'Error',
    index: 'Index',
    keywordSearch: 'Please enter keyword',
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to log out?',
    lookForward: 'Coming soon',
    modify: 'Modify',
    modifySuccess: 'Modify Success',
    noData: 'No Data',
    operate: 'Operate',
    pleaseCheckValue: 'Please check whether the value is valid',
    refresh: 'Refresh',
    reset: 'Reset',
    search: 'Search',
    switch: 'Switch',
    tip: 'Tip',
    trigger: 'Trigger',
    update: 'Update',
    updateSuccess: 'Update Success',
    userCenter: 'User Center',
    yesOrNo: {
      yes: 'Yes',
      no: 'No'
    }
  },
  request: {
    logout: 'Logout user after request failed',
    logoutMsg: 'User status is invalid, please log in again',
    logoutWithModal: 'Pop up modal after request failed and then log out user',
    logoutWithModalMsg: 'User status is invalid, please log in again',
    refreshToken: 'The requested token has expired, refresh the token',
    tokenExpired: 'The requested token has expired'
  },
  theme: {
    themeDrawerTitle: 'Theme Configuration',
    tabs: {
      appearance: 'Appearance',
      layout: 'Layout',
      general: 'General',
      preset: 'Preset'
    },
    appearance: {
      themeSchema: {
        title: 'Theme Schema',
        light: 'Light',
        dark: 'Dark',
        auto: 'Follow System'
      },
      grayscale: 'Grayscale',
      colourWeakness: 'Colour Weakness',
      themeColor: {
        title: 'Theme Color',
        primary: 'Primary',
        info: 'Info',
        success: 'Success',
        warning: 'Warning',
        error: 'Error',
        followPrimary: 'Follow Primary'
      },
      themeRadius: {
        title: 'Theme Radius'
      },
      recommendColor: 'Apply Recommended Color Algorithm',
      recommendColorDesc: 'The recommended color algorithm refers to',
      preset: {
        title: 'Theme Presets',
        apply: 'Apply',
        applySuccess: 'Preset applied successfully',
        default: {
          name: 'Default Preset',
          desc: 'Default theme preset with balanced settings'
        },
        dark: {
          name: 'Dark Preset',
          desc: 'Dark theme preset for night time usage'
        },
        compact: {
          name: 'Compact Preset',
          desc: 'Compact layout preset for small screens'
        },
        azir: {
          name: "Azir's Preset",
          desc: 'It is a cold and elegant preset that Azir likes'
        }
      }
    },
    layout: {
      layoutMode: {
        title: 'Layout Mode',
        vertical: 'Vertical Mode',
        horizontal: 'Horizontal Mode',
        'vertical-mix': 'Vertical Mix Mode',
        'vertical-hybrid-header-first': 'Left Hybrid Header-First',
        'top-hybrid-sidebar-first': 'Top-Hybrid Sidebar-First',
        'top-hybrid-header-first': 'Top-Hybrid Header-First',
        vertical_detail: 'Vertical menu layout, with the menu on the left and content on the right.',
        'vertical-mix_detail':
          'Vertical mix-menu layout, with the primary menu on the dark left side and the secondary menu on the lighter left side.',
        'vertical-hybrid-header-first_detail':
          'Left hybrid layout, with the primary menu at the top, the secondary menu on the dark left side, and the tertiary menu on the lighter left side.',
        horizontal_detail: 'Horizontal menu layout, with the menu at the top and content below.',
        'top-hybrid-sidebar-first_detail':
          'Top hybrid layout, with the primary menu on the left and the secondary menu at the top.',
        'top-hybrid-header-first_detail':
          'Top hybrid layout, with the primary menu at the top and the secondary menu on the left.'
      },
      tab: {
        title: 'Tab Settings',
        visible: 'Tab Visible',
        cache: 'Tag Bar Info Cache',
        cacheTip: 'Keep the tab bar information after leaving the page',
        height: 'Tab Height',
        mode: {
          title: 'Tab Mode',
          slider: 'Slider',
          chrome: 'Chrome',
          button: 'Button'
        },
        closeByMiddleClick: 'Close Tab by Middle Click',
        closeByMiddleClickTip: 'Enable closing tabs by clicking with the middle mouse button'
      },
      header: {
        title: 'Header Settings',
        height: 'Header Height',
        breadcrumb: {
          visible: 'Breadcrumb Visible',
          showIcon: 'Breadcrumb Icon Visible'
        }
      },
      sider: {
        title: 'Sider Settings',
        inverted: 'Dark Sider',
        width: 'Sider Width',
        collapsedWidth: 'Sider Collapsed Width',
        mixWidth: 'Mix Sider Width',
        mixCollapsedWidth: 'Mix Sider Collapse Width',
        mixChildMenuWidth: 'Mix Child Menu Width',
        autoSelectFirstMenu: 'Auto Select First Submenu',
        autoSelectFirstMenuTip:
          'When a first-level menu is clicked, the first submenu is automatically selected and navigated to the deepest level'
      },
      footer: {
        title: 'Footer Settings',
        visible: 'Footer Visible',
        fixed: 'Fixed Footer',
        height: 'Footer Height',
        right: 'Right Footer'
      },
      content: {
        title: 'Content Area Settings',
        scrollMode: {
          title: 'Scroll Mode',
          tip: 'The theme scroll only scrolls the main part, the outer scroll can carry the header and footer together',
          wrapper: 'Wrapper',
          content: 'Content'
        },
        page: {
          animate: 'Page Animate',
          mode: {
            title: 'Page Animate Mode',
            fade: 'Fade',
            'fade-slide': 'Slide',
            'fade-bottom': 'Fade Zoom',
            'fade-scale': 'Fade Scale',
            'zoom-fade': 'Zoom Fade',
            'zoom-out': 'Zoom Out',
            none: 'None'
          }
        },
        fixedHeaderAndTab: 'Fixed Header And Tab'
      }
    },
    general: {
      title: 'General Settings',
      watermark: {
        title: 'Watermark Settings',
        visible: 'Watermark Full Screen Visible',
        text: 'Custom Watermark Text',
        enableUserName: 'Enable User Name Watermark',
        enableTime: 'Show Current Time',
        timeFormat: 'Time Format'
      },
      multilingual: {
        title: 'Multilingual Settings',
        visible: 'Display multilingual button'
      },
      globalSearch: {
        title: 'Global Search Settings',
        visible: 'Display GlobalSearch button'
      }
    },
    configOperation: {
      copyConfig: 'Copy Config',
      copySuccessMsg: 'Copy Success, Please replace the variable "themeSettings" in "src/theme/settings.ts"',
      resetConfig: 'Reset Config',
      resetSuccessMsg: 'Reset Success'
    }
  },
  route: {
    login: 'Login',
    403: 'No Permission',
    404: 'Page Not Found',
    500: 'Server Error',
    'iframe-page': 'Iframe Page',
    home: 'Home',
    'mini-program': 'Mini Program',
    'mini-program_overview': 'Mini Program Overview',
    'mini-program_members': 'Member Management',
    'mini-program_family': 'Family Management',
    'mini-program_family-tree': 'Family Tree',
    'mini-program_generation-table': 'Generation Table',
    'mini-program_content': 'Content Management',
    'mini-program_surname': 'Surname Management',
    system: 'System',
    system_menu: 'Menu Management',
    system_role: 'Role Management',
    system_permission: 'Permission Management',
    system_admin: 'Admin Management',
    system_settings: 'System Settings'
  },
  page: {
    login: {
      common: {
        loginOrRegister: 'Login / Register',
        userNamePlaceholder: 'Please enter user name',
        phonePlaceholder: 'Please enter phone number',
        codePlaceholder: 'Please enter verification code',
        passwordPlaceholder: 'Please enter password',
        confirmPasswordPlaceholder: 'Please enter password again',
        codeLogin: 'Verification code login',
        confirm: 'Confirm',
        back: 'Back',
        validateSuccess: 'Verification passed',
        loginSuccess: 'Login successfully',
        welcomeBack: 'Welcome back, {userName} !',
        captchaPlaceholder: 'Enter captcha',
        refreshCaptcha: 'Click to refresh captcha',
        loading: 'Loading...'
      },
      pwdLogin: {
        title: 'Password Login',
        rememberMe: 'Remember me',
        forgetPassword: 'Forget password?',
        register: 'Register',
        otherAccountLogin: 'Other Account Login',
        otherLoginMode: 'Other Login Mode',
        superAdmin: 'Super Admin',
        admin: 'Admin',
        user: 'User'
      },
      codeLogin: {
        title: 'Verification Code Login',
        getCode: 'Get verification code',
        reGetCode: 'Reacquire after {time}s',
        sendCodeSuccess: 'Verification code sent successfully',
        imageCodePlaceholder: 'Please enter image verification code'
      },
      register: {
        title: 'Register',
        agreement: 'I have read and agree to',
        protocol: '《User Agreement》',
        policy: '《Privacy Policy》'
      },
      resetPwd: {
        title: 'Reset Password'
      },
      bindWeChat: {
        title: 'Bind WeChat'
      }
    },
    miniProgram: {
      overview: {
        tip: 'Mini Program Admin is ready',
        desc: 'This dashboard can manage members, family trees, album content and system settings.',
        live: 'Live'
      }
    },
    home: {
      title: 'Family Genealogy System',
      desc: 'Manage family archives, member profiles, generation sequences and content assets',
      memberCount: 'Total Members',
      familyCount: 'Families',
      photoCount: 'Total Photos',
      contentCount: 'Total Content',
      contentBreakdown: 'Content Breakdown',
      dynamics: 'Dynamics',
      photos: 'Photos',
      documents: 'Documents',
      events: 'Events',
      quickActions: 'Quick Actions',
      surnameDistribution: 'Surname Distribution',
      totalSurnames: '{n} surnames in total',
      updatedAt: 'Updated at {time}',
      noSurnameData: 'No surname data',
      surnameRanking: 'Surname Ranking',
      noData: 'No data',
      membersUnit: '{n} members',
      memberTip: 'Total members: {n}',
      familyTip: 'Total families: {n}',
      chartMember: 'Members',
      chartFamily: 'Families',
      chartSurnameTip: '{name}'
    },
    systemSettings: {
      title: 'System Settings',
      description: 'Manage basic parameters, running logs and security policies',
      basic: 'Basic Config',
      log: 'Logs',
      security: 'Security',
      save: 'Save',
      saveSuccess: 'Saved successfully',
      reset: 'Reset',
      resetConfirm: 'Are you sure to restore this config to default?',
      resetSuccess: 'Reset to default successfully',
      verifyRequired: 'This is a sensitive operation, please verify your password first',
      verifyModalTitle: 'Password Verification',
      verifyPlaceholder: 'Enter your current password',
      verifySuccess: 'Verified',
      verifyFailed: 'Password verification failed',
      configName: 'Config Name',
      configValue: 'Config Value',
      remark: 'Description',
      systemName: 'System Name',
      systemLogo: 'System Logo',
      logoUrl: 'Logo image URL, leave empty for default',
      defaultLanguage: 'Default Language',
      timezone: 'Timezone',
      copyright: 'Copyright',
      passwordPolicy: 'Password Policy',
      passwordMinLength: 'Min Password Length',
      passwordRequireUpper: 'Require Uppercase Letter',
      passwordRequireLower: 'Require Lowercase Letter',
      passwordRequireNumber: 'Require Number',
      passwordRequireSpecial: 'Require Special Character',
      passwordExpireDays: 'Password Expiry (days)',
      passwordExpireDaysTip: '0 means passwords never expire',
      loginSecurity: 'Login Security',
      loginMaxAttempts: 'Max Failed Attempts',
      loginLockoutMinutes: 'Lockout Duration (minutes)',
      loginCaptchaEnabled: 'Enable Login Captcha',
      loginTokenExpireDays: 'Token Expiry (days)',
      ipRestriction: 'IP Access Restriction',
      ipRestrictionEnabled: 'Enable IP Restriction',
      ipRestrictionMode: 'Restriction Mode',
      ipModeBlacklist: 'Blacklist (block IPs below)',
      ipModeWhitelist: 'Whitelist (allow only IPs below)',
      ipBlacklist: 'IP Blacklist',
      ipWhitelist: 'IP Whitelist',
      ipListTip: 'One IP per line. Supports wildcard (e.g. 192.168.1.*) and CIDR (e.g. 10.0.0.0/8)',
      sensitiveVerify: 'Sensitive Operation Verification',
      sensitiveVerifyEnabled: 'Enable Sensitive Operation Verification',
      sensitiveVerifyTimeout: 'Verify Expiry (seconds)',
      sensitiveVerifyTimeoutTip: 'Sensitive operations can be performed without re-verification within this period',
      logType: 'Log Type',
      logTypeOperation: 'Operation',
      logTypeError: 'Error',
      logTypeAccess: 'Access',
      module: 'Module',
      action: 'Action',
      method: 'Method',
      path: 'Path',
      operator: 'Operator',
      ip: 'IP',
      status: 'Status',
      success: 'Result',
      successYes: 'Success',
      successNo: 'Failed',
      costTime: 'Cost (ms)',
      createTime: 'Time',
      detail: 'Detail',
      keyword: 'Keyword',
      keywordPlaceholder: 'Action / Path / Detail',
      timeRange: 'Time Range',
      startTime: 'Start Time',
      endTime: 'End Time',
      search: 'Search',
      export: 'Export',
      exportSuccess: 'Exported successfully',
      exportFailed: 'Export failed',
      clean: 'Clean',
      cleanConfirm: 'Are you sure to clean the selected logs? This cannot be undone.',
      cleanSuccess: 'Logs cleaned',
      delete: 'Delete',
      deleteConfirm: 'Are you sure to delete this log?',
      deleteSuccess: 'Deleted successfully',
      viewDetail: 'View Detail',
      noPermission: 'No Permission',
      noPermissionTip: 'Your account has no access to this feature. Please contact the administrator.',
      logAccessEnabled: 'Enable Access Logs',
      logRetentionDays: 'Log Retention (days)',
      logConfig: 'Log Config',
      refresh: 'Refresh',
      empty: 'No data'
    }
  },
  form: {
    required: 'Cannot be empty',
    userName: {
      required: 'Please enter user name',
      invalid: 'User name format is incorrect'
    },
    phone: {
      required: 'Please enter phone number',
      invalid: 'Phone number format is incorrect'
    },
    pwd: {
      required: 'Please enter password',
      invalid: '6-18 characters, including letters, numbers, and underscores'
    },
    confirmPwd: {
      required: 'Please enter password again',
      invalid: 'The two passwords are inconsistent'
    },
    code: {
      required: 'Please enter verification code',
      invalid: 'Verification code format is incorrect'
    },
    email: {
      required: 'Please enter email',
      invalid: 'Email format is incorrect'
    }
  },
  dropdown: {
    closeCurrent: 'Close Current',
    closeOther: 'Close Other',
    closeLeft: 'Close Left',
    closeRight: 'Close Right',
    closeAll: 'Close All',
    pin: 'Pin Tab',
    unpin: 'Unpin Tab'
  },
  icon: {
    themeConfig: 'Theme Configuration',
    themeSchema: 'Theme Schema',
    lang: 'Switch Language',
    fullscreen: 'Fullscreen',
    fullscreenExit: 'Exit Fullscreen',
    reload: 'Reload Page',
    collapse: 'Collapse Menu',
    expand: 'Expand Menu',
    pin: 'Pin',
    unpin: 'Unpin'
  },
  datatable: {
    itemCount: 'Total {total} items',
    fixed: {
      left: 'Left Fixed',
      right: 'Right Fixed',
      unFixed: 'Unfixed'
    }
  }
};

export default local;
