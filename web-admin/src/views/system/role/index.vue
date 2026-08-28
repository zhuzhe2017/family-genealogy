<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import { useMessage, useDialog, NButton, NSpace } from 'naive-ui';
import {
  fetchRoleList,
  fetchCreateRole,
  fetchUpdateRole,
  fetchDeleteRole,
  fetchPermissionList,
  fetchAssignPermissions
} from '@/service/api';
import type { RoleItem, PermissionItem } from '@/service/api';

const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const tableData = ref<RoleItem[]>([]);

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
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }]
};

const showPermissionModal = ref(false);
const permissionLoading = ref(false);
const assigning = ref(false);
const permissionList = ref<PermissionItem[]>([]);
const selectedPermissions = ref<number[]>([]);
const currentRoleId = ref<number | null>(null);

const columns: DataTableColumn<RoleItem>[] = [
  { title: '角色名称', key: 'name', width: 160 },
  { title: '角色编码', key: 'code', width: 160 },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: row => (row.status === 1 ? '启用' : '禁用')
  },
  {
    title: '权限',
    key: 'permissions',
    ellipsis: { tooltip: true },
    render: row => row.permissions?.map(p => p.name).join('、') || '-'
  },
  {
    title: '操作',
    key: 'actions',
    width: 220,
    render: row => h(NSpace, null, {
      default: () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
        h(NButton, { size: 'small', onClick: () => handleAssignPermission(row) }, { default: () => '分配权限' }),
        h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
      ]
    })
  }
];

async function loadData() {
  loading.value = true;
  try {
    const res = await fetchRoleList();
    tableData.value = res.data || [];
  } catch (err: any) {
    message.error(err?.msg || '加载角色列表失败');
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

function handleEdit(row: RoleItem) {
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
      await fetchUpdateRole(editId.value, formData);
      message.success('更新成功');
    } else {
      await fetchCreateRole(formData);
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

function handleDelete(row: RoleItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除角色「${row.name}」吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteRole(row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

async function handleAssignPermission(row: RoleItem) {
  currentRoleId.value = row.id;
  showPermissionModal.value = true;
  permissionLoading.value = true;
  selectedPermissions.value = row.permissionIds || [];
  try {
    const res = await fetchPermissionList();
    permissionList.value = res.data || [];
  } catch (err: any) {
    message.error(err?.msg || '加载权限列表失败');
  } finally {
    permissionLoading.value = false;
  }
}

async function handleAssignSubmit() {
  if (!currentRoleId.value) return;
  assigning.value = true;
  try {
    await fetchAssignPermissions(currentRoleId.value, selectedPermissions.value);
    message.success('分配成功');
    showPermissionModal.value = false;
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '分配失败');
  } finally {
    assigning.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div>
    <NCard :bordered="false" title="角色管理">
      <template #header-extra>
        <NButton type="primary" @click="handleAdd">新增角色</NButton>
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

    <NModal v-model:show="showModal" :title="isEdit ? '编辑角色' : '新增角色'" :mask-closable="false" preset="card" style="width: 520px">
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px" require-mark-placement="right-hanging">
        <NFormItem label="角色名称" path="name">
          <NInput v-model:value="formData.name" placeholder="请输入角色名称" />
        </NFormItem>
        <NFormItem label="角色编码" path="code">
          <NInput v-model:value="formData.code" placeholder="如 admin" />
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

    <NModal v-model:show="showPermissionModal" title="分配权限" :mask-closable="false" preset="card" style="width: 520px">
      <NSpin :show="permissionLoading">
        <NCheckboxGroup v-model:value="selectedPermissions">
          <NSpace vertical>
            <NCheckbox v-for="item in permissionList" :key="item.id" :value="item.id">{{ item.name }}（{{ item.code }}）</NCheckbox>
          </NSpace>
        </NCheckboxGroup>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showPermissionModal = false">取消</NButton>
          <NButton type="primary" :loading="assigning" @click="handleAssignSubmit">确认</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
