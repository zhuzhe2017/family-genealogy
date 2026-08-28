<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NCard, NSpace, NSpin, NForm, NFormItem, NInput, NSwitch } from 'naive-ui';
import { fetchTenantFamilySettings } from '@/service/api';

const route = useRoute();
const familyId = ref<number>(0);
const loading = ref(false);
const settings = ref<Partial<Api.Tenant.FamilySettings>>({});

async function load(id: number) {
  familyId.value = id;
  loading.value = true;
  try {
    const { data } = await fetchTenantFamilySettings(id);
    settings.value = data || {};
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

onMounted(() => {
  const id = Number(route.params.familyId);
  if (id) load(id);
});
</script>

<template>
  <NSpin :show="loading">
    <NCard title="家族设置">
      <NForm label-placement="left" label-width="120">
        <NFormItem label="家族名称">
          <NInput :value="String(settings.name || '')" readonly />
        </NFormItem>
        <NFormItem label="堂号">
          <NInput :value="String(settings.hall_name || '')" readonly />
        </NFormItem>
        <NFormItem label="发源地">
          <NInput :value="String(settings.origin || '')" readonly />
        </NFormItem>
        <NFormItem label="公开家族">
          <NSwitch :value="settings.is_public === 1" disabled />
        </NFormItem>
        <NFormItem label="允许加入">
          <NSwitch :value="settings.allow_join === 1" disabled />
        </NFormItem>
        <NFormItem label="家族简介">
          <NInput type="textarea" :value="String(settings.description || '')" readonly />
        </NFormItem>
      </NForm>
    </NCard>
  </NSpin>
</template>
