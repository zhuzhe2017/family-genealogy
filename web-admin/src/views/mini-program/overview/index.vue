<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

onMounted(() => {
  router.replace('/home');
});
</script>

<template>
  <div class="flex items-center justify-center h-40">
    <NSpin />
  </div>
</template>
