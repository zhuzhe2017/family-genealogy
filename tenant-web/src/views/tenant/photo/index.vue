<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NCard, NList, NListItem, NSpace, NSpin, NButton, NPagination, NEmpty } from 'naive-ui';
import { fetchTenantContents, deleteTenantContent, type ContentType } from '@/service/api';

const route = useRoute();
const props = defineProps<{ type: ContentType }>();

const familyId = ref<number>(0);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Record<string, unknown>[]>([]);

const titleMap: Record<ContentType, string> = {
  photo: '相册',
  document: '文档',
  event: '事件'
};

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchTenantContents(familyId.value, props.type, { page: page.value, pageSize: pageSize.value });
    list.value = data?.list || [];
    total.value = data?.total || 0;
  } finally {
    loading.value = false;
  }
}

async function remove(id: string) {
  await deleteTenantContent(familyId.value, props.type, id);
  await load();
}

function displayTitle(item: Record<string, unknown>): string {
  return String(item.title || item.name || item.id || '未命名');
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
    <NSpace justify="space-between" align="center">
      <h2 class="text-xl font-bold">{{ titleMap[type] }}</h2>
      <NButton type="primary" @click="$router.push(`/tenant/family/${familyId}/content/${type}/create`)">
        新增{{ titleMap[type] }}
      </NButton>
    </NSpace>
    <NSpin :show="loading">
      <NEmpty v-if="list.length === 0" description="暂无数据" />
      <NList v-else hoverable clickable>
        <NListItem v-for="item in list" :key="String(item.id)">
          <NCard :title="displayTitle(item)">
            <template #header-extra>
              <NSpace>
                <NButton text type="primary" @click.stop="$router.push(`/tenant/family/${familyId}/content/${type}/${item.id}`)">
                  详情
                </NButton>
                <NButton text type="error" @click.stop="remove(String(item.id))">
                  删除
                </NButton>
              </NSpace>
            </template>
            <p class="text-gray-600 truncate">
              {{ item.description || item.content || '' }}
            </p>
          </NCard>
        </NListItem>
      </NList>
      <div class="flex justify-end mt-4">
        <NPagination v-model:page="page" v-model:page-size="pageSize" :item-count="total" @update:page="load" @update:page-size="load" />
      </div>
    </NSpin>
  </NSpace>
</template>
