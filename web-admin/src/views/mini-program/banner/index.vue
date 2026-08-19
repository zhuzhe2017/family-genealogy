<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn } from 'naive-ui';
import { useMessage, useDialog, NTag, NButton, NSpace, NImage, NSelect, NInput, NInputNumber, NForm, NFormItem, NDataTable, NModal, NSwitch, NDatePicker, NCard } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import { resolveImageUrl } from '@/utils/image-url';
import ImageUpload from '@/components/common/image-upload/index.vue';
import {
  fetchAllFamilies,
  fetchAdminBannerList,
  fetchCreateAdminBanner,
  fetchUpdateAdminBanner,
  fetchDeleteAdminBanner
} from '@/service/api';
import type { AdminBannerItem, AdminBannerPayload } from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

const noImageUrl = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2220%22 y=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22central%22 fill=%22%23999%22 font-size=%2212%22%3E无%3C/text%3E%3C/svg%3E';

// ===== 家族下拉 =====
const familyOptions = ref<{ label: string; value: number }[]>([]);
async function loadFamilyOptions() {
  try {
    const { data } = await fetchAllFamilies({ status: 1 });
    familyOptions.value = [
      { label: '全局广告（所有家族）', value: 0 },
      ...(data || []).map((f: any) => ({ label: `${f.name}（ID ${f.id}）`, value: f.id }))
    ];
  } catch {
    familyOptions.value = [{ label: '全局广告（所有家族）', value: 0 }];
  }
}

// ===== 列表 =====
const loading = ref(false);
const data = ref<AdminBannerItem[]>([]);
const search = reactive({ familyId: null as number | null, status: null as number | null, keyword: '' });
const pagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const linkTypeLabels: Record<string, string> = { none: '无跳转', page: '小程序页面', url: '外部链接' };
const linkTypeTag: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary'> = {
  none: 'default',
  page: 'success',
  url: 'warning'
};
const linkTypeOptions = [
  { label: '无跳转', value: 'none' },
  { label: '小程序页面', value: 'page' },
  { label: '外部链接', value: 'url' }
];

function formatTime(v: string | null | undefined) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '-';
}

const columns: DataTableColumn<AdminBannerItem>[] = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '家族', key: 'familyId', width: 150, ellipsis: { tooltip: true }, render: row => row.familyId === 0 ? '全局' : `#${row.familyId}` },
  { title: '图片', key: 'imageUrl', width: 110, align: 'center', render: row => h(NImage, { src: resolveImageUrl(row.imageUrl) || noImageUrl, width: 80, height: 46, objectFit: 'cover', fallbackSrc: noImageUrl }) },
  { title: '标题', key: 'title', minWidth: 140, ellipsis: { tooltip: true } },
  {
    title: '跳转', key: 'linkType', width: 100, align: 'center',
    render: row => h(NTag, { type: linkTypeTag[row.linkType] || 'default', size: 'small', bordered: false }, { default: () => linkTypeLabels[row.linkType] || row.linkType })
  },
  { title: '跳转地址', key: 'linkUrl', width: 150, ellipsis: { tooltip: true }, render: row => row.linkUrl || '-' },
  { title: '点击', key: 'clickCount', width: 80, align: 'center', render: row => row.clickCount ?? 0 },
  { title: '排序', key: 'sortOrder', width: 70, align: 'center' },
  {
    title: '状态', key: 'status', width: 80, align: 'center',
    render: row => h(NTag, { type: row.status === 1 ? 'success' : 'default', size: 'small', bordered: false }, { default: () => row.status === 1 ? '启用' : '停用' })
  },
  { title: '生效时间', key: 'startTime', width: 170, render: row => formatTime(row.startTime) },
  { title: '失效时间', key: 'endTime', width: 170, render: row => formatTime(row.endTime) },
  { title: '创建时间', key: 'createTime', width: 170, render: row => formatTime(row.createTime) },
  {
    title: '操作', key: 'actions', width: 130, fixed: 'right',
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        hasAuth('system:family-banner:update') ? h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openEdit(row) }, { default: () => '编辑' }) : null,
        hasAuth('system:family-banner:delete') ? h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' }) : null
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
    const { data: res } = await fetchAdminBannerList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      familyId: search.familyId ?? undefined,
      status: search.status ?? undefined,
      keyword: search.keyword || undefined
    });
    data.value = res?.list || [];
    pagination.itemCount = res?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '广告列表加载失败');
  } finally {
    loading.value = false;
  }
}

// ===== 新增 / 编辑弹窗 =====
const showModal = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<AdminBannerPayload>({
  familyId: 0,
  title: '',
  imageUrl: '',
  linkType: 'none',
  linkUrl: '',
  sortOrder: 0,
  status: 1,
  startTime: null,
  endTime: null
});
const timeRange = ref<[number, number] | null>(null);

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    familyId: 0,
    title: '',
    imageUrl: '',
    linkType: 'none',
    linkUrl: '',
    sortOrder: 0,
    status: 1,
    startTime: null,
    endTime: null
  });
  timeRange.value = null;
  showModal.value = true;
}

function openEdit(row: AdminBannerItem) {
  editingId.value = row.id;
  Object.assign(form, {
    familyId: row.familyId,
    title: row.title,
    imageUrl: row.imageUrl,
    linkType: row.linkType,
    linkUrl: row.linkUrl || '',
    sortOrder: row.sortOrder,
    status: row.status,
    startTime: row.startTime,
    endTime: row.endTime
  });
  timeRange.value = (row.startTime && row.endTime) ? [new Date(row.startTime).getTime(), new Date(row.endTime).getTime()] : null;
  showModal.value = true;
}

function handleTimeChange(v: [number, number] | null) {
  timeRange.value = v;
  if (v && v.length === 2) {
    form.startTime = formatTs(v[0]);
    form.endTime = formatTs(v[1]);
  } else {
    form.startTime = null;
    form.endTime = null;
  }
}

function formatTs(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

async function handleSave() {
  if (!form.familyId && form.familyId !== 0) {
    message.warning('请选择家族');
    return;
  }
  if (!form.title.trim()) {
    message.warning('请填写广告标题');
    return;
  }
  if (!form.imageUrl.trim()) {
    message.warning('请上传广告图片');
    return;
  }
  if ((form.linkType === 'page' || form.linkType === 'url') && !form.linkUrl?.trim()) {
    message.warning('请填写跳转地址');
    return;
  }
  const linkUrl = form.linkUrl?.trim() || '';
  if (form.linkType === 'page' && !linkUrl.startsWith('/')) {
    message.warning('小程序页面路径需以 / 开头');
    return;
  }
  if (form.linkType === 'url' && !/^https?:\/\//.test(linkUrl)) {
    message.warning('外部链接需以 http:// 或 https:// 开头');
    return;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      await fetchUpdateAdminBanner(editingId.value, form);
      message.success('更新成功');
    } else {
      await fetchCreateAdminBanner(form);
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

function handleDelete(row: AdminBannerItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除广告「${row.title}」吗？删除后不可恢复。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminBanner(row.id);
        message.success('删除成功');
        loadList();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
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
    <NCard title="广告轮播管理" :bordered="false" class="mb-16px">
      <div class="flex items-center gap-12px flex-wrap">
        <NSelect v-model:value="search.familyId" :options="familyOptions" placeholder="选择家族" clearable style="width: 220px" />
        <NSelect v-model:value="search.status" :options="[{ label: '启用', value: 1 }, { label: '停用', value: 0 }]" placeholder="状态" clearable style="width: 120px" />
        <NInput v-model:value="search.keyword" placeholder="标题关键字" clearable style="width: 180px" @keyup.enter="handleSearch" />
        <NButton type="primary" ghost @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
        <div class="flex-1" />
        <NButton v-if="hasAuth('system:family-banner:create')" type="primary" @click="openCreate">新增广告</NButton>
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
        :scroll-x="1500"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <NModal v-model:show="showModal" preset="card" :title="editingId ? '编辑广告' : '新增广告'" style="width: min(92vw, 560px)" :mask-closable="false">
      <NForm label-placement="left" label-width="90px">
        <NFormItem label="所属家族">
          <NSelect v-model:value="form.familyId" :options="familyOptions" placeholder="选择家族（含全局广告）" />
        </NFormItem>
        <NFormItem label="广告标题">
          <NInput v-model:value="form.title" placeholder="例如：家族文化节活动" maxlength="100" />
        </NFormItem>
        <NFormItem label="广告图片">
          <ImageUpload v-model:value="form.imageUrl" :size="160" :min-width="750" :min-height="260" />
          <div class="text-12px text-gray-400 mt-4px">推荐尺寸 750×260 像素（约 2.88:1），以保证小程序端展示完整不被拉伸</div>
        </NFormItem>
        <NFormItem label="跳转类型">
          <NSelect v-model:value="form.linkType" :options="linkTypeOptions" style="width: 180px" />
        </NFormItem>
        <NFormItem v-if="form.linkType === 'page' || form.linkType === 'url'" label="跳转地址">
          <NInput v-model:value="form.linkUrl" placeholder="小程序页面路径，如 /pages/worship/worship；或外部链接" maxlength="500" />
        </NFormItem>
        <NFormItem label="排序值">
          <NInputNumber v-model:value="form.sortOrder" :min="0" :max="9999" style="width: 160px" />
        </NFormItem>
        <NFormItem label="状态">
          <NSwitch v-model:value="form.status" :checked-value="1" :unchecked-value="0">
            <template #checked>启用</template>
            <template #unchecked>停用</template>
          </NSwitch>
        </NFormItem>
        <NFormItem label="有效期">
          <NDatePicker v-model:value="timeRange" type="datetimerange" clearable style="width: 100%" @update:value="handleTimeChange" />
          <div class="text-12px text-gray-400 mt-4px">不选择则永久有效</div>
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-8px">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
