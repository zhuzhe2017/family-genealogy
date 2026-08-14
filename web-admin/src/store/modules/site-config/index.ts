import { ref } from 'vue';
import { defineStore } from 'pinia';
import { SetupStoreId } from '@/enum';
import { fetchSiteConfig } from '@/service/api';

/**
 * 站点基础配置（系统名称/LOGO/版权信息）
 *
 * 数据来源：sys_config 表中的 system_name / system_logo / copyright 配置项，
 * 由公开接口 /system-config/site 获取，供登录页、后台左上角 Logo 与页脚展示。
 */
export const useSiteConfigStore = defineStore(SetupStoreId.SiteConfig, () => {
  const systemName = ref('');
  const systemLogo = ref('');
  const copyright = ref('');
  const loading = ref(false);
  const loaded = ref(false);

  /** 拉取站点配置（已加载过则直接复用；force 为 true 时强制刷新） */
  async function fetchConfig(force = false) {
    if ((loaded.value && !force) || loading.value) return;

    loading.value = true;
    try {
      const { data, error } = await fetchSiteConfig();
      if (!error && data) {
        systemName.value = data.systemName || '';
        systemLogo.value = data.systemLogo || '';
        copyright.value = data.copyright || '';
        loaded.value = true;
      }
    } finally {
      loading.value = false;
    }
  }

  return {
    systemName,
    systemLogo,
    copyright,
    loading,
    loaded,
    fetchConfig
  };
});
