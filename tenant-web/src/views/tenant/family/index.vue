<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NCard, NSpace, NStatistic, NGrid, NGridItem, NSpin } from 'naive-ui';
import { fetchTenantFamilyOverview } from '@/service/api';

const route = useRoute();
const familyId = ref<number>(0);
const loading = ref(false);
const overview = ref<Partial<Api.Tenant.FamilyOverview>>({});

async function load(id: number) {
  familyId.value = id;
  loading.value = true;
  try {
    const { data } = await fetchTenantFamilyOverview(id);
    overview.value = data || {};
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.params.familyId,
  v => {
    const id = Number(v);
    if (id) load(id);
  },
  { immediate: true }
);
</script>

<template>
  <NSpin :show="loading">
    <NSpace vertical size="large">
      <h2 class="text-xl font-bold">{{ overview.name || '家族概览' }}</h2>
      <NGrid cols="2 s:3 m:4" x-gap="16" y-gap="16" responsive="screen">
        <NGridItem>
          <NCard>
            <NStatistic label="成员" :value="Number(overview.memberCount) || 0" />
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard>
            <NStatistic label="相册" :value="Number(overview.photoCount) || 0" />
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard>
            <NStatistic label="文档" :value="Number(overview.documentCount) || 0" />
          </NCard>
        </NGridItem>
        <NGridItem>
          <NCard>
            <NStatistic label="事件" :value="Number(overview.eventCount) || 0" />
          </NCard>
        </NGridItem>
      </NGrid>
    </NSpace>
  </NSpin>
</template>
