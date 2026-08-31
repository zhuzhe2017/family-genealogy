<script setup lang="ts">
import { h, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NDataTable, NButton, NSpace, NSpin, NTag, NSwitch, NPopconfirm } from 'naive-ui';
import { fetchTenantPermissions, setTenantPermissionRole, removeTenantPermission } from '@/service/api';
import type { TenantPermissionItem } from '@/service/api/tenant';

const route = useRoute();
const familyId = ref<number>(0);
const loading = ref(false);
const list = ref<TenantPermissionItem[]>([]);
const canManage = ref(false);
const familyName = ref('');

const roleMap: Record<string, { label: string; type: 'success' | 'warning' | 'default' }> = {
  creator: { label: '族长', type: 'warning' },
  admin: { label: '管理员', type: 'success' },
  member: { label: '普通成员', type: 'default' }
};

const columns = [
  {
    title: '用户',
    key: 'nickname',
    render: (row: TenantPermissionItem) => {
      return h('div', { class: 'flex items-center gap-8px' }, [
        row.avatarUrl ? h('img', { src: row.avatarUrl, class: 'w-32px h-32px rounded-full' }) : null,
        h('span', null, row.nickname || '-')
      ]);
    }
  },
  {
    title: '角色',
    key: 'role',
    render: (row: TenantPermissionItem) => {
      const config = roleMap[row.role] || roleMap.member;
      return h(NTag, { type: config.type }, { default: () => config.label });
    }
  },
  {
    title: '状态',
    key: 'status',
    render: (row: TenantPermissionItem) => {
      return h(NTag, { type: row.status === 1 ? 'success' : 'error' }, {
        default: () => (row.status === 1 ? '正常' : '已移除')
      });
    }
  },
  {
    title: '设为管理员',
    key: 'actions',
    render: (row: TenantPermissionItem) => {
      if (row.isCreator) return h('span', null, '族长不可修改');
      if (!canManage.value) return null;

      const isAdmin = row.role === 'admin' && row.status === 1;

      return h(NSpace, null, {
        default: () => [
          h(NSwitch, {
            value: isAdmin,
            disabled: loading.value,
            onUpdateValue: (v: boolean) => handleToggleRole(row.userId, v)
          }),
          h(
            NPopconfirm,
            {
              onPositiveClick: () => handleRemove(row.userId)
            },
            {
              trigger: () =>
                h(
                  NButton,
                  { text: true, type: 'error', disabled: row.role !== 'admin' },
                  { default: () => '移除权限' }
                ),
              default: () => '确定移除该管理员权限吗？'
            }
          )
        ]
      });
    }
  }
];

async function load() {
  if (!familyId.value) return;
  loading.value = true;
  try {
    const { data } = await fetchTenantPermissions(familyId.value);
    list.value = data?.list || [];
    canManage.value = data?.canManage ?? false;
    familyName.value = data?.familyName || '';
  } finally {
    loading.value = false;
  }
}

async function handleToggleRole(targetUserId: string, admin: boolean) {
  const role = admin ? 'admin' : 'member';
  const { error } = await setTenantPermissionRole(familyId.value, targetUserId, role);
  if (!error) {
    window.$message?.success?.(admin ? '已设为管理员' : '已取消管理员');
    await load();
  }
}

async function handleRemove(targetUserId: string) {
  const { error } = await removeTenantPermission(familyId.value, targetUserId);
  if (!error) {
    window.$message?.success?.('已移除权限');
    await load();
  }
}

watch(
  () => route.params.familyId,
  v => {
    const id = Number(v);
    if (id) {
      familyId.value = id;
      load();
    }
  },
  { immediate: true }
);

onMounted(load);
</script>

<template>
  <NSpace vertical size="large">
    <div class="text-lg font-bold">
      {{ familyName }} - 家族权限管理
    </div>
    <NSpin :show="loading">
      <NDataTable :columns="columns" :data="list" :bordered="false" />
    </NSpin>
    <div v-if="!canManage" class="text-sm text-gray">
      仅族长可管理管理员权限
    </div>
  </NSpace>
</template>
