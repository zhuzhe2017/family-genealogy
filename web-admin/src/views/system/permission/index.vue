<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import { useMessage, useDialog, NButton, NSpace } from 'naive-ui';
import { fetchPermissionList, fetchCreatePermission, fetchUpdatePermission, fetchDeletePermission } from '@/service/api';
import type { PermissionItem } from '@/service/api';

const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const tableData = ref<PermissionItem[]>([]);

const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<number | null>(null);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);
const formData = reactive({
  name: '',
  code: '',
  status: 1
});
const formRules = {
  name: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入权限编码', trigger: 'blur' }]
};

const columns: DataTableColumn<PermissionItem>[] = [
  { title: '权限名称', key: 'name', width: 180 },
  { title: '权限编码', key: 'code', ellipsis: { tooltip: true } },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: row => (row.status === 1 ? '启用' : '禁用')
  },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    render: row => h(NSpace, null, {
      default: () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
      ]
    })
  }
];

async function loadData() {
  loading.value = true;
  try {
    const res = await fetchPermissionList();
    tableData.value = res.data || [];
  } catch (err: any) {
    message.error(err?.msg || '加载权限列表失败');
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  formData.name = '';
  formData.code = '';
  formData.status = 1;
}

function handleAdd() {
  isEdit.value = false;
  editId.value = null;
  resetForm();
  showModal.value = true;
}

function handleEdit(row: PermissionItem) {
  isEdit.value = true;
  editId.value = row.id;
  formData.name = row.name;
  formData.code = row.code;
  formData.status = row.status;
  showModal.value = true;
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    if (isEdit.value && editId.value) {
      await fetchUpdatePermission(editId.value, formData);
      message.success('更新成功');
    } else {
      await fetchCreatePermission(formData);
      message.success('新增成功');
    }
    showModal.value = false;
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  } finally {
    submitting.value = false;
  }
}

function handleDelete(row: PermissionItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除权限「${row.name}」吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeletePermission(row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div>
    <NCard :bordered="false" title="权限管理">
      <template #header-extra>
        <NButton type="primary" @click="handleAdd">新增权限</NButton>
      </template>

      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        :row-key="row => row.id"
        :bordered="false"
        :single-line="false"
      />
    </NCard>

    <NModal v-model:show="showModal" :title="isEdit ? '编辑权限' : '新增权限'" :mask-closable="false" preset="card" style="width: 520px">
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px" require-mark-placement="right-hanging">
        <NFormItem label="权限名称" path="name">
          <NInput v-model:value="formData.name" placeholder="请输入权限名称" />
        </NFormItem>
        <NFormItem label="权限编码" path="code">
          <NInput v-model:value="formData.code" placeholder="如 system:menu:list" />
        </NFormItem>
        <NFormItem label="状态">
          <NSwitch v-model:value="formData.status" :checked-value="1" :unchecked-value="0" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" :loading="submitting" @click="handleSubmit">确认</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
