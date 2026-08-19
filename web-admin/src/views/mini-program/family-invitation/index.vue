<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn } from 'naive-ui';
import { useMessage, useDialog, NTag, NButton, NSpace, NSelect, NInput, NDataTable, NCard } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import { fetchAdminInvitationList, fetchDeleteAdminInvitation } from '@/service/api';
import type { AdminInvitationItem } from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

// ===== 列表 =====
const loading = ref(false);
const data = ref<AdminInvitationItem[]>([]);
const search = reactive({ status: null as number | null, keyword: '' });
const pagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const statusLabels: Record<number, string> = { 0: '已失效', 1: '待接受', 2: '已接受', 3: '已拒绝', 4: '已过期' };
const statusTag: Record<number, 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary'> = {
  0: 'default',
  1: 'warning',
  2: 'success',
  3: 'error',
  4: 'info'
};
const statusOptions = [
  { label: '待接受', value: 1 },
  { label: '已接受', value: 2 },
  { label: '已拒绝', value: 3 },
  { label: '已过期', value: 4 },
  { label: '已失效', value: 0 }
];
const roleLabels: Record<string, string> = { member: '普通会员', admin: '家族管理员' };

function formatTime(v: string | null | undefined) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '-';
}

const columns: DataTableColumn<AdminInvitationItem>[] = [
  { title: 'ID', key: 'id', width: 60 },
  { title: '邀请码', key: 'inviteCode', width: 110, ellipsis: { tooltip: true } },
  { title: '家族', key: 'familyName', minWidth: 120, ellipsis: { tooltip: true }, render: row => row.familyName || `#${row.familyId}` },
  { title: '邀请人', key: 'inviterNickname', width: 100, ellipsis: { tooltip: true }, render: row => row.inviterNickname || row.inviterUserId },
  {
    title: '被邀请人', key: 'invitee', minWidth: 140, ellipsis: { tooltip: true },
    render: row => row.inviteeNickname || [row.inviteePhone, row.inviteeEmail].filter(Boolean).join(' / ') || '待填写'
  },
  {
    title: '角色', key: 'role', width: 90, align: 'center',
    render: row => h(NTag, { type: row.role === 'admin' ? 'warning' : 'default', size: 'small', bordered: false }, { default: () => roleLabels[row.role] || row.role })
  },
  {
    title: '状态', key: 'status', width: 80, align: 'center',
    render: row => h(NTag, { type: statusTag[row.status] || 'default', size: 'small', bordered: false }, { default: () => statusLabels[row.status] || row.status })
  },
  { title: '过期时间', key: 'expiresAt', width: 150, render: row => formatTime(row.expiresAt) },
  { title: '创建时间', key: 'createTime', width: 150, render: row => formatTime(row.createTime) },
  {
    title: '操作', key: 'actions', width: 90, fixed: 'right',
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        hasAuth('system:family-invitation:delete')
          ? h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
          : null
      ]
    })
  }
];

function handleSearch() {
  pagination.page = 1;
  loadList();
}
function handleReset() {
  search.status = null;
  search.keyword = '';
  pagination.page = 1;
  loadList();
}
function handlePageChange(page: number) {
  pagination.page = page;
  loadList();
}
function handlePageSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  loadList();
}

async function loadList() {
  loading.value = true;
  try {
    const { data: res } = await fetchAdminInvitationList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      status: search.status ?? undefined,
      keyword: search.keyword || undefined
    });
    data.value = res?.list || [];
    pagination.itemCount = res?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '家族邀请列表加载失败');
  } finally {
    loading.value = false;
  }
}

function handleDelete(row: AdminInvitationItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除邀请码「${row.inviteCode}」吗？删除后不可恢复。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminInvitation(row.id);
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
    <NCard title="家族邀请管理" :bordered="false" class="mb-16px">
      <div class="flex items-center gap-12px flex-wrap">
        <NSelect v-model:value="search.status" :options="statusOptions" placeholder="状态" clearable style="width: 120px" />
        <NInput v-model:value="search.keyword" placeholder="邀请码/家族/昵称关键字" clearable style="width: 200px" @keyup.enter="handleSearch" />
        <NButton type="primary" ghost @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
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
        :scroll-x="1100"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>
  </div>
</template>
