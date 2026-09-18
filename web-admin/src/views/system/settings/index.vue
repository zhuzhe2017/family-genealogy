<script setup lang="ts">
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { useDialog, useMessage } from 'naive-ui';
import { useMediaQuery } from '@vueuse/core';
import { useAuth } from '@/hooks/business/auth';
import { $t } from '@/locales';
import ImageUpload from '@/components/common/image-upload/index.vue';
import {
  fetchSystemConfigGroups,
  fetchSaveSystemConfigBatch,
  fetchSensitiveVerifyConfig,
  fetchVerifyPassword,
  fetchSystemLogList,
  fetchSystemLogStats,
  fetchSystemLogDetail,
  fetchSystemLogExport,
  fetchSystemLogClean,
  fetchDeleteSystemLog,
  fetchCloudStorageConfig,
  fetchSaveCloudStorageConfig,
  fetchPayConfig,
  fetchSavePayConfig,
  fetchTestPayConnection,
  type SystemConfigGroups,
  type SystemLogItem,
  type CloudStorageFullConfig,
  type CloudStorageProvider,
  type PayFullConfig,
  type PayProvider
} from '@/service/api';

defineOptions({ name: 'SystemSettings' });

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

/** 窄屏（<768px 移动端）下缩小 label 宽度，避免输入框被过度压缩 */
const isNarrow = useMediaQuery('(max-width: 767px)');
const basicLabelWidth = computed(() => (isNarrow.value ? '96px' : '140px'));
const securityLabelWidth = computed(() => (isNarrow.value ? '116px' : '240px'));

/** 配置键 -> i18n 完整 key */
function fieldKeyOf(key: string): App.I18n.I18nKey {
  const map: Record<string, App.I18n.I18nKey> = {
    system_name: 'page.systemSettings.systemName',
    system_logo: 'page.systemSettings.systemLogo',
    default_language: 'page.systemSettings.defaultLanguage',
    timezone: 'page.systemSettings.timezone',
    copyright: 'page.systemSettings.copyright',
    password_min_length: 'page.systemSettings.passwordMinLength',
    password_require_upper: 'page.systemSettings.passwordRequireUpper',
    password_require_lower: 'page.systemSettings.passwordRequireLower',
    password_require_number: 'page.systemSettings.passwordRequireNumber',
    password_require_special: 'page.systemSettings.passwordRequireSpecial',
    password_expire_days: 'page.systemSettings.passwordExpireDays',
    login_max_attempts: 'page.systemSettings.loginMaxAttempts',
    login_lockout_minutes: 'page.systemSettings.loginLockoutMinutes',
    login_captcha_enabled: 'page.systemSettings.loginCaptchaEnabled',
    login_token_expire_days: 'page.systemSettings.loginTokenExpireDays',
    ip_restriction_enabled: 'page.systemSettings.ipRestrictionEnabled',
    ip_restriction_mode: 'page.systemSettings.ipRestrictionMode',
    ip_blacklist: 'page.systemSettings.ipBlacklist',
    ip_whitelist: 'page.systemSettings.ipWhitelist',
    sensitive_op_verify_enabled: 'page.systemSettings.sensitiveVerifyEnabled',
    sensitive_op_verify_timeout: 'page.systemSettings.sensitiveVerifyTimeout',
    log_access_enabled: 'page.systemSettings.logAccessEnabled',
    log_retention_days: 'page.systemSettings.logRetentionDays'
  };
  return map[key] ?? (`page.systemSettings.${key}` as App.I18n.I18nKey);
}

// ==================== 权限 ====================
const canUpdate = computed(() => hasAuth('system:settings:update'));
const canViewSecurity = computed(() => hasAuth('system:settings:security:list'));
const canViewLog = computed(() => hasAuth('system:settings:log:list'));
const canDeleteLog = computed(() => hasAuth('system:settings:log:delete'));
const canExportLog = computed(() => hasAuth('system:settings:log:export'));
const canVerify = computed(() => hasAuth('system:settings:verify'));
const canViewCloudStorage = computed(() => hasAuth('system:settings:cloud:list'));
const canUpdateCloudStorage = computed(() => hasAuth('system:settings:cloud:update'));
const canViewPay = computed(() => hasAuth('system:settings:pay:list'));
const canUpdatePay = computed(() => hasAuth('system:settings:pay:update'));

// ==================== 配置数据 ====================
const activeTab = ref('basic');
const loading = ref(false);
const groups = ref<SystemConfigGroups>({ basic: [], security: [], log: [] });
// 表单模型：不同配置项值类型不同（字符串/数字/布尔/json文本）
const basicModel = reactive<Record<string, string>>({});

const securityModel = reactive<Record<string, any>>({});

// ==================== 云存储配置 ====================
const cloudLoading = ref(false);
const cloudConfig = ref<CloudStorageFullConfig>({
  provider: 'tencent',
  tencent: { enabled: false, secretId: '', secretKey: '', bucket: '', region: '', appId: '', domain: '' },
  aliyun: { enabled: false, accessKeyId: '', accessKeySecret: '', bucket: '', region: '', endpoint: '', domain: '' },
  qiniu: { enabled: false, accessKey: '', secretKey: '', bucket: '', region: '', domain: '' }
});

const cloudModel = reactive<CloudStorageFullConfig & { touched: Record<string, boolean> }>({
  provider: 'tencent',
  tencent: { enabled: false, secretId: '', secretKey: '', bucket: '', region: '', appId: '', domain: '' },
  aliyun: { enabled: false, accessKeyId: '', accessKeySecret: '', bucket: '', region: '', endpoint: '', domain: '' },
  qiniu: { enabled: false, accessKey: '', secretKey: '', bucket: '', region: '', domain: '' },
  touched: {}
});

const cloudProviderOptions = computed(() => [
  { label: $t('page.systemSettings.cloudStorageProviderTencent'), value: 'tencent' },
  { label: $t('page.systemSettings.cloudStorageProviderAliyun'), value: 'aliyun' },
  { label: $t('page.systemSettings.cloudStorageProviderQiniu'), value: 'qiniu' }
]);

const cloudProviderNames: Record<CloudStorageProvider, string> = {
  tencent: $t('page.systemSettings.cloudStorageProviderTencent'),
  aliyun: $t('page.systemSettings.cloudStorageProviderAliyun'),
  qiniu: $t('page.systemSettings.cloudStorageProviderQiniu')
};

const cloudFields: Record<
  CloudStorageProvider,
  { key: string; label: App.I18n.I18nKey; required?: boolean; type?: 'password' }[]
> = {
  tencent: [
    { key: 'secretId', label: 'page.systemSettings.cloudStorageSecretId', required: true },
    { key: 'secretKey', label: 'page.systemSettings.cloudStorageSecretKey', required: true, type: 'password' },
    { key: 'bucket', label: 'page.systemSettings.cloudStorageBucket', required: true },
    { key: 'region', label: 'page.systemSettings.cloudStorageRegion', required: true },
    { key: 'appId', label: 'page.systemSettings.cloudStorageAppId' },
    { key: 'domain', label: 'page.systemSettings.cloudStorageDomain' }
  ],
  aliyun: [
    { key: 'accessKeyId', label: 'page.systemSettings.cloudStorageSecretId', required: true },
    { key: 'accessKeySecret', label: 'page.systemSettings.cloudStorageAccessKeySecret', required: true, type: 'password' },
    { key: 'bucket', label: 'page.systemSettings.cloudStorageBucket', required: true },
    { key: 'region', label: 'page.systemSettings.cloudStorageRegion', required: true },
    { key: 'endpoint', label: 'page.systemSettings.cloudStorageEndpoint' },
    { key: 'domain', label: 'page.systemSettings.cloudStorageDomain' }
  ],
  qiniu: [
    { key: 'accessKey', label: 'page.systemSettings.cloudStorageAccessKey', required: true },
    { key: 'secretKey', label: 'page.systemSettings.cloudStorageSecretKey', required: true, type: 'password' },
    { key: 'bucket', label: 'page.systemSettings.cloudStorageBucket', required: true },
    { key: 'region', label: 'page.systemSettings.cloudStorageRegion' },
    { key: 'domain', label: 'page.systemSettings.cloudStorageDomain' }
  ]
};

function isMasked(value: string): boolean {
  return typeof value === 'string' && value.includes('*');
}

function cloudFieldValue(provider: CloudStorageProvider, key: string): string {
  return String((cloudModel[provider] as unknown as Record<string, string>)[key] ?? '');
}

function updateCloudField(provider: CloudStorageProvider, key: string, value: string) {
  (cloudModel[provider] as unknown as Record<string, string>)[key] = value;
}

function handleCloudFieldFocus(provider: CloudStorageProvider, key: string) {
  if (isMasked(cloudFieldValue(provider, key))) {
    updateCloudField(provider, key, '');
    cloudModel.touched[`${provider}.${key}`] = true;
  }
}

async function loadCloudStorageConfig() {
  if (!canViewCloudStorage.value) return;
  cloudLoading.value = true;
  try {
    const { data } = await fetchCloudStorageConfig();
    if (!data) return;
    cloudConfig.value = data;
    resetCloudModel();
  } finally {
    cloudLoading.value = false;
  }
}

function resetCloudModel() {
  const cfg = cloudConfig.value;
  cloudModel.provider = cfg.provider;
  for (const p of Object.keys(cloudFields) as CloudStorageProvider[]) {
    const target = cfg[p];
    const src = cloudModel[p];
    for (const field of cloudFields[p]) {
      const value = (target as unknown as Record<string, unknown>)[field.key];
      (src as unknown as Record<string, string>)[field.key] = String(value ?? '');
    }
    src.enabled = target.enabled;
  }
  cloudModel.touched = {};
}

function validateCloudStorage(): boolean {
  const providers: CloudStorageProvider[] = ['tencent', 'aliyun', 'qiniu'];
  for (const p of providers) {
    const model = cloudModel[p];
    if (!model.enabled) continue;
    for (const field of cloudFields[p]) {
      if (!field.required) continue;
      const value = String((model as unknown as Record<string, string>)[field.key] || '').trim();
      if (value === '' || isMasked(value)) {
        message.error(`${cloudProviderNames[p]} - ${$t(field.label)} ${$t('page.systemSettings.cloudStorageRequired')}`);
        return false;
      }
    }
  }
  return true;
}

async function handleSaveCloudStorage() {
  if (!canUpdateCloudStorage.value) return;
  if (!(await ensureVerified())) return;
  if (!validateCloudStorage()) return;

  const payload: CloudStorageFullConfig = {
    provider: cloudModel.provider,
    tencent: { ...cloudModel.tencent },
    aliyun: { ...cloudModel.aliyun },
    qiniu: { ...cloudModel.qiniu }
  };

  // 过滤掉仍被脱敏的敏感字段，避免用掩码覆盖真实密钥
  const sensitiveFields: Record<CloudStorageProvider, string[]> = {
    tencent: ['secretKey'],
    aliyun: ['accessKeySecret'],
    qiniu: ['secretKey']
  };
  for (const p of Object.keys(sensitiveFields) as CloudStorageProvider[]) {
    for (const key of sensitiveFields[p]) {
      const value = String((payload[p] as unknown as Record<string, string>)[key] || '');
      if (isMasked(value)) {
        (payload[p] as unknown as Record<string, string>)[key] = '';
      }
    }
  }

  const { error } = await fetchSaveCloudStorageConfig(payload);
  if (!error) {
    message.success($t('page.systemSettings.cloudStorageSaveSuccess'));
    await loadCloudStorageConfig();
  }
}

/** json 数组 <-> textarea 文本 */
function jsonToText(value: unknown): string {
  return Array.isArray(value) ? (value as string[]).join('\n') : String(value ?? '');
}
function textToJson(text: string): string {
  return JSON.stringify(text.split('\n').map(s => s.trim()).filter(Boolean));
}

// ==================== 支付配置 ====================
const payLoading = ref(false);
const paySaving = ref(false);
const payTesting = ref(false);
const payConfig = ref<PayFullConfig>({
  provider: 'wxpay',
  wxpay: { enabled: false, appId: '', mchId: '', mchSerialNo: '', privateKey: '', apiV3Key: '', notifyUrl: '', platformPublicKey: '', statusNotifyUrl: '' },
  alipay: { enabled: false, appId: '', privateKey: '', alipayPublicKey: '', notifyUrl: '', statusNotifyUrl: '' }
});

const payModel = reactive<PayFullConfig>({
  provider: 'wxpay',
  wxpay: { enabled: false, appId: '', mchId: '', mchSerialNo: '', privateKey: '', apiV3Key: '', notifyUrl: '', platformPublicKey: '', statusNotifyUrl: '' },
  alipay: { enabled: false, appId: '', privateKey: '', alipayPublicKey: '', notifyUrl: '', statusNotifyUrl: '' }
});

const payProviderOptions = computed(() => [
  { label: $t('page.systemSettings.payProviderWxpay'), value: 'wxpay' },
  { label: $t('page.systemSettings.payProviderAlipay'), value: 'alipay' }
]);

const payProviderNames: Record<PayProvider, string> = {
  wxpay: $t('page.systemSettings.payProviderWxpay'),
  alipay: $t('page.systemSettings.payProviderAlipay')
};

interface PayField {
  key: string;
  label: App.I18n.I18nKey;
  required?: boolean;
  type?: 'password' | 'textarea';
}

const payFields: Record<PayProvider, PayField[]> = {
  wxpay: [
    { key: 'appId', label: 'page.systemSettings.payAppId', required: true },
    { key: 'mchId', label: 'page.systemSettings.payMchId', required: true },
    { key: 'mchSerialNo', label: 'page.systemSettings.payMchSerialNo', required: true },
    { key: 'privateKey', label: 'page.systemSettings.payPrivateKey', required: true, type: 'textarea' },
    { key: 'apiV3Key', label: 'page.systemSettings.payApiV3Key', required: true, type: 'password' },
    { key: 'notifyUrl', label: 'page.systemSettings.payNotifyUrl', required: true },
    { key: 'platformPublicKey', label: 'page.systemSettings.payPlatformPublicKey', type: 'textarea' },
    { key: 'statusNotifyUrl', label: 'page.systemSettings.payStatusNotifyUrl' }
  ],
  alipay: [
    { key: 'appId', label: 'page.systemSettings.payAppId', required: true },
    { key: 'privateKey', label: 'page.systemSettings.payPrivateKey', required: true, type: 'textarea' },
    { key: 'alipayPublicKey', label: 'page.systemSettings.payAlipayPublicKey', required: true, type: 'textarea' },
    { key: 'notifyUrl', label: 'page.systemSettings.payNotifyUrl', required: true },
    { key: 'statusNotifyUrl', label: 'page.systemSettings.payStatusNotifyUrl' }
  ]
};

const paySensitiveFields: Record<PayProvider, string[]> = {
  wxpay: ['privateKey', 'apiV3Key', 'platformPublicKey'],
  alipay: ['privateKey', 'alipayPublicKey']
};

function payFieldValue(provider: PayProvider, key: string): string {
  return String((payModel[provider] as unknown as Record<string, string>)[key] ?? '');
}

function updatePayField(provider: PayProvider, key: string, value: string) {
  (payModel[provider] as unknown as Record<string, string>)[key] = value;
}

function handlePayFieldFocus(provider: PayProvider, key: string) {
  if (isMasked(payFieldValue(provider, key))) {
    updatePayField(provider, key, '');
  }
}

async function loadPayConfig() {
  if (!canViewPay.value) return;
  payLoading.value = true;
  try {
    const { data } = await fetchPayConfig();
    if (!data) return;
    payConfig.value = data;
    resetPayModel();
  } finally {
    payLoading.value = false;
  }
}

function resetPayModel() {
  const cfg = payConfig.value;
  payModel.provider = cfg.provider;
  for (const p of Object.keys(payFields) as PayProvider[]) {
    const target = cfg[p];
    const src = payModel[p];
    for (const field of payFields[p]) {
      const value = (target as unknown as Record<string, unknown>)[field.key];
      (src as unknown as Record<string, string>)[field.key] = String(value ?? '');
    }
    src.enabled = target.enabled;
  }
}

function isValidUrl(value: string): boolean {
  return /^https?:\/\/.+/.test(value);
}

function validatePayConfig(): boolean {
  const providers: PayProvider[] = ['wxpay', 'alipay'];
  for (const p of providers) {
    const model = payModel[p];
    for (const field of payFields[p]) {
      const value = String((model as unknown as Record<string, string>)[field.key] || '').trim();
      if (field.required && model.enabled && (value === '' || isMasked(value))) {
        message.error(`${payProviderNames[p]} - ${$t(field.label)} ${$t('page.systemSettings.payRequired')}`);
        return false;
      }
      if (value && (field.key === 'notifyUrl' || field.key === 'statusNotifyUrl') && !isValidUrl(value)) {
        message.error(`${payProviderNames[p]} - ${$t(field.label)} URL 格式不正确（需 http/https 开头）`);
        return false;
      }
    }
  }
  return true;
}

async function handleSavePay() {
  if (!canUpdatePay.value) return;
  if (!(await ensureVerified())) return;
  if (!validatePayConfig()) return;

  const payload: PayFullConfig = {
    provider: payModel.provider,
    wxpay: { ...payModel.wxpay },
    alipay: { ...payModel.alipay }
  };

  // 掩码值置空表示不修改，由服务端保留原值
  for (const p of Object.keys(paySensitiveFields) as PayProvider[]) {
    for (const key of paySensitiveFields[p]) {
      const value = String((payload[p] as unknown as Record<string, string>)[key] || '');
      if (isMasked(value)) {
        (payload[p] as unknown as Record<string, string>)[key] = '';
      }
    }
  }

  paySaving.value = true;
  try {
    const { error } = await fetchSavePayConfig(payload);
    if (!error) {
      message.success($t('page.systemSettings.paySaveSuccess'));
      await loadPayConfig();
    }
  } finally {
    paySaving.value = false;
  }
}

async function handleTestPay(provider: PayProvider) {
  if (!canUpdatePay.value) return;
  payTesting.value = true;
  try {
    const { data, error } = await fetchTestPayConnection(provider);
    if (!error && data) {
      if (data.success) {
        message.success(`${payProviderNames[provider]}：${data.message || $t('page.systemSettings.payTestSuccess')}`);
      } else {
        message.error(`${payProviderNames[provider]}：${data.message || $t('page.systemSettings.payTestFailed')}`);
      }
    }
  } finally {
    payTesting.value = false;
  }
}

async function loadConfigs() {
  loading.value = true;
  try {
    const { data } = await fetchSystemConfigGroups();
    if (!data) return;
    groups.value = data;

    for (const item of data.basic) {
      basicModel[item.configKey] = String(item.configValue ?? '');
    }
    for (const item of data.security) {
      securityModel[item.configKey] = item.valueType === 'json' ? jsonToText(item.configValue) : item.configValue;
    }
  } finally {
    loading.value = false;
  }
}

/** 保存基础配置 */
async function handleSaveBasic() {
  if (!canUpdate.value) return;
  const items = groups.value.basic.map(item => ({ id: item.id, configValue: basicModel[item.configKey] }));
  const { error } = await fetchSaveSystemConfigBatch(items);
  if (!error) {
    message.success($t('page.systemSettings.saveSuccess'));
    loadConfigs();
  }
}

/** 保存安全设置 */
async function handleSaveSecurity() {
  if (!canUpdate.value) return;
  if (!(await ensureVerified())) return;
  const items = groups.value.security.map(item => ({
    id: item.id,
    configValue:
      item.valueType === 'json' ? textToJson(String(securityModel[item.configKey] ?? '')) : securityModel[item.configKey]
  }));
  const { error } = await fetchSaveSystemConfigBatch(items);
  if (!error) {
    message.success($t('page.systemSettings.saveSuccess'));
    loadConfigs();
  }
}

// ==================== 敏感操作二次验证 ====================
const sensitiveConfig = ref<{ enabled: boolean; timeout: number }>({ enabled: true, timeout: 120 });
const verifyModalVisible = ref(false);
const verifyLoading = ref(false);
const verifyPassword = ref('');
let pendingVerify: ((ok: boolean) => void) | null = null;
let verifiedUntil = 0;

async function loadSensitiveConfig() {
  if (!canVerify.value) return;
  try {
    const { data } = await fetchSensitiveVerifyConfig();
    if (data) sensitiveConfig.value = data;
  } catch {
    /* 忽略 */
  }
}

/** 确保通过二次验证（未启用或有效期内直接放行） */
function ensureVerified(): Promise<boolean> {
  if (!sensitiveConfig.value.enabled) return Promise.resolve(true);
  if (verifiedUntil > Date.now()) return Promise.resolve(true);
  if (!canVerify.value) {
    message.warning($t('page.systemSettings.noPermission'));
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    pendingVerify = resolve;
    verifyPassword.value = '';
    verifyModalVisible.value = true;
  });
}

async function handleVerifySubmit() {
  if (!verifyPassword.value) return;
  verifyLoading.value = true;
  try {
    const { error, data } = await fetchVerifyPassword(verifyPassword.value);
    if (!error && data?.verified) {
      verifiedUntil = Date.now() + data.expiresIn * 1000;
      message.success($t('page.systemSettings.verifySuccess'));
      verifyModalVisible.value = false;
      pendingVerify?.(true);
    } else {
      message.error($t('page.systemSettings.verifyFailed'));
      verifyPassword.value = '';
      pendingVerify?.(false);
      pendingVerify = null;
      return;
    }
  } finally {
    verifyLoading.value = false;
    pendingVerify = null;
  }
}

function handleVerifyCancel() {
  verifyModalVisible.value = false;
  pendingVerify?.(false);
  pendingVerify = null;
}

// ==================== 日志查看 ====================
const logLoading = ref(false);
const logList = ref<SystemLogItem[]>([]);
const logTotal = ref(0);
const logPage = ref(1);
const logPageSize = ref(10);
const logStats = ref<{ operation: number; error: number; access: number }>({ operation: 0, error: 0, access: 0 });

const logFilters = reactive<{
  logType: string | null;
  keyword: string;
  operator: string;
  timeRange: [string, string] | null;
}>({
  logType: null,
  keyword: '',
  operator: '',
  timeRange: null
});

const logTypeOptions = computed(() => [
  { label: $t('page.systemSettings.logTypeOperation'), value: 'operation' },
  { label: $t('page.systemSettings.logTypeError'), value: 'error' },
  { label: $t('page.systemSettings.logTypeAccess'), value: 'access' }
]);

const logTypeNames: Record<string, string> = {
  operation: $t('page.systemSettings.logTypeOperation'),
  error: $t('page.systemSettings.logTypeError'),
  access: $t('page.systemSettings.logTypeAccess')
};

async function loadLogs() {
  if (!canViewLog.value) return;
  logLoading.value = true;
  try {
    const { data } = await fetchSystemLogList({
      page: logPage.value,
      pageSize: logPageSize.value,
      logType: logFilters.logType || undefined,
      keyword: logFilters.keyword || undefined,
      operator: logFilters.operator || undefined,
      startTime: logFilters.timeRange?.[0] || undefined,
      endTime: logFilters.timeRange?.[1] || undefined
    });
    if (data) {
      logList.value = data.list;
      logTotal.value = data.total;
    }
  } finally {
    logLoading.value = false;
  }
}

async function loadLogStats() {
  if (!canViewLog.value) return;
  try {
    const { data } = await fetchSystemLogStats();
    if (data) logStats.value = data;
  } catch {
    /* 忽略 */
  }
}

function handleLogSearch() {
  logPage.value = 1;
  loadLogs();
}

function handleLogReset() {
  logFilters.logType = null;
  logFilters.keyword = '';
  logFilters.operator = '';
  logFilters.timeRange = null;
  logPage.value = 1;
  loadLogs();
}

async function handleExport() {
  if (!canExportLog.value) return;
  try {
    const blob = await fetchSystemLogExport({
      logType: logFilters.logType || undefined,
      keyword: logFilters.keyword || undefined,
      operator: logFilters.operator || undefined,
      startTime: logFilters.timeRange?.[0] || undefined,
      endTime: logFilters.timeRange?.[1] || undefined
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success($t('page.systemSettings.exportSuccess'));
  } catch {
    message.error($t('page.systemSettings.exportFailed'));
  }
}

async function handleClean() {
  if (!canDeleteLog.value) return;
  if (!(await ensureVerified())) return;
  dialog.warning({
    title: $t('page.systemSettings.clean'),
    content: $t('page.systemSettings.cleanConfirm'),
    positiveText: $t('common.confirm'),
    negativeText: $t('common.cancel'),
    onPositiveClick: async () => {
      const { error } = await fetchSystemLogClean({
        logType: logFilters.logType || undefined,
        startTime: logFilters.timeRange?.[0] || undefined,
        endTime: logFilters.timeRange?.[1] || undefined
      });
      if (!error) {
        message.success($t('page.systemSettings.cleanSuccess'));
        loadLogs();
        loadLogStats();
      }
    }
  });
}

async function handleDeleteLog(row: SystemLogItem) {
  if (!canDeleteLog.value) return;
  if (!(await ensureVerified())) return;
  dialog.warning({
    title: $t('page.systemSettings.delete'),
    content: $t('page.systemSettings.deleteConfirm'),
    positiveText: $t('common.confirm'),
    negativeText: $t('common.cancel'),
    onPositiveClick: async () => {
      const { error } = await fetchDeleteSystemLog(row.id);
      if (!error) {
        message.success($t('page.systemSettings.deleteSuccess'));
        loadLogs();
        loadLogStats();
      }
    }
  });
}

const detailModalVisible = ref(false);
const detailLoading = ref(false);
const detailRow = ref<SystemLogItem | null>(null);

async function handleViewDetail(row: SystemLogItem) {
  detailLoading.value = true;
  detailModalVisible.value = true;
  try {
    const { data } = await fetchSystemLogDetail(row.id);
    detailRow.value = data || row;
  } finally {
    detailLoading.value = false;
  }
}

const columns = computed(() => {
  return [
    {
      title: 'ID',
      key: 'id',
      width: 70,
      render: (row: SystemLogItem) => h('span', row.id)
    },
    {
      title: $t('page.systemSettings.logType'),
      key: 'logType',
      width: 100,
      render: (row: SystemLogItem) =>
        h(
          'span',
          {
            class:
              row.logType === 'error' ? 'text-red-500' : row.logType === 'access' ? 'text-blue-500' : 'text-green-500'
          },
          logTypeNames[row.logType] || row.logType
        )
    },
    { title: $t('page.systemSettings.action'), key: 'action', width: 100, ellipsis: { tooltip: true } },
    { title: $t('page.systemSettings.module'), key: 'module', width: 110 },
    { title: $t('page.systemSettings.operator'), key: 'operator', width: 110 },
    { title: $t('page.systemSettings.method'), key: 'method', width: 70 },
    { title: $t('page.systemSettings.ip'), key: 'ip', width: 120, ellipsis: { tooltip: true } },
    { title: $t('page.systemSettings.status'), key: 'status', width: 75 },
    {
      title: $t('page.systemSettings.success'),
      key: 'success',
      width: 70,
      render: (row: SystemLogItem) =>
        h(
          'span',
          { class: row.success === 1 ? 'text-green-500' : 'text-red-500' },
          row.success === 1 ? $t('page.systemSettings.successYes') : $t('page.systemSettings.successNo')
        )
    },
    { title: $t('page.systemSettings.costTime'), key: 'costTime', width: 90 },
    { title: $t('page.systemSettings.createTime'), key: 'createTime', width: 165, ellipsis: { tooltip: true } },
    {
      title: $t('common.operate'),
      key: 'actions',
      width: 140,
      render: (row: SystemLogItem) =>
        h('div', { class: 'flex gap-12px' }, [
          h(
            'a',
            { class: 'text-blue-600 cursor-pointer', onClick: () => handleViewDetail(row) },
            { default: () => $t('page.systemSettings.viewDetail') }
          ),
          canDeleteLog.value &&
            h(
              'a',
              { class: 'text-red-600 cursor-pointer', onClick: () => handleDeleteLog(row) },
              { default: () => $t('common.delete') }
            )
        ])
    }
  ];
});

/** 切换到日志 Tab 时加载日志数据 */
watch(activeTab, tab => {
  if (tab === 'log' && canViewLog.value) {
    loadLogs();
    loadLogStats();
  }
  if (tab === 'cloud' && canViewCloudStorage.value) {
    loadCloudStorageConfig();
  }
  if (tab === 'pay' && canViewPay.value) {
    loadPayConfig();
  }
});

onMounted(() => {
  loadConfigs();
  loadSensitiveConfig();
  loadCloudStorageConfig();
  loadPayConfig();
});
</script>

<template>
  <div class="page-container">
    <div class="mb-16px">
      <h2 class="text-20px font-600 mb-4px">{{ $t('page.systemSettings.title') }}</h2>
      <p class="text-14px text-#999">{{ $t('page.systemSettings.description') }}</p>
    </div>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane name="basic" :tab="$t('page.systemSettings.basic')" />
      <NTabPane
        name="log"
        :tab="`${$t('page.systemSettings.log')} (${logStats.operation + logStats.error + logStats.access})`"
      />
      <NTabPane name="security" :tab="$t('page.systemSettings.security')" />
      <NTabPane name="cloud" :tab="$t('page.systemSettings.cloudStorage')" />
      <NTabPane name="pay" :tab="$t('page.systemSettings.payConfig')" />
    </NTabs>

    <div v-if="loading && activeTab !== 'log'" class="mt-24px">
      <NSkeleton v-for="i in 5" :key="i" text style="margin-bottom: 12px" />
    </div>

    <!-- 基础配置面板 -->
    <div v-else-if="activeTab === 'basic'" class="mt-16px max-w-720px mx-auto">
      <NCard :bordered="false" class="shadow-sm">
        <template #header>{{ $t('page.systemSettings.basic') }}</template>
        <NForm label-placement="left" :label-width="basicLabelWidth" :show-feedback="false">
          <NFormItem
            v-for="item in groups.basic"
            :key="item.id"
            :label="$t(fieldKeyOf(item.configKey))"
          >
            <ImageUpload
              v-if="item.configKey === 'system_logo'"
              v-model:value="basicModel[item.configKey]"
              :disabled="!canUpdate"
              :max-size="2"
            />
            <NInput
              v-else
              v-model:value="basicModel[item.configKey]"
              :placeholder="item.remark"
              :disabled="!canUpdate"
              clearable
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <div class="flex justify-end gap-12px">
            <NButton v-if="canUpdate" type="primary" :loading="loading" @click="handleSaveBasic">
              {{ $t('page.systemSettings.save') }}
            </NButton>
          </div>
        </template>
      </NCard>
    </div>

    <!-- 日志查看面板 -->
    <div v-else-if="activeTab === 'log'" class="mt-16px">
      <NCard v-if="canViewLog" :bordered="false" class="shadow-sm">
        <div class="flex items-center gap-12px mb-16px">
          <NSelect
            v-model:value="logFilters.logType"
            class="w-100px shrink-0"
            clearable
            :options="logTypeOptions"
            :placeholder="$t('page.systemSettings.logType')"
          />
          <NInput
            v-model:value="logFilters.keyword"
            class="flex-1 min-w-0"
            clearable
            :placeholder="$t('page.systemSettings.keywordPlaceholder')"
          />
          <NInput
            v-model:value="logFilters.operator"
            class="w-90px max-w-90px shrink-0"
            clearable
            :placeholder="$t('page.systemSettings.operator')"
          />
          <NDatePicker
            v-model:formatted-value="logFilters.timeRange"
            type="daterange"
            value-format="yyyy-MM-dd HH:mm:ss"
            class="w-190px shrink-0"
            clearable
          />
          <NButton class="shrink-0" type="primary" @click="handleLogSearch">{{ $t('page.systemSettings.search') }}</NButton>
          <NButton class="shrink-0" @click="handleLogReset">{{ $t('page.systemSettings.refresh') }}</NButton>
          <NButton v-if="canExportLog" class="shrink-0" :loading="logLoading" @click="handleExport">
            {{ $t('page.systemSettings.export') }}
          </NButton>
          <NButton v-if="canDeleteLog" class="shrink-0" type="warning" :loading="logLoading" @click="handleClean">
            {{ $t('page.systemSettings.clean') }}
          </NButton>
        </div>

        <NDataTable
          remote
          :columns="columns"
          :data="logList"
          :loading="logLoading"
          :row-key="(row: SystemLogItem) => row.id"
          :scroll-x="1100"
        />
        <div class="flex justify-end mt-16px">
          <NPagination
            v-model:page="logPage"
            :page-size="logPageSize"
            :item-count="logTotal"
            show-size-picker
            :page-sizes="[10, 20, 50, 100]"
            @update:page="loadLogs"
            @update:page-size="logPageSize = $event; loadLogs()"
          />
        </div>
      </NCard>

      <NCard v-else :bordered="false" class="shadow-sm">
        <NResult
          status="403"
          :title="$t('page.systemSettings.noPermission')"
          :description="$t('page.systemSettings.noPermissionTip')"
        />
      </NCard>
    </div>

    <!-- 安全设置面板 -->
    <div v-else-if="activeTab === 'security'" class="mt-16px max-w-720px mx-auto">
      <template v-if="canViewSecurity">
        <NCard :bordered="false" class="shadow-sm mb-16px">
          <template #header>{{ $t('page.systemSettings.passwordPolicy') }}</template>
          <NForm label-placement="left" :label-width="securityLabelWidth" :show-feedback="false">
            <NFormItem :label="$t('page.systemSettings.passwordMinLength')">
              <NInputNumber
                v-model:value="securityModel.password_min_length"
                :min="1"
                :max="32"
                :disabled="!canUpdate"
                class="w-full"
              />
            </NFormItem>
            <NFormItem
              v-for="key in ['password_require_upper', 'password_require_lower', 'password_require_number', 'password_require_special']"
              :key="key"
              :label="$t(fieldKeyOf(key))"
            >
              <NSwitch v-model:value="securityModel[key]" :disabled="!canUpdate" />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.passwordExpireDays')">
              <NInputNumber
                v-model:value="securityModel.password_expire_days"
                :min="0"
                :disabled="!canUpdate"
                class="w-full"
              >
                <template #suffix>{{ $t('page.systemSettings.passwordExpireDaysTip') }}</template>
              </NInputNumber>
            </NFormItem>
          </NForm>
        </NCard>

        <NCard :bordered="false" class="shadow-sm mb-16px">
          <template #header>{{ $t('page.systemSettings.loginSecurity') }}</template>
          <NForm label-placement="left" :label-width="securityLabelWidth" :show-feedback="false">
            <NFormItem :label="$t('page.systemSettings.loginMaxAttempts')">
              <NInputNumber
                v-model:value="securityModel.login_max_attempts"
                :min="1"
                :max="20"
                :disabled="!canUpdate"
                class="w-full"
              />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.loginLockoutMinutes')">
              <NInputNumber
                v-model:value="securityModel.login_lockout_minutes"
                :min="1"
                :max="1440"
                :disabled="!canUpdate"
                class="w-full"
              />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.loginCaptchaEnabled')">
              <NSwitch v-model:value="securityModel.login_captcha_enabled" :disabled="!canUpdate" />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.loginTokenExpireDays')">
              <NInputNumber
                v-model:value="securityModel.login_token_expire_days"
                :min="1"
                :max="365"
                :disabled="!canUpdate"
                class="w-full"
              />
            </NFormItem>
          </NForm>
        </NCard>

        <NCard :bordered="false" class="shadow-sm mb-16px">
          <template #header>{{ $t('page.systemSettings.ipRestriction') }}</template>
          <NForm label-placement="left" :label-width="securityLabelWidth" :show-feedback="false">
            <NFormItem :label="$t('page.systemSettings.ipRestrictionEnabled')">
              <NSwitch v-model:value="securityModel.ip_restriction_enabled" :disabled="!canUpdate" />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.ipRestrictionMode')">
              <NSelect
                v-model:value="securityModel.ip_restriction_mode"
                class="w-full"
                :disabled="!canUpdate"
                :options="[
                  { label: $t('page.systemSettings.ipModeBlacklist'), value: 'blacklist' },
                  { label: $t('page.systemSettings.ipModeWhitelist'), value: 'whitelist' }
                ]"
              />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.ipBlacklist')">
              <NInput
                v-model:value="securityModel.ip_blacklist"
                type="textarea"
                :rows="4"
                :placeholder="$t('page.systemSettings.ipListTip')"
                :disabled="!canUpdate"
              />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.ipWhitelist')">
              <NInput
                v-model:value="securityModel.ip_whitelist"
                type="textarea"
                :rows="4"
                :placeholder="$t('page.systemSettings.ipListTip')"
                :disabled="!canUpdate"
              />
            </NFormItem>
          </NForm>
        </NCard>

        <NCard :bordered="false" class="shadow-sm mb-16px">
          <template #header>{{ $t('page.systemSettings.sensitiveVerify') }}</template>
          <NForm label-placement="left" :label-width="securityLabelWidth" :show-feedback="false">
            <NFormItem :label="$t('page.systemSettings.sensitiveVerifyEnabled')">
              <NSwitch v-model:value="securityModel.sensitive_op_verify_enabled" :disabled="!canUpdate" />
            </NFormItem>
            <NFormItem :label="$t('page.systemSettings.sensitiveVerifyTimeout')">
              <NInputNumber
                v-model:value="securityModel.sensitive_op_verify_timeout"
                :min="30"
                :max="86400"
                :disabled="!canUpdate"
                class="w-full"
              >
                <template #suffix>{{ $t('page.systemSettings.sensitiveVerifyTimeoutTip') }}</template>
              </NInputNumber>
            </NFormItem>
          </NForm>
        </NCard>

        <div class="flex justify-end mb-16px">
          <NButton v-if="canUpdate" type="primary" :loading="loading" @click="handleSaveSecurity">
            {{ $t('page.systemSettings.save') }}
          </NButton>
        </div>
      </template>

      <NCard v-else :bordered="false" class="shadow-sm">
        <NResult
          status="403"
          :title="$t('page.systemSettings.noPermission')"
          :description="$t('page.systemSettings.noPermissionTip')"
        />
      </NCard>
    </div>

    <!-- 云存储配置面板 -->
    <div v-else-if="activeTab === 'cloud'" class="mt-16px">
      <NSpin :show="cloudLoading">
        <NCard v-if="canViewCloudStorage" :bordered="false" class="shadow-sm mb-16px">
          <template #header>{{ $t('page.systemSettings.cloudStorage') }}</template>
          <template #header-extra>
            <NTag type="info" size="small">{{ $t('page.systemSettings.cloudStorageTip') }}</NTag>
          </template>

          <div class="mb-24px">
            <NForm label-placement="left" label-width="140px" :show-feedback="false">
              <NFormItem :label="$t('page.systemSettings.cloudStorageProvider')">
                <NSelect
                  v-model:value="cloudModel.provider"
                  class="w-240px"
                  :disabled="!canUpdateCloudStorage"
                  :options="cloudProviderOptions"
                />
              </NFormItem>
            </NForm>
            <NAlert type="warning" :show-icon="true">{{ $t('page.systemSettings.cloudStorageMaskTip') }}</NAlert>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-3 gap-16px">
            <NCard
              v-for="provider in (['tencent', 'aliyun', 'qiniu'] as CloudStorageProvider[])"
              :key="provider"
              :bordered="true"
              class="shadow-sm"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <span>{{ cloudProviderNames[provider] }}</span>
                  <NSwitch
                    v-model:value="cloudModel[provider].enabled"
                    :disabled="!canUpdateCloudStorage"
                  >
                    <template #checked>{{ $t('page.systemSettings.cloudStorageEnabled') }}</template>
                    <template #unchecked>{{ $t('page.systemSettings.cloudStorageDisabled') }}</template>
                  </NSwitch>
                </div>
              </template>

              <NForm label-placement="left" label-width="120px" :show-feedback="false">
                <NFormItem
                  v-for="field in cloudFields[provider]"
                  :key="field.key"
                  :label="$t(field.label)"
                >
                  <NInput
                    v-model:value="(cloudModel[provider] as unknown as Record<string, string>)[field.key]"
                    :type="field.type === 'password' ? 'password' : 'text'"
                    :placeholder="field.required ? $t('page.systemSettings.cloudStorageRequired') : ''"
                    :disabled="!canUpdateCloudStorage || !cloudModel[provider].enabled"
                    :show-password-on="field.type === 'password' ? 'click' : undefined"
                    clearable
                    @focus="handleCloudFieldFocus(provider, field.key)"
                  />
                </NFormItem>
              </NForm>
            </NCard>
          </div>

          <template #footer>
            <div class="flex justify-end gap-12px">
              <NButton
                v-if="canUpdateCloudStorage"
                type="primary"
                :loading="cloudLoading"
                @click="handleSaveCloudStorage"
              >
                {{ $t('page.systemSettings.cloudStorageSave') }}
              </NButton>
            </div>
          </template>
        </NCard>

        <NCard v-else :bordered="false" class="shadow-sm">
          <NResult
            status="403"
            :title="$t('page.systemSettings.noPermission')"
            :description="$t('page.systemSettings.noPermissionTip')"
          />
        </NCard>
      </NSpin>
    </div>

    <!-- 支付配置面板 -->
    <div v-else-if="activeTab === 'pay'" class="mt-16px">
      <NSpin :show="payLoading">
        <NCard v-if="canViewPay" :bordered="false" class="shadow-sm mb-16px">
          <template #header>{{ $t('page.systemSettings.payConfig') }}</template>
          <template #header-extra>
            <NTag type="info" size="small">{{ $t('page.systemSettings.payConfigTip') }}</NTag>
          </template>

          <div class="mb-24px">
            <NForm label-placement="left" label-width="140px" :show-feedback="false">
              <NFormItem :label="$t('page.systemSettings.payProvider')">
                <NSelect
                  v-model:value="payModel.provider"
                  class="w-240px"
                  :disabled="!canUpdatePay"
                  :options="payProviderOptions"
                />
              </NFormItem>
            </NForm>
            <NAlert type="warning" :show-icon="true">{{ $t('page.systemSettings.payMaskTip') }}</NAlert>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-2 gap-16px">
            <NCard
              v-for="provider in (['wxpay', 'alipay'] as PayProvider[])"
              :key="provider"
              :bordered="true"
              class="shadow-sm"
            >
              <template #header>
                <div class="flex items-center justify-between">
                  <span>{{ payProviderNames[provider] }}</span>
                  <NSwitch
                    v-model:value="payModel[provider].enabled"
                    :disabled="!canUpdatePay"
                  >
                    <template #checked>
                      {{ provider === 'wxpay' ? $t('page.systemSettings.payWxEnabled') : $t('page.systemSettings.payAlipayEnabled') }}
                    </template>
                    <template #unchecked>
                      {{ provider === 'wxpay' ? $t('page.systemSettings.payWxEnabled') : $t('page.systemSettings.payAlipayEnabled') }}
                    </template>
                  </NSwitch>
                </div>
              </template>

              <NForm label-placement="left" label-width="130px" :show-feedback="false">
                <NFormItem
                  v-for="field in payFields[provider]"
                  :key="field.key"
                  :label="$t(field.label)"
                >
                  <NInput
                    v-model:value="(payModel[provider] as unknown as Record<string, string>)[field.key]"
                    :type="field.type === 'password' ? 'password' : field.type === 'textarea' ? 'textarea' : 'text'"
                    :placeholder="field.required ? $t('page.systemSettings.payRequired') : ''"
                    :disabled="!canUpdatePay || !payModel[provider].enabled"
                    :show-password-on="field.type === 'password' ? 'click' : undefined"
                    clearable
                    @focus="handlePayFieldFocus(provider, field.key)"
                  />
                </NFormItem>
              </NForm>

              <template #footer>
                <div class="flex justify-end">
                  <NButton
                    v-if="canUpdatePay"
                    size="small"
                    :loading="payTesting"
                    @click="handleTestPay(provider)"
                  >
                    {{ $t('page.systemSettings.payTest') }}
                  </NButton>
                </div>
              </template>
            </NCard>
          </div>

          <template #footer>
            <div class="flex justify-end gap-12px">
              <NButton
                v-if="canUpdatePay"
                type="primary"
                :loading="paySaving"
                @click="handleSavePay"
              >
                {{ $t('page.systemSettings.paySave') }}
              </NButton>
            </div>
          </template>
        </NCard>

        <NCard v-else :bordered="false" class="shadow-sm">
          <NResult
            status="403"
            :title="$t('page.systemSettings.noPermission')"
            :description="$t('page.systemSettings.noPermissionTip')"
          />
        </NCard>
      </NSpin>
    </div>

    <!-- 二次验证弹窗 -->
    <NModal
      v-model:show="verifyModalVisible"
      preset="dialog"
      type="warning"
      :title="$t('page.systemSettings.verifyModalTitle')"
      :show-icon="false"
    >
      <NForm class="mt-16px" @submit.prevent="handleVerifySubmit">
        <NFormItem :label="$t('page.systemSettings.operator')">
          <NInput
            v-model:value="verifyPassword"
            type="password"
            show-password-on="click"
            :placeholder="$t('page.systemSettings.verifyPlaceholder')"
            @keyup.enter="handleVerifySubmit"
          />
        </NFormItem>
        <div class="flex justify-end gap-12px">
          <NButton @click="handleVerifyCancel">{{ $t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="verifyLoading" @click="handleVerifySubmit">
            {{ $t('common.confirm') }}
          </NButton>
        </div>
      </NForm>
    </NModal>

    <!-- 日志详情弹窗 -->
    <NModal
      v-model:show="detailModalVisible"
      preset="card"
      :title="$t('page.systemSettings.viewDetail')"
      class="max-w-720px"
    >
      <NSpin :show="detailLoading">
        <NDescriptions v-if="detailRow" :column="1" bordered size="small" label-placement="left">
          <NDescriptionsItem :label="$t('page.systemSettings.logType')">{{ detailRow.logType }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.action')">{{ detailRow.action }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.module')">{{ detailRow.module }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.method')">
            {{ detailRow.method }} {{ detailRow.path }}
          </NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.operator')">{{ detailRow.operator }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.ip')">{{ detailRow.ip }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.status')">{{ detailRow.status }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.createTime')">{{ detailRow.createTime }}</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.costTime')">{{ detailRow.costTime }} ms</NDescriptionsItem>
          <NDescriptionsItem :label="$t('page.systemSettings.detail')">
            <pre class="whitespace-pre-wrap break-all text-12px max-h-300px overflow-auto">{{ detailRow.detail || '-' }}</pre>
          </NDescriptionsItem>
        </NDescriptions>
      </NSpin>
    </NModal>
  </div>
</template>

<style scoped>
/* 优化表单行间距：以 flex gap 替代 NFormItem 默认 18px 行距，整体更紧凑 */
:deep(.n-form) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:deep(.n-form .n-form-item) {
  margin-bottom: 0;
}
</style>
