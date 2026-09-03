<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NButton, NCard, NSpace, NSpin, NForm, NFormItem, NInput, NSwitch } from 'naive-ui';
import { fetchTenantFamilySettings, updateTenantFamilySettings } from '@/service/api';

const route = useRoute();
const familyId = ref<number>(0);
const loading = ref(false);
const saving = ref(false);

const form = reactive({
  name: '',
  hallName: '',
  origin: '',
  description: '',
  isPublic: false,
  allowJoin: false
});

async function load(id: number) {
  familyId.value = id;
  loading.value = true;
  try {
    const { data } = await fetchTenantFamilySettings(id);
    if (data) {
      form.name = String(data.name || '');
      form.hallName = String(data.hall_name || '');
      form.origin = String(data.origin || '');
      form.description = String(data.description || '');
      form.isPublic = data.is_public === 1;
      form.allowJoin = data.allow_join === 1;
    }
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!form.name.trim()) {
    window.$message?.warning('家族名称不能为空');
    return;
  }
  saving.value = true;
  try {
    await updateTenantFamilySettings(familyId.value, {
      name: form.name,
      hallName: form.hallName,
      origin: form.origin,
      description: form.description,
      isPublic: form.isPublic ? 1 : 0,
      allowJoin: form.allowJoin ? 1 : 0
    });
    window.$message?.success('设置已保存');
    await load(familyId.value);
  } finally {
    saving.value = false;
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
    <NCard title="家族设置" style="max-width: 640px">
      <NForm label-placement="left" label-width="120">
        <NFormItem label="家族名称">
          <NInput v-model:value="form.name" placeholder="家族名称" />
        </NFormItem>
        <NFormItem label="堂号">
          <NInput v-model:value="form.hallName" placeholder="堂号（选填）" />
        </NFormItem>
        <NFormItem label="发源地">
          <NInput v-model:value="form.origin" placeholder="家族发源地（选填）" />
        </NFormItem>
        <NFormItem label="公开家族">
          <NSwitch v-model:value="form.isPublic" />
          <span class="ml-3 text-gray-400 text-sm">公开后非成员可查看家族基本信息</span>
        </NFormItem>
        <NFormItem label="允许加入">
          <NSwitch v-model:value="form.allowJoin" />
          <span class="ml-3 text-gray-400 text-sm">开启后用户可申请加入家族</span>
        </NFormItem>
        <NFormItem label="家族简介">
          <NInput v-model:value="form.description" type="textarea" :rows="4" placeholder="家族简介（选填）" />
        </NFormItem>
        <NSpace justify="end">
          <NButton type="primary" :loading="saving" @click="save">
            保存设置
          </NButton>
        </NSpace>
      </NForm>
    </NCard>
  </NSpin>
</template>
