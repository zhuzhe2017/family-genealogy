import type { RouteMeta } from 'vue-router';
import ElegantVueRouter from '@elegant-router/vue/vite';
import type { RouteKey } from '@elegant-router/types';
export function setupElegantRouter() {
  return ElegantVueRouter({
    layouts: {
      base: 'src/layouts/base-layout/index.vue',
      blank: 'src/layouts/blank-layout/index.vue'
    },
    routePathTransformer(routeName, routePath) {
      const key = routeName as RouteKey;

      if (key === 'login') {
        const modules: UnionKey.LoginModule[] = ['pwd-login', 'code-login', 'register', 'reset-pwd', 'bind-wechat'];
        const moduleReg = modules.join('|');
        return `/login/:module(${moduleReg})?`;
      }

      // tenant 后台家族子路由统一携带 :familyId 参数。
      // 页面统一通过 route.params.familyId 取当前家族。
      // 参数设为可选:菜单按路由名跳转时缺参能让守卫补参或回首页,否则 vue-router 解析阶段直接抛 Missing required param。
      const tenantFamilySubRoutes: RouteKey[] = [
        'tenant_document',
        'tenant_event',
        'tenant_member',
        'tenant_permission',
        'tenant_photo',
        'tenant_settings'
      ];
      if (tenantFamilySubRoutes.includes(key)) {
        return `${routePath}/:familyId?`;
      }

      return routePath;
    },
    onRouteMetaGen(routeName) {
      const key = routeName as RouteKey;
      const constantRoutes: RouteKey[] = ['login', '403', '404', '500'];
      const meta: Partial<RouteMeta> = {
        title: key,
        i18nKey: `route.${key}` as App.I18n.I18nKey
      };
      if (constantRoutes.includes(key)) {
        meta.constant = true;
      }
      return meta;
    }
  });
}
