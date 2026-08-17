<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn } from 'naive-ui';
import { useMessage, useDialog, NTag, NButton, NSpace, NTabs, NTabPane, NImage, NSelect, NInput, NForm, NFormItem, NCard, NDataTable } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import { resolveImageUrl } from '@/utils/image-url';
import {
  fetchAllFamilies,
  fetchAdminWorshipRecordList, fetchDeleteAdminWorshipRecord,
  fetchAdminWorshipMemorialList, fetchDeleteAdminWorshipMemorial
} from '@/service/api';
import type { AdminWorshipRecordItem, AdminWorshipMemorialItem } from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

const noImageUrl = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2220%22 y=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22central%22 fill=%22%23999%22 font-size=%2212%22%3E无%3C/text%3E%3C/svg%3E';

const activeTab = ref('records');

// ===== 家族下拉 =====
const familyOptions = ref<{ label: string; value: number }[]>([]);
async function loadFamilyOptions() {
  try {
    const { data } = await fetchAllFamilies({ status: 1 });
    familyOptions.value = (data || []).map((f: any) => ({ label: `${f.name}（ID ${f.id}）`, value: f.id }));
  } catch {
    familyOptions.value = [];
  }
}

// ===== 祭祀记录 =====
const recordLoading = ref(false);
const recordData = ref<AdminWorshipRecordItem[]>([]);
const recordSearch = reactive({ familyId: null as number | null, type: '', keyword: '' });
const recordPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const typeOptions = [
  { label: '上香', value: 'incense' },
  { label: '祈福', value: 'pray' },
  { label: '献祭', value: 'offer' },
  { label: '许愿', value: 'wish' }
];

const typeTagType: Record<string, 'default' | 'success' | 'warning' | 'info' | 'error' | 'primary'> = {
  incense: 'warning',
  pray: 'success',
  offer: 'error',
  wish: 'primary'
};
const typeLabels: Record<string, string> = { incense: '上香', pray: '祈福', offer: '献祭', wish: '许愿' };

const recordColumns: DataTableColumn<AdminWorshipRecordItem>[] = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '家族', key: 'familyName', width: 140, ellipsis: { tooltip: true }, render: row => row.familyName || `#${row.familyId}` },
  { title: '祭祀人', key: 'userName', width: 110 },
  {
    title: '类型', key: 'type', width: 80, align: 'center',
    render: row => h(NTag, { type: typeTagType[row.type] || 'default', size: 'small', bordered: false }, { default: () => typeLabels[row.type] || row.type })
  },
  { title: '内容/心愿', key: 'content', ellipsis: { tooltip: true }, render: row => row.content || '-' },
  { title: '时间', key: 'createTime', width: 170 },
  {
    title: '操作', key: 'actions', width: 90, fixed: 'right',
    render: row => hasAuth('system:worship:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDeleteRecord(row) }, { default: () => '删除' })
  }
];

function handleRecordSearch() { recordPagination.page = 1; loadRecords(); }
function handleRecordReset() {
  recordSearch.familyId = null; recordSearch.type = ''; recordSearch.keyword = '';
  recordPagination.page = 1; loadRecords();
}
function handleRecordPageChange(page: number) { recordPagination.page = page; loadRecords(); }
function handleRecordPageSizeChange(size: number) { recordPagination.pageSize = size; recordPagination.page = 1; loadRecords(); }

async function loadRecords() {
  recordLoading.value = true;
  try {
    const { data } = await fetchAdminWorshipRecordList({
      page: recordPagination.page,
      pageSize: recordPagination.pageSize,
      familyId: recordSearch.familyId ?? undefined,
      type: recordSearch.type || undefined,
      keyword: recordSearch.keyword || undefined
    });
    recordData.value = data?.list || [];
    recordPagination.itemCount = data?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '祭祀记录加载失败');
  } finally {
    recordLoading.value = false;
  }
}

function handleDeleteRecord(row: AdminWorshipRecordItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除「${row.userName}」的${typeLabels[row.type] || row.type}记录吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminWorshipRecord(row.id);
        message.success('删除成功');
        loadRecords();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

// ===== 纪念对象 =====
const memorialLoading = ref(false);
const memorialData = ref<AdminWorshipMemorialItem[]>([]);
const memorialSearch = reactive({ familyId: null as number | null, keyword: '' });
const memorialPagination = reactive({ page: 1, pageSize: 10, itemCount: 0, showSizePicker: true, pageSizes: [10, 20, 50, 100] });

const memorialColumns: DataTableColumn<AdminWorshipMemorialItem>[] = [
  { title: 'ID', key: 'id', width: 70 },
  { title: '家族', key: 'familyName', width: 140, ellipsis: { tooltip: true }, render: row => row.familyName || `#${row.familyId}` },
  { title: '成员', key: 'memberName', width: 110 },
  {
    title: '遗像', key: 'avatarUrl', width: 80,
    render: row => {
      if (!row.avatarUrl) return '-';
      return h(NImage, {
        src: resolveImageUrl(row.avatarUrl),
        width: 36,
        height: 36,
        'fallback-src': noImageUrl,
        style: 'object-fit: contain; border-radius: 4px;',
        'img-props': { style: 'object-fit: contain;' }
      });
    }
  },
  { title: '纪念寄语', key: 'epitaph', ellipsis: { tooltip: true }, render: row => row.epitaph || '-' },
  { title: '创建人', key: 'creatorUserId', width: 150, ellipsis: { tooltip: true } },
  { title: '创建时间', key: 'createTime', width: 170 },
  {
    title: '操作', key: 'actions', width: 90, fixed: 'right',
    render: row => hasAuth('system:worship:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDeleteMemorial(row) }, { default: () => '删除' })
  }
];

function handleMemorialSearch() { memorialPagination.page = 1; loadMemorials(); }
function handleMemorialReset() {
  memorialSearch.familyId = null; memorialSearch.keyword = '';
  memorialPagination.page = 1; loadMemorials();
}
function handleMemorialPageChange(page: number) { memorialPagination.page = page; loadMemorials(); }
function handleMemorialPageSizeChange(size: number) { memorialPagination.pageSize = size; memorialPagination.page = 1; loadMemorials(); }

async function loadMemorials() {
  memorialLoading.value = true;
  try {
    const { data } = await fetchAdminWorshipMemorialList({
      page: memorialPagination.page,
      pageSize: memorialPagination.pageSize,
      familyId: memorialSearch.familyId ?? undefined,
      keyword: memorialSearch.keyword || undefined
    });
    memorialData.value = data?.list || [];
    memorialPagination.itemCount = data?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '纪念对象加载失败');
  } finally {
    memorialLoading.value = false;
  }
}

function handleDeleteMemorial(row: AdminWorshipMemorialItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定删除成员「${row.memberName}」的纪念对象吗？删除后小程序端不再展示。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteAdminWorshipMemorial(row.id);
        message.success('删除成功');
        loadMemorials();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

function handleTabChange(tab: string) {
  activeTab.value = tab;
  if (tab === 'records') loadRecords();
  if (tab === 'memorials') loadMemorials();
}

onMounted(() => { loadRecords(); loadFamilyOptions(); });
</script>

<template>
  <div>
    <NCard :bordered="false" title="祭祀管理">
      <template #header-extra>
        <span class="text-gray-400 text-12px">祭祀记录 / 纪念对象管理，删除操作不可恢复</span>
      </template>
      <NTabs type="line" :value="activeTab" @update:value="handleTabChange">
        <NTabPane name="records" tab="祭祀记录">
          <NForm inline label-placement="left" class="mb-16px">
            <NFormItem label="家族">
              <NSelect v-model:value="recordSearch.familyId" placeholder="全部家族" clearable filterable :options="familyOptions" style="width: 220px" />
            </NFormItem>
            <NFormItem label="类型">
              <NSelect v-model:value="recordSearch.type" placeholder="全部" clearable :options="typeOptions" style="width: 110px" />
            </NFormItem>
            <NFormItem label="祭祀人">
              <NInput v-model:value="recordSearch.keyword" placeholder="祭祀人姓名" clearable style="width: 150px" @keyup.enter="handleRecordSearch" />
            </NFormItem>
            <NFormItem>
              <NSpace>
                <NButton type="primary" @click="handleRecordSearch">搜索</NButton>
                <NButton @click="handleRecordReset">重置</NButton>
              </NSpace>
            </NFormItem>
          </NForm>
          <NDataTable
            :columns="recordColumns"
            :data="recordData"
            :loading="recordLoading"
            :row-key="row => row.id"
            :pagination="recordPagination"
            :bordered="false"
            :single-line="false"
            :scroll-x="1000"
            remote
            @update:page="handleRecordPageChange"
            @update:page-size="handleRecordPageSizeChange"
          />
        </NTabPane>

        <NTabPane name="memorials" tab="纪念对象">
          <NForm inline label-placement="left" class="mb-16px">
            <NFormItem label="家族">
              <NSelect v-model:value="memorialSearch.familyId" placeholder="全部家族" clearable filterable :options="familyOptions" style="width: 220px" />
            </NFormItem>
            <NFormItem label="成员">
              <NInput v-model:value="memorialSearch.keyword" placeholder="成员姓名" clearable style="width: 150px" @keyup.enter="handleMemorialSearch" />
            </NFormItem>
            <NFormItem>
              <NSpace>
                <NButton type="primary" @click="handleMemorialSearch">搜索</NButton>
                <NButton @click="handleMemorialReset">重置</NButton>
              </NSpace>
            </NFormItem>
          </NForm>
          <NDataTable
            :columns="memorialColumns"
            :data="memorialData"
            :loading="memorialLoading"
            :row-key="row => row.id"
            :pagination="memorialPagination"
            :bordered="false"
            :single-line="false"
            :scroll-x="1100"
            remote
            @update:page="handleMemorialPageChange"
            @update:page-size="handleMemorialPageSizeChange"
          />
        </NTabPane>
      </NTabs>
    </NCard>
  </div>
</template>
