<script setup lang="ts">
import { h, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NDataTable, NButton, NSpace, NInput, NSpin, NPagination, NTag } from 'naive-ui';
import { fetchTenantMembers, deleteTenantMember } from '@/service/api';

const route = useRoute();
const familyId = ref<number>(0);
const loading = ref(false);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Api.Tenant.MemberItem[]>([]);

const columns = [
  { title: '姓名', key: 'name' },
  { title: '性别', key: 'gender', render: (row: Api.Tenant.MemberItem) => (row.gender === 'male' ? '男' : '女') },
  { title: '代数', key: 'generation' },
  { title: '字辈', key: 'generation_name' },
  { title: '状态', key: 'is_alive', render: (row: Api.Tenant.MemberItem) => (row.is_alive === 1 ? '在世' : '已故') },
  {
    title: '操作',
    key: 'actions',
    render: (row: Api.Tenant.MemberItem) => {
      return h(NSpace, null, {
        default: () => [
          h(NButton, { text: true, type: 'primary', onClick: () => viewDetail(row.id) }, { default: () => '详情' }),
          h(NButton, { text: true, type: 'error', onClick: () => handleDelete(row.id) }, { default: () => '删除' })
        ]
      });
    }
  }
];

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchTenantMembers(familyId.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value
    });
    list.value = data?.list || [];
    total.value = data?.total || 0;
  } finally {
    loading.value = false;
  }
}

function viewDetail(id: string) {
  console.log('view detail', id);
}

async function handleDelete(id: string) {
  await deleteTenantMember(familyId.value, id);
  await load();
}

function search() {
  page.value = 1;
  load();
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
    <NSpace>
      <NInput v-model:value="keyword" placeholder="搜索姓名" @keyup.enter="search" />
      <NButton type="primary" @click="search">
        搜索
      </NButton>
      <NButton type="primary" @click="$router.push(`/tenant/family/${familyId}/members/create`)">
        新增成员
      </NButton>
    </NSpace>
    <NSpin :show="loading">
      <NDataTable :columns="columns" :data="list" :bordered="false" />
      <div class="flex justify-end mt-4">
        <NPagination v-model:page="page" v-model:page-size="pageSize" :item-count="total" @update:page="load" @update:page-size="search" />
      </div>
    </NSpin>
  </NSpace>
</template>
