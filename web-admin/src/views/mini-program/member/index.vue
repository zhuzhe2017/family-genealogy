<script setup lang="ts">
import { h, ref, reactive, computed, onMounted } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import {
  useMessage,
  useDialog,
  NTag,
  NButton,
  NSpace,
  NSelect,
  NInputNumber,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NDataTable,
  NCard,
  NStatistic,
  NDatePicker,
  NGrid,
  NGi,
  NEmpty
} from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import { useEcharts, type ECOption } from '@/hooks/common/echarts';
import {
  fetchAdminMemberList,
  fetchAdminMemberDetail,
  fetchAdminMemberCreate,
  fetchAdminMemberUpdate,
  fetchAdminMemberDelete,
  fetchLevelList,
  fetchCreateLevel,
  fetchUpdateLevel,
  fetchDeleteLevel,
  fetchPointsRuleList,
  fetchCreatePointsRule,
  fetchUpdatePointsRule,
  fetchDeletePointsRule,
  fetchPointsRecordList,
  fetchAdjustPoints,
  fetchConsumeList,
  fetchCreateConsume,
  fetchDeleteConsume,
  fetchMemberStatsOverview,
  fetchConsumeTrend,
  fetchMemberExport,
  fetchConsumeExport
} from '@/service/api';
import type {
  MemberItem,
  MemberDetail,
  LevelItem,
  PointsRuleItem,
  PointsRecordItem,
  ConsumeItem,
  MemberStatsOverview,
  ConsumeTrendItem
} from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

/** 性别选项 */
const GENDER_OPTIONS = [
  { label: '保密', value: 0 },
  { label: '男', value: 1 },
  { label: '女', value: 2 }
];
const GENDER_LABEL_MAP = Object.fromEntries(GENDER_OPTIONS.map(g => [g.value, g.label]));

/** 状态选项（通用 启用/停用） */
const ENABLE_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 }
];

/** 消费类型选项（与后端枚举一致） */
const CONSUME_TYPE_OPTIONS = [
  { label: '商品消费', value: 'goods' },
  { label: '服务消费', value: 'service' },
  { label: '充值', value: 'recharge' },
  { label: '会员购买', value: 'membership' },
  { label: '其他', value: 'other' }
];
const CONSUME_TYPE_LABEL_MAP = Object.fromEntries(CONSUME_TYPE_OPTIONS.map(c => [c.value, c.label]));

/** 积分业务类型选项 */
const POINTS_BIZ_OPTIONS = [
  { label: '消费积分', value: 'consume' },
  { label: '注册赠送', value: 'register' },
  { label: '签到积分', value: 'signin' },
  { label: '人工调整', value: 'adjust' },
  { label: '退款回冲', value: 'refund' }
];
const POINTS_BIZ_LABEL_MAP = Object.fromEntries(POINTS_BIZ_OPTIONS.map(p => [p.value, p.label]));

/** 等级 TAG 颜色 */
const LEVEL_COLORS = ['default', 'info', 'success', 'warning', 'error', 'primary'] as const;

/** 空串/空值兜底 */
const orDash = (v: unknown) => (v === null || v === undefined || v === '' ? '-' : String(v));

/** 状态 TAG 渲染 */
function statusTag(status: number) {
  return h(
    NTag,
    { size: 'small', type: status === 1 ? 'success' : 'default', bordered: false },
    { default: () => (status === 1 ? '启用' : '停用') }
  );
}

/** 性别 TAG 渲染 */
function genderTag(gender: number) {
  return h(NTag, { size: 'small', bordered: false }, { default: () => GENDER_LABEL_MAP[gender] || '保密' });
}

/** 等级 TAG 渲染 */
function levelTag(name: string, index: number) {
  return h(
    NTag,
    { size: 'small', type: LEVEL_COLORS[index % LEVEL_COLORS.length] as any, bordered: false },
    { default: () => name }
  );
}

/** 金额格式化 */
function fmtMoney(v: number | string | null | undefined) {
  const n = Number(v) || 0;
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 下载 Blob 文件 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== Tab1: 会员列表 ====================
const memberLoading = ref(false);
const memberTableData = ref<MemberItem[]>([]);
const memberSearch = reactive({ keyword: '', levelId: null as number | null, status: null as number | null });
const memberPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const levelOptions = ref<{ label: string; value: number }[]>([]);
const levelNameMap = ref<Record<number, string>>({});

async function loadLevels() {
  const { data, error } = await fetchLevelList();
  if (error) return;
  levelOptions.value = (data?.list || []).map(l => ({ label: l.name, value: l.id }));
  levelNameMap.value = Object.fromEntries((data?.list || []).map(l => [l.id, l.name]));
}

async function loadMembers() {
  memberLoading.value = true;
  try {
    const { data, error } = await fetchAdminMemberList({
      page: memberPagination.page,
      pageSize: memberPagination.pageSize,
      keyword: memberSearch.keyword || undefined,
      levelId: memberSearch.levelId ?? undefined,
      status: memberSearch.status ?? undefined
    });
    if (error) {
      message.error(error.message);
      memberTableData.value = [];
      memberPagination.itemCount = 0;
      return;
    }
    memberTableData.value = data?.list || [];
    memberPagination.itemCount = data?.total || 0;
  } catch {
    memberTableData.value = [];
    memberPagination.itemCount = 0;
  } finally {
    memberLoading.value = false;
  }
}

function handleMemberSearch() {
  memberPagination.page = 1;
  loadMembers();
}

function handleMemberReset() {
  memberSearch.keyword = '';
  memberSearch.levelId = null;
  memberSearch.status = null;
  memberPagination.page = 1;
  loadMembers();
}

/** 导出会员 Excel */
async function handleMemberExport() {
  try {
    const blob = await fetchMemberExport({
      keyword: memberSearch.keyword || undefined,
      levelId: memberSearch.levelId ?? undefined,
      status: memberSearch.status ?? undefined
    });
    downloadBlob(blob as Blob, `会员信息_${new Date().toISOString().slice(0, 10)}.xlsx`);
    message.success('会员信息导出成功');
  } catch (err: any) {
    message.error(err?.msg || err?.message || '导出失败');
  }
}

// 会员表单
const memberModalVisible = ref(false);
const memberSaving = ref(false);
const memberFormRef = ref<FormInst | null>(null);
const memberForm = reactive({
  id: 0,
  name: '',
  phone: '',
  gender: 1,
  birthday: null as string | null,
  levelId: null as number | null,
  points: 0,
  status: 1,
  remark: ''
});

function openMemberCreate() {
  Object.assign(memberForm, {
    id: 0,
    name: '',
    phone: '',
    gender: 1,
    birthday: null,
    levelId: null,
    points: 0,
    status: 1,
    remark: ''
  });
  memberModalVisible.value = true;
}

function openMemberEdit(row: MemberItem) {
  Object.assign(memberForm, {
    id: row.id,
    name: row.name,
    phone: row.phone,
    gender: row.gender,
    birthday: row.birthday,
    levelId: row.levelId,
    points: row.points,
    status: row.status,
    remark: row.remark
  });
  memberModalVisible.value = true;
}

async function submitMember() {
  try {
    await memberFormRef.value?.validate();
  } catch {
    return;
  }
  memberSaving.value = true;
  try {
    const base = {
      name: memberForm.name,
      phone: memberForm.phone || null,
      gender: memberForm.gender,
      birthday: memberForm.birthday,
      levelId: memberForm.levelId ?? undefined,
      status: memberForm.status,
      remark: memberForm.remark || undefined
    };
    if (memberForm.id === 0) {
      const { data, error } = await fetchAdminMemberCreate({ ...base, points: memberForm.points });
      if (error) {
        message.error(error.message);
        return;
      }
      message.success(`会员创建成功，编号：${data?.memberNo}`);
    } else {
      const { error } = await fetchAdminMemberUpdate(memberForm.id, base);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('会员更新成功');
    }
    memberModalVisible.value = false;
    loadMembers();
    loadStats();
  } catch (err: any) {
    message.error(err?.msg || err?.message || '保存失败');
  } finally {
    memberSaving.value = false;
  }
}

function handleDeleteMember(row: MemberItem) {
  dialog.warning({
    title: '删除会员',
    content: `确定删除会员「${row.name}（${row.memberNo}）」吗？删除后其积分与消费记录将一并移除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await fetchAdminMemberDelete(row.id);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('删除成功');
      loadMembers();
      loadStats();
    }
  });
}

// 调分弹窗
const adjustVisible = ref(false);
const adjustSaving = ref(false);
const adjustFormRef = ref<FormInst | null>(null);
const adjustForm = reactive({ memberId: 0, memberName: '', changePoints: 0, remark: '' });

function openAdjust(row: MemberItem) {
  Object.assign(adjustForm, { memberId: row.id, memberName: `${row.name}（${row.memberNo}）`, changePoints: 0, remark: '' });
  adjustVisible.value = true;
}

async function submitAdjust() {
  try {
    await adjustFormRef.value?.validate();
  } catch {
    return;
  }
  adjustSaving.value = true;
  try {
    const { data, error } = await fetchAdjustPoints({
      memberId: adjustForm.memberId,
      changePoints: adjustForm.changePoints,
      remark: adjustForm.remark || undefined
    });
    if (error) {
      message.error(error.message);
      return;
    }
    message.success(`调整成功，当前积分：${data?.balancePoints}`);
    adjustVisible.value = false;
    loadMembers();
    loadPointsRecords();
  } catch (err: any) {
    message.error(err?.msg || err?.message || '调整失败');
  } finally {
    adjustSaving.value = false;
  }
}

const memberColumns: DataTableColumn<MemberItem>[] = [
  { title: '会员编号', key: 'memberNo', width: 150, ellipsis: { tooltip: true } },
  { title: '姓名', key: 'name', width: 110, ellipsis: { tooltip: true } },
  { title: '手机号', key: 'phone', width: 120, render: row => orDash(row.phone) },
  { title: '性别', key: 'gender', width: 70, render: row => genderTag(row.gender) },
  {
    title: '等级',
    key: 'levelName',
    width: 90,
    render: row => (row.levelId ? levelTag(row.levelName, row.levelId) : '-')
  },
  { title: '当前积分', key: 'points', width: 90, align: 'right', render: row => orDash(row.points) },
  { title: '累计消费(元)', key: 'totalConsume', width: 120, align: 'right', render: row => fmtMoney(row.totalConsume) },
  { title: '消费次数', key: 'consumeCount', width: 85, align: 'right', render: row => orDash(row.consumeCount) },
  { title: '状态', key: 'status', width: 75, render: row => statusTag(row.status) },
  { title: '注册时间', key: 'createTime', width: 160, ellipsis: { tooltip: true } },
  {
    title: '操作',
    key: 'actions',
    width: 190,
    fixed: 'right',
    render: row => [
      hasAuth('system:member:update') &&
        h(
          NButton,
          { size: 'small', type: 'primary', ghost: true, style: 'margin-right: 8px', onClick: () => openMemberEdit(row) },
          { default: () => '编辑' }
        ),
      hasAuth('system:member:update') &&
        h(
          NButton,
          { size: 'small', ghost: true, style: 'margin-right: 8px', onClick: () => openAdjust(row) },
          { default: () => '调分' }
        ),
      hasAuth('system:member:delete') &&
        h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDeleteMember(row) }, { default: () => '删除' })
    ]
  }
];

// ==================== Tab2: 等级管理 ====================
const levelLoading = ref(false);
const levelTableData = ref<LevelItem[]>([]);

async function loadLevelData() {
  levelLoading.value = true;
  try {
    const { data, error } = await fetchLevelList();
    if (error) {
      message.error(error.message);
      levelTableData.value = [];
      return;
    }
    levelTableData.value = data?.list || [];
  } finally {
    levelLoading.value = false;
  }
}

const levelModalVisible = ref(false);
const levelSaving = ref(false);
const levelFormRef = ref<FormInst | null>(null);
const levelForm = reactive({
  id: 0,
  name: '',
  code: '',
  pointsMin: 0,
  pointsMax: 0,
  discountRate: 1,
  sortOrder: 0,
  status: 1,
  remark: ''
});

function openLevelCreate() {
  Object.assign(levelForm, {
    id: 0,
    name: '',
    code: '',
    pointsMin: 0,
    pointsMax: 0,
    discountRate: 1,
    sortOrder: 0,
    status: 1,
    remark: ''
  });
  levelModalVisible.value = true;
}

function openLevelEdit(row: LevelItem) {
  Object.assign(levelForm, {
    id: row.id,
    name: row.name,
    code: row.code,
    pointsMin: row.pointsMin,
    pointsMax: row.pointsMax,
    discountRate: row.discountRate,
    sortOrder: row.sortOrder,
    status: row.status,
    remark: row.remark
  });
  levelModalVisible.value = true;
}

async function submitLevel() {
  try {
    await levelFormRef.value?.validate();
  } catch {
    return;
  }
  levelSaving.value = true;
  try {
    const payload = {
      name: levelForm.name,
      code: levelForm.code,
      pointsMin: levelForm.pointsMin,
      pointsMax: levelForm.pointsMax,
      discountRate: levelForm.discountRate,
      sortOrder: levelForm.sortOrder,
      status: levelForm.status,
      remark: levelForm.remark || undefined
    };
    if (levelForm.id === 0) {
      const { error } = await fetchCreateLevel(payload);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('等级创建成功');
    } else {
      const { error } = await fetchUpdateLevel(levelForm.id, payload);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('等级更新成功');
    }
    levelModalVisible.value = false;
    loadLevelData();
    loadLevels();
  } catch (err: any) {
    message.error(err?.msg || err?.message || '保存失败');
  } finally {
    levelSaving.value = false;
  }
}

function handleDeleteLevel(row: LevelItem) {
  dialog.warning({
    title: '删除等级',
    content: `确定删除等级「${row.name}」吗？存在会员引用该等级时不允许删除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await fetchDeleteLevel(row.id);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('删除成功');
      loadLevelData();
      loadLevels();
    }
  });
}

const levelColumns: DataTableColumn<LevelItem>[] = [
  { title: '等级名称', key: 'name', width: 120 },
  { title: '等级编码', key: 'code', width: 110 },
  {
    title: '积分区间',
    key: 'range',
    width: 170,
    render: row => `${row.pointsMin} ~ ${row.pointsMax === 0 ? '不限' : row.pointsMax}`
  },
  {
    title: '折扣率',
    key: 'discountRate',
    width: 100,
    render: row => `${Number(row.discountRate) * 10} 折`
  },
  { title: '排序', key: 'sortOrder', width: 70, align: 'right' },
  { title: '状态', key: 'status', width: 75, render: row => statusTag(row.status) },
  { title: '备注', key: 'remark', ellipsis: { tooltip: true }, render: row => orDash(row.remark) },
  { title: '创建时间', key: 'createTime', width: 160, ellipsis: { tooltip: true } },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    fixed: 'right',
    render: row => [
      hasAuth('system:member:update') &&
        h(
          NButton,
          { size: 'small', type: 'primary', ghost: true, style: 'margin-right: 8px', onClick: () => openLevelEdit(row) },
          { default: () => '编辑' }
        ),
      hasAuth('system:member:delete') &&
        h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDeleteLevel(row) }, { default: () => '删除' })
    ]
  }
];

// ==================== Tab3: 积分规则 ====================
const ruleLoading = ref(false);
const ruleTableData = ref<PointsRuleItem[]>([]);

async function loadRuleData() {
  ruleLoading.value = true;
  try {
    const { data, error } = await fetchPointsRuleList();
    if (error) {
      message.error(error.message);
      ruleTableData.value = [];
      return;
    }
    ruleTableData.value = data?.list || [];
  } finally {
    ruleLoading.value = false;
  }
}

const ruleModalVisible = ref(false);
const ruleSaving = ref(false);
const ruleFormRef = ref<FormInst | null>(null);
const ruleForm = reactive({
  id: 0,
  name: '',
  code: '',
  points: 0,
  pointsPerAmount: 0,
  enabled: 1,
  sortOrder: 0,
  remark: ''
});

function openRuleCreate() {
  Object.assign(ruleForm, {
    id: 0,
    name: '',
    code: '',
    points: 0,
    pointsPerAmount: 0,
    enabled: 1,
    sortOrder: 0,
    remark: ''
  });
  ruleModalVisible.value = true;
}

function openRuleEdit(row: PointsRuleItem) {
  Object.assign(ruleForm, {
    id: row.id,
    name: row.name,
    code: row.code,
    points: row.points,
    pointsPerAmount: row.pointsPerAmount,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    remark: row.remark
  });
  ruleModalVisible.value = true;
}

async function submitRule() {
  try {
    await ruleFormRef.value?.validate();
  } catch {
    return;
  }
  ruleSaving.value = true;
  try {
    const payload = {
      name: ruleForm.name,
      code: ruleForm.code,
      points: ruleForm.points,
      pointsPerAmount: ruleForm.pointsPerAmount,
      enabled: ruleForm.enabled,
      sortOrder: ruleForm.sortOrder,
      remark: ruleForm.remark || undefined
    };
    if (ruleForm.id === 0) {
      const { error } = await fetchCreatePointsRule(payload);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('规则创建成功');
    } else {
      const { error } = await fetchUpdatePointsRule(ruleForm.id, payload);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('规则更新成功');
    }
    ruleModalVisible.value = false;
    loadRuleData();
  } catch (err: any) {
    message.error(err?.msg || err?.message || '保存失败');
  } finally {
    ruleSaving.value = false;
  }
}

function handleDeleteRule(row: PointsRuleItem) {
  dialog.warning({
    title: '删除积分规则',
    content: `确定删除规则「${row.name}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await fetchDeletePointsRule(row.id);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('删除成功');
      loadRuleData();
    }
  });
}

const ruleColumns: DataTableColumn<PointsRuleItem>[] = [
  { title: '规则名称', key: 'name', width: 150 },
  { title: '规则编码', key: 'code', width: 120 },
  {
    title: '固定积分',
    key: 'points',
    width: 100,
    align: 'right',
    render: row => (row.points > 0 ? `${row.points} 分` : '-')
  },
  {
    title: '每元积分',
    key: 'pointsPerAmount',
    width: 100,
    align: 'right',
    render: row => (row.pointsPerAmount > 0 ? `${row.pointsPerAmount} 分/元` : '-')
  },
  { title: '启用', key: 'enabled', width: 75, render: row => statusTag(row.enabled) },
  { title: '排序', key: 'sortOrder', width: 70, align: 'right' },
  { title: '备注', key: 'remark', ellipsis: { tooltip: true }, render: row => orDash(row.remark) },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    fixed: 'right',
    render: row => [
      hasAuth('system:member:update') &&
        h(
          NButton,
          { size: 'small', type: 'primary', ghost: true, style: 'margin-right: 8px', onClick: () => openRuleEdit(row) },
          { default: () => '编辑' }
        ),
      hasAuth('system:member:delete') &&
        h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDeleteRule(row) }, { default: () => '删除' })
    ]
  }
];

// ==================== Tab4: 积分记录 ====================
const pointsLoading = ref(false);
const pointsTableData = ref<PointsRecordItem[]>([]);
const pointsSearch = reactive({ memberId: '', bizType: '', keyword: '' });
const pointsPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

async function loadPointsRecords() {
  pointsLoading.value = true;
  try {
    const { data, error } = await fetchPointsRecordList({
      page: pointsPagination.page,
      pageSize: pointsPagination.pageSize,
      memberId: pointsSearch.memberId ? Number(pointsSearch.memberId) : undefined,
      bizType: pointsSearch.bizType || undefined,
      keyword: pointsSearch.keyword || undefined
    });
    if (error) {
      message.error(error.message);
      pointsTableData.value = [];
      pointsPagination.itemCount = 0;
      return;
    }
    pointsTableData.value = data?.list || [];
    pointsPagination.itemCount = data?.total || 0;
  } finally {
    pointsLoading.value = false;
  }
}

function handlePointsSearch() {
  pointsPagination.page = 1;
  loadPointsRecords();
}

function handlePointsReset() {
  pointsSearch.memberId = '';
  pointsSearch.bizType = '';
  pointsSearch.keyword = '';
  pointsPagination.page = 1;
  loadPointsRecords();
}

const pointsColumns: DataTableColumn<PointsRecordItem>[] = [
  { title: '会员', key: 'memberName', width: 130, ellipsis: { tooltip: true }, render: row => `${row.memberName}（${row.memberNo}）` },
  {
    title: '变动积分',
    key: 'changePoints',
    width: 100,
    align: 'right',
    render: row =>
      h(
        NTag,
        { size: 'small', type: (row.changePoints >= 0 ? 'success' : 'error') as any, bordered: false },
        { default: () => (row.changePoints >= 0 ? `+${row.changePoints}` : String(row.changePoints)) }
      )
  },
  { title: '变动后积分', key: 'balancePoints', width: 100, align: 'right' },
  {
    title: '业务类型',
    key: 'bizType',
    width: 100,
    render: row => POINTS_BIZ_LABEL_MAP[row.bizType] || row.bizType
  },
  { title: '来源单号', key: 'sourceId', width: 140, ellipsis: { tooltip: true }, render: row => orDash(row.sourceId) },
  { title: '操作人', key: 'operator', width: 110, ellipsis: { tooltip: true }, render: row => orDash(row.operator) },
  { title: '备注', key: 'remark', ellipsis: { tooltip: true }, render: row => orDash(row.remark) },
  { title: '时间', key: 'createTime', width: 160, ellipsis: { tooltip: true } }
];

// ==================== Tab5: 消费记录 ====================
const consumeLoading = ref(false);
const consumeTableData = ref<ConsumeItem[]>([]);
const consumeSearch = reactive({
  memberId: '',
  consumeType: '',
  status: null as number | null,
  keyword: '',
  startTime: null as string | null,
  endTime: null as string | null
});
const consumePagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

async function loadConsume() {
  consumeLoading.value = true;
  try {
    const { data, error } = await fetchConsumeList({
      page: consumePagination.page,
      pageSize: consumePagination.pageSize,
      memberId: consumeSearch.memberId ? Number(consumeSearch.memberId) : undefined,
      consumeType: consumeSearch.consumeType || undefined,
      status: consumeSearch.status ?? undefined,
      keyword: consumeSearch.keyword || undefined,
      startTime: consumeSearch.startTime || undefined,
      endTime: consumeSearch.endTime || undefined
    });
    if (error) {
      message.error(error.message);
      consumeTableData.value = [];
      consumePagination.itemCount = 0;
      return;
    }
    consumeTableData.value = data?.list || [];
    consumePagination.itemCount = data?.total || 0;
  } finally {
    consumeLoading.value = false;
  }
}

function handleConsumeSearch() {
  consumePagination.page = 1;
  loadConsume();
}

function handleConsumeReset() {
  Object.assign(consumeSearch, {
    memberId: '',
    consumeType: '',
    status: null,
    keyword: '',
    startTime: null,
    endTime: null
  });
  consumePagination.page = 1;
  loadConsume();
}

/** 导出消费记录 Excel */
async function handleConsumeExport() {
  try {
    const blob = await fetchConsumeExport({
      memberId: consumeSearch.memberId ? Number(consumeSearch.memberId) : undefined,
      consumeType: consumeSearch.consumeType || undefined,
      status: consumeSearch.status ?? undefined,
      keyword: consumeSearch.keyword || undefined,
      startTime: consumeSearch.startTime || undefined,
      endTime: consumeSearch.endTime || undefined
    });
    downloadBlob(blob as Blob, `消费记录_${new Date().toISOString().slice(0, 10)}.xlsx`);
    message.success('消费记录导出成功');
  } catch (err: any) {
    message.error(err?.msg || err?.message || '导出失败');
  }
}

// 消费新增弹窗
const consumeModalVisible = ref(false);
const consumeSaving = ref(false);
const consumeFormRef = ref<FormInst | null>(null);
const consumeForm = reactive({
  orderNo: '',
  memberId: null as number | null,
  consumeType: 'goods',
  amount: 0,
  payTime: null as string | null,
  remark: ''
});

// 会员下拉（远程搜索）
const memberSearchLoading = ref(false);
const memberOptions = ref<{ label: string; value: number }[]>([]);

async function searchMemberOptions(keyword: string) {
  memberSearchLoading.value = true;
  try {
    const { data } = await fetchAdminMemberList({ page: 1, pageSize: 20, keyword: keyword || undefined });
    memberOptions.value = (data?.list || []).map(m => ({ label: `${m.name}（${m.memberNo}）`, value: m.id }));
  } finally {
    memberSearchLoading.value = false;
  }
}

function openConsumeCreate() {
  Object.assign(consumeForm, {
    orderNo: '',
    memberId: null,
    consumeType: 'goods',
    amount: 0,
    payTime: null,
    remark: ''
  });
  searchMemberOptions('');
  consumeModalVisible.value = true;
}

async function submitConsume() {
  try {
    await consumeFormRef.value?.validate();
  } catch {
    return;
  }
  consumeSaving.value = true;
  try {
    const { data, error } = await fetchCreateConsume({
      orderNo: consumeForm.orderNo || undefined,
      memberId: consumeForm.memberId as number,
      consumeType: consumeForm.consumeType,
      amount: consumeForm.amount,
      payTime: consumeForm.payTime || undefined,
      remark: consumeForm.remark || undefined
    });
    if (error) {
      message.error(error.message);
      return;
    }
    message.success(`消费记录已创建，获得积分：${data?.pointsGained ?? 0}`);
    consumeModalVisible.value = false;
    loadConsume();
    loadMembers();
    loadStats();
  } catch (err: any) {
    message.error(err?.msg || err?.message || '保存失败');
  } finally {
    consumeSaving.value = false;
  }
}

function handleDeleteConsume(row: ConsumeItem) {
  dialog.warning({
    title: '作废消费记录',
    content: `确定作废订单「${row.orderNo}」吗？作废后将回冲对应金额与积分。`,
    positiveText: '作废',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await fetchDeleteConsume(row.id);
      if (error) {
        message.error(error.message);
        return;
      }
      message.success('作废成功');
      loadConsume();
      loadMembers();
      loadStats();
    }
  });
}

const consumeColumns: DataTableColumn<ConsumeItem>[] = [
  { title: '订单号', key: 'orderNo', width: 150, ellipsis: { tooltip: true } },
  { title: '会员', key: 'memberName', width: 130, ellipsis: { tooltip: true }, render: row => `${row.memberName}（${row.memberNo}）` },
  {
    title: '类型',
    key: 'consumeType',
    width: 100,
    render: row => h(NTag, { size: 'small', bordered: false }, { default: () => CONSUME_TYPE_LABEL_MAP[row.consumeType] || row.consumeType })
  },
  { title: '金额(元)', key: 'amount', width: 110, align: 'right', render: row => fmtMoney(row.amount) },
  { title: '获得积分', key: 'pointsGained', width: 90, align: 'right' },
  { title: '支付时间', key: 'payTime', width: 160, ellipsis: { tooltip: true } },
  { title: '状态', key: 'status', width: 75, render: row => statusTag(row.status) },
  { title: '操作人', key: 'operator', width: 110, ellipsis: { tooltip: true }, render: row => orDash(row.operator) },
  { title: '备注', key: 'remark', ellipsis: { tooltip: true }, render: row => orDash(row.remark) },
  {
    title: '操作',
    key: 'actions',
    width: 90,
    fixed: 'right',
    render: row =>
      row.status === 1 &&
      hasAuth('system:member:delete') &&
      h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDeleteConsume(row) }, { default: () => '作废' })
  }
];

// ==================== Tab6: 统计分析 ====================
const stats = ref<MemberStatsOverview | null>(null);
const trend = ref<ConsumeTrendItem[]>([]);
const statsLoading = ref(false);

async function loadStats() {
  statsLoading.value = true;
  try {
    const [sRes, tRes] = await Promise.all([fetchMemberStatsOverview(), fetchConsumeTrend(6)]);
    if (sRes.error) {
      message.error(sRes.error.message);
      return;
    }
    stats.value = sRes.data;
    trend.value = tRes.data || [];
    updateLevelPie();
    updateTrendChart();
  } finally {
    statsLoading.value = false;
  }
}

const levelPieOptions = computed<ECOption>(() => {
  const data = (stats.value?.levelDistribution || []).map(d => ({ name: d.levelName, value: d.count }));
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} 人 ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [
      {
        name: '会员等级分布',
        type: 'pie',
        radius: ['40%', '68%'],
        center: ['50%', '44%'],
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{c}人' },
        data
      }
    ]
  };
});

const { domRef: levelPieDomRef, updateOptions: updateLevelPie } = useEcharts(() => levelPieOptions.value as ECOption);

const trendOptions = computed<ECOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['消费金额', '消费笔数'], bottom: 0 },
  grid: { left: 50, right: 24, top: 30, bottom: 44 },
  xAxis: { type: 'category', data: trend.value.map(t => t.month) },
  yAxis: { type: 'value', name: '金额(元)' },
  series: [
    {
      name: '消费金额',
      type: 'bar',
      barMaxWidth: 36,
      itemStyle: { borderRadius: [4, 4, 0, 0] },
      data: trend.value.map(t => t.amount)
    },
    {
      name: '消费笔数',
      type: 'line',
      smooth: true,
      data: trend.value.map(t => t.count)
    }
  ]
}));

const { domRef: trendDomRef, updateOptions: updateTrendChart } = useEcharts(() => trendOptions.value as ECOption);

const TYPE_COLORS = ['#2080f0', '#18a058', '#f0a020', '#d03050', '#8a2be2'];

/** 消费类型分布列 */
const typeDistributionColumns: DataTableColumn<{ consumeType: string; count: number; amount: number }>[] = [
  {
    title: '消费类型',
    key: 'consumeType',
    render: row =>
      h(
        NTag,
        { size: 'small', bordered: false, color: { color: `${TYPE_COLORS[0]}20`, textColor: TYPE_COLORS[0] } },
        { default: () => CONSUME_TYPE_LABEL_MAP[row.consumeType] || row.consumeType }
      )
  },
  { title: '消费笔数', key: 'count', align: 'right' },
  { title: '消费金额(元)', key: 'amount', align: 'right', render: row => fmtMoney(row.amount) }
];

// ==================== 详情 ====================
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<MemberDetail | null>(null);

async function openDetail(row: MemberItem) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    const { data, error } = await fetchAdminMemberDetail(row.id);
    if (error) {
      message.error(error.message);
      return;
    }
    detail.value = data;
  } finally {
    detailLoading.value = false;
  }
}

onMounted(() => {
  loadLevels();
  loadMembers();
  loadLevelData();
  loadRuleData();
  loadPointsRecords();
  loadConsume();
  loadStats();
});
</script>

<template>
  <div class="min-h-500px">
    <n-tabs type="line" animated>
      <!-- 会员列表 -->
      <n-tab-pane name="members" tab="会员列表">
        <n-space class="mb-16px" wrap align="center">
          <n-input v-model:value="memberSearch.keyword" placeholder="姓名/编号/手机号" clearable style="width: 200px" @keyup.enter="handleMemberSearch" />
          <n-select v-model:value="memberSearch.levelId" :options="levelOptions" placeholder="等级" clearable style="width: 140px" />
          <n-select v-model:value="memberSearch.status" :options="ENABLE_OPTIONS" placeholder="状态" clearable style="width: 120px" />
          <n-button type="primary" @click="handleMemberSearch">查询</n-button>
          <n-button @click="handleMemberReset">重置</n-button>
          <n-button v-if="hasAuth('system:member:create')" type="primary" @click="openMemberCreate">新增会员</n-button>
          <n-button v-if="hasAuth('system:member:export')" @click="handleMemberExport">导出 Excel</n-button>
        </n-space>
        <n-data-table
          :columns="memberColumns"
          :data="memberTableData"
          :loading="memberLoading"
          :pagination="memberPagination"
          :row-key="(row: MemberItem) => row.id"
          @update:page="(p: number) => { memberPagination.page = p; loadMembers(); }"
          @update:page-size="(s: number) => { memberPagination.pageSize = s; memberPagination.page = 1; loadMembers(); }"
        />
      </n-tab-pane>

      <!-- 等级管理 -->
      <n-tab-pane name="levels" tab="等级管理">
        <n-space class="mb-16px" wrap>
          <n-button v-if="hasAuth('system:member:create')" type="primary" @click="openLevelCreate">新增等级</n-button>
        </n-space>
        <n-data-table :columns="levelColumns" :data="levelTableData" :loading="levelLoading" :row-key="(row: LevelItem) => row.id" />
      </n-tab-pane>

      <!-- 积分规则 -->
      <n-tab-pane name="rules" tab="积分规则">
        <n-space class="mb-16px" wrap>
          <n-button v-if="hasAuth('system:member:create')" type="primary" @click="openRuleCreate">新增规则</n-button>
        </n-space>
        <n-data-table :columns="ruleColumns" :data="ruleTableData" :loading="ruleLoading" :row-key="(row: PointsRuleItem) => row.id" />
      </n-tab-pane>

      <!-- 积分记录 -->
      <n-tab-pane name="points" tab="积分记录">
        <n-space class="mb-16px" wrap align="center">
          <n-input v-model:value="pointsSearch.memberId" placeholder="会员ID" clearable style="width: 110px" @keyup.enter="handlePointsSearch" />
          <n-select v-model:value="pointsSearch.bizType" :options="POINTS_BIZ_OPTIONS" placeholder="业务类型" clearable style="width: 140px" />
          <n-input v-model:value="pointsSearch.keyword" placeholder="会员名/编号" clearable style="width: 180px" @keyup.enter="handlePointsSearch" />
          <n-button type="primary" @click="handlePointsSearch">查询</n-button>
          <n-button @click="handlePointsReset">重置</n-button>
        </n-space>
        <n-data-table
          :columns="pointsColumns"
          :data="pointsTableData"
          :loading="pointsLoading"
          :pagination="pointsPagination"
          :row-key="(row: PointsRecordItem) => row.id"
          @update:page="(p: number) => { pointsPagination.page = p; loadPointsRecords(); }"
          @update:page-size="(s: number) => { pointsPagination.pageSize = s; pointsPagination.page = 1; loadPointsRecords(); }"
        />
      </n-tab-pane>

      <!-- 消费记录 -->
      <n-tab-pane name="consume" tab="消费记录">
        <n-space class="mb-16px" wrap align="center">
          <n-input v-model:value="consumeSearch.memberId" placeholder="会员ID" clearable style="width: 110px" @keyup.enter="handleConsumeSearch" />
          <n-select v-model:value="consumeSearch.consumeType" :options="CONSUME_TYPE_OPTIONS" placeholder="消费类型" clearable style="width: 140px" />
          <n-select v-model:value="consumeSearch.status" :options="ENABLE_OPTIONS" placeholder="状态" clearable style="width: 110px" />
          <n-input v-model:value="consumeSearch.keyword" placeholder="订单号/会员名" clearable style="width: 180px" @keyup.enter="handleConsumeSearch" />
          <n-date-picker v-model:formatted-value="consumeSearch.startTime" value-format="yyyy-MM-dd" type="date" clearable placeholder="开始日期" style="width: 140px" />
          <n-date-picker v-model:formatted-value="consumeSearch.endTime" value-format="yyyy-MM-dd" type="date" clearable placeholder="结束日期" style="width: 140px" />
          <n-button type="primary" @click="handleConsumeSearch">查询</n-button>
          <n-button @click="handleConsumeReset">重置</n-button>
          <n-button v-if="hasAuth('system:member:create')" type="primary" @click="openConsumeCreate">新增消费</n-button>
          <n-button v-if="hasAuth('system:member:export')" @click="handleConsumeExport">导出 Excel</n-button>
        </n-space>
        <n-data-table
          :columns="consumeColumns"
          :data="consumeTableData"
          :loading="consumeLoading"
          :pagination="consumePagination"
          :row-key="(row: ConsumeItem) => row.id"
          @update:page="(p: number) => { consumePagination.page = p; loadConsume(); }"
          @update:page-size="(s: number) => { consumePagination.pageSize = s; consumePagination.page = 1; loadConsume(); }"
        />
      </n-tab-pane>

      <!-- 统计分析 -->
      <n-tab-pane name="stats" tab="统计分析">
        <n-spin :show="statsLoading">
          <n-grid :cols="4" :x-gap="12" :y-gap="12" class="mb-16px" responsive="screen" item-responsive>
            <n-gi span="4 s:2 m:1">
              <n-card size="small">
                <n-statistic label="会员总数" :value="stats?.memberCount || 0" />
              </n-card>
            </n-gi>
            <n-gi span="4 s:2 m:1">
              <n-card size="small">
                <n-statistic label="活跃会员" :value="stats?.activeCount || 0" />
              </n-card>
            </n-gi>
            <n-gi span="4 s:2 m:1">
              <n-card size="small">
                <n-statistic label="累计消费(元)" :value="fmtMoney(stats?.totalConsume)" :precision="2" />
              </n-card>
            </n-gi>
            <n-gi span="4 s:2 m:1">
              <n-card size="small">
                <n-statistic label="本月消费(元)" :value="fmtMoney(stats?.monthConsume)" :precision="2" />
              </n-card>
            </n-gi>
          </n-grid>

          <n-grid :cols="2" :x-gap="12" :y-gap="12" responsive="screen" item-responsive>
            <n-gi span="2 m:1">
              <n-card size="small" title="会员等级分布">
                <div class="relative">
                  <div ref="levelPieDomRef" class="h-320px w-full" />
                  <n-empty
                    v-if="!(stats?.levelDistribution || []).length"
                    description="暂无数据"
                    class="absolute inset-0 flex items-center justify-center"
                  />
                </div>
              </n-card>
            </n-gi>
            <n-gi span="2 m:1">
              <n-card size="small" title="近 6 个月消费趋势">
                <div class="relative">
                  <div ref="trendDomRef" class="h-320px w-full" />
                  <n-empty
                    v-if="!trend.length"
                    description="暂无数据"
                    class="absolute inset-0 flex items-center justify-center"
                  />
                </div>
              </n-card>
            </n-gi>
          </n-grid>

          <n-card size="small" title="消费类型分布" class="mt-16px">
            <n-data-table
              :columns="typeDistributionColumns"
              :data="stats?.typeDistribution || []"
              :pagination="false"
              :row-key="(row: any) => row.consumeType"
            />
            <n-empty v-if="!(stats?.typeDistribution || []).length" description="暂无数据" />
          </n-card>
        </n-spin>
      </n-tab-pane>
    </n-tabs>

    <!-- 会员新增/编辑 -->
    <n-modal v-model:show="memberModalVisible" preset="card" :title="memberForm.id === 0 ? '新增会员' : '编辑会员'" style="width: 520px">
      <n-form ref="memberFormRef" :model="memberForm" label-placement="left" label-width="90px">
        <n-form-item label="姓名" required :rule="{ required: true, message: '请输入会员姓名' }">
          <n-input v-model:value="memberForm.name" placeholder="请输入姓名" />
        </n-form-item>
        <n-form-item label="手机号" :rule="{
          validator: () => !memberForm.phone || /^1[3-9]\d{9}$/.test(memberForm.phone),
          message: '请输入正确的 11 位手机号',
          trigger: ['input', 'blur']
        }">
          <n-input v-model:value="memberForm.phone" placeholder="选填" />
        </n-form-item>
        <n-form-item label="性别">
          <n-select v-model:value="memberForm.gender" :options="GENDER_OPTIONS" />
        </n-form-item>
        <n-form-item label="生日">
          <n-date-picker v-model:formatted-value="memberForm.birthday" value-format="yyyy-MM-dd" type="date" clearable placeholder="选填" style="width: 100%" />
        </n-form-item>
        <n-form-item label="等级">
          <n-select v-model:value="memberForm.levelId" :options="levelOptions" clearable placeholder="自动匹配" />
        </n-form-item>
        <n-form-item v-if="memberForm.id === 0" label="初始积分">
          <n-input-number v-model:value="memberForm.points" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="状态">
          <n-select v-model:value="memberForm.status" :options="ENABLE_OPTIONS" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="memberForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="memberModalVisible = false">取消</n-button>
          <n-button type="primary" :loading="memberSaving" @click="submitMember">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 人工调分 -->
    <n-modal v-model:show="adjustVisible" preset="card" title="人工调整积分" style="width: 440px">
      <n-form ref="adjustFormRef" :model="adjustForm" label-placement="left" label-width="90px">
        <n-form-item label="会员">
          <span>{{ adjustForm.memberName }}</span>
        </n-form-item>
        <n-form-item label="变动积分" required :rule="{
          validator: () => adjustForm.changePoints !== 0,
          message: '变动积分不能为 0',
          trigger: ['input', 'blur']
        }">
          <n-input-number v-model:value="adjustForm.changePoints" :min="-100000" :max="100000" style="width: 100%" placeholder="正数增加 / 负数扣减" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="adjustForm.remark" type="textarea" :rows="2" placeholder="调整原因" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="adjustVisible = false">取消</n-button>
          <n-button type="primary" :loading="adjustSaving" @click="submitAdjust">确定</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 等级新增/编辑 -->
    <n-modal v-model:show="levelModalVisible" preset="card" :title="levelForm.id === 0 ? '新增等级' : '编辑等级'" style="width: 500px">
      <n-form ref="levelFormRef" :model="levelForm" label-placement="left" label-width="90px">
        <n-form-item label="等级名称" required :rule="{ required: true, message: '请输入等级名称' }">
          <n-input v-model:value="levelForm.name" placeholder="如：金卡会员" />
        </n-form-item>
        <n-form-item label="等级编码" required :rule="{ required: true, message: '请输入等级编码' }">
          <n-input v-model:value="levelForm.code" placeholder="如：gold" />
        </n-form-item>
        <n-form-item label="积分下限" required>
          <n-input-number v-model:value="levelForm.pointsMin" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="积分上限">
          <n-input-number v-model:value="levelForm.pointsMax" :min="0" style="width: 100%" placeholder="0 表示不限" />
        </n-form-item>
        <n-form-item label="折扣率" required>
          <n-input-number v-model:value="levelForm.discountRate" :min="0" :max="1" :step="0.05" style="width: 100%" placeholder="0~1，如 0.9 表示 9 折" />
        </n-form-item>
        <n-form-item label="排序">
          <n-input-number v-model:value="levelForm.sortOrder" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="状态">
          <n-select v-model:value="levelForm.status" :options="ENABLE_OPTIONS" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="levelForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="levelModalVisible = false">取消</n-button>
          <n-button type="primary" :loading="levelSaving" @click="submitLevel">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 积分规则新增/编辑 -->
    <n-modal v-model:show="ruleModalVisible" preset="card" :title="ruleForm.id === 0 ? '新增积分规则' : '编辑积分规则'" style="width: 500px">
      <n-form ref="ruleFormRef" :model="ruleForm" label-placement="left" label-width="100px">
        <n-form-item label="规则名称" required :rule="{ required: true, message: '请输入规则名称' }">
          <n-input v-model:value="ruleForm.name" placeholder="如：消费积分" />
        </n-form-item>
        <n-form-item label="规则编码" required :rule="{ required: true, message: '请输入规则编码' }">
          <n-input v-model:value="ruleForm.code" placeholder="如：consume" />
        </n-form-item>
        <n-form-item label="固定积分">
          <n-input-number v-model:value="ruleForm.points" :min="0" style="width: 100%" placeholder="按次固定赠送" />
        </n-form-item>
        <n-form-item label="每元积分">
          <n-input-number v-model:value="ruleForm.pointsPerAmount" :min="0" :precision="2" :step="0.1" style="width: 100%" placeholder="按消费金额赠送" />
        </n-form-item>
        <n-form-item label="是否启用">
          <n-select v-model:value="ruleForm.enabled" :options="ENABLE_OPTIONS" />
        </n-form-item>
        <n-form-item label="排序">
          <n-input-number v-model:value="ruleForm.sortOrder" :min="0" style="width: 100%" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="ruleForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="ruleModalVisible = false">取消</n-button>
          <n-button type="primary" :loading="ruleSaving" @click="submitRule">保存</n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 新增消费记录 -->
    <n-modal v-model:show="consumeModalVisible" preset="card" title="新增消费记录" style="width: 480px">
      <n-form ref="consumeFormRef" :model="consumeForm" label-placement="left" label-width="90px">
        <n-form-item label="订单号">
          <n-input v-model:value="consumeForm.orderNo" placeholder="选填，自动生成" />
        </n-form-item>
        <n-form-item label="会员" required :rule="{ required: true, message: '请选择会员' }">
          <n-select
            v-model:value="consumeForm.memberId"
            :options="memberOptions"
            :loading="memberSearchLoading"
            filterable
            remote
            clearable
            placeholder="搜索并选择会员"
            @search="searchMemberOptions"
          />
        </n-form-item>
        <n-form-item label="消费类型">
          <n-select v-model:value="consumeForm.consumeType" :options="CONSUME_TYPE_OPTIONS" />
        </n-form-item>
        <n-form-item label="金额(元)" required :rule="{
          validator: () => consumeForm.amount > 0,
          message: '金额必须大于 0',
          trigger: ['input', 'blur']
        }">
          <n-input-number v-model:value="consumeForm.amount" :min="0.01" :precision="2" style="width: 100%" />
        </n-form-item>
        <n-form-item label="支付时间">
          <n-date-picker v-model:formatted-value="consumeForm.payTime" value-format="yyyy-MM-dd HH:mm:ss" type="datetime" clearable style="width: 100%" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input v-model:value="consumeForm.remark" type="textarea" :rows="2" placeholder="选填" />
        </n-form-item>
      </n-form>
      <template #footer>
        <n-space justify="end">
          <n-button @click="consumeModalVisible = false">取消</n-button>
          <n-button type="primary" :loading="consumeSaving" @click="submitConsume">保存</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>
