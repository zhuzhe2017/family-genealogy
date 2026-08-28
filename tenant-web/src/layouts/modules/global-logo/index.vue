<script setup lang="ts">
import { onMounted } from 'vue';
import { $t } from '@/locales';
import { useSiteConfigStore } from '@/store/modules/site-config';

defineOptions({
  name: 'GlobalLogo'
});

interface Props {
  /** Whether to show the title */
  showTitle?: boolean;
}

withDefaults(defineProps<Props>(), {
  showTitle: true
});

const siteConfigStore = useSiteConfigStore();

onMounted(() => {
  siteConfigStore.fetchConfig();
});
</script>

<template>
  <RouterLink to="/" class="w-full flex-center nowrap-hidden">
    <SystemLogo class="size-32px" />
    <h2 v-show="showTitle" class="pl-8px text-16px text-primary font-bold transition duration-300 ease-in-out">
      {{ siteConfigStore.systemName || $t('system.title') }}
    </h2>
  </RouterLink>
</template>

<style scoped></style>
