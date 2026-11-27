<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn } from 'naive-ui';
import {
  useMessage, useDialog, NTag, NButton, NSpace,
  NSelect, NInput, NInputNumber, NForm, NFormItem,
  NDataTable, NModal, NSwitch, NCard
} from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchAdminHistoryEventList,
  fetchCreateAdminHistoryEvent,
  fetchUpdateAdminHistoryEvent,
  fetchDeleteAdminHistoryEvent,
  fetchToggleAdminHistoryEventStatus
} from '@/service/api/history-events';
import type { HistoryEventItem, HistoryEventPayload } from '@/service/api/history-events';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

// 分类常量（对应后端 HistoryCategory）
const CATEGORY_OPTIONS = [
  { label: '政治',     value: 'politics' },
  { label: '战争',     value: 'war' },
  { label: '文化',     value: 'culture' },
  { label: '经济',     value: 'economy' },
  { label: '社会迁徙', value: 'society' },
  { label: '科技',     value: 'science' }
];
const CATEGORY_TAG: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary'> = {
  politics: 'primary',
  war:      'error',
  culture:  'info',
  economy:  'success',
  society:  'warning',
  science:  'default'
};
const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map(o => [o.value, o.label])
);

// ===== 列表 =====
const loading = ref(false);
const data = ref<HistoryEventItem[]>([]);
const search = reactive({
  yearFrom: null as number | null,
  yearTo: null as number | null,
  category: null as string | null,
  keyword: '',
  status: null as number | null
});
const pagination = reactive({ page: 1, pageSize: 20, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

function formatYear(v: number) {
  if (v < 0) return `前${Math.abs(v)}年`;
  return `${v}年`;
}
function formatTime(v: string | null | undefined) {
  return v ? String(v).replace('T', ' ').slice(0, 19) : '-';
}

const columns: DataTableColumn<HistoryEventItem>[] = [
  { title: 'ID', key: 'id', width: 60 },
  {
    title: '年份', key: 'year', width: 110, align: 'center',
    sorter: 'default',
    render: row => h('span', row.year < 0 ? { style: 'color: #f26a6a' } : {}, formatYear(row.year))
  },
  {
    title: '分类', key: 'category', width: 100, align: 'center',
    render: row => h(NTag, {
      type: CATEGORY_TAG[row.category] || 'default',
      size: 'small',
      bordered: false
    }, { default: () => CATEGORY_LABEL[row.category] || row.category })
  },
  { title: '朝代', key: 'dynasty', width: 90, ellipsis: { tooltip: true } },
  { title: '事件标题', key: 'title', minWidth: 180, ellipsis: { tooltip: true } },
  { title: '描述', key: 'description', minWidth: 260, ellipsis: { tooltip: true } },
  { title: '地域', key: 'region', width: 150, ellipsis: { tooltip: true }, render: row => row.region || '-' },
  { title: '排序', key: 'sort_order', width: 70, align: 'center' },
  {
    title: '状态', key: 'status', width: 80, align: 'center',
    render: row => h(NTag, {
      type: row.status === 1 ? 'success' : 'default',
      size: 'small', bordered: false
    }, { default: () => row.status === 1 ? '启用' : '停用' })
  },
  { title: '创建时间', key: 'create_time', width: 170, render: row => formatTime(row.create_time) },
  {
    title: '操作', key: 'actions', width: 200, fixed: 'right',
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        hasAuth('system:history-events:update')
          ? h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => openEdit(row) }, { default: () => '编辑' })
          : null,
        hasAuth('system:history-events:update')
          ? h(NButton, {
              size: 'small',
              type: row.status === 1 ? 'warning' : 'success',
              ghost: true,
              onClick: () => handleToggle(row)
            }, { default: () => row.status === 1 ? '停用' : '启用' })
          : null,
        hasAuth('system:history-events:delete')
          ? h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
          : null
      ].filter(Boolean)
    })
  }
];

function handleSearch() { pagination.page = 1; loadList(); }
function handleReset() {
  search.yearFrom = null; search.yearTo = null;
  search.category = null; search.keyword = ''; search.status = null;
  pagination.page = 1; loadList();
}
function handlePageChange(page: number) { pagination.page = page; loadList(); }
function handlePageSizeChange(size: number) { pagination.pageSize = size; pagination.page = 1; loadList(); }

async function loadList() {
  loading.value = true;
  try {
    const { data: res } = await fetchAdminHistoryEventList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      yearFrom: search.yearFrom ?? undefined,
      yearTo: search.yearTo ?? undefined,
      category: search.category ?? undefined,
      keyword: search.keyword || undefined,
      status: search.status ?? undefined
    });
    data.value = res?.list || [];
    pagination.itemCount = res?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '历史事件列表加载失败');
  } finally {
    loading.value = false;
  }
}

// ===== 新增 / 编辑弹窗 =====
const showModal = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const form = reactive<HistoryEventPayload>({
  year: 0,
  title: '',
  dynasty: '',
  description: '',
  category: 'society',
  region: '',
  keywords: '',
  sort_order: 0,
  status: 1
});

function resetForm() {
  Object.assign(form, {
    year: 0,
    title: '',
    dynasty: '',
    description: '',
    category: 'society',
    region: '',
    keywords: '',
    sort_order: 0,
    status: 1
  });
}

function openCreate() {
  editingId.value = null;
  resetForm();
  showModal.value = true;
}

function openEdit(row: HistoryEventItem) {
  editingId.value = row.id;
  Object.assign(form, {
    year: row.year,
    title: row.title,
    dynasty: row.dynasty || '',
    description: row.description || '',
    category: row.category,
    region: row.region || '',
    keywords: row.keywords || '',
    sort_order: row.sort_order,
    status: row.status
  });
  showModal.value = true;
}

async function handleSave() {
  if (!form.title.trim()) { message.warning('请填写事件标题'); return; }
  if (form.year === null || form.year === undefined || Number.isNaN(Number(form.year))) {
    message.warning('请填写有效年份（公元前用负数，如 -221）'); return;
  }
  if (!form.category) { message.warning('请选择分类'); return; }

  saving.value = true;
  try {
    if (editingId.value) {
      await fetchUpdateAdminHistoryEvent(editingId.value, form);
      message.success('更新成功，小程序缓存已自动刷新');
    } else {
      await fetchCreateAdminHistoryEvent(form);
      message.success('创建成功，小程序缓存已自动刷新');
    }
    showModal.value = false;
    loadList();
  } catch (err: any) {
    message.error(err?.msg || '保存失败');
  } finally {
    saving.value = false;
  }
}

function handleDelete(row: HistoryEventItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除「${row.title}（${formatYear(row.year)}）」吗？删除后将从时空地图中消失。`,
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminHistoryEvent(row.id);
        message.success('删除成功');
        loadList();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

async function handleToggle(row: HistoryEventItem) {
  try {
    const nextStatus = row.status === 1 ? 0 : 1;
    await fetchToggleAdminHistoryEventStatus(row.id, nextStatus);
    message.success(nextStatus === 1 ? '已启用' : '已停用');
    loadList();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  }
}

onMounted(() => loadList());
</script>

<template>
  <div>
    <!-- 搜索卡片 -->
    <NCard title="同期历史事件管理" :bordered="false" class="mb-16px">
      <div class="flex items-center gap-12px flex-wrap">
        <NInputNumber v-model:value="search.yearFrom" placeholder="起始年" style="width: 130px" :show-button="false" />
        <span class="text-gray-400">—</span>
        <NInputNumber v-model:value="search.yearTo" placeholder="结束年" style="width: 130px" :show-button="false" />
        <NSelect v-model:value="search.category" :options="CATEGORY_OPTIONS" placeholder="分类" clearable style="width: 130px" />
        <NSelect
          v-model:value="search.status"
          :options="[{ label: '启用', value: 1 }, { label: '停用', value: 0 }]"
          placeholder="状态" clearable style="width: 110px"
        />
        <NInput v-model:value="search.keyword" placeholder="标题/描述关键字" clearable style="width: 200px" @keyup.enter="handleSearch" />
        <NButton type="primary" ghost @click="handleSearch">查询</NButton>
        <NButton @click="handleReset">重置</NButton>
        <div class="flex-1" />
        <NButton v-if="hasAuth('system:history-events:create')" type="primary" @click="openCreate">新增事件</NButton>
      </div>
      <div class="text-12px text-gray-400 mt-8px">
        💡 公元前年份请用负数填写（如 -221 表示公元前 221 年）。修改后小程序端时空地图缓存会自动刷新。
      </div>
    </NCard>

    <!-- 数据表格 -->
    <NCard :bordered="false">
      <NDataTable
        :columns="columns"
        :data="data"
        :loading="loading"
        :row-key="row => row.id"
        :pagination="pagination"
        :bordered="false"
        :single-line="false"
        :scroll-x="1600"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- 新增 / 编辑弹窗 -->
    <NModal
      v-model:show="showModal"
      preset="card"
      :title="editingId ? '编辑历史事件' : '新增历史事件'"
      style="width: min(92vw, 620px)"
      :mask-closable="false"
    >
      <NForm label-placement="left" label-width="90px">
        <NFormItem label="事件标题" required>
          <NInput v-model:value="form.title" placeholder="例如：明初大槐树移民" maxlength="100" />
        </NFormItem>
        <NFormItem label="年份" required>
          <div class="flex items-center gap-8px">
            <NInputNumber v-model:value="form.year" style="width: 160px" placeholder="正数公元，负数公元前" />
            <span class="text-12px text-gray-400">例：1370 = 公元1370年；-221 = 公元前221年</span>
          </div>
        </NFormItem>
        <NFormItem label="分类" required>
          <NSelect v-model:value="form.category" :options="CATEGORY_OPTIONS" style="width: 200px" />
        </NFormItem>
        <NFormItem label="朝代">
          <NInput v-model:value="form.dynasty" placeholder="例如：明 / 清 / 民国" maxlength="50" />
        </NFormItem>
        <NFormItem label="描述">
          <NInput
            v-model:value="form.description"
            type="textarea"
            placeholder="事件详细描述（建议包含与家族迁徙相关的背景）"
            :rows="3"
            maxlength="500"
          />
        </NFormItem>
        <NFormItem label="关联地域">
          <NInput
            v-model:value="form.region"
            placeholder="逗号分隔，如：华北,河南,河北,山东（未来按家族籍贯精准匹配）"
            maxlength="200"
          />
        </NFormItem>
        <NFormItem label="搜索关键词">
          <NInput
            v-model:value="form.keywords"
            placeholder="逗号分隔，如：大槐树,移民,官方移民"
            maxlength="200"
          />
        </NFormItem>
        <NFormItem label="排序值">
          <NInputNumber v-model:value="form.sort_order" :min="0" :max="9999" style="width: 160px" />
          <span class="text-12px text-gray-400 ml-8px">同一年份内越大越靠前</span>
        </NFormItem>
        <NFormItem label="状态">
          <NSwitch v-model:value="form.status" :checked-value="1" :unchecked-value="0">
            <template #checked>启用（小程序端可见）</template>
            <template #unchecked>停用（小程序端隐藏）</template>
          </NSwitch>
        </NFormItem>
      </NForm>
      <template #footer>
        <div class="flex justify-end gap-8px">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" :loading="saving" @click="handleSave">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>
