<script setup lang="ts">
import { h, ref, reactive, onMounted, computed } from 'vue';
import type { DataTableColumn, FormInst, FormRules } from 'naive-ui';
import { useMessage, useDialog, NButton, NSpace, NSwitch, NTag, NSelect } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchAdminList,
  fetchCreateAdmin,
  fetchUpdateAdmin,
  fetchBindAdminFamily,
  fetchAdminFamilies,
  fetchAllFamilies,
  type AdminItem,
  type FamilyOption
} from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

// 权限
const canCreate = computed(() => hasAuth('system:admin:create'));
const canUpdate = computed(() => hasAuth('system:admin:update'));
const canBindFamily = computed(() => hasAuth('system:admin:bind-family'));
const canListFamily = computed(() => hasAuth('system:admin:family'));

const loading = ref(false);
const tableData = ref<AdminItem[]>([]);
const pagination = reactive({ page: 1, pageSize: 10, itemCount: 0 });

const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<number | null>(null);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);
const formData = reactive({
  username: '',
  password: '',
  nickname: '',
  phone: '',
  email: '',
  role: 'admin',
  status: 1
});

const roleOptions = [
  { label: '超级管理员', value: 'super' },
  { label: '管理员', value: 'admin' }
];

const roleValueMap: Record<string, string> = { super: '超级管理员', admin: '管理员' };

const editStatusText = computed(() => (formData.status === 1 ? '启用' : '禁用'));

const formRules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
};

const columns: DataTableColumn<AdminItem>[] = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '账号', key: 'username', width: 160 },
  { title: '昵称', key: 'nickname', width: 140 },
  { title: '角色', key: 'role', width: 120, render: row => roleValueMap[row.role] || row.role },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: row =>
      h(
        NTag,
        { type: row.status === 1 ? 'success' : 'error', size: 'small' },
        { default: () => (row.status === 1 ? '启用' : '禁用') }
      )
  },
  { title: '手机号', key: 'phone', width: 140 },
  { title: '邮箱', key: 'email', ellipsis: { tooltip: true } },
  { title: '最后登录时间', key: 'lastLoginTime', width: 180 },
  { title: '创建时间', key: 'createTime', width: 180 },
  {
    title: '操作',
    key: 'actions',
    width: 260,
    render: row =>
      h(NSpace, null, {
        default: () => [
          canUpdate.value && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
          canBindFamily.value && h(NButton, { size: 'small', onClick: () => handleBindFamily(row) }, { default: () => '绑定家族' }),
          h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
        ]
      })
  }
];

async function loadData() {
  loading.value = true;
  try {
    const { data } = await fetchAdminList(pagination.page, pagination.pageSize);
    if (data) {
      tableData.value = data.list || [];
      pagination.itemCount = data.total || 0;
    }
  } catch (err: any) {
    message.error(err?.msg || '加载管理员列表失败');
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  formData.username = '';
  formData.password = '';
  formData.nickname = '';
  formData.phone = '';
  formData.email = '';
  formData.role = 'admin';
  formData.status = 1;
}

function handleAdd() {
  isEdit.value = false;
  editId.value = null;
  resetForm();
  showModal.value = true;
}

function handleEdit(row: AdminItem) {
  isEdit.value = true;
  editId.value = row.id;
  formData.username = row.username;
  formData.password = '';
  formData.nickname = row.nickname || '';
  formData.phone = row.phone || '';
  formData.email = row.email || '';
  formData.role = row.role || 'admin';
  formData.status = row.status ?? 1;
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
      const updateData: Parameters<typeof fetchUpdateAdmin>[1] = {
        nickname: formData.nickname,
        phone: formData.phone,
        email: formData.email,
        role: formData.role,
        status: formData.status
      };
      await fetchUpdateAdmin(editId.value, updateData);
      message.success('更新成功');
    } else {
      await fetchCreateAdmin({
        username: formData.username,
        password: formData.password,
        nickname: formData.nickname,
        phone: formData.phone,
        email: formData.email,
        role: formData.role
      });
      message.success('创建成功');
    }
    showModal.value = false;
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  } finally {
    submitting.value = false;
  }
}

function handleDelete(row: AdminItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除管理员「${row.username}」吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        // 后端暂未提供删除接口，需后续补充
        message.warning('删除接口暂未实现');
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

// 绑定家族
const showFamilyModal = ref(false);
const familyLoading = ref(false);
const familySubmitting = ref(false);
const familyOptions = ref<FamilyOption[]>([]);
const selectedFamilyIds = ref<number[]>([]);
const currentAdminId = ref<number | null>(null);

async function handleBindFamily(row: AdminItem) {
  currentAdminId.value = row.id;
  showFamilyModal.value = true;
  familyLoading.value = true;
  selectedFamilyIds.value = [];
  try {
    const [allRes, adminRes] = await Promise.all([
      fetchAllFamilies(),
      canListFamily.value ? fetchAdminFamilies() : Promise.resolve({ data: [] })
    ]);
    const allFamilies = allRes.data || [];
    familyOptions.value = allFamilies as unknown as FamilyOption[];
    const owned = (adminRes.data || []) as unknown as FamilyOption[];
    selectedFamilyIds.value = owned.filter(f => allFamilies.some(a => a.id === f.id)).map(f => f.id);
  } catch (err: any) {
    message.error(err?.msg || '加载家族列表失败');
  } finally {
    familyLoading.value = false;
  }
}

async function handleBindFamilySubmit() {
  if (!currentAdminId.value) return;
  familySubmitting.value = true;
  try {
    await fetchBindAdminFamily(currentAdminId.value, selectedFamilyIds.value);
    message.success('绑定成功');
    showFamilyModal.value = false;
  } catch (err: any) {
    message.error(err?.msg || '绑定失败');
  } finally {
    familySubmitting.value = false;
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

onMounted(() => {
  loadData();
});
</script>

<template>
  <div>
    <NCard :bordered="false" title="管理员管理">
      <template #header-extra>
        <NButton v-if="canCreate" type="primary" @click="handleAdd">新增管理员</NButton>
      </template>

      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        :row-key="row => row.id"
        :bordered="false"
        :single-line="false"
        :remote="true"
        :pagination="pagination"
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- 新增/编辑管理员 -->
    <NModal v-model:show="showModal" :title="isEdit ? '编辑管理员' : '新增管理员'" :mask-closable="false" preset="card" style="width: 520px">
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px" require-mark-placement="right-hanging">
        <NFormItem label="账号" path="username">
          <NInput v-model:value="formData.username" :disabled="isEdit" placeholder="请输入登录账号" />
        </NFormItem>
        <NFormItem v-if="!isEdit" label="密码" path="password">
          <NInput v-model:value="formData.password" type="password" show-password-on="click" placeholder="请输入初始密码" />
        </NFormItem>
        <NFormItem label="昵称">
          <NInput v-model:value="formData.nickname" placeholder="请输入昵称" />
        </NFormItem>
        <NFormItem label="手机号">
          <NInput v-model:value="formData.phone" placeholder="请输入手机号" />
        </NFormItem>
        <NFormItem label="邮箱">
          <NInput v-model:value="formData.email" placeholder="请输入邮箱" />
        </NFormItem>
        <NFormItem label="角色" path="role">
          <NSelect v-model:value="formData.role" :options="roleOptions" />
        </NFormItem>
        <NFormItem label="状态">
          <NSwitch v-model:value="formData.status" :checked-value="1" :unchecked-value="0" />
          <span class="ml-8px text-#666">{{ editStatusText }}</span>
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" :loading="submitting" @click="handleSubmit">确认</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 绑定家族 -->
    <NModal v-model:show="showFamilyModal" title="绑定家族" :mask-closable="false" preset="card" style="width: 480px">
      <NSpin :show="familyLoading">
        <NCheckboxGroup v-model:value="selectedFamilyIds">
          <NSpace vertical>
            <NCheckbox v-for="item in familyOptions" :key="item.id" :value="item.id">{{ item.name }}（成员 {{ item.memberCount }} / 字辈 {{ item.genCount }}）</NCheckbox>
          </NSpace>
        </NCheckboxGroup>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showFamilyModal = false">取消</NButton>
          <NButton type="primary" :loading="familySubmitting" @click="handleBindFamilySubmit">确认</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>
