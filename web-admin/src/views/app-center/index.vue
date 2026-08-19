<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn } from 'naive-ui';
import { useMessage, useDialog, NTag, NButton, NSpace, NSelect, NInput, NInputNumber, NForm, NFormItem, NDataTable, NModal, NSwitch, NCard } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchAdminPluginList,
  fetchCreateAdminPlugin,
  fetchUpdateAdminPlugin,
  fetchDeleteAdminPlugin
} from '@/service/api';
import type { AdminPluginItem, AdminPluginPayload } from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

// ===== 列表 =====
const loading = ref(false);
const data = ref<AdminPluginItem[]>([]);
const search = reactive({ status: null as number | null, keyword: '' });
const pagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const entryTypeLabels: Record<string, string> = { page: '小程序页面', url: '外部H5链接' };
const entryTypeTag: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary'> = {
  page: 'success',
  url: 'warning'
};
const entryTypeOptions = [
  { label: '小程序页面', value: 'page' },
  { label: '外部H5链接', value: 'url' }
];

function formatTime(v: string | null | undefined) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '-';
}

const columns: DataTableColumn<AdminPluginItem>[] = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '编码', key: 'code', width: 120, ellipsis: { tooltip: true } },
  {
    title: '图标', key: 'icon', width: 70, align: 'center',
    render: row => h('span', { style: 'font-size: 24px; line-height: 1' }, row.icon)
  },
  { title: '名称', key: 'name', minWidth: 120, ellipsis: { tooltip: true } },
  { title: '简介', key: 'description', minWidth: 160, ellipsis: { tooltip: true }, render: row => row.description || '-' },
  {
    title: '入口类型', key: 'entryType', width: 110, align: 'center',
    render: row => h(NTag, { type: entryTypeTag[row.entryType] || 'default', size: 'small', bordered: false }, { default: () => entryTypeLabels[row.entryType] || row.entryType })
  },
  { title: '入口地址', key: 'entryValue', width: 180, ellipsis: { tooltip: true } },
  { title: '排序', key: 'sortOrder', width: 70, align: 'center' },
  {
    title: '状态', key: 'status', width: 80, align: 'center',
    render: row => h(NTag, { type: row.status === 1 ? 'success' : 'default', size: 'small', bordered: false }, { default: () => row.status === 1 ? '启用' : '停用' })
  },
  { title: '创建时间', key: 'createTime', width: 170, render: row => formatTime(row.createTime) },
  {
    title: '操作', key: 'actions', width: 130, fixed: 'right',
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        hasAuth('system:app-plugin:update') ? h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openEdit(row) }, { default: () => '编辑' }) : null,
        hasAuth('system:app-plugin:delete') ? h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' }) : null
      ]
    })
  }
];

function handleSearch() { pagination.page = 1; loadList(); }
function handleReset() {
  search.status = null; search.keyword = '';
  pagination.page = 1; loadList();
}
function handlePageChange(page: number) { pagination.page = page; loadList(); }
function handlePageSizeChange(size: number) { pagination.pageSize = size; pagination.page = 1; loadList(); }

async function loadList() {
  loading.value = true;
  try {
    const { data: res } = await fetchAdminPluginList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: search.status ?? undefined,
      keyword: search.keyword || undefined
    });
    data.value = res?.list || [];
    pagination.itemCount = res?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '应用中心列表加载失败');
  } finally {
    loading.value = false;
  }
}

// ===== 新增 / 编辑弹窗 =====
const showModal = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<AdminPluginPayload>({
  code: '',
  name: '',
  icon: '',
  description: '',
  entryType: 'page',
  entryValue: '',
  sortOrder: 0,
  status: 1
});

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    code: '',
    name: '',
    icon: '',
    description: '',
    entryType: 'page',
    entryValue: '',
    sortOrder: 0,
    status: 1
  });
  showModal.value = true;
}

function openEdit(row: AdminPluginItem) {
  editingId.value = row.id;
  Object.assign(form, {
    code: row.code,
    name: row.name,
    icon: row.icon,
    description: row.description || '',
    entryType: row.entryType,
    entryValue: row.entryValue || '',
    sortOrder: row.sortOrder,
    status: row.status
  });
  showModal.value = true;
}

async function handleSave() {
  if (!/^[a-z0-9_-]{2,64}$/.test(form.code.trim())) {
    message.warning('应用编码需为 2-64 位小写字母/数字/下划线/中划线');
    return;
  }
  if (!form.name.trim()) {
    message.warning('请填写应用名称');
    return;
  }
  if (!form.icon.trim()) {
    message.warning('请填写应用图标（emoji 或图片URL）');
    return;
  }
  if (!form.entryValue.trim()) {
    message.warning('请填写入口地址');
    return;
  }
  if (form.entryType === 'page' && !form.entryValue.trim().startsWith('/')) {
    message.warning('小程序页面路径需以 / 开头');
    return;
  }
  if (form.entryType === 'url' && !/^https?:\/\//.test(form.entryValue.trim())) {
    message.warning('外部H5链接需以 http:// 或 https:// 开头');
    return;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      await fetchUpdateAdminPlugin(editingId.value, { ...form });
      message.success('更新成功');
    } else {
      await fetchCreateAdminPlugin({ ...form });
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

function handleDelete(row: AdminPluginItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除应用「${row.name}」吗？删除后不可恢复。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminPlugin(row.id);
        message.success('删除成功');
        loadList();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

onMounted(loadList);
</script>

<template>
  <div>
    <NCard title="应用中心" :bordered="false" class="mb-16px">
      <div class="flex items-center gap-12px flex-wrap">
        <NSelect v-model:value="search.status" :options="[{ label: '启用', value: 1 }, { label: '停用', value: 0 }]" placeholder="状态" clearable style="width: 120px" />
        <NInput v-model:value="search.keyword" placeholder="名称/编码关键字" clearable style="width: 180px" @keyup.enter="handleSearch" />
        <NButton type="primary" ghost @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
        <div class="flex-1" />
        <NButton v-if="hasAuth('system:app-plugin:create')" type="primary" @click="openCreate">新增应用</NButton>
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
        :scroll-x="1200"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <NModal v-model:show="showModal" preset="card" :title="editingId ? '编辑应用' : '新增应用'" style="width: min(92vw, 560px)" :mask-closable="false">
      <NForm label-placement="left" label-width="90px">
        <NFormItem label="应用编码">
          <NInput v-model:value="form.code" placeholder="如 compass、naming，唯一且创建后不可重复" maxlength="64" />
        </NFormItem>
        <NFormItem label="应用名称">
          <NInput v-model:value="form.name" placeholder="例如：电子罗盘" maxlength="64" />
        </NFormItem>
        <NFormItem label="应用图标">
          <NInput v-model:value="form.icon" placeholder="emoji 或图片URL，如 🧭" maxlength="255" />
          <div class="text-12px text-gray-400 mt-4px">小程序端以 emoji 底色块展示，推荐直接填 emoji</div>
        </NFormItem>
        <NFormItem label="应用简介">
          <NInput v-model:value="form.description" type="textarea" :rows="2" placeholder="一句话说明用途" maxlength="255" />
        </NFormItem>
        <NFormItem label="入口类型">
          <NSelect v-model:value="form.entryType" :options="entryTypeOptions" style="width: 180px" />
        </NFormItem>
        <NFormItem label="入口地址">
          <NInput v-model:value="form.entryValue" :placeholder="form.entryType === 'page' ? '小程序页面路径，如 /pages/compass/compass' : '外部H5链接，如 https://...'" maxlength="500" />
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
