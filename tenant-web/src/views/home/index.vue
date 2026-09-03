<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NCard,
  NAvatar,
  NGrid,
  NGridItem,
  NModal,
  NList,
  NListItem,
  NSpace,
  NSpin,
  NEmpty,
  NStatistic
} from 'naive-ui';
import { fetchTenantFamilies, fetchTenantFamilyOverview } from '@/service/api';
import { localStg } from '@/utils/storage';

type TenantFamilyItem = Api.Tenant.TenantFamilyItem;

/** familyId 在 localStg 中以字符串存储 */
function getCurrentFamilyId(): number {
  return Number(localStg.get('currentFamilyId')) || 0;
}

const loadingFamilies = ref(false);
const families = ref<TenantFamilyItem[]>([]);
const modalVisible = ref(false);
const selectedId = ref<number>(0);

const currentFamilyId = ref<number>(0);
const overviewLoading = ref(false);
const overview = ref<Partial<Api.Tenant.FamilyOverview>>({});

const hasFamily = computed(() => currentFamilyId.value > 0);
const familyName = computed(() => overview.value?.name || '');

async function loadFamilies() {
  loadingFamilies.value = true;
  try {
    const { data } = await fetchTenantFamilies();
    families.value = (data || []).filter(item => ['admin', 'creator'].includes(item.role));
  } finally {
    loadingFamilies.value = false;
  }
}

async function openSelectModal() {
  await loadFamilies();
  selectedId.value = getCurrentFamilyId();
  modalVisible.value = true;
}

async function loadOverview(id: number) {
  if (!id) return;
  currentFamilyId.value = id;
  overviewLoading.value = true;
  try {
    const { data } = await fetchTenantFamilyOverview(id);
    overview.value = data || {};
  } finally {
    overviewLoading.value = false;
  }
}

function confirmSelect() {
  if (!selectedId.value) return;
  localStg.set('currentFamilyId', String(selectedId.value));
  modalVisible.value = false;
  void loadOverview(selectedId.value);
}

function switchFamily() {
  void openSelectModal();
}

onMounted(async () => {
  const id = getCurrentFamilyId();
  if (id) {
    await loadOverview(id);
  } else {
    void openSelectModal();
  }
});
</script>

<template>
  <div class="h-full">
    <NModal
      v-model:show="modalVisible"
      preset="card"
      title="请选择要管理的家族"
      style="width: 480px"
      :mask-closable="false"
      :closable="false"
    >
      <NSpin :show="loadingFamilies">
        <NEmpty v-if="!loadingFamilies && families.length === 0" description="暂无可管理的家族" />
        <NList v-else hoverable clickable>
          <NListItem v-for="item in families" :key="item.familyId" @click="selectedId = item.familyId">
            <NSpace align="center" size="large" :class="{ 'opacity-60': selectedId && selectedId !== item.familyId }">
              <NAvatar :src="item.logo" :fallback-src="'/logo.svg'" round />
              <div class="flex-1">
                <div class="font-medium">{{ item.name }}</div>
                <div class="text-gray-500 text-sm">{{ item.role === 'creator' ? '创建者' : '管理员' }}</div>
              </div>
            </NSpace>
          </NListItem>
        </NList>
      </NSpin>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="modalVisible = false">取消</NButton>
          <NButton type="primary" :disabled="!selectedId" @click="confirmSelect">确认</NButton>
        </NSpace>
      </template>
    </NModal>

    <div class="h-full p-16px">
      <NSpin :show="overviewLoading">
        <template v-if="hasFamily && familyName">
          <div class="flex-y-center justify-between mb-16px">
            <div class="flex-y-center gap-12px">
              <NAvatar :src="overview.logo" :fallback-src="'/logo.svg'" round size="large" />
              <div>
                <h2 class="text-xl font-bold">{{ familyName }}</h2>
                <span class="text-gray-500 text-sm">家族概况</span>
              </div>
            </div>
            <NButton secondary @click="switchFamily">切换家族</NButton>
          </div>

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
        </template>

        <template v-else>
          <div class="h-full flex-center">
            <NCard title="欢迎来到家族管理后台" class="w-120 text-center">
              <NSpace vertical align="center" size="large">
                <p class="text-gray-500">请先选择一个家族，然后管理成员、相册、文档和事件。</p>
                <NButton type="primary" size="large" @click="openSelectModal">选择家族</NButton>
              </NSpace>
            </NCard>
          </div>
        </template>
      </NSpin>
    </div>
  </div>
</template>
