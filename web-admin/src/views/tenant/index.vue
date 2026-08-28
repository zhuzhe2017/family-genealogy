<script setup lang="ts">
import { h, ref, reactive, onMounted, computed } from 'vue';
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui';
import { useMessage, useDialog, NButton, NSpace, NSwitch, NTag, NImage, NDataTable, NInput, NSelect, NForm, NFormItem, NModal, NCard } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchTenantList,
  fetchUpdateTenant,
  fetchDeleteTenant,
  fetchRestoreTenant,
  fetchToggleTenantPublic,
  type TenantItem,
  type UpdateTenantData
} from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

const canUpdate = computed(() => hasAuth('system:family:update'));
const canDelete = computed(() => hasAuth('system:family:delete'));

const loading = ref(false);
const tableData = ref<TenantItem[]>([]);
const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  pageSizes: [10, 20, 50, 100],
  showSizePicker: true,
  showQuickJumper: true,
  prefix: () => '共 '
});
const search = reactive({ keyword: '', status: -1 as number, isPublic: null as number | null });

const showModal = ref(false);
const editId = ref<number | null>(null);
const formRef = ref<FormInst | null>(null);
const formData = reactive<UpdateTenantData>({
  name: '',
  logo: '',
  founder: '',
  hallName: '',
  origin: '',
  description: '',
  isPublic: 1,
  allowJoin: 1,
  status: 1
});

const statusOptions = [
  { label: '全部', value: -1 },
  { label: '正常', value: 1 },
  { label: '已停用', value: 0 }
];

const publicOptions = [
  { label: '全部', value: -1 },
  { label: '公开', value: 1 },
  { label: '私密', value: 0 }
];

const formRules: FormRules = {
  name: [{ required: true, message: '请输入租户名称', trigger: 'blur' }]
};

const columns: DataTableColumn<TenantItem>[] = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '名称', key: 'name', ellipsis: { tooltip: true }, width: 180 },
  { title: '姓氏', key: 'surname_name', width: 100 },
  { title: '始祖', key: 'founder', width: 120 },
  { title: '堂号', key: 'hall_name', width: 140 },
  {
    title: 'LOGO',
    key: 'logo',
    width: 80,
    render: row =>
      row.logo
        ? h(NImage, { src: row.logo, width: 48, height: 48, style: 'border-radius:4px;', objectFit: 'cover' })
        : '-'
  },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: row =>
      h(NTag, { type: row.status === 1 ? 'success' : 'error', size: 'small' }, { default: () => (row.status === 1 ? '正常' : '已停用') })
  },
  {
    title: '公开',
    key: 'is_public',
    width: 100,
    render: row =>
      h(NSwitch, {
        value: row.is_public === 1,
        disabled: !canUpdate.value,
        onUpdateValue: () => handleTogglePublic(row)
      })
  },
  { title: '成员数', key: 'realMemberCount', width: 90 },
  { title: '相册', key: 'photoCount', width: 80 },
  { title: '文档', key: 'documentCount', width: 80 },
  { title: '事件', key: 'eventCount', width: 80 },
  { title: '管理员', key: 'adminCount', width: 90 },
  { title: '种子码', key: 'seed_share_code', width: 160, ellipsis: { tooltip: true } },
  { title: '创建时间', key: 'create_time', width: 180 },
  {
    title: '操作',
    key: 'actions',
    fixed: 'right',
    width: 200,
    render: row =>
      h(NSpace, null, {
        default: () => [
          h(
            NButton,
            { text: true, type: 'primary', size: 'small', disabled: !canUpdate.value, onClick: () => handleEdit(row) },
            { default: () => '编辑' }
          ),
          row.status === 1
            ? h(
                NButton,
                { text: true, type: 'error', size: 'small', disabled: !canDelete.value, onClick: () => handleDelete(row) },
                { default: () => '停用' }
              )
            : h(
                NButton,
                { text: true, type: 'warning', size: 'small', disabled: !canUpdate.value, onClick: () => handleRestore(row) },
                { default: () => '恢复' }
              )
        ]
      })
  }
];

async function loadData() {
  loading.value = true;
  try {
    const { data } = await fetchTenantList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: search.keyword || undefined,
      status: search.status === -1 ? -1 : search.status,
      isPublic: search.isPublic === null || search.isPublic === -1 ? undefined : search.isPublic
    });
    tableData.value = data?.list || [];
    pagination.itemCount = data?.total || 0;
  } finally {
    loading.value = false;
  }
}

function handlePageChange(page: number) {
  pagination.page = page;
  loadData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  loadData();
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  search.keyword = '';
  search.status = -1;
  search.isPublic = null;
  handleSearch();
}

function handleEdit(row: TenantItem) {
  editId.value = row.id;
  formData.name = row.name;
  formData.logo = row.logo || '';
  formData.founder = row.founder || '';
  formData.hallName = row.hall_name || '';
  formData.origin = row.origin || '';
  formData.description = row.description || '';
  formData.isPublic = row.is_public;
  formData.allowJoin = row.allow_join;
  formData.status = row.status;
  showModal.value = true;
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  if (editId.value === null) {
    message.error('未选择租户');
    return;
  }

  const { error } = await fetchUpdateTenant(editId.value, { ...formData });
  if (!error) {
    message.success('保存成功');
    showModal.value = false;
    loadData();
  }
}

function handleDelete(row: TenantItem) {
  dialog.warning({
    title: '确认停用',
    content: `停用后该租户数据不可继续操作，确定停用「${row.name}」吗？`,
    positiveText: '确认停用',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await fetchDeleteTenant(row.id);
      if (!error) {
        message.success('已停用');
        loadData();
      }
    }
  });
}

function handleRestore(row: TenantItem) {
  dialog.warning({
    title: '确认恢复',
    content: `恢复后该租户将重新启用，确定恢复「${row.name}」吗？`,
    positiveText: '确认恢复',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await fetchRestoreTenant(row.id);
      if (!error) {
        message.success('已恢复');
        loadData();
      }
    }
  });
}

async function handleTogglePublic(row: TenantItem) {
  const { error } = await fetchToggleTenantPublic(row.id);
  if (!error) {
    message.success('状态已更新');
    loadData();
  }
}

onMounted(loadData);
</script>

<template>
  <div class="flex flex-col gap-16px p-16px">
    <NCard :bordered="false">
      <NForm inline label-placement="left" :model="search">
        <NFormItem label="租户名称/始祖/发源地">
          <NInput v-model:value="search.keyword" placeholder="请输入租户名称、始祖或发源地" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect v-model:value="search.status" :options="statusOptions" placeholder="状态" style="width: 140px" />
        </NFormItem>
        <NFormItem label="公开状态">
          <NSelect v-model:value="search.isPublic" :options="publicOptions" placeholder="全部" clearable style="width: 140px" />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">查询</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>

    <NCard :bordered="false" title="租户管理">
      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        :row-key="row => row.id"
        :pagination="pagination"
        :remote="true"
        :scroll-x="1800"
        striped
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <NModal v-model:show="showModal" title="编辑租户" preset="card" style="width: 600px" :mask-closable="false">
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px">
        <NFormItem label="租户名称" path="name">
          <NInput v-model:value="formData.name" placeholder="请输入租户名称" maxlength="100" />
        </NFormItem>
        <NFormItem label="LOGO">
          <NInput v-model:value="formData.logo" placeholder="图片 URL" />
        </NFormItem>
        <NFormItem label="始祖">
          <NInput v-model:value="formData.founder" placeholder="始祖姓名" maxlength="50" />
        </NFormItem>
        <NFormItem label="堂号">
          <NInput v-model:value="formData.hallName" placeholder="堂号" maxlength="50" />
        </NFormItem>
        <NFormItem label="发源地">
          <NInput v-model:value="formData.origin" placeholder="发源地" maxlength="200" />
        </NFormItem>
        <NFormItem label="简介">
          <NInput v-model:value="formData.description" type="textarea" placeholder="家族简介" maxlength="500" />
        </NFormItem>
        <NFormItem label="公开">
          <NSwitch v-model:value="formData.isPublic" :checked-value="1" :unchecked-value="0" />
        </NFormItem>
        <NFormItem label="允许加入">
          <NSwitch v-model:value="formData.allowJoin" :checked-value="1" :unchecked-value="0" />
        </NFormItem>
        <NFormItem label="状态">
          <NSwitch v-model:value="formData.status" :checked-value="1" :unchecked-value="0">
            <template #checked>正常</template>
            <template #unchecked>已停用</template>
          </NSwitch>
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-12px">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="handleSubmit">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
