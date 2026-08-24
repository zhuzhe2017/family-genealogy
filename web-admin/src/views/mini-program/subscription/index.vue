<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import { useMessage, useDialog, NTag, NButton, NSpace, NSwitch, NSelect, NInputNumber, NForm, NFormItem, NInput, NCheckboxGroup, NCheckbox } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchAdminPlanList, fetchCreateAdminPlan, fetchUpdateAdminPlan,
  fetchAdminFamilySubscriptionList, fetchAdminActivateFamily, fetchAdminFreezeFamily,
  fetchAdminOrderList, fetchAdminRefundOrder
} from '@/service/api';
import type {
  AdminPlanItem, AdminFamilySubscriptionItem, AdminOrderItem
} from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

/** 能力点选项（与后端 Capability 枚举一致） */
const CAPABILITY_OPTIONS = [
  { label: '数据备份', value: 'backup' },
  { label: '谱牒数据导出', value: 'export' },
  { label: '高级权限 / 多管理员', value: 'permission' },
  { label: '纪念日、生日提醒', value: 'reminder' },
  { label: '家族简报', value: 'digest' },
  { label: '家族主页 / 封面定制', value: 'theme' },
  { label: '家族徽章 / 荣誉体系', value: 'badge' },
  { label: 'AI 老照片修复', value: 'ai_restore' },
  { label: '祭祀增值服务', value: 'worship_pro' },
  { label: '谱牒印刷折扣', value: 'print' },
  { label: '专业修谱顾问', value: 'advisor' },
  { label: '专属客服', value: 'support' },
  { label: '无广告体验', value: 'no_ads' }
];
const CAPABILITY_LABEL_MAP = Object.fromEntries(CAPABILITY_OPTIONS.map(c => [c.value, c.label]));

const SUB_STATUS_OPTIONS = [
  { label: '有效', value: 'active', type: 'success' },
  { label: '宽限期', value: 'grace', type: 'warning' },
  { label: '已冻结', value: 'frozen', type: 'error' },
  { label: '已过期', value: 'expired', type: 'default' }
] as const;

const ORDER_STATUS_OPTIONS = [
  { label: '待支付', value: 'pending', type: 'warning' },
  { label: '已支付', value: 'paid', type: 'success' },
  { label: '已退款', value: 'refunded', type: 'error' },
  { label: '已关闭', value: 'closed', type: 'default' }
] as const;

const PLAN_STATUS_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 }
];

/** 状态 TAG 渲染 */
function statusTag(status: string, map: readonly { label: string; value: string; type: string }[]) {
  const item = map.find(s => s.value === status);
  return h(NTag, { size: 'small', type: (item?.type as any) || 'default', bordered: false }, { default: () => item?.label || status });
}

/** 字节 → MB/GB 文案 */
function formatStorage(bytes: number | null | undefined) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '不限';
  const gb = n / (1024 * 1024 * 1024);
  if (gb >= 1) return (gb % 1 === 0 ? gb : gb.toFixed(1)) + 'GB';
  const mb = n / (1024 * 1024);
  return (mb % 1 === 0 ? mb : mb.toFixed(1)) + 'MB';
}

/** 空串/空值兜底 */
const orDash = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

// ==================== Tab1: 家族订阅 ====================
const subLoading = ref(false);
const subTableData = ref<AdminFamilySubscriptionItem[]>([]);
const subSearch = reactive({ keyword: '', planCode: '', status: '' });
const subPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const planOptions = ref<{ label: string; value: string }[]>([]);
const activateVisible = ref(false);
const activateFormRef = ref<FormInst | null>(null);
const activateSaving = ref(false);
const activateForm = reactive({ familyId: 0, familyName: '', planCode: '', months: 12, ownerUserId: '' });

const freezeVisible = ref(false);
const freezeSaving = ref(false);
const freezeForm = reactive({ familyId: 0, familyName: '', reason: '' });

async function loadSubscriptions() {
  subLoading.value = true;
  try {
    const { data } = await fetchAdminFamilySubscriptionList({
      page: subPagination.page,
      pageSize: subPagination.pageSize,
      keyword: subSearch.keyword || undefined,
      planCode: subSearch.planCode || undefined,
      status: subSearch.status || undefined
    });
    subTableData.value = data?.list || [];
    subPagination.itemCount = data?.total || 0;
  } catch {
    subTableData.value = [];
    subPagination.itemCount = 0;
  } finally {
    subLoading.value = false;
  }
}

function handleSubSearch() { subPagination.page = 1; loadSubscriptions(); }
function handleSubReset() {
  subSearch.keyword = '';
  subSearch.planCode = '';
  subSearch.status = '';
  subPagination.page = 1;
  loadSubscriptions();
}

function openActivate(row: AdminFamilySubscriptionItem) {
  activateForm.familyId = row.familyId;
  activateForm.familyName = row.familyName;
  activateForm.planCode = row.planCode === 'free' ? 'family' : row.planCode;
  activateForm.months = 12;
  activateForm.ownerUserId = row.ownerUserId || '';
  activateVisible.value = true;
}

async function submitActivate() {
  activateSaving.value = true;
  try {
    await fetchAdminActivateFamily({
      familyId: activateForm.familyId,
      planCode: activateForm.planCode,
      months: activateForm.months,
      ownerUserId: activateForm.ownerUserId || undefined
    });
    message.success('开通成功');
    activateVisible.value = false;
    loadSubscriptions();
    loadPlans();
  } catch (err: any) {
    message.error(err?.message || '操作失败');
  } finally {
    activateSaving.value = false;
  }
}

function openFreeze(row: AdminFamilySubscriptionItem) {
  freezeForm.familyId = row.familyId;
  freezeForm.familyName = row.familyName;
  freezeForm.reason = '';
  freezeVisible.value = true;
}

async function submitFreeze() {
  freezeSaving.value = true;
  try {
    await fetchAdminFreezeFamily({ familyId: freezeForm.familyId, reason: freezeForm.reason || undefined });
    message.success('已冻结');
    freezeVisible.value = false;
    loadSubscriptions();
  } catch (err: any) {
    message.error(err?.message || '操作失败');
  } finally {
    freezeSaving.value = false;
  }
}

const subColumns: DataTableColumn<AdminFamilySubscriptionItem>[] = [
  { title: '家族ID', key: 'familyId', width: 80 },
  { title: '家族名称', key: 'familyName', width: 160, fixed: 'left' },
  { title: '套餐', key: 'planName', width: 100, render: row => h(NTag, { size: 'small', type: row.planCode === 'free' ? 'default' : 'success', bordered: false }, { default: () => row.planName }) },
  { title: '状态', key: 'status', width: 90, render: row => statusTag(row.status, SUB_STATUS_OPTIONS) },
  { title: '到期时间', key: 'expireAt', width: 170, render: row => orDash(row.expireAt && row.expireAt.slice(0, 10)) },
  { title: '存储用量', key: 'storageUsed', width: 110, render: row => formatStorage(row.storageUsed) },
  { title: 'AI修复', key: 'aiRestoreUsed', width: 80, align: 'center', render: row => row.aiRestoreUsed },
  { title: '祭祀', key: 'worshipProUsed', width: 80, align: 'center', render: row => row.worshipProUsed },
  {
    title: '操作', key: 'actions', width: 170, fixed: 'right',
    render: row => h(NSpace, null, {
      default: () => [
        hasAuth('system:subscription:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openActivate(row) }, { default: () => '开通/升级' }),
        row.planCode !== 'free' && hasAuth('system:subscription:update') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => openFreeze(row) }, { default: () => '冻结' })
      ]
    })
  }
];

// ==================== Tab2: 套餐管理 ====================
const planLoading = ref(false);
const planTableData = ref<AdminPlanItem[]>([]);
const planSearch = reactive({ keyword: '', status: null as number | null });
const planPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const planVisible = ref(false);
const planSaving = ref(false);
const planFormRef = ref<FormInst | null>(null);
const planIsEdit = ref(false);
const planForm = reactive({
  code: '',
  name: '',
  priceAnnual: 0,
  storageLimitMb: 10240,
  capabilities: [] as string[],
  aiRestoreQuota: 0,
  worshipProQuota: 0,
  sortOrder: 0,
  status: 1
});

async function loadPlans() {
  planLoading.value = true;
  try {
    const { data } = await fetchAdminPlanList({
      page: planPagination.page,
      pageSize: planPagination.pageSize,
      keyword: planSearch.keyword || undefined,
      status: planSearch.status ?? undefined
    });
    planTableData.value = data?.list || [];
    planPagination.itemCount = data?.total || 0;
    planOptions.value = (data?.list || [])
      .filter(p => p.status === 1 && p.code !== 'free')
      .map(p => ({ label: p.name, value: p.code }));
  } catch {
    planTableData.value = [];
    planPagination.itemCount = 0;
  } finally {
    planLoading.value = false;
  }
}

function handlePlanSearch() { planPagination.page = 1; loadPlans(); }
function handlePlanReset() {
  planSearch.keyword = '';
  planSearch.status = null;
  planPagination.page = 1;
  loadPlans();
}

function openPlanCreate() {
  planIsEdit.value = false;
  Object.assign(planForm, {
    code: '', name: '', priceAnnual: 0, storageLimitMb: 10240,
    capabilities: [], aiRestoreQuota: 0, worshipProQuota: 0, sortOrder: planTableData.value.length + 1, status: 1
  });
  planVisible.value = true;
}

function openPlanEdit(row: AdminPlanItem) {
  planIsEdit.value = true;
  Object.assign(planForm, {
    code: row.code,
    name: row.name,
    priceAnnual: row.priceAnnual,
    storageLimitMb: row.storageLimit <= 0 ? 0 : Math.round(row.storageLimit / (1024 * 1024)),
    capabilities: [...(row.capabilities || [])],
    aiRestoreQuota: row.quotaRules?.ai_restore || 0,
    worshipProQuota: row.quotaRules?.worship_pro || 0,
    sortOrder: row.sortOrder,
    status: row.status
  });
  planVisible.value = true;
}

async function submitPlan() {
  if (!planIsEdit.value && !planForm.code.trim()) {
    message.error('请输入套餐编码');
    return;
  }
  if (!planForm.name.trim()) {
    message.error('请输入套餐名称');
    return;
  }
  planSaving.value = true;
  const payload = {
    name: planForm.name,
    priceAnnual: planForm.priceAnnual,
    storageLimit: planForm.storageLimitMb <= 0 ? 0 : planForm.storageLimitMb * 1024 * 1024,
    capabilities: planForm.capabilities,
    quotaRules: {
      ...(planForm.aiRestoreQuota > 0 ? { ai_restore: planForm.aiRestoreQuota } : {}),
      ...(planForm.worshipProQuota > 0 ? { worship_pro: planForm.worshipProQuota } : {})
    },
    sortOrder: planForm.sortOrder,
    status: planForm.status
  };
  try {
    if (planIsEdit.value) {
      await fetchUpdateAdminPlan(planForm.code, payload);
      message.success('保存成功');
    } else {
      await fetchCreateAdminPlan({ code: planForm.code.trim(), ...payload });
      message.success('创建成功');
    }
    planVisible.value = false;
    loadPlans();
    loadSubscriptions();
  } catch (err: any) {
    message.error(err?.message || '操作失败');
  } finally {
    planSaving.value = false;
  }
}

const planColumns: DataTableColumn<AdminPlanItem>[] = [
  { title: '编码', key: 'code', width: 90 },
  { title: '名称', key: 'name', width: 110 },
  { title: '价格（元/年）', key: 'priceAnnual', width: 110, render: row => row.priceAnnual.toFixed(2) },
  { title: '存储上限', key: 'storageLimit', width: 100, render: row => formatStorage(row.storageLimit) },
  {
    title: '能力点', key: 'capabilities', width: 320,
    render: row => {
      const caps = row.capabilities || [];
      if (caps.length === 0) return '-';
      return h(NSpace, { size: 4, wrap: true }, {
        default: () => caps.map(c => h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => CAPABILITY_LABEL_MAP[c] || c }))
      });
    }
  },
  {
    title: '按次额度', key: 'quotaRules', width: 160,
    render: row => {
      const rules: string[] = [];
      if (row.quotaRules?.ai_restore) rules.push(`AI修复 ${row.quotaRules.ai_restore}张/年`);
      if (row.quotaRules?.worship_pro) rules.push(`祭祀 ${row.quotaRules.worship_pro >= 999 ? '不限' : row.quotaRules.worship_pro + '次'}/年`);
      return rules.length ? rules.join('；') : '-';
    }
  },
  { title: '排序', key: 'sortOrder', width: 70, align: 'center' },
  { title: '状态', key: 'status', width: 75, align: 'center', render: row => h(NTag, { size: 'small', type: row.status === 1 ? 'success' : 'default', bordered: false }, { default: () => row.status === 1 ? '启用' : '停用' }) },
  {
    title: '操作', key: 'actions', width: 90, fixed: 'right',
    render: row => hasAuth('system:subscription:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openPlanEdit(row) }, { default: () => '编辑' })
  }
];

// ==================== Tab3: 订单记录 ====================
const orderLoading = ref(false);
const orderTableData = ref<AdminOrderItem[]>([]);
const orderSearch = reactive({ keyword: '', status: '', familyId: '' });
const orderPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const refundVisible = ref(false);
const refundSaving = ref(false);
const refundForm = reactive({ orderNo: '', familyName: '', amount: 0, reason: '' });

function openRefund(row: AdminOrderItem) {
  refundForm.orderNo = row.orderNo;
  refundForm.familyName = row.familyName || '-';
  refundForm.amount = row.amount;
  refundForm.reason = '';
  refundVisible.value = true;
}

async function submitRefund() {
  refundSaving.value = true;
  try {
    await fetchAdminRefundOrder({ orderNo: refundForm.orderNo, reason: refundForm.reason || undefined });
    message.success('退款成功');
    refundVisible.value = false;
    loadOrders();
    loadSubscriptions();
  } catch (err: any) {
    message.error(err?.message || '退款失败');
  } finally {
    refundSaving.value = false;
  }
}

async function loadOrders() {
  orderLoading.value = true;
  try {
    const { data } = await fetchAdminOrderList({
      page: orderPagination.page,
      pageSize: orderPagination.pageSize,
      keyword: orderSearch.keyword || undefined,
      status: orderSearch.status || undefined,
      familyId: orderSearch.familyId ? Number(orderSearch.familyId) : undefined
    });
    orderTableData.value = data?.list || [];
    orderPagination.itemCount = data?.total || 0;
  } catch {
    orderTableData.value = [];
    orderPagination.itemCount = 0;
  } finally {
    orderLoading.value = false;
  }
}

function handleOrderSearch() { orderPagination.page = 1; loadOrders(); }
function handleOrderReset() {
  orderSearch.keyword = '';
  orderSearch.status = '';
  orderSearch.familyId = '';
  orderPagination.page = 1;
  loadOrders();
}

const orderColumns: DataTableColumn<AdminOrderItem>[] = [
  { title: '订单号', key: 'orderNo', width: 190, fixed: 'left' },
  { title: '家族', key: 'familyName', width: 140, render: row => orDash(row.familyName) },
  { title: '用户', key: 'userNickname', width: 110, render: row => orDash(row.userNickname) },
  { title: '套餐', key: 'planName', width: 100, render: row => orDash(row.planName) },
  { title: '金额（元）', key: 'amount', width: 90, render: row => row.amount.toFixed(2) },
  { title: '时长', key: 'periodMonths', width: 70, align: 'center', render: row => `${row.periodMonths}个月` },
  { title: '状态', key: 'status', width: 90, render: row => statusTag(row.status, ORDER_STATUS_OPTIONS) },
  { title: '创建时间', key: 'createTime', width: 160 },
  { title: '支付时间', key: 'payTime', width: 160, render: row => orDash(row.payTime) },
  { title: '退款时间', key: 'refundTime', width: 160, render: row => orDash(row.refundTime) },
  {
    title: '操作', key: 'actions', width: 90, fixed: 'right',
    render: row => row.status === 'paid' && hasAuth('system:subscription:refund')
      && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => openRefund(row) }, { default: () => '退款' })
  }
];

// ==================== 初始化 ====================
onMounted(() => {
  loadSubscriptions();
  loadPlans();
  loadOrders();
});
</script>

<template>
  <div class="min-h-500px">
    <n-tabs type="line" animated>
      <!-- 家族订阅 -->
      <n-tab-pane name="families" tab="家族订阅">
        <n-space class="mb-16px" wrap align="center">
          <n-input v-model:value="subSearch.keyword" placeholder="家族名称" clearable style="width: 200px" @keyup.enter="handleSubSearch" />
          <n-select v-model:value="subSearch.planCode" :options="planOptions" placeholder="套餐" clearable style="width: 140px" />
          <n-select v-model:value="subSearch.status" :options="SUB_STATUS_OPTIONS.map(s => ({ label: s.label, value: s.value }))" placeholder="状态" clearable style="width: 120px" />
          <n-button type="primary" @click="handleSubSearch">查询</n-button>
          <n-button @click="handleSubReset">重置</n-button>
        </n-space>
        <n-data-table
          :columns="subColumns"
          :data="subTableData"
          :loading="subLoading"
          :pagination="subPagination"
          :row-key="(row: AdminFamilySubscriptionItem) => row.familyId"
          @update:page="(p: number) => { subPagination.page = p; loadSubscriptions(); }"
          @update:page-size="(s: number) => { subPagination.pageSize = s; subPagination.page = 1; loadSubscriptions(); }"
        />
      </n-tab-pane>

      <!-- 套餐管理 -->
      <n-tab-pane name="plans" tab="套餐管理">
        <n-space class="mb-16px" wrap align="center">
          <n-input v-model:value="planSearch.keyword" placeholder="套餐名称/编码" clearable style="width: 200px" @keyup.enter="handlePlanSearch" />
          <n-select v-model:value="planSearch.status" :options="PLAN_STATUS_OPTIONS" placeholder="状态" clearable style="width: 120px" />
          <n-button type="primary" @click="handlePlanSearch">查询</n-button>
          <n-button @click="handlePlanReset">重置</n-button>
          <n-button v-if="hasAuth('system:subscription:create')" type="primary" @click="openPlanCreate">新增套餐</n-button>
        </n-space>
        <n-data-table
          :columns="planColumns"
          :data="planTableData"
          :loading="planLoading"
          :pagination="planPagination"
          :row-key="(row: AdminPlanItem) => row.code"
          @update:page="(p: number) => { planPagination.page = p; loadPlans(); }"
          @update:page-size="(s: number) => { planPagination.pageSize = s; planPagination.page = 1; loadPlans(); }"
        />
      </n-tab-pane>

      <!-- 订单记录 -->
      <n-tab-pane name="orders" tab="订单记录">
        <n-space class="mb-16px" wrap align="center">
          <n-input v-model:value="orderSearch.keyword" placeholder="订单号/家族/用户" clearable style="width: 200px" @keyup.enter="handleOrderSearch" />
          <n-input v-model:value="orderSearch.familyId" placeholder="家族ID" clearable style="width: 110px" @keyup.enter="handleOrderSearch" />
          <n-select v-model:value="orderSearch.status" :options="ORDER_STATUS_OPTIONS.map(s => ({ label: s.label, value: s.value }))" placeholder="状态" clearable style="width: 120px" />
          <n-button type="primary" @click="handleOrderSearch">查询</n-button>
          <n-button @click="handleOrderReset">重置</n-button>
        </n-space>
        <n-data-table
          :columns="orderColumns"
          :data="orderTableData"
          :loading="orderLoading"
          :pagination="orderPagination"
          :row-key="(row: AdminOrderItem) => row.id"
          @update:page="(p: number) => { orderPagination.page = p; loadOrders(); }"
          @update:page-size="(s: number) => { orderPagination.pageSize = s; orderPagination.page = 1; loadOrders(); }"
        />
      </n-tab-pane>
    </n-tabs>

    <!-- 开通/升级订阅 -->
    <n-modal v-model:show="activateVisible" preset="card" title="开通 / 升级订阅" style="width: 460px">
      <n-form ref="activateFormRef" :model="activateForm" label-placement="left" label-width="90px">
        <n-form-item label="家族">
          <span>{{ activateForm.familyName }}（ID: {{ activateForm.familyId }}）</span>
        </n-form-item>
        <n-form-item label="套餐" required>
          <n-select v-model:value="activateForm.planCode" :options="planOptions" />
        </n-form-item>
        <n-form-item label="时长">
          <n-select v-model:value="activateForm.months" :options="[12, 24, 36].map(m => ({ label: `${m}个月`, value: m }))" />
        </n-form-item>
        <n-form-item label="支付人ID">
          <n-input v-model:value="activateForm.ownerUserId" placeholder="可选，默认留空（后台开通）" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="activateVisible = false">取消</n-button>
          <n-button type="primary" :loading="activateSaving" @click="submitActivate">确认开通</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 冻结订阅 -->
    <n-modal v-model:show="freezeVisible" preset="card" title="冻结订阅" style="width: 460px">
      <p class="mb-16px">冻结后「{{ freezeForm.familyName }}」当前周期内权益保留，周期结束后数据只读。</p>
      <n-input v-model:value="freezeForm.reason" type="textarea" placeholder="冻结原因（可选）" :rows="3" />
      <template #footer>
        <n-space justify="end">
          <n-button @click="freezeVisible = false">取消</n-button>
          <n-button type="error" :loading="freezeSaving" @click="submitFreeze">确认冻结</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 订单退款 -->
    <n-modal v-model:show="refundVisible" preset="card" title="订单退款" style="width: 460px">
      <p class="mb-16px">
        将为「{{ refundForm.familyName }}」的订单 <b>{{ refundForm.orderNo }}</b> 退款
        <b>¥{{ refundForm.amount.toFixed(2) }}</b>，退款后该家族订阅将取消（权益降级冻结）。
      </p>
      <n-input v-model:value="refundForm.reason" type="textarea" placeholder="退款原因（可选）" :rows="3" />
      <template #footer>
        <n-space justify="end">
          <n-button @click="refundVisible = false">取消</n-button>
          <n-button type="error" :loading="refundSaving" @click="submitRefund">确认退款</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 新增/编辑套餐 -->
    <n-modal v-model:show="planVisible" preset="card" :title="planIsEdit ? '编辑套餐' : '新增套餐'" style="width: 620px">
      <n-form ref="planFormRef" :model="planForm" label-placement="left" label-width="110px">
        <n-form-item label="套餐编码" required>
          <n-input v-model:value="planForm.code" :disabled="planIsEdit" placeholder="如 family / premium" />
        </n-form-item>
        <n-form-item label="套餐名称" required>
          <n-input v-model:value="planForm.name" placeholder="如 家族版" />
        </n-form-item>
        <n-form-item label="价格（元/年）">
          <n-input-number v-model:value="planForm.priceAnnual" :min="0" :step="1" style="width: 180px" />
        </n-form-item>
        <n-form-item label="存储上限（MB）">
          <n-input-number v-model:value="planForm.storageLimitMb" :min="0" :step="1024" style="width: 180px" />
          <span class="ml-8px text-#999">0 表示不限</span>
        </n-form-item>
        <n-form-item label="AI修复额度">
          <n-input-number v-model:value="planForm.aiRestoreQuota" :min="0" style="width: 180px" />
          <span class="ml-8px text-#999">张/年，0 表示不含</span>
        </n-form-item>
        <n-form-item label="祭祀额度">
          <n-input-number v-model:value="planForm.worshipProQuota" :min="0" style="width: 180px" />
          <span class="ml-8px text-#999">次/年，0 表示不含，999 表示不限</span>
        </n-form-item>
        <n-form-item label="能力点">
          <n-checkbox-group v-model:value="planForm.capabilities">
            <n-space wrap>
              <n-checkbox v-for="opt in CAPABILITY_OPTIONS" :key="opt.value" :value="opt.value" :label="opt.label" />
            </n-space>
          </n-checkbox-group>
        </n-form-item>
        <n-form-item label="排序">
          <n-input-number v-model:value="planForm.sortOrder" :min="0" style="width: 120px" />
        </n-form-item>
        <n-form-item label="状态">
          <n-switch v-model:value="planForm.status" :checked-value="1" :unchecked-value="0">
            <template #checked>启用</template>
            <template #unchecked>停用</template>
          </n-switch>
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="planVisible = false">取消</n-button>
          <n-button type="primary" :loading="planSaving" @click="submitPlan">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.mb-16px { margin-bottom: 16px; }
.mb-16px > * { margin-right: 8px; }
</style>
