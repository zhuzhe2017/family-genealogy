<script setup lang="ts">
import { onMounted } from 'vue';
import { useSiteConfigStore } from '@/store/modules/site-config';

defineOptions({
  name: 'GlobalFooter'
});

const siteConfigStore = useSiteConfigStore();

onMounted(() => {
  siteConfigStore.fetchConfig();
});
</script>

<template>
  <DarkModeContainer class="h-full flex-center">
    <span class="nowrap-hidden">
      {{ siteConfigStore.copyright || '数字家谱 © 2026' }}
    </span>
  </DarkModeContainer>
</template>

<style scoped></style>
