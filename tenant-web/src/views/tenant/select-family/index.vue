<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { NCard, NGrid, NGridItem, NSpace, NSpin, NButton, NAvatar, NEmpty } from 'naive-ui';
import { fetchTenantFamilies, type ContentType } from '@/service/api';

interface TenantFamilyItem {
  familyId: number;
  name: string;
  logo: string;
  role: string;
}

const router = useRouter();
const loading = ref(true);
const families = ref<TenantFamilyItem[]>([]);

async function load() {
  try {
    const { data } = await fetchTenantFamilies();
    families.value = (data || []).filter((item: TenantFamilyItem) => ['admin', 'creator'].includes(item.role));
  } finally {
    loading.value = false;
  }
}

function selectFamily(id: number) {
  router.push(`/tenant/family/${id}/overview`);
}

onMounted(load);
</script>

<template>
  <div class="h-full flex-center flex-col">
    <NSpin :show="loading">
      <NSpace vertical align="center" size="large">
        <h1 class="text-2xl font-bold">请选择要管理的家族</h1>
        <NEmpty v-if="!loading && families.length === 0" description="暂无可管理的家族" />
        <NGrid v-else cols="1 s:2 m:3 l:4" x-gap="16" y-gap="16" responsive="screen">
          <NGridItem v-for="item in families" :key="item.familyId">
            <NCard hoverable class="cursor-pointer w-72" @click="selectFamily(item.familyId)">
              <NSpace align="center" size="large">
                <NAvatar :src="item.logo" :fallback-src="'/logo.svg'" round size="large" />
                <div>
                  <div class="text-lg font-medium">{{ item.name }}</div>
                  <div class="text-gray-500 text-sm">{{ item.role === 'creator' ? '创建者' : '管理员' }}</div>
                </div>
              </NSpace>
            </NCard>
          </NGridItem>
        </NGrid>
        <NButton v-if="!loading" type="primary" @click="load">
          刷新
        </NButton>
      </NSpace>
    </NSpin>
  </div>
</template>
