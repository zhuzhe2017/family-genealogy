<script setup lang="ts">
import { h, ref, reactive, computed, onMounted } from 'vue';
import type { DataTableColumn, DataTableRowKey } from 'naive-ui';
import { useMessage, useDialog, NButton, NSpace, NImage, NTag } from 'naive-ui';
import {
  fetchContentList,
  fetchContentAudit,
  fetchContentToggle,
  fetchContentDelete,
  type ContentType,
  type AuditStatus,
  type ContentListItem
} from '@/service/api';
import { useAuth } from '@/hooks/business/auth';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

interface TabConfig {
  key: ContentType;
  label: string;
}

const tabs: TabConfig[] = [
  { key: 'dynamic', label: '动态' },
  { key: 'photo', label: '相册照片' },
  { key: 'document', label: '家族文档' },
  { key: 'event', label: '家族事件' }
];

const activeTab = ref<ContentType>('dynamic');
const loading = ref(false);
const tableData = ref<ContentListItem[]>([]);

const searchParams = reactive({
  keyword: '',
  auditStatus: null as AuditStatus | null
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50]
});

const auditStatusOptions = [
  { label: '待审核', value: 0 },
  { label: '已通过', value: 1 },
  { label: '已下架', value: 2 }
];

function auditStatusTag(status: number) {
  const map: Record<number, { text: string; type: 'warning' | 'success' | 'error' }> = {
    0: { text: '待审核', type: 'warning' },
    1: { text: '已通过', type: 'success' },
    2: { text: '已下架', type: 'error' }
  };
  const item = map[status] || { text: '未知', type: 'warning' as const };
  return h(NTag, { type: item.type, size: 'small', bordered: false }, { default: () => item.text });
}

/** 各类型列定义 */
function buildColumns(type: ContentType): DataTableColumn<ContentListItem>[] {
  const base: DataTableColumn<ContentListItem>[] = [
    { title: '审核状态', key: 'audit_status', width: 100, render: row => auditStatusTag(row.audit_status) },
    { title: '创建时间', key: 'create_time', width: 170 }
  ];

  const actions: DataTableColumn<ContentListItem> = {
    title: '操作',
    key: 'actions',
    width: 220,
    fixed: 'right',
    render: row =>
      h(NSpace, { size: 8 }, {
        default: () => renderActions(row)
      })
  };

  switch (type) {
    case 'dynamic':
      return [
        { title: '动态内容', key: 'content', ellipsis: { tooltip: true }, minWidth: 240 },
        { title: '发布者', key: 'user_name', width: 110 },
        { title: '点赞', key: 'like_count', width: 80 },
        { title: '评论', key: 'comment_count', width: 80 },
        ...base,
        actions
      ];
    case 'photo':
      return [
        {
          title: '照片',
          key: 'url',
          width: 90,
          render: row => (row.url ? h(NImage, { src: row.url, width: 60, objectFit: 'cover' }) : '-')
        },
        { title: '标题', key: 'title', ellipsis: { tooltip: true }, minWidth: 160 },
        { title: '年份', key: 'year', width: 80 },
        { title: '上传者', key: 'uploader_name', width: 110 },
        ...base,
        actions
      ];
    case 'document':
      return [
        { title: '文档名称', key: 'name', ellipsis: { tooltip: true }, minWidth: 200 },
        { title: '卷册', key: 'volume', width: 100 },
        { title: '页数', key: 'page_count', width: 80 },
        ...base,
        actions
      ];
    case 'event':
      return [
        { title: '事件标题', key: 'title', ellipsis: { tooltip: true }, minWidth: 200 },
        { title: '类型', key: 'type_name', width: 90 },
        {
          title: '日期',
          key: 'date',
          width: 120,
          render: row => `${row.year || '-'}-${String(row.month || 0).padStart(2, '0')}-${String(row.day || 0).padStart(2, '0')}`
        },
        ...base,
        actions
      ];
  }
}

const columns = computed(() => buildColumns(activeTab.value));

/** 根据审核状态渲染操作按钮 */
function renderActions(row: ContentListItem) {
  const btns: any[] = [];
  const s = row.audit_status;

  // 待审核：通过 / 驳回
  if (s === 0) {
    if (hasAuth('system:content:audit')) {
      btns.push(h(NButton, { size: 'small', type: 'success', ghost: true, onClick: () => handleAudit(row, 1) }, { default: () => '通过' }));
      btns.push(h(NButton, { size: 'small', type: 'warning', ghost: true, onClick: () => handleAudit(row, 2) }, { default: () => '驳回' }));
    }
  }
  // 已通过：下架
  if (s === 1 && hasAuth('system:content:toggle')) {
    btns.push(h(NButton, { size: 'small', type: 'warning', ghost: true, onClick: () => handleToggle(row) }, { default: () => '下架' }));
  }
  // 已下架：上架
  if (s === 2 && hasAuth('system:content:toggle')) {
    btns.push(h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleToggle(row) }, { default: () => '上架' }));
  }
  // 删除
  if (hasAuth('system:content:delete')) {
    btns.push(h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' }));
  }
  return btns;
}

async function loadData() {
  loading.value = true;
  try {
    const { data } = await fetchContentList(activeTab.value, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchParams.keyword || undefined,
      auditStatus: searchParams.auditStatus ?? undefined
    });
    tableData.value = data?.list || [];
    pagination.itemCount = data?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '加载列表失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchParams.keyword = '';
  searchParams.auditStatus = null;
  pagination.page = 1;
  loadData();
}

function handlePageChange(page: number) {
  pagination.page = page;
  loadData();
}

function handlePageSizeChange(pageSize: number) {
  pagination.pageSize = pageSize;
  pagination.page = 1;
  loadData();
}

async function handleAudit(row: ContentListItem, auditStatus: AuditStatus) {
  try {
    await fetchContentAudit(activeTab.value, row.id, auditStatus);
    message.success(auditStatus === 1 ? '已通过' : '已驳回');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  }
}

async function handleToggle(row: ContentListItem) {
  try {
    await fetchContentToggle(activeTab.value, row.id);
    message.success('操作成功');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  }
}

function handleDelete(row: ContentListItem) {
  dialog.warning({
    title: '确认删除',
    content: '确定要删除该内容吗？删除后小程序端将不再展示。',
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchContentDelete(activeTab.value, row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

function handleTabChange(key: string) {
  activeTab.value = key as ContentType;
  searchParams.keyword = '';
  searchParams.auditStatus = null;
  pagination.page = 1;
  loadData();
}

const rowKey = (row: ContentListItem) => row.id;

onMounted(() => {
  loadData();
});
</script>

<template>
  <div>
    <NCard :bordered="false" class="mb-16px">
      <NForm inline label-placement="left" :model="searchParams">
        <NFormItem label="关键词">
          <NInput v-model:value="searchParams.keyword" placeholder="标题/内容/发布者" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="审核状态">
          <NSelect
            v-model:value="searchParams.auditStatus"
            placeholder="全部"
            clearable
            :options="auditStatusOptions"
            style="width: 140px"
          />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>

    <NCard :bordered="false" title="内容管理">
      <NTabs type="line" animated :value="activeTab" @update:value="handleTabChange">
        <NTabPane v-for="tab in tabs" :key="tab.key" :name="tab.key" :tab="tab.label">
          <NDataTable
            :columns="columns"
            :data="tableData"
            :loading="loading"
            :row-key="rowKey"
            :pagination="pagination"
            :bordered="false"
            :single-line="false"
            remote
            @update:page="handlePageChange"
            @update:page-size="handlePageSizeChange"
          />
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>
