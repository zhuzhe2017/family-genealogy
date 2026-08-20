<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn } from 'naive-ui';
import {
  useMessage,
  useDialog,
  NTag,
  NButton,
  NSpace,
  NSelect,
  NInput,
  NInputNumber,
  NForm,
  NFormItem,
  NDataTable,
  NModal,
  NCard,
  NDrawer,
  NDrawerContent,
  NTabs,
  NTabPane,
  NDescriptions,
  NDescriptionsItem,
  NStatistic,
  NGrid,
  NGi,
  NEmpty,
  NSpin,
  NDatePicker,
  NDivider,
  NImage,
  NList,
  NListItem
} from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import { resolveImageUrl } from '@/utils/image-url';
import ImageUpload from '@/components/common/image-upload/index.vue';
import {
  fetchAllFamilies,
  fetchAdminGatheringList,
  fetchAdminGatheringDetail,
  fetchCreateAdminGathering,
  fetchUpdateAdminGathering,
  fetchUpdateAdminGatheringStatus,
  fetchDeleteAdminGathering,
  fetchAdminGatheringRegistrations,
  fetchAdminGatheringStats,
  fetchAdminGatheringArchives,
  fetchCreateAdminGatheringArchive,
  fetchDeleteAdminGatheringArchive
} from '@/service/api';
import type {
  AdminGatheringItem,
  AdminGatheringPayload,
  AdminGatheringSession,
  AdminAgendaItem,
  AdminRegistrationItem,
  AdminGatheringStats,
  AdminArchiveItem
} from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

const STATUS_LABELS: Record<number, string> = { 0: '草稿', 1: '筹备中', 2: '进行中', 3: '已结束', 4: '已归档' };
const STATUS_TAGS: Record<number, 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary'> = {
  0: 'default',
  1: 'primary',
  2: 'warning',
  3: 'info',
  4: 'success'
};
const REG_STATUS_LABELS: Record<number, string> = { 1: '已报名', 2: '已取消', 3: '已签到' };
const NEXT_ACTIONS: Record<number, { label: string; to: number }> = {
  0: { label: '发布', to: 1 },
  1: { label: '开始', to: 2 },
  2: { label: '结束', to: 3 },
  3: { label: '归档', to: 4 }
};

function formatTime(v: string | null | undefined) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '-';
}
function toTs(v: string | null | undefined) {
  return v ? new Date(v.replace(' ', 'T')).getTime() : null;
}

// ===== 家族下拉 =====
const familyOptions = ref<{ label: string; value: number }[]>([]);
async function loadFamilyOptions() {
  try {
    const { data } = await fetchAllFamilies({ status: 1 });
    familyOptions.value = (data || []).map((f: any) => ({ label: `${f.name}（ID ${f.id}）`, value: f.id }));
  } catch {
    familyOptions.value = [];
  }
}

// ===== 列表 =====
const loading = ref(false);
const data = ref<AdminGatheringItem[]>([]);
const search = reactive({ familyId: null as number | null, status: null as number | null, keyword: '' });
const pagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const columns: DataTableColumn<AdminGatheringItem>[] = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '家族', key: 'familyName', width: 130, ellipsis: { tooltip: true } },
  { title: '聚会名称', key: 'title', minWidth: 160, ellipsis: { tooltip: true } },
  { title: '地点', key: 'location', width: 120, ellipsis: { tooltip: true }, render: row => row.location || '-' },
  { title: '开始时间', key: 'startTime', width: 160, render: row => formatTime(row.startTime) },
  {
    title: '报名', key: 'signedTotal', width: 80, align: 'center',
    render: row => `${row.signedTotal}${row.capacity > 0 ? `/${row.capacity}` : ''}`
  },
  { title: '签到', key: 'checkinTotal', width: 70, align: 'center', render: row => row.checkinTotal ?? 0 },
  {
    title: '状态', key: 'status', width: 90, align: 'center',
    render: row => h(NTag, { type: STATUS_TAGS[row.status] || 'default', size: 'small', bordered: false }, { default: () => STATUS_LABELS[row.status] || row.status })
  },
  { title: '创建时间', key: 'createTime', width: 160, render: row => formatTime(row.createTime) },
  {
    title: '操作', key: 'actions', width: 170, fixed: 'right',
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openDetail(row.id) }, { default: () => '详情' }),
        hasAuth('system:gathering:update') ? h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openEdit(row) }, { default: () => '编辑' }) : null,
        hasAuth('system:gathering:delete') ? h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' }) : null
      ]
    })
  }
];

function handleSearch() { pagination.page = 1; loadList(); }
function handleReset() {
  search.familyId = null; search.status = null; search.keyword = '';
  pagination.page = 1; loadList();
}
function handlePageChange(page: number) { pagination.page = page; loadList(); }
function handlePageSizeChange(size: number) { pagination.pageSize = size; pagination.page = 1; loadList(); }

async function loadList() {
  loading.value = true;
  try {
    const { data: res } = await fetchAdminGatheringList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      familyId: search.familyId ?? undefined,
      status: search.status ?? undefined,
      keyword: search.keyword || undefined
    });
    data.value = res?.list || [];
    pagination.itemCount = res?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '聚会列表加载失败');
  } finally {
    loading.value = false;
  }
}

// ===== 新增 / 编辑弹窗 =====
const showModal = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<AdminGatheringPayload>({
  familyId: 0,
  title: '',
  description: '',
  coverImage: '',
  location: '',
  addressDetail: '',
  startTime: null,
  endTime: null,
  signupDeadline: null,
  agenda: [],
  capacity: 0,
  status: 0,
  sessions: []
});
const rangeTs = ref<[number, number] | null>(null);
const deadlineTs = ref<number | null>(null);

function resetForm() {
  Object.assign(form, {
    familyId: 0,
    title: '',
    description: '',
    coverImage: '',
    location: '',
    addressDetail: '',
    startTime: null,
    endTime: null,
    signupDeadline: null,
    agenda: [],
    capacity: 0,
    status: 0,
    sessions: []
  });
  rangeTs.value = null;
  deadlineTs.value = null;
}

function openCreate() {
  editingId.value = null;
  resetForm();
  showModal.value = true;
}

function openEdit(row: AdminGatheringItem) {
  editingId.value = row.id;
  resetForm();
  showModal.value = true;
  fetchAdminGatheringDetail(row.id)
    .then(({ data: d }) => {
      Object.assign(form, {
        familyId: d.familyId,
        title: d.title,
        description: d.description || '',
        coverImage: d.coverImage || '',
        location: d.location || '',
        addressDetail: d.addressDetail || '',
        startTime: d.startTime || null,
        endTime: d.endTime || null,
        signupDeadline: d.signupDeadline || null,
        agenda: (d.agenda || []).map((a: any) => ({ time: a.time || '', item: a.item || '', remark: a.remark || '' })),
        capacity: d.capacity || 0,
        status: d.status ?? 0,
        sessions: (d.sessions || []).map((s: any) => ({
          id: s.id,
          name: s.name || '',
          startTime: toTs(s.startTime),
          endTime: toTs(s.endTime),
          capacity: s.capacity || 0
        }))
      });
      rangeTs.value = d.startTime && d.endTime ? [toTs(d.startTime)!, toTs(d.endTime)!] : null;
      deadlineTs.value = toTs(d.signupDeadline);
    })
    .catch((err: any) => message.error(err?.msg || '聚会详情加载失败'));
}

function handleRangeChange(v: [number, number] | null) {
  rangeTs.value = v;
  form.startTime = v ? formatTs(v[0]) : null;
  form.endTime = v ? formatTs(v[1]) : null;
}
function handleDeadlineChange(v: number | null) {
  deadlineTs.value = v;
  form.signupDeadline = v ? formatTs(v) : null;
}
function formatTs(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 场次 / 议程动态行
function addSession() {
  (form.sessions as AdminGatheringSession[]).push({ name: '', startTime: null, endTime: null, capacity: 0 });
}
function removeSession(i: number) {
  (form.sessions as AdminGatheringSession[]).splice(i, 1);
}
function addAgenda() {
  (form.agenda as AdminAgendaItem[]).push({ time: '', item: '', remark: '' });
}
function removeAgenda(i: number) {
  (form.agenda as AdminAgendaItem[]).splice(i, 1);
}

async function handleSave() {
  if (!form.familyId) {
    message.warning('请选择所属家族');
    return;
  }
  if (!form.title.trim()) {
    message.warning('请填写聚会名称');
    return;
  }
  saving.value = true;
  try {
    // 场次时间在表单内为 timestamp，提交前转回字符串
    const payload: AdminGatheringPayload = {
      ...form,
      sessions: (form.sessions as AdminGatheringSession[]).map((s) => ({
        id: s.id,
        name: s.name,
        startTime: s.startTime ? formatTs(Number(s.startTime)) : null,
        endTime: s.endTime ? formatTs(Number(s.endTime)) : null,
        capacity: s.capacity || 0
      }))
    };
    if (editingId.value) {
      await fetchUpdateAdminGathering(editingId.value, payload);
      message.success('更新成功');
    } else {
      await fetchCreateAdminGathering(payload);
      message.success('创建成功');
    }
    showModal.value = false;
    loadList();
  } catch (err: any) {
    message.error(err?.msg || '保存失败');
  } finally {
    saving.value = false;
  }
}

function handleDelete(row: AdminGatheringItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除聚会「${row.title}」吗？报名、场次与归档资料将一并删除，不可恢复。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminGathering(row.id);
        message.success('删除成功');
        loadList();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

// ===== 详情抽屉 =====
const showDetail = ref(false);
const detailLoading = ref(false);
const detail = ref<AdminGatheringDetail | null>(null);
const stats = ref<AdminGatheringStats | null>(null);
const detailTab = ref('info');

// 名单 tab
const regLoading = ref(false);
const regData = ref<AdminRegistrationItem[]>([]);
const regSearch = reactive({ status: null as number | null, keyword: '' });
const regPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50] });
const regColumns: DataTableColumn<AdminRegistrationItem>[] = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '姓名', key: 'name', width: 90 },
  { title: '手机号', key: 'phone', width: 120, render: row => row.phone || '-' },
  { title: '场次', key: 'sessionName', width: 120, ellipsis: { tooltip: true }, render: row => row.sessionName || '未选场次' },
  { title: '饮食', key: 'dietLabel', width: 80, align: 'center' },
  { title: '随行', key: 'guestCount', width: 70, align: 'center' },
  {
    title: '状态', key: 'status', width: 90, align: 'center',
    render: row => h(NTag, { type: row.status === 3 ? 'success' : row.status === 2 ? 'default' : 'primary', size: 'small', bordered: false }, { default: () => REG_STATUS_LABELS[row.status] || row.status })
  },
  { title: '签到码', key: 'checkinCode', width: 90, align: 'center', render: row => row.status === 2 ? '-' : row.checkinCode },
  { title: '签到时间', key: 'checkinTime', width: 160, render: row => formatTime(row.checkinTime) },
  { title: '备注', key: 'specialNeed', minWidth: 120, ellipsis: { tooltip: true }, render: row => row.specialNeed || '-' }
];

function openDetail(id: number) {
  detailTab.value = 'info';
  showDetail.value = true;
  detailLoading.value = true;
  detail.value = null;
  stats.value = null;
  regData.value = [];
  regPagination.itemCount = 0;
  archives.value = [];
  Promise.all([
    fetchAdminGatheringDetail(id),
    fetchAdminGatheringStats(id)
  ])
    .then(([dRes, sRes]) => {
      detail.value = dRes.data;
      stats.value = sRes.data;
    })
    .catch((err: any) => message.error(err?.msg || '详情加载失败'))
    .finally(() => { detailLoading.value = false; });
  loadRegistrations(id, 1);
  loadArchives(id);
}

function loadRegistrations(id: number, page: number) {
  regLoading.value = true;
  regPagination.page = page;
  fetchAdminGatheringRegistrations(id, {
    page,
    pageSize: regPagination.pageSize,
    status: regSearch.status ?? undefined,
    keyword: regSearch.keyword || undefined
  })
    .then(({ data: res }) => {
      regData.value = res?.list || [];
      regPagination.itemCount = res?.total || 0;
    })
    .catch((err: any) => message.error(err?.msg || '报名名单加载失败'))
    .finally(() => { regLoading.value = false; });
}
function handleRegSearch() { if (detail.value) loadRegistrations(detail.value.id, 1); }
function handleRegReset() {
  regSearch.status = null; regSearch.keyword = '';
  if (detail.value) loadRegistrations(detail.value.id, 1);
}

// ===== 归档资料 =====
const archives = ref<AdminArchiveItem[]>([]);
const archiveModal = ref(false);
const archiveSaving = ref(false);
const archiveForm = reactive({ title: '', fileUrl: '', fileType: 'image', description: '' });

function loadArchives(id: number) {
  fetchAdminGatheringArchives(id)
    .then(({ data: res }) => { archives.value = res?.list || []; })
    .catch((err: any) => message.error(err?.msg || '归档资料加载失败'));
}

function openArchiveCreate() {
  Object.assign(archiveForm, { title: '', fileUrl: '', fileType: 'image', description: '' });
  archiveModal.value = true;
}

async function handleArchiveSave() {
  if (!archiveForm.title.trim()) {
    message.warning('请填写资料标题');
    return;
  }
  if (!archiveForm.fileUrl.trim()) {
    message.warning('请上传归档文件');
    return;
  }
  archiveSaving.value = true;
  try {
    await fetchCreateAdminGatheringArchive(detail.value!.id, archiveForm);
    message.success('归档成功');
    archiveModal.value = false;
    loadArchives(detail.value!.id);
  } catch (err: any) {
    message.error(err?.msg || '归档失败');
  } finally {
    archiveSaving.value = false;
  }
}

function handleArchiveDelete(item: AdminArchiveItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除归档「${item.title}」吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminGatheringArchive(detail.value!.id, item.id);
        message.success('删除成功');
        loadArchives(detail.value!.id);
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

function runStatusAction() {
  const d = detail.value;
  if (!d) return;
  const action = NEXT_ACTIONS[d.status];
  if (!action) {
    message.info('该聚会已归档，无需其他操作');
    return;
  }
  dialog.warning({
    title: `确认${action.label}`,
    content: `确认将聚会「${d.title}」${action.label}吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchUpdateAdminGatheringStatus(d.id, action.to);
        message.success('操作成功');
        if (detail.value) openDetail(detail.value.id);
        loadList();
      } catch (err: any) {
        message.error(err?.msg || '操作失败');
      }
    }
  });
}

onMounted(() => {
  loadFamilyOptions();
  loadList();
});
</script>

<template>
  <div>
    <NCard title="宗亲聚会管理" :bordered="false" class="mb-16px">
      <div class="flex items-center gap-12px flex-wrap">
        <NSelect v-model:value="search.familyId" :options="familyOptions" placeholder="选择家族" clearable style="width: 200px" />
        <NSelect
          v-model:value="search.status"
          :options="[0, 1, 2, 3, 4].map(s => ({ label: STATUS_LABELS[s], value: s }))"
          placeholder="聚会状态"
          clearable
          style="width: 130px"
        />
        <NInput v-model:value="search.keyword" placeholder="聚会名称关键字" clearable style="width: 180px" @keyup.enter="handleSearch" />
        <NButton type="primary" ghost @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
        <div class="flex-1" />
        <NButton v-if="hasAuth('system:gathering:create')" type="primary" @click="openCreate">新增聚会</NButton>
      </div>
    </NCard>

    <NCard :bordered="false">
      <NDataTable
        :columns="columns"
        :data="data"
        :loading="loading"
        :row-key="row => row.id"
        :pagination="pagination"
        :bordered="false"
        :single-line="false"
        :scroll-x="1300"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- 新增 / 编辑 -->
    <NModal v-model:show="showModal" preset="card" :title="editingId ? '编辑聚会' : '新增聚会'" style="width: min(94vw, 640px)" :mask-closable="false">
      <NForm label-placement="left" label-width="90px">
        <NFormItem label="所属家族">
          <NSelect v-model:value="form.familyId" :options="familyOptions" placeholder="选择家族" />
        </NFormItem>
        <NFormItem label="聚会名称">
          <NInput v-model:value="form.title" placeholder="例如：2026 年中秋宗亲联谊会" maxlength="50" />
        </NFormItem>
        <NFormItem label="聚会封面">
          <ImageUpload v-model:value="form.coverImage" :size="160" />
          <div class="text-12px text-gray-400 mt-4px">选填，小程序端聚会让封面展示</div>
        </NFormItem>
        <NFormItem label="聚会地点">
          <NInput v-model:value="form.location" placeholder="例如：张氏宗祠" maxlength="50" />
        </NFormItem>
        <NFormItem label="详细地址">
          <NInput v-model:value="form.addressDetail" placeholder="省市区 + 街道门牌" maxlength="100" />
        </NFormItem>
        <NFormItem label="聚会介绍">
          <NInput v-model:value="form.description" type="textarea" :rows="3" placeholder="聚会主题、注意事项等" maxlength="1000" />
        </NFormItem>
        <NFormItem label="时间范围">
          <NDatePicker v-model:value="rangeTs" type="datetimerange" clearable style="width: 100%" @update:value="handleRangeChange" />
        </NFormItem>
        <NFormItem label="报名截止">
          <NDatePicker v-model:value="deadlineTs" type="datetime" clearable style="width: 100%" @update:value="handleDeadlineChange" />
        </NFormItem>
        <NFormItem label="人数上限">
          <NInputNumber v-model:value="form.capacity" :min="0" :max="999999" style="width: 160px" />
          <span class="text-12px text-gray-400 ml-8px">0 表示不限</span>
        </NFormItem>

        <NDivider>场次 / 时间段</NDivider>
        <div v-for="(s, i) in form.sessions" :key="i" class="session-line">
          <div class="flex items-center gap-8px mb-8px">
            <span class="text-13px font-600 text-#8B1A1A">场次 {{ i + 1 }}</span>
            <NButton size="tiny" text type="error" @click="removeSession(i)">删除</NButton>
          </div>
          <div class="flex items-center gap-8px">
            <NInput v-model:value="s.name" placeholder="场次名称（如：上午场）" maxlength="50" />
          </div>
          <div class="flex items-center gap-8px mt-8px">
            <NDatePicker v-model:value="s.startTime" type="datetime" clearable placeholder="开始" style="width: 50%" />
            <NDatePicker v-model:value="s.endTime" type="datetime" clearable placeholder="结束" style="width: 50%" />
          </div>
          <div class="flex items-center gap-8px mt-8px">
            <NInputNumber v-model:value="s.capacity" :min="0" placeholder="名额上限" style="width: 160px" />
            <span class="text-12px text-gray-400">0 表示不限</span>
          </div>
        </div>
        <NButton size="small" dashed block @click="addSession">＋ 添加场次</NButton>

        <NDivider>议程安排</NDivider>
        <div v-for="(a, i) in form.agenda" :key="i" class="session-line">
          <div class="flex items-center gap-8px mb-8px">
            <span class="text-13px font-600 text-#8B1A1A">议程 {{ i + 1 }}</span>
            <NButton size="tiny" text type="error" @click="removeAgenda(i)">删除</NButton>
          </div>
          <div class="flex items-center gap-8px">
            <NInput v-model:value="a.time" placeholder="时间（如：09:00-09:30）" maxlength="30" style="width: 40%" />
            <NInput v-model:value="a.item" placeholder="事项（如：签到入场）" maxlength="50" />
          </div>
          <div class="mt-8px">
            <NInput v-model:value="a.remark" placeholder="备注（选填）" maxlength="100" />
          </div>
        </div>
        <NButton size="small" dashed block @click="addAgenda">＋ 添加议程</NButton>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-8px">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
        </div>
      </template>
    </NModal>

    <!-- 详情抽屉 -->
    <NDrawer v-model:show="showDetail" :width="min(92, 720)" :height="'100%'" placement="right">
      <NDrawerContent title="聚会详情" closable>
        <NSpin :show="detailLoading">
          <div v-if="detail">
            <div class="flex items-center gap-12px mb-16px">
              <NTag :type="STATUS_TAGS[detail.status] || 'default'" size="small" bordered>
                {{ STATUS_LABELS[detail.status] || detail.status }}
              </NTag>
              <span class="text-18px font-600">{{ detail.title }}</span>
              <div class="flex-1" />
              <NButton
                v-if="hasAuth('system:gathering:update')"
                size="small"
                type="primary"
                ghost
                :disabled="detail.status === 4"
                @click="runStatusAction"
              >
                {{ detail.status === 4 ? '已归档' : NEXT_ACTIONS[detail.status]?.label || '操作' }}
              </NButton>
            </div>

            <NTabs v-model:value="detailTab" type="line">
              <NTabPane name="info" tab="基本信息">
                <NDescriptions :column="1" bordered size="small">
                  <NDescriptionsItem label="所属家族">{{ detail.familyName }}</NDescriptionsItem>
                  <NDescriptionsItem label="聚会时间">
                    {{ detail.startTime ? formatTime(detail.startTime) : '-' }} ~ {{ detail.endTime ? formatTime(detail.endTime) : '-' }}
                  </NDescriptionsItem>
                  <NDescriptionsItem label="报名截止">{{ detail.signupDeadline ? formatTime(detail.signupDeadline) : '-' }}</NDescriptionsItem>
                  <NDescriptionsItem label="聚会地点">{{ detail.location || '-' }} {{ detail.addressDetail || '' }}</NDescriptionsItem>
                  <NDescriptionsItem label="人数上限">{{ detail.capacity > 0 ? detail.capacity : '不限' }}</NDescriptionsItem>
                  <NDescriptionsItem label="聚会介绍">{{ detail.description || '-' }}</NDescriptionsItem>
                </NDescriptions>

                <template v-if="detail.sessions && detail.sessions.length">
                  <NDivider>场次</NDivider>
                  <NDescriptions :column="1" bordered size="small">
                    <NDescriptionsItem v-for="(s, i) in detail.sessions" :key="i" :label="s.name || `场次 ${i + 1}`">
                      {{ formatTime(s.startTime) }} ~ {{ formatTime(s.endTime) }}
                      <span v-if="s.capacity > 0" class="ml-8px">（已报 {{ s.signedCount || 0 }}/{{ s.capacity }}）</span>
                    </NDescriptionsItem>
                  </NDescriptions>
                </template>

                <template v-if="detail.agenda && detail.agenda.length">
                  <NDivider>议程</NDivider>
                  <NDescriptions :column="1" bordered size="small">
                    <NDescriptionsItem v-for="(a, i) in detail.agenda" :key="i" :label="a.time || `议程 ${i + 1}`">
                      {{ a.item }}{{ a.remark ? `（${a.remark}）` : '' }}
                    </NDescriptionsItem>
                  </NDescriptions>
                </template>
              </NTabPane>

              <NTabPane name="stats" tab="统计分析">
                <template v-if="stats">
                  <NGrid :cols="4" :x-gap="12" :y-gap="12" class="mb-16px">
                    <NGi><NCard :bordered="false" class="stat-card"><NStatistic label="总报名" :value="stats.total" /></NCard></NGi>
                    <NGi><NCard :bordered="false" class="stat-card"><NStatistic label="已签到" :value="stats.checkedIn" /></NCard></NGi>
                    <NGi><NCard :bordered="false" class="stat-card"><NStatistic label="已取消" :value="stats.cancelled" /></NCard></NGi>
                    <NGi><NCard :bordered="false" class="stat-card"><NStatistic label="随行人数" :value="stats.totalGuest" /></NCard></NGi>
                  </NGrid>

                  <NDivider>场次分布</NDivider>
                  <NDescriptions v-if="stats.sessions.length" :column="1" bordered size="small">
                    <NDescriptionsItem v-for="(s, i) in stats.sessions" :key="i" :label="s.name">
                      报名 {{ s.count }} 人，签到 {{ s.checkedIn }} 人
                    </NDescriptionsItem>
                  </NDescriptions>
                  <NEmpty v-else description="暂无场次数据" />

                  <NDivider>饮食分布</NDivider>
                  <NDescriptions v-if="stats.diets.length" :column="1" bordered size="small">
                    <NDescriptionsItem v-for="(d, i) in stats.diets" :key="i" :label="d.label">
                      {{ d.count }} 人
                    </NDescriptionsItem>
                  </NDescriptions>
                  <NEmpty v-else description="暂无饮食数据" />
                </template>
                <NEmpty v-else description="暂无统计数据" />
              </NTabPane>

              <NTabPane name="registrations" tab="报名名单">
                <div class="flex items-center gap-8px mb-12px">
                  <NSelect
                    v-model:value="regSearch.status"
                    :options="[1, 2, 3].map(s => ({ label: REG_STATUS_LABELS[s], value: s }))"
                    placeholder="报名状态"
                    clearable
                    style="width: 130px"
                  />
                  <NInput v-model:value="regSearch.keyword" placeholder="姓名 / 手机号" clearable style="width: 180px" @keyup.enter="handleRegSearch" />
                  <NButton size="small" type="primary" ghost @click="handleRegSearch">查询</NButton>
                  <NButton size="small" @click="handleRegReset">重置</NButton>
                </div>
                <NDataTable
                  :columns="regColumns"
                  :data="regData"
                  :loading="regLoading"
                  :row-key="row => row.id"
                  :pagination="regPagination"
                  :bordered="false"
                  :single-line="false"
                  :scroll-x="1100"
                  remote
                  @update:page="(page: number) => detail && loadRegistrations(detail.id, page)"
                  @update:page-size="(size: number) => { regPagination.pageSize = size; regPagination.page = 1; if (detail) loadRegistrations(detail.id, 1); }"
                />
              </NTabPane>
              <NTabPane name="archives" tab="归档资料">
                <div class="flex items-center mb-12px">
                  <span class="text-13px text-gray-400">聚会结束后整理的照片、影集、通讯录等资料</span>
                  <div class="flex-1" />
                  <NButton v-if="hasAuth('system:gathering:update')" size="small" type="primary" ghost @click="openArchiveCreate">新增归档</NButton>
                </div>
                <NEmpty v-if="!archives.length" description="暂无归档资料" />
                <NList v-else bordered>
                  <NListItem v-for="item in archives" :key="item.id">
                    <div class="flex items-center gap-12px">
                      <NImage
                        v-if="item.fileType === 'image' && item.fileUrl"
                        :src="resolveImageUrl(item.fileUrl)"
                        :width="64"
                        :height="64"
                        object-fit="cover"
                        :fallback-src="'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2220%22 y=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22central%22 fill=%22%23999%22 font-size=%2212%22%3E无%3C/text%3E%3C/svg%3E'"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="text-14px font-500 truncate">{{ item.title }}</div>
                        <div v-if="item.description" class="text-12px text-gray-400 truncate">{{ item.description }}</div>
                        <div class="text-12px text-gray-300">{{ formatTime(item.createTime) }}</div>
                      </div>
                      <NButton v-if="hasAuth('system:gathering:update')" size="small" text type="error" @click="handleArchiveDelete(item)">删除</NButton>
                    </div>
                  </NListItem>
                </NList>
              </NTabPane>
            </NTabs>
          </div>
          <NEmpty v-else-if="!detailLoading" description="无数据" />
        </NSpin>
      </NDrawerContent>
    </NDrawer>

    <!-- 新增归档资料 -->
    <NModal v-model:show="archiveModal" preset="card" title="新增归档资料" style="width: min(92vw, 480px)" :mask-closable="false">
      <NForm label-placement="left" label-width="80px">
        <NFormItem label="资料标题">
          <NInput v-model:value="archiveForm.title" placeholder="例如：2026 年中秋聚会合影" maxlength="100" />
        </NFormItem>
        <NFormItem label="归档文件">
          <ImageUpload v-model:value="archiveForm.fileUrl" :size="160" />
          <div class="text-12px text-gray-400 mt-4px">上传图片资料（小程序端展示缩略图）</div>
        </NFormItem>
        <NFormItem label="描述">
          <NInput v-model:value="archiveForm.description" type="textarea" :rows="2" placeholder="选填" maxlength="500" />
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-8px">
          <NButton @click="archiveModal = false">取消</NButton>
          <NButton type="primary" :loading="archiveSaving" @click="handleArchiveSave">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.session-line {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  background: #fafafa;
}
.stat-card {
  background: #f7f8fa;
}
</style>
