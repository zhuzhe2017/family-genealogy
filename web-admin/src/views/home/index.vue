<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Icon } from '@iconify/vue';
import {
  fetchDashboardStats,
  type DashboardStats,
  type SurnameStat
} from '@/service/api/dashboard';
import { useEcharts, type ECOption } from '@/hooks/common/echarts';
import { useSiteConfigStore } from '@/store/modules/site-config';

const router = useRouter();
const { t } = useI18n();
const siteConfigStore = useSiteConfigStore();

const stats = ref<DashboardStats>({
  totalFamilies: 0,
  totalMembers: 0,
  content: { dynamics: 0, photos: 0, documents: 0, events: 0 },
  surnames: []
});
const loading = ref(true);
const error = ref('');
/** 数据最后更新时间 */
const lastUpdated = ref('');

const contentTotal = computed(
  () =>
    stats.value.content.dynamics +
    stats.value.content.photos +
    stats.value.content.documents +
    stats.value.content.events
);

/** 姓氏 TOP 数据（最多展示 12 个） */
const topSurnames = computed<SurnameStat[]>(() =>
  (stats.value.surnames || []).slice(0, 12)
);

/** 姓氏总数 */
const surnameTotalCount = computed(() => stats.value.surnames?.length || 0);

/** 姓氏图表配置 */
const surnameChartOptions = computed<ECOption>(() => {
  const data = topSurnames.value;
  const names = data.map(s => s.surname);
  const members = data.map(s => s.memberCount);
  const families = data.map(s => s.familyCount);

  // 取最大值做自适应
  const maxVal = Math.max(...members, 1);

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const idx = params[0]?.dataIndex;
        if (idx === undefined || !data[idx]) return '';
        const item = data[idx];
        return `<strong>${t('page.home.chartSurnameTip', { name: item.surname })}</strong><br/>
                ${t('page.home.memberTip', { n: item.memberCount })}<br/>
                ${t('page.home.familyTip', { n: item.familyCount })}`;
      }
    },
    legend: {
      data: [t('page.home.chartMember'), t('page.home.chartFamily')],
      bottom: 0
    },
    grid: { left: '3%', right: '8%', top: '3%', bottom: 30, containLabel: true },
    xAxis: {
      type: 'value',
      max: Math.ceil(maxVal * 1.2),
      axisLabel: { fontSize: 11 }
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLabel: { fontSize: 13, fontWeight: 'bold' }
    },
    series: [
      {
        name: t('page.home.chartMember'),
        type: 'bar',
        data: members,
        barWidth: 12,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#18a058' },
              { offset: 1, color: '#36d47c' }
            ]
          },
          borderRadius: [0, 4, 4, 0]
        },
        label: { show: true, position: 'right', fontSize: 11 }
      },
      {
        name: t('page.home.chartFamily'),
        type: 'bar',
        data: families,
        barWidth: 12,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#2080f0' },
              { offset: 1, color: '#66b1ff' }
            ]
          },
          borderRadius: [0, 4, 4, 0]
        },
        label: { show: true, position: 'right', fontSize: 11 }
      }
    ]
  };
});

// ECharts 实例
const { domRef: chartDomRef, updateOptions: updateSurnameChart } = useEcharts(
  () => surnameChartOptions.value as ECOption
);

/** 快捷操作 */
const shortcuts = [
  {
    title: '成员管理',
    desc: '新增、编辑、删除家族成员信息',
    icon: 'mdi:account-group',
    color: '#18a058',
    route: '/mini-program/members'
  },
  {
    title: '家族管理',
    desc: '管理家族档案、配置字辈表',
    icon: 'mdi:family-tree',
    color: '#2080f0',
    route: '/mini-program/family'
  },
  {
    title: '字辈管理',
    desc: '维护家族辈分序列与行第',
    icon: 'mdi:format-list-text',
    color: '#f0a020',
    route: '/mini-program/generation-table'
  },
  {
    title: '家族树',
    desc: '可视化展示家族谱系结构',
    icon: 'mdi:graph-outline',
    color: '#d03050',
    route: '/mini-program/family-tree'
  }
];

/** 按路由跳转 */
function goRoute(route: string) {
  router.push(route);
}

async function loadStats() {
  // 非首次加载不置 loading，避免 v-if 卸载图表容器导致 ECharts 实例失效
  if (!stats.value) {
    loading.value = true;
  }
  error.value = '';
  try {
    const result = await fetchDashboardStats();
    stats.value = result?.data || stats.value;
    lastUpdated.value = new Date().toLocaleTimeString('zh-CN');
    // 数据加载完成后更新图表
    updateSurnameChart(() => surnameChartOptions.value as ECOption);
  } catch (err: any) {
    error.value = '获取统计数据失败';
    console.error('dashboard stats error:', err);
  } finally {
    loading.value = false;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  siteConfigStore.fetchConfig();
  loadStats();
  // 每 60 秒自动刷新
  timer = setInterval(loadStats, 60_000);
});

onUnmounted(() => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
});
</script>

<template>
  <NSpace vertical :size="16">
    <!-- 欢迎横幅 -->
    <div class="welcome-banner">
      <h1 class="text-2xl font-bold">{{ siteConfigStore.systemName || $t('page.home.title') }}</h1>
      <p class="text-gray-500 mt-1">{{ $t('page.home.desc') }}</p>
    </div>

    <!-- 统计卡片 -->
    <NCard :bordered="false" class="stats-card">
      <template v-if="error">
        <NAlert type="warning" :title="error" />
      </template>
      <NGrid x-gap="16" y-gap="16" responsive="screen" item-responsive>
        <NGi span="24 s:12 m:6 l:6">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(24,160,88,0.12); color: #18a058;">
              <Icon icon="mdi:account-multiple" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.memberCount') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.totalMembers" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6 l:6">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(32,128,240,0.12); color: #2080f0;">
              <Icon icon="mdi:source-branch" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.familyCount') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.totalFamilies" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6 l:6">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(240,160,32,0.12); color: #f0a020;">
              <Icon icon="mdi:image-multiple" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.photoCount') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.content.photos" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6 l:6">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(208,48,80,0.12); color: #d03050;">
              <Icon icon="mdi:file-document-multiple" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.contentCount') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="contentTotal" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
      </NGrid>
    </NCard>

    <!-- 内容分类 & 快捷操作 -->
    <NGrid x-gap="16" y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:14">
        <NCard :bordered="false" :title="$t('page.home.contentBreakdown')">
          <NGrid x-gap="12" y-gap="12" :cols="4">
            <NGi span="6">
              <div class="type-card type-dynamic" @click="goRoute('/mini-program/content')">
                <div class="type-num">{{ stats.content.dynamics }}</div>
                <div class="type-label">{{ $t('page.home.dynamics') }}</div>
              </div>
            </NGi>
            <NGi span="6">
              <div class="type-card type-photo" @click="goRoute('/mini-program/content')">
                <div class="type-num">{{ stats.content.photos }}</div>
                <div class="type-label">{{ $t('page.home.photos') }}</div>
              </div>
            </NGi>
            <NGi span="6">
              <div class="type-card type-doc" @click="goRoute('/mini-program/content')">
                <div class="type-num">{{ stats.content.documents }}</div>
                <div class="type-label">{{ $t('page.home.documents') }}</div>
              </div>
            </NGi>
            <NGi span="6">
              <div class="type-card type-event" @click="goRoute('/mini-program/content')">
                <div class="type-num">{{ stats.content.events }}</div>
                <div class="type-label">{{ $t('page.home.events') }}</div>
              </div>
            </NGi>
          </NGrid>
        </NCard>
      </NGi>
      <NGi span="24 s:24 m:10">
        <NCard :bordered="false" :title="$t('page.home.quickActions')">
          <NSpace vertical :size="0">
            <div
              v-for="item in shortcuts"
              :key="item.title"
              class="shortcut-item"
              @click="goRoute(item.route)"
            >
              <div
                class="shortcut-icon"
                :style="{ background: item.color + '1a', color: item.color }"
              >
                <Icon :icon="item.icon" :width="22" />
              </div>
              <div class="shortcut-text">
                <div class="font-medium">{{ item.title }}</div>
                <div class="text-xs text-gray-500">{{ item.desc }}</div>
              </div>
              <Icon icon="mdi:chevron-right" class="text-gray-400 ml-auto" />
            </div>
          </NSpace>
        </NCard>
      </NGi>
    </NGrid>

    <!-- 姓氏统计图表 -->
    <NGrid x-gap="16" y-gap="16" responsive="screen" item-responsive>
      <NGi span="24 s:24 m:16">
        <NCard :bordered="false">
          <template #header>
            <div class="flex items-center justify-between">
              <span>{{ $t('page.home.surnameDistribution') }}</span>
              <div class="flex items-center gap-3 text-xs text-gray-500">
                <span>{{ $t('page.home.totalSurnames', { n: surnameTotalCount }) }}</span>
                <span>{{ $t('page.home.updatedAt', { time: lastUpdated || '--:--:--' }) }}</span>
              </div>
            </div>
          </template>
          <NSkeleton v-if="loading" text :repeat="6" />
          <div
            v-else-if="topSurnames.length === 0"
            class="flex items-center justify-center h-60 text-gray-400"
          >
            {{ $t('page.home.noSurnameData') }}
          </div>
          <div
            v-else
            ref="chartDomRef"
            class="chart-container"
          />
        </NCard>
      </NGi>
      <NGi span="24 s:24 m:8">
        <NCard :bordered="false" :title="$t('page.home.surnameRanking')">
          <NSkeleton v-if="loading" text :repeat="6" />
          <div
            v-else-if="topSurnames.length === 0"
            class="text-gray-400 text-center py-8"
          >
            {{ $t('page.home.noData') }}
          </div>
          <div v-else class="surname-rank-list">
            <div
              v-for="(item, idx) in topSurnames"
              :key="item.surname"
              class="surname-rank-item"
            >
              <div
                class="rank-badge"
                :class="{
                  'rank-1': idx === 0,
                  'rank-2': idx === 1,
                  'rank-3': idx === 2
                }"
              >
                {{ idx + 1 }}
              </div>
              <div class="rank-name">{{ item.surname }}</div>
              <div class="rank-value">{{ $t('page.home.membersUnit', { n: item.memberCount }) }}</div>
            </div>
          </div>
        </NCard>
      </NGi>
    </NGrid>
  </NSpace>
</template>

<style scoped>
.welcome-banner {
  padding: 4px 0;
}

.stats-card {
  --n-padding: 20px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  flex-shrink: 0;
}

.stat-info {
  min-width: 0;
}

.stat-label {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.type-card {
  text-align: center;
  padding: 16px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.type-card:hover {
  background: var(--n-color-hover);
}

.type-num {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.type-label {
  font-size: 12px;
  color: var(--n-text-color-2);
  margin-top: 4px;
}

.type-dynamic {
  color: #18a058;
}

.type-photo {
  color: #2080f0;
}

.type-doc {
  color: #f0a020;
}

.type-event {
  color: #d03050;
}

.shortcut-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
}

.shortcut-item:hover {
  background: var(--n-color-hover);
}

.shortcut-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.shortcut-text {
  min-width: 0;
}

.chart-container {
  width: 100%;
  height: 340px;
}

.surname-rank-list {
  display: flex;
  flex-direction: column;
}

.surname-rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--n-border-color);
}

.surname-rank-item:last-child {
  border-bottom: none;
}

.rank-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  background: var(--n-color-hover);
  flex-shrink: 0;
}

.rank-badge.rank-1 {
  background: #d03050;
  color: #fff;
}

.rank-badge.rank-2 {
  background: #f0a020;
  color: #fff;
}

.rank-badge.rank-3 {
  background: #18a058;
  color: #fff;
}

.rank-name {
  font-size: 14px;
  font-weight: 500;
}

.rank-value {
  margin-left: auto;
  font-size: 13px;
  color: var(--n-text-color-2);
  font-variant-numeric: tabular-nums;
}
</style>
