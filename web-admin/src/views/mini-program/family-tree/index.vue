<script setup lang="ts">
const treeNodes = [
  { id: 1, title: '祖先家族', children: [{ id: 2, title: '第一代' }, { id: 3, title: '第二代' }] },
  { id: 4, title: '支系分支', children: [{ id: 5, title: '分支A' }] }
];
</script>

<template>
  <NCard :bordered="false" title="家族树管理">
    <NSpace vertical :size="12">
      <div class="text-sm text-gray-500">这里可以展示和维护小程序中的家族树结构。</div>
      <NTree :data="treeNodes" />
    </NSpace>
  </NCard>
</template>
