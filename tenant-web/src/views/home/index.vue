<script setup lang="ts">
import { useRouter } from 'vue-router';
import { NCard, NSpace, NButton } from 'naive-ui';

const router = useRouter();

function goSelectFamily() {
  router.push('/tenant/select-family');
}
</script>

<template>
  <div class="h-full flex-center">
    <NCard title="欢迎来到家族管理后台" class="w-120 text-center">
      <NSpace vertical align="center" size="large">
        <p class="text-gray-500">请先选择一个家族，然后管理成员、相册、文档和事件。</p>
        <NButton type="primary" size="large" @click="goSelectFamily">
          选择家族
        </NButton>
      </NSpace>
    </NCard>
  </div>
</template>
