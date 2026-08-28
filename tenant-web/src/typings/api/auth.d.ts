declare namespace Api {
  /**
   * namespace Auth
   *
   * backend api module: "user/auth"
   */
  namespace Auth {
    interface LoginToken {
      token: string;
      refreshToken: string;
    }

    /** C 端用户信息（租户后台复用） */
    interface UserInfo {
      /** 用户 ID */
      userId: string;
      /** 昵称 */
      userName: string;
      /** 用户真实昵称（后端字段 nickName） */
      nickName: string;
      /** 头像 */
      avatarUrl: string;
      /** 手机号 */
      phone?: string;
      /** 性别 */
      gender?: number;
      /** 当前所属家族 ID */
      familyId?: number | null;
      /** 当前绑定成员 ID */
      memberId?: string;
      /** 分享码 */
      shareCode?: string | null;
      /** 角色数组（租户后台静态路由暂不使用） */
      roles: string[];
      /** 按钮权限（租户后台静态路由暂不使用） */
      buttons: string[];
    }
  }
}
