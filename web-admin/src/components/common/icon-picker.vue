<script setup lang="ts">
import { ref, computed } from 'vue';

defineOptions({ name: 'IconPicker' });

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const showModal = ref(false);
const searchText = ref('');
const activeCategory = ref('all');

function handleOpenPicker() {
  searchText.value = '';
  showModal.value = true;
}

function handleClear() {
  emit('update:modelValue', '');
}

function selectIcon(icon: string) {
  emit('update:modelValue', icon);
  showModal.value = false;
}

const categories = [
  { label: '全部', key: 'all' },
  { label: '导航', key: 'nav' },
  { label: '数据', key: 'data' },
  { label: '操作', key: 'action' },
  { label: '文件', key: 'file' },
  { label: '用户', key: 'user' },
  { label: '系统', key: 'system' },
  { label: '品牌', key: 'brand' }
];

interface IconEntry {
  icon: string;
  label: string;
}

const iconsByCategory: Record<string, IconEntry[]> = {
  nav: [
    { icon: 'mdi:home', label: 'home' },
    { icon: 'mdi:home-outline', label: 'home-o' },
    { icon: 'mdi:menu', label: 'menu' },
    { icon: 'mdi:menu-open', label: 'menu-open' },
    { icon: 'mdi:view-dashboard', label: 'dashboard' },
    { icon: 'mdi:view-dashboard-outline', label: 'dash-o' },
    { icon: 'mdi:view-list', label: 'list' },
    { icon: 'mdi:view-grid', label: 'grid' },
    { icon: 'mdi:sidebar', label: 'sidebar' },
    { icon: 'mdi:layers', label: 'layers' },
    { icon: 'mdi:layers-outline', label: 'layers-o' },
    { icon: 'mdi:chevron-left', label: 'chevron-l' },
    { icon: 'mdi:chevron-right', label: 'chevron-r' },
    { icon: 'mdi:chevron-up', label: 'chevron-up' },
    { icon: 'mdi:chevron-down', label: 'chevron-down' },
    { icon: 'mdi:fullscreen', label: 'fullscreen' },
    { icon: 'mdi:fullscreen-exit', label: 'full-exit' },
    { icon: 'mdi:page-layout-header', label: 'layout' },
    { icon: 'mdi:collage', label: 'collage' },
    { icon: 'mdi:swap-horizontal-bold', label: 'swap-h' },
    { icon: 'mdi:swap-vertical-bold', label: 'swap-v' },
    { icon: 'mdi:arrow-expand-all', label: 'expand' },
    { icon: 'mdi:unfold-more-horizontal', label: 'unfold' }
  ],
  data: [
    { icon: 'mdi:table', label: 'table' },
    { icon: 'mdi:table-large', label: 'table-lg' },
    { icon: 'mdi:database', label: 'database' },
    { icon: 'mdi:database-outline', label: 'db-o' },
    { icon: 'mdi:chart-bar', label: 'bar' },
    { icon: 'mdi:chart-line', label: 'line' },
    { icon: 'mdi:chart-pie', label: 'pie' },
    { icon: 'mdi:chart-donut', label: 'donut' },
    { icon: 'mdi:monitor-dashboard', label: 'dash-mon' },
    { icon: 'mdi:clipboard-text', label: 'clip-txt' },
    { icon: 'mdi:clipboard-text-outline', label: 'clip-txt-o' },
    { icon: 'mdi:clipboard-list', label: 'clip-list' },
    { icon: 'mdi:grid', label: 'grid' },
    { icon: 'mdi:grid-large', label: 'grid-lg' },
    { icon: 'mdi:calculator', label: 'calc' },
    { icon: 'mdi:poll', label: 'poll' },
    { icon: 'mdi:poll-box', label: 'poll-box' },
    { icon: 'mdi:file-excel', label: 'excel' },
    { icon: 'mdi:file-table', label: 'table-file' },
    { icon: 'mdi:archive', label: 'archive' },
    { icon: 'mdi:package', label: 'package' },
    { icon: 'mdi:notebook', label: 'notebook' },
    { icon: 'mdi:sort-alphabetical-ascending', label: 'sort-az' },
    { icon: 'mdi:sort-numeric-ascending', label: 'sort-1-9' }
  ],
  action: [
    { icon: 'mdi:plus', label: 'plus' },
    { icon: 'mdi:plus-circle', label: 'plus-cir' },
    { icon: 'mdi:plus-circle-outline', label: 'plus-cir-o' },
    { icon: 'mdi:pencil', label: 'pencil' },
    { icon: 'mdi:pencil-outline', label: 'pencil-o' },
    { icon: 'mdi:delete', label: 'delete' },
    { icon: 'mdi:delete-outline', label: 'del-o' },
    { icon: 'mdi:eye', label: 'eye' },
    { icon: 'mdi:eye-outline', label: 'eye-o' },
    { icon: 'mdi:eye-off', label: 'eye-off' },
    { icon: 'mdi:download', label: 'download' },
    { icon: 'mdi:upload', label: 'upload' },
    { icon: 'mdi:refresh', label: 'refresh' },
    { icon: 'mdi:save', label: 'save' },
    { icon: 'mdi:check', label: 'check' },
    { icon: 'mdi:check-circle', label: 'check-cir' },
    { icon: 'mdi:close', label: 'close' },
    { icon: 'mdi:close-circle', label: 'close-cir' },
    { icon: 'mdi:undo', label: 'undo' },
    { icon: 'mdi:redo', label: 'redo' },
    { icon: 'mdi:lock', label: 'lock' },
    { icon: 'mdi:lock-open', label: 'lock-open' },
    { icon: 'mdi:cog', label: 'cog' },
    { icon: 'mdi:cog-outline', label: 'cog-o' },
    { icon: 'mdi:wrench', label: 'wrench' },
    { icon: 'mdi:hammer', label: 'hammer' },
    { icon: 'mdi:tools', label: 'tools' },
    { icon: 'mdi:copy', label: 'copy' },
    { icon: 'mdi:clipboard', label: 'clipboard' },
    { icon: 'mdi:clipboard-check', label: 'clip-check' },
    { icon: 'mdi:star', label: 'star' },
    { icon: 'mdi:star-outline', label: 'star-o' },
    { icon: 'mdi:heart', label: 'heart' },
    { icon: 'mdi:heart-outline', label: 'heart-o' },
    { icon: 'mdi:flag', label: 'flag' },
    { icon: 'mdi:bookmark', label: 'bookmark' },
    { icon: 'mdi:tag', label: 'tag' },
    { icon: 'mdi:send', label: 'send' },
    { icon: 'mdi:share-variant', label: 'share' },
    { icon: 'mdi:bell', label: 'bell' },
    { icon: 'mdi:bell-outline', label: 'bell-o' },
    { icon: 'mdi:bell-ring', label: 'bell-ring' },
    { icon: 'mdi:alert', label: 'alert' },
    { icon: 'mdi:alert-circle', label: 'alert-cir' },
    { icon: 'mdi:calendar', label: 'calendar' },
    { icon: 'mdi:calendar-outline', label: 'cal-o' },
    { icon: 'mdi:clock', label: 'clock' },
    { icon: 'mdi:clock-outline', label: 'clock-o' },
    { icon: 'mdi:history', label: 'history' },
    { icon: 'mdi:printer', label: 'printer' },
    { icon: 'mdi:camera', label: 'camera' },
    { icon: 'mdi:qrcode', label: 'qrcode' },
    { icon: 'mdi:link', label: 'link' },
    { icon: 'mdi:cloud', label: 'cloud' },
    { icon: 'mdi:cloud-upload', label: 'cloud-up' },
    { icon: 'mdi:cloud-download', label: 'cloud-down' },
    { icon: 'mdi:lightbulb', label: 'lightbulb' },
    { icon: 'mdi:lightbulb-outline', label: 'bulb-o' },
    { icon: 'mdi:flash', label: 'flash' },
    { icon: 'mdi:puzzle', label: 'puzzle' },
    { icon: 'mdi:toggle-switch', label: 'switch' },
    { icon: 'mdi:toggle-switch-off', label: 'switch-off' },
    { icon: 'mdi:search-web', label: 'search' }
  ],
  file: [
    { icon: 'mdi:file', label: 'file' },
    { icon: 'mdi:file-outline', label: 'file-o' },
    { icon: 'mdi:file-document', label: 'document' },
    { icon: 'mdi:file-document-outline', label: 'doc-o' },
    { icon: 'mdi:file-image', label: 'image' },
    { icon: 'mdi:file-image-outline', label: 'img-o' },
    { icon: 'mdi:file-pdf', label: 'pdf' },
    { icon: 'mdi:file-code', label: 'code' },
    { icon: 'mdi:folder', label: 'folder' },
    { icon: 'mdi:folder-outline', label: 'folder-o' },
    { icon: 'mdi:folder-open', label: 'folder-open' },
    { icon: 'mdi:folder-plus', label: 'folder-plus' },
    { icon: 'mdi:folder-multiple', label: 'folders' },
    { icon: 'mdi:note', label: 'note' },
    { icon: 'mdi:note-text', label: 'note-txt' },
    { icon: 'mdi:note-text-outline', label: 'note-o' },
    { icon: 'mdi:attachment', label: 'attach' },
    { icon: 'mdi:filing-cabinet', label: 'cabinet' },
    { icon: 'mdi:sticker', label: 'sticker' },
    { icon: 'mdi:sticker-emoji', label: 'emoji' }
  ],
  user: [
    { icon: 'mdi:account', label: 'user' },
    { icon: 'mdi:account-outline', label: 'user-o' },
    { icon: 'mdi:account-multiple', label: 'users' },
    { icon: 'mdi:account-multiple-outline', label: 'users-o' },
    { icon: 'mdi:account-plus', label: 'user-plus' },
    { icon: 'mdi:account-minus', label: 'user-minus' },
    { icon: 'mdi:account-check', label: 'user-check' },
    { icon: 'mdi:account-cog', label: 'user-cog' },
    { icon: 'mdi:account-edit', label: 'user-edit' },
    { icon: 'mdi:account-group', label: 'group' },
    { icon: 'mdi:account-settings', label: 'user-set' },
    { icon: 'mdi:account-supervisor', label: 'supervisor' },
    { icon: 'mdi:account-circle', label: 'user-cir' },
    { icon: 'mdi:account-tie', label: 'user-tie' },
    { icon: 'mdi:id-card', label: 'id-card' },
    { icon: 'mdi:badge-account', label: 'badge' },
    { icon: 'mdi:passport', label: 'passport' },
    { icon: 'mdi:face-man', label: 'man' },
    { icon: 'mdi:face-woman', label: 'woman' },
    { icon: 'mdi:human', label: 'human' },
    { icon: 'mdi:human-male-female', label: 'gender' }
  ],
  system: [
    { icon: 'mdi:cog', label: 'setting' },
    { icon: 'mdi:cog-outline', label: 'setting-o' },
    { icon: 'mdi:cog-box', label: 'setting-box' },
    { icon: 'mdi:cogs', label: 'settings' },
    { icon: 'mdi:server', label: 'server' },
    { icon: 'mdi:server-outline', label: 'server-o' },
    { icon: 'mdi:server-security', label: 'server-sec' },
    { icon: 'mdi:domain', label: 'domain' },
    { icon: 'mdi:monitor', label: 'monitor' },
    { icon: 'mdi:laptop', label: 'laptop' },
    { icon: 'mdi:devices', label: 'devices' },
    { icon: 'mdi:network', label: 'network' },
    { icon: 'mdi:wifi', label: 'wifi' },
    { icon: 'mdi:lan', label: 'lan' },
    { icon: 'mdi:shield', label: 'shield' },
    { icon: 'mdi:shield-outline', label: 'shield-o' },
    { icon: 'mdi:shield-check', label: 'shield-ok' },
    { icon: 'mdi:security', label: 'security' },
    { icon: 'mdi:key', label: 'key' },
    { icon: 'mdi:code-tags', label: 'code' },
    { icon: 'mdi:terminal', label: 'terminal' },
    { icon: 'mdi:console', label: 'console' },
    { icon: 'mdi:application', label: 'app' },
    { icon: 'mdi:widgets', label: 'widgets' },
    { icon: 'mdi:information', label: 'info' },
    { icon: 'mdi:information-outline', label: 'info-o' },
    { icon: 'mdi:help-circle', label: 'help' },
    { icon: 'mdi:help-circle-outline', label: 'help-o' },
    { icon: 'mdi:map', label: 'map' },
    { icon: 'mdi:map-marker', label: 'marker' },
    { icon: 'mdi:earth', label: 'earth' },
    { icon: 'mdi:weather-sunny', label: 'sunny' },
    { icon: 'mdi:weather-night', label: 'night' },
    { icon: 'mdi:book-open-variant', label: 'book' },
    { icon: 'mdi:bookmark-box', label: 'bookmark-box' },
    { icon: 'mdi:lifebuoy', label: 'lifebuoy' }
  ],
  brand: [
    { icon: 'mdi:github', label: 'github' },
    { icon: 'mdi:gitlab', label: 'gitlab' },
    { icon: 'mdi:docker', label: 'docker' },
    { icon: 'mdi:linux', label: 'linux' },
    { icon: 'mdi:microsoft-windows', label: 'windows' },
    { icon: 'mdi:apple', label: 'apple' },
    { icon: 'mdi:android', label: 'android' },
    { icon: 'mdi:google', label: 'google' },
    { icon: 'mdi:google-chrome', label: 'chrome' },
    { icon: 'mdi:microsoft-edge', label: 'edge' },
    { icon: 'mdi:firefox', label: 'firefox' },
    { icon: 'mdi:nodejs', label: 'nodejs' },
    { icon: 'mdi:npm', label: 'npm' },
    { icon: 'mdi:yarn', label: 'yarn' },
    { icon: 'mdi:pnpm', label: 'pnpm' },
    { icon: 'mdi:vuejs', label: 'vue' },
    { icon: 'mdi:react', label: 'react' },
    { icon: 'mdi:angular', label: 'angular' },
    { icon: 'mdi:tailwind', label: 'tailwind' },
    { icon: 'mdi:mysql', label: 'mysql' },
    { icon: 'mdi:redis', label: 'redis' },
    { icon: 'mdi:nginx', label: 'nginx' },
    { icon: 'mdi:git', label: 'git' },
    { icon: 'mdi:git-branch', label: 'git-branch' },
    { icon: 'mdi:markdown', label: 'markdown' },
    { icon: 'mdi:json', label: 'json' },
    { icon: 'mdi:yaml', label: 'yaml' },
    { icon: 'mdi:xml', label: 'xml' },
    { icon: 'mdi:console', label: 'console' },
    { icon: 'mdi:svg', label: 'svg' }
  ]
};

const allIcons = computed(() => {
  const result: IconEntry[] = [];
  const seen = new Set<string>();
  for (const cat of Object.values(iconsByCategory)) {
    for (const entry of cat) {
      if (!seen.has(entry.icon)) {
        seen.add(entry.icon);
        result.push(entry);
      }
    }
  }
  return result;
});

const filteredIcons = computed(() => {
  const icons = activeCategory.value === 'all' ? allIcons.value : (iconsByCategory[activeCategory.value] || []);

  if (!searchText.value) return icons;

  const kw = searchText.value.toLowerCase();
  return icons.filter(e => e.label.includes(kw) || e.icon.toLowerCase().includes(kw));
});
</script>

<template>
  <div class="flex-y-center gap-8px">
    <NButton :type="modelValue ? 'primary' : 'default'" ghost @click="handleOpenPicker">
      <template #icon>
        <SvgIcon v-if="modelValue" :icon="modelValue" />
        <SvgIcon v-else icon="mdi:image-plus" />
      </template>
      <span v-if="modelValue" class="ml-4px">{{ modelValue }}</span>
      <span v-else class="ml-4px">选择图标</span>
    </NButton>
    <NButton v-if="modelValue" size="small" circle quaternary type="error" @click="handleClear">
      <template #icon><SvgIcon icon="mdi:close" /></template>
    </NButton>

    <NModal v-model:show="showModal" title="选择图标" preset="card" style="width: 700px" :mask-closable="false" :segmented="{ content: true }">
      <div class="flex flex-col" style="height: 520px">
        <div class="flex-none mb-12px">
          <NInput v-model:value="searchText" placeholder="搜索图标名称..." clearable>
            <template #prefix><SvgIcon icon="mdi:magnify" /></template>
          </NInput>
        </div>

        <div class="flex-none mb-12px flex-wrap gap-4px">
          <NTag
            v-for="cat in categories"
            :key="cat.key"
            :type="activeCategory === cat.key ? 'primary' : 'default'"
            :bordered="false"
            style="cursor: pointer"
            size="small"
            @click="activeCategory = cat.key"
          >
            {{ cat.label }}
          </NTag>
        </div>

        <div class="flex-1 overflow-y-auto border rounded-6px p-8px">
          <div v-if="filteredIcons.length > 0" class="grid grid-cols-8 gap-4px">
            <div
              v-for="icon in filteredIcons"
              :key="icon.icon"
              class="flex flex-col items-center justify-center p-6px rounded-6px cursor-pointer border-1 border-transparent transition-all duration-200 hover:bg-gray-100 hover:border-gray-300"
              :class="modelValue === icon.icon ? 'bg-blue-50 border-blue-500' : ''"
              @click="selectIcon(icon.icon)"
            >
              <SvgIcon :icon="icon.icon" class="text-22px" />
              <span class="text-10px mt-2px text-center truncate w-full">{{ icon.label }}</span>
            </div>
          </div>
          <div v-else class="text-center py-32px text-gray-400">未找到匹配的图标</div>
        </div>
      </div>
    </NModal>
  </div>
</template>
