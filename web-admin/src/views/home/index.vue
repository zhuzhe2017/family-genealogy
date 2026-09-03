<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Icon } from '@iconify/vue';
import dayjs from 'dayjs';
import {
  fetchDashboardStats,
  fetchDashboardSubscriptionStats,
  type DashboardStats,
  type SurnameStat,
  type SubscriptionStats
} from '@/service/api/dashboard';
import { useEcharts, type ECOption } from '@/hooks/common/echarts';
import { useSiteConfigStore } from '@/store/modules/site-config';

const router = useRouter();
const { t } = useI18n();
const siteConfigStore = useSiteConfigStore();

const stats = ref<DashboardStats>({
  totalUsers: 0,
  todayNewUsers: 0,
  totalFamilies: 0,
  todayNewFamilies: 0,
  pendingAuditContents: 0,
  paidFamilies: 0,
  totalMembers: 0,
  content: { dynamics: 0, photos: 0, documents: 0, events: 0 },
  surnames: []
});
const loading = ref(true);
const error = ref('');
/** 数据最后更新时间 */
const lastUpdated = ref('');

/** 姓氏 TOP 数据（最多展示 12 个） */
const topSurnames = computed<SurnameStat[]>(() =>
  (stats.value.surnames || []).slice(0, 12)
);

/** 姓氏总数 */
const surnameTotalCount = computed(() => stats.value.surnames?.length || 0);

/** 姓氏图表配置（竖向柱状图，姓氏较多时启用横向滑动） */
const surnameChartOptions = computed<ECOption>(() => {
  const data = topSurnames.value;
  const names = data.map(s => s.surname);
  const members = data.map(s => s.memberCount);
  const families = data.map(s => s.familyCount);

  // 取最大值做自适应
  const maxVal = Math.max(...members, 1);

  // 姓氏数量较多时启用横向滑动（slider + 内部拖拽/滚轮/触屏），默认窗口展示前 8 个
  const showZoom = names.length > 8;
  const visibleCount = 8;
  const dataZoom = showZoom
    ? [
        {
          type: 'slider' as const,
          xAxisIndex: 0,
          height: 18,
          bottom: 30,
          startValue: 0,
          endValue: visibleCount - 1,
          showDetail: false,
          brushSelect: false,
          // 平滑滚动动画
          animationDurationUpdate: 300,
          handleStyle: { color: '#909399', borderColor: '#909399' }
        },
        {
          type: 'inside' as const,
          xAxisIndex: 0,
          startValue: 0,
          endValue: visibleCount - 1,
          // 禁用滚轮缩放，保留滚轮/拖拽/触屏横向平移，交互更贴近"滑动查看"
          zoomOnMouseWheel: false,
          moveOnMouseMove: true,
          moveOnMouseWheel: true
        }
      ]
    : undefined;

  return {
    animationDurationUpdate: 300,
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
    grid: {
      left: '2%',
      right: '2%',
      top: '6%',
      bottom: showZoom ? 64 : 36,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: { fontSize: 11, interval: 0, rotate: 35 }
    },
    yAxis: {
      type: 'value',
      max: Math.ceil(maxVal * 1.2),
      axisLabel: { fontSize: 11 }
    },
    dataZoom,
    series: [
      {
        name: t('page.home.chartMember'),
        type: 'bar',
        data: members,
        barMaxWidth: 28,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#36d47c' },
              { offset: 1, color: '#18a058' }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        },
        label: { show: true, position: 'top', fontSize: 10 }
      },
      {
        name: t('page.home.chartFamily'),
        type: 'bar',
        data: families,
        barMaxWidth: 28,
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#66b1ff' },
              { offset: 1, color: '#2080f0' }
            ]
          },
          borderRadius: [4, 4, 0, 0]
        },
        label: { show: true, position: 'top', fontSize: 10 }
      }
    ]
  };
});

// ECharts 实例
const { domRef: chartDomRef, updateOptions: updateSurnameChart } = useEcharts(
  () => surnameChartOptions.value as ECOption
);

// ==================== 订阅与商业化分析 ====================
const subscriptionStats = ref<SubscriptionStats>({
  subscriptionGrowth: [],
  revenue: [],
  conversion: [],
  kpis: { totalRevenue: 0, totalOrders: 0, totalPaidFamilies: 0, conversionRate: 0 }
});
const subscriptionLoading = ref(true);
const subscriptionError = ref('');

/** 日期范围类型 */
type DateRangeType = 'last7Days' | 'last30Days' | 'last90Days' | 'custom';
const activeRange = ref<DateRangeType>('last30Days');
const customDateRange = ref<[number, number] | null>(null);

function getPresetDateRange(type: DateRangeType): { startDate: string; endDate: string } {
  const end = dayjs();
  let start = end;
  if (type === 'last7Days') start = end.subtract(6, 'day');
  if (type === 'last30Days') start = end.subtract(29, 'day');
  if (type === 'last90Days') start = end.subtract(89, 'day');
  return { startDate: start.format('YYYY-MM-DD'), endDate: end.format('YYYY-MM-DD') };
}

const subscriptionDateRange = computed(() => {
  if (activeRange.value === 'custom' && customDateRange.value) {
    const [startTs, endTs] = customDateRange.value;
    return {
      startDate: dayjs(startTs).format('YYYY-MM-DD'),
      endDate: dayjs(endTs).format('YYYY-MM-DD')
    };
  }
  return getPresetDateRange(activeRange.value);
});

const subscriptionDates = computed(() => subscriptionStats.value.subscriptionGrowth.map(d => d.date));

/** 订阅增长趋势图配置 */
const subscriptionGrowthOptions = computed<ECOption>(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
  legend: {
    data: [t('page.home.chartNewSubscriptions'), t('page.home.chartTotalSubscriptions')],
    bottom: 0
  },
  grid: { left: '2%', right: '2%', top: '8%', bottom: 40, containLabel: true },
  xAxis: { type: 'category', data: subscriptionDates.value, axisLabel: { fontSize: 11 } },
  yAxis: [
    { type: 'value', name: t('page.home.chartNewSubscriptions'), axisLabel: { fontSize: 11 } },
    { type: 'value', name: t('page.home.chartTotalSubscriptions'), axisLabel: { fontSize: 11 } }
  ],
  dataZoom: subscriptionDates.value.length > 8
    ? [{ type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true }]
    : undefined,
  series: [
    {
      name: t('page.home.chartNewSubscriptions'),
      type: 'bar',
      data: subscriptionStats.value.subscriptionGrowth.map(d => d.newSubscriptions),
      barMaxWidth: 24,
      itemStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#66b1ff' }, { offset: 1, color: '#2080f0' }] },
        borderRadius: [4, 4, 0, 0]
      }
    },
    {
      name: t('page.home.chartTotalSubscriptions'),
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: subscriptionStats.value.subscriptionGrowth.map(d => d.totalSubscriptions),
      itemStyle: { color: '#18a058' },
      lineStyle: { width: 3 },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(24,160,88,0.2)' }, { offset: 1, color: 'rgba(24,160,88,0.02)' }]
        }
      }
    }
  ]
}));

/** 商业化收入数据图表配置 */
const revenueOptions = computed<ECOption>(() => ({
  tooltip: { trigger: 'axis', formatter: '{b}<br/>{a}: ¥{c}' },
  grid: { left: '2%', right: '2%', top: '8%', bottom: 24, containLabel: true },
  xAxis: { type: 'category', data: subscriptionStats.value.revenue.map(d => d.date), axisLabel: { fontSize: 11 } },
  yAxis: { type: 'value', name: '¥', axisLabel: { fontSize: 11 } },
  dataZoom: subscriptionStats.value.revenue.length > 8
    ? [{ type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true }]
    : undefined,
  series: [
    {
      name: t('page.home.chartRevenue'),
      type: 'bar',
      data: subscriptionStats.value.revenue.map(d => d.amount),
      barMaxWidth: 28,
      itemStyle: {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#f0a020' }, { offset: 1, color: '#d03050' }] },
        borderRadius: [4, 4, 0, 0]
      }
    }
  ]
}));

/** 用户转化率分析图表配置 */
const conversionOptions = computed<ECOption>(() => ({
  tooltip: { trigger: 'axis' },
  legend: {
    data: [t('page.home.chartFamilyCount'), t('page.home.chartPaidCount'), t('page.home.chartConversionRate')],
    bottom: 0
  },
  grid: { left: '2%', right: '2%', top: '8%', bottom: 40, containLabel: true },
  xAxis: { type: 'category', data: subscriptionStats.value.conversion.map(d => d.date), axisLabel: { fontSize: 11 } },
  yAxis: [
    { type: 'value', name: t('page.home.countUnit'), axisLabel: { fontSize: 11 } },
    { type: 'value', name: '%', max: 100, axisLabel: { fontSize: 11, formatter: '{value}%' } }
  ],
  dataZoom: subscriptionStats.value.conversion.length > 8
    ? [{ type: 'inside', xAxisIndex: 0, zoomOnMouseWheel: false, moveOnMouseWheel: true }]
    : undefined,
  series: [
    {
      name: t('page.home.chartFamilyCount'),
      type: 'line',
      smooth: true,
      data: subscriptionStats.value.conversion.map(d => d.familyCount),
      itemStyle: { color: '#909399' },
      lineStyle: { type: 'dashed' }
    },
    {
      name: t('page.home.chartPaidCount'),
      type: 'line',
      smooth: true,
      data: subscriptionStats.value.conversion.map(d => d.paidCount),
      itemStyle: { color: '#2080f0' },
      lineStyle: { width: 3 }
    },
    {
      name: t('page.home.chartConversionRate'),
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: subscriptionStats.value.conversion.map(d => d.conversionRate),
      itemStyle: { color: '#18a058' },
      lineStyle: { width: 3 },
      symbol: 'circle',
      symbolSize: 6
    }
  ]
}));

const { domRef: growthChartRef, updateOptions: updateGrowthChart } = useEcharts(
  () => subscriptionGrowthOptions.value as ECOption
);
const { domRef: revenueChartRef, updateOptions: updateRevenueChart } = useEcharts(
  () => revenueOptions.value as ECOption
);
const { domRef: conversionChartRef, updateOptions: updateConversionChart } = useEcharts(
  () => conversionOptions.value as ECOption
);

async function loadSubscriptionStats() {
  subscriptionLoading.value = true;
  subscriptionError.value = '';
  try {
    const result = await fetchDashboardSubscriptionStats(subscriptionDateRange.value);
    subscriptionStats.value = result?.data || subscriptionStats.value;
    updateGrowthChart(() => subscriptionGrowthOptions.value as ECOption);
    updateRevenueChart(() => revenueOptions.value as ECOption);
    updateConversionChart(() => conversionOptions.value as ECOption);
  } catch (err: any) {
    subscriptionError.value = t('page.home.subscriptionLoadError') || '获取订阅数据失败';
    console.error('subscription stats error:', err);
  } finally {
    subscriptionLoading.value = false;
  }
}

function handleRangeChange(type: DateRangeType) {
  activeRange.value = type;
  if (type !== 'custom') {
    customDateRange.value = null;
    loadSubscriptionStats();
  }
}

function handleCustomDateChange() {
  if (customDateRange.value) {
    activeRange.value = 'custom';
    loadSubscriptionStats();
  }
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
  loadSubscriptionStats();
  // 每 60 秒自动刷新
  timer = setInterval(() => {
    loadStats();
    loadSubscriptionStats();
  }, 60_000);
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
        <NGi span="24 s:12 m:6 l:4">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(24,160,88,0.12); color: #18a058;">
              <Icon icon="mdi:account-multiple" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.totalUsers') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.totalUsers" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6 l:4">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(54,212,124,0.12); color: #36d47c;">
              <Icon icon="mdi:account-plus" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.todayNewUsers') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.todayNewUsers" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6 l:4">
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
        <NGi span="24 s:12 m:6 l:4">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(102,177,255,0.12); color: #66b1ff;">
              <Icon icon="mdi:family-tree" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.todayNewFamilies') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.todayNewFamilies" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6 l:4">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(240,160,32,0.12); color: #f0a020;">
              <Icon icon="mdi:shield-alert" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.pendingAuditContents') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.pendingAuditContents" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6 l:4">
          <div class="stat-item">
            <div class="stat-icon" style="background: rgba(208,48,80,0.12); color: #d03050;">
              <Icon icon="mdi:crown" :width="28" />
            </div>
            <div class="stat-info">
              <div class="stat-label">{{ $t('page.home.paidFamilies') }}</div>
              <div class="stat-value">
                <NSkeleton v-if="loading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="stats.paidFamilies" :duration="1200" />
              </div>
            </div>
          </div>
        </NGi>
      </NGrid>
    </NCard>

    <!-- 订阅与商业化分析 -->
    <NCard :bordered="false" class="subscription-card">
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="font-medium">{{ $t('page.home.subscriptionStatsTitle') }}</span>
          <div class="flex items-center gap-3">
            <NButtonGroup size="small">
              <NButton
                :type="activeRange === 'last7Days' ? 'primary' : 'default'"
                @click="handleRangeChange('last7Days')"
              >
                {{ $t('page.home.last7Days') }}
              </NButton>
              <NButton
                :type="activeRange === 'last30Days' ? 'primary' : 'default'"
                @click="handleRangeChange('last30Days')"
              >
                {{ $t('page.home.last30Days') }}
              </NButton>
              <NButton
                :type="activeRange === 'last90Days' ? 'primary' : 'default'"
                @click="handleRangeChange('last90Days')"
              >
                {{ $t('page.home.last90Days') }}
              </NButton>
              <NButton
                :type="activeRange === 'custom' ? 'primary' : 'default'"
                @click="handleRangeChange('custom')"
              >
                {{ $t('page.home.customDate') }}
              </NButton>
            </NButtonGroup>
            <NDatePicker
              v-if="activeRange === 'custom'"
              v-model:value="customDateRange"
              type="daterange"
              size="small"
              clearable
              @update:value="handleCustomDateChange"
            />
          </div>
        </div>
      </template>

      <NAlert v-if="subscriptionError" type="warning" :title="subscriptionError" class="mb-4" />

      <!-- KPI 指标卡 -->
      <NGrid x-gap="16" y-gap="16" responsive="screen" item-responsive class="mb-5">
        <NGi span="24 s:12 m:6">
          <div class="kpi-card">
            <div class="kpi-icon" style="background: rgba(240,160,32,0.12); color: #f0a020;">
              <Icon icon="mdi:cash-multiple" :width="24" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ $t('page.home.kpiTotalRevenue') }}</div>
              <div class="kpi-value">
                <NSkeleton v-if="subscriptionLoading" text width="80" />
                <span v-else>¥{{ subscriptionStats.kpis.totalRevenue.toFixed(2) }}</span>
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6">
          <div class="kpi-card">
            <div class="kpi-icon" style="background: rgba(32,128,240,0.12); color: #2080f0;">
              <Icon icon="mdi:receipt-text" :width="24" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ $t('page.home.kpiPaidOrders') }}</div>
              <div class="kpi-value">
                <NSkeleton v-if="subscriptionLoading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="subscriptionStats.kpis.totalOrders" :duration="1000" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6">
          <div class="kpi-card">
            <div class="kpi-icon" style="background: rgba(208,48,80,0.12); color: #d03050;">
              <Icon icon="mdi:crown" :width="24" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ $t('page.home.kpiPaidFamilies') }}</div>
              <div class="kpi-value">
                <NSkeleton v-if="subscriptionLoading" text width="60" />
                <NNumberAnimation v-else :from="0" :to="subscriptionStats.kpis.totalPaidFamilies" :duration="1000" />
              </div>
            </div>
          </div>
        </NGi>
        <NGi span="24 s:12 m:6">
          <div class="kpi-card">
            <div class="kpi-icon" style="background: rgba(24,160,88,0.12); color: #18a058;">
              <Icon icon="mdi:trending-up" :width="24" />
            </div>
            <div class="kpi-info">
              <div class="kpi-label">{{ $t('page.home.kpiConversionRate') }}</div>
              <div class="kpi-value">
                <NSkeleton v-if="subscriptionLoading" text width="60" />
                <span v-else>{{ subscriptionStats.kpis.conversionRate }}%</span>
              </div>
            </div>
          </div>
        </NGi>
      </NGrid>

      <!-- 图表区 -->
      <NGrid x-gap="16" y-gap="16" responsive="screen" item-responsive>
        <NGi span="24 s:24 m:24 l:16">
          <NCard :bordered="false" :title="$t('page.home.chartSubscriptionGrowth')" class="chart-card">
            <div class="relative">
              <NSkeleton v-if="subscriptionLoading" text :repeat="6" class="absolute inset-0 z-10 bg-white dark:bg-[#101014]" />
              <div
                v-if="!subscriptionLoading && subscriptionStats.subscriptionGrowth.length === 0"
                class="flex items-center justify-center h-72 text-gray-400"
              >
                {{ $t('page.home.noData') }}
              </div>
              <div ref="growthChartRef" class="chart-container" />
            </div>
          </NCard>
        </NGi>
        <NGi span="24 s:24 m:24 l:8">
          <NCard :bordered="false" :title="$t('page.home.chartRevenue')" class="chart-card">
            <div class="relative">
              <NSkeleton v-if="subscriptionLoading" text :repeat="6" class="absolute inset-0 z-10 bg-white dark:bg-[#101014]" />
              <div
                v-if="!subscriptionLoading && subscriptionStats.revenue.length === 0"
                class="flex items-center justify-center h-72 text-gray-400"
              >
                {{ $t('page.home.noData') }}
              </div>
              <div ref="revenueChartRef" class="chart-container" />
            </div>
          </NCard>
        </NGi>
        <NGi span="24 s:24 m:24 l:24">
          <NCard :bordered="false" :title="$t('page.home.chartConversion')" class="chart-card">
            <div class="relative">
              <NSkeleton v-if="subscriptionLoading" text :repeat="6" class="absolute inset-0 z-10 bg-white dark:bg-[#101014]" />
              <div
                v-if="!subscriptionLoading && subscriptionStats.conversion.length === 0"
                class="flex items-center justify-center h-72 text-gray-400"
              >
                {{ $t('page.home.noData') }}
              </div>
              <div ref="conversionChartRef" class="chart-container" />
            </div>
          </NCard>
        </NGi>
      </NGrid>
    </NCard>

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

.subscription-card {
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

.kpi-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: 12px;
  background: var(--n-color-hover);
}

.kpi-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  flex-shrink: 0;
}

.kpi-info {
  min-width: 0;
}

.kpi-label {
  font-size: 13px;
  color: var(--n-text-color-2);
  margin-bottom: 4px;
}

.kpi-value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.chart-card {
  --n-padding: 16px;
}

.chart-container {
  width: 100%;
  height: 300px;
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
