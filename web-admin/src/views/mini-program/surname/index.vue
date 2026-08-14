<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import { useMessage, useDialog, NSwitch, NImage, NButton, NSpace } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import ImageUpload from '@/components/common/image-upload/index.vue';
import { resolveImageUrl } from '@/utils/image-url';
import {
  fetchSurnameList, fetchCreateSurname, fetchUpdateSurname,
  fetchDeleteSurname, fetchToggleSurnameStatus,
  fetchAllSurnames, fetchBatchImportSurnames
} from '@/service/api';

interface SurnameItem {
  id: number;
  surname: string;
  pinyin: string;
  initial: string;
  ranking: number;
  totem: string;
  origin: string;
  population: number;
  description: string;
  status: number;
  createBy: string;
  createTime: string;
  updateTime: string;
}

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();
const noImageUrl = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2220%22 y=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22central%22 fill=%22%23999%22 font-size=%2212%22%3E无%3C/text%3E%3C/svg%3E';

const loading = ref(false);
const tableData = ref<SurnameItem[]>([]);

const searchParams = reactive({
  keyword: '',
  initial: null as string | null,
  status: null as number | null
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100]
});

const initials = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const initialOptions = initials.map(ch => ({ label: ch, value: ch }));

const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 }
];

const columns: DataTableColumn<SurnameItem>[] = [
  { title: '姓氏', key: 'surname', width: 70, fixed: 'left' },
  { title: '拼音', key: 'pinyin', width: 100 },
  { title: '首字母', key: 'initial', width: 65 },
  { title: '排名', key: 'ranking', width: 70, sorter: (a, b) => a.ranking - b.ranking },
  {
    title: '图腾', key: 'totem', width: 90,
    render: row => {
      if (!row.totem) return '-';
      return h(NImage, {
        src: resolveImageUrl(row.totem),
        width: 36,
        height: 36,
        'fallback-src': noImageUrl,
        style: 'object-fit: contain; border-radius: 4px;',
        'img-props': { style: 'object-fit: contain;' }
      });
    }
  },
  { title: '起源', key: 'origin', ellipsis: { tooltip: true }, width: 200 },
  { title: '人口', key: 'population', width: 100, render: row => row.population ? row.population.toLocaleString() : '-' },
  { title: '创建人', key: 'createBy', width: 100 },
  {
    title: '状态', key: 'status', width: 75,
    render: row => h(NSwitch, {
      value: row.status === 1,
      disabled: !hasAuth('system:surname:status'),
      'onUpdate:value': () => handleToggleStatus(row)
    })
  },
  { title: '创建时间', key: 'createTime', width: 170 },
  {
    title: '操作', key: 'actions', width: 150, fixed: 'right',
    render: row => h(NSpace, null, {
      default: () => [
        hasAuth('system:surname:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
        hasAuth('system:surname:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
      ]
    })
  }
];

function handleSearch() {
  pagination.page = 1;
  loadData();
}

function handleReset() {
  searchParams.keyword = '';
  searchParams.initial = null;
  searchParams.status = null;
  pagination.page = 1;
  loadData();
}

function handlePageChange(page: number) {
  pagination.page = page;
  loadData();
}

function handlePageSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  loadData();
}

async function loadData() {
  loading.value = true;
  try {
    const { data } = await fetchSurnameList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchParams.keyword || undefined,
      initial: searchParams.initial || undefined,
      status: searchParams.status ?? undefined
    });
    tableData.value = data?.list || [];
    pagination.itemCount = data?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '加载失败');
  } finally {
    loading.value = false;
  }
}

// ===== 新增/编辑 =====
const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<number | null>(null);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);

const formData = reactive({
  surname: '',
  pinyin: '',
  initial: '',
  ranking: 0,
  totem: '',
  origin: '',
  population: 0,
  description: ''
});

const formRules = {
  surname: [{ required: true, message: '请输入姓氏', trigger: 'blur' }]
};

function resetForm() {
  formData.surname = '';
  formData.pinyin = '';
  formData.initial = '';
  formData.ranking = 0;
  formData.totem = '';
  formData.origin = '';
  formData.population = 0;
  formData.description = '';
}

function handleAdd() {
  isEdit.value = false;
  editId.value = null;
  resetForm();
  showModal.value = true;
}

function handleEdit(row: SurnameItem) {
  isEdit.value = true;
  editId.value = row.id;
  formData.surname = row.surname;
  formData.pinyin = row.pinyin;
  formData.initial = row.initial;
  formData.ranking = row.ranking;
  formData.totem = row.totem;
  formData.origin = row.origin;
  formData.population = row.population;
  formData.description = row.description;
  showModal.value = true;
}

async function handleSubmit() {
  try { await formRef.value?.validate(); } catch { return; }
  submitting.value = true;
  try {
    if (isEdit.value && editId.value) {
      await fetchUpdateSurname(editId.value, formData);
      message.success('更新成功');
    } else {
      await fetchCreateSurname(formData);
      message.success('新增成功');
    }
    showModal.value = false;
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  } finally {
    submitting.value = false;
  }
}

// ===== 删除 =====
function handleDelete(row: SurnameItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除姓氏「${row.surname}」吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteSurname(row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

// ===== 状态切换 =====
async function handleToggleStatus(row: SurnameItem) {
  try {
    const { data } = await fetchToggleSurnameStatus(row.id);
    message.success(data?.status === 1 ? '已启用' : '已禁用');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  }
}

// ===== 批量导入 =====
const showImportModal = ref(false);
const importData = ref('');
const importing = ref(false);
const importResult = ref<any>(null);

const importTemplate = `[
  { "surname": "张", "pinyin": "zhang", "initial": "Z", "ranking": 1, "totem": "https://example.com/zhang.png", "origin": "源于姬姓", "population": 88000000 },
  { "surname": "王", "pinyin": "wang", "initial": "W", "ranking": 2, "origin": "源于姬姓", "population": 95000000 }
]`;

function handleBatchImport() {
  importData.value = '';
  importResult.value = null;
  showImportModal.value = true;
}

async function handleDoImport() {
  let items: any[];
  try {
    items = JSON.parse(importData.value);
    if (!Array.isArray(items)) throw new Error('数据格式错误，需要 JSON 数组');
  } catch (err: any) {
    message.error('JSON 解析失败：' + err.message);
    return;
  }
  importing.value = true;
  try {
    const { data } = await fetchBatchImportSurnames(items);
    importResult.value = data;
    if (data && data.imported > 0) loadData();
  } catch (err: any) {
    message.error(err?.msg || '导入失败');
  } finally {
    importing.value = false;
  }
}

// ===== 导出 =====
async function handleExport() {
  try {
    const res = await fetchAllSurnames({ keyword: searchParams.keyword || undefined, initial: searchParams.initial || undefined, status: searchParams.status ?? undefined });
    const jsonStr = JSON.stringify(res.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `姓氏数据_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('导出成功');
  } catch (err: any) {
    message.error(err?.msg || '导出失败');
  }
}

onMounted(() => { loadData(); });
</script>

<template>
  <div>
    <!-- 搜索栏 -->
    <NCard :bordered="false" class="mb-16px">
      <NForm inline label-placement="left" :model="searchParams">
        <NFormItem label="姓氏/拼音">
          <NInput v-model:value="searchParams.keyword" placeholder="请输入姓氏或拼音" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="首字母">
          <NSelect v-model:value="searchParams.initial" placeholder="全部" clearable :options="initialOptions" style="width: 100px" />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect v-model:value="searchParams.status" placeholder="全部" clearable :options="statusOptions" style="width: 100px" />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>

    <!-- 数据表格 -->
    <NCard :bordered="false" title="姓氏管理">
      <template #header-extra>
        <NSpace>
          <NButton v-if="hasAuth('system:surname:import')" @click="handleBatchImport">批量导入</NButton>
          <NButton @click="handleExport">导出数据</NButton>
          <NButton v-if="hasAuth('system:surname:create')" type="primary" @click="handleAdd">新增姓氏</NButton>
        </NSpace>
      </template>

      <NDataTable
        :columns="columns"
        :data="tableData"
        :loading="loading"
        :row-key="row => row.id"
        :pagination="pagination"
        :bordered="false"
        :single-line="false"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />

      <!-- 批量导入弹窗 -->
      <NModal v-model:show="showImportModal" title="批量导入姓氏" preset="card" style="width: 600px" :mask-closable="false">
        <NAlert type="info" class="mb-16px" :show-icon="false">
          <template #header><span class="text-14px">请准备 JSON 数据，格式示例：</span></template>
          <NCode :code="importTemplate" language="json" :word-wrap="true" />
        </NAlert>
        <NInput v-model:value="importData" type="textarea" :rows="8" placeholder="请粘贴 JSON 数组数据..." />
        <div v-if="importResult" class="mt-12px">
          <NAlert :type="importResult.errors.length > 0 ? 'warning' : 'success'" :show-icon="false">
            <div>导入成功: {{ importResult.imported }} 条</div>
            <div v-if="importResult.skipped > 0">跳过(已存在): {{ importResult.skipped }} 条</div>
            <div v-if="importResult.errors.length > 0">
              <div v-for="(err, i) in importResult.errors" :key="i" class="text-red-500">{{ err }}</div>
            </div>
          </NAlert>
        </div>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showImportModal = false">关闭</NButton>
            <NButton type="primary" :loading="importing" @click="handleDoImport">导入</NButton>
          </NSpace>
        </template>
      </NModal>

      <!-- 新增/编辑弹窗 -->
      <NModal v-model:show="showModal" :title="isEdit ? '编辑姓氏' : '新增姓氏'" preset="card" style="width: 640px" :mask-closable="false">
        <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px">
          <NFormItem label="姓氏" path="surname">
            <NInput v-model:value="formData.surname" placeholder="请输入姓氏" :disabled="isEdit" />
          </NFormItem>
          <NFormItem label="拼音" path="pinyin">
            <NInput v-model:value="formData.pinyin" placeholder="如 zhang" />
          </NFormItem>
          <NFormItem label="首字母" path="initial">
            <NInput v-model:value="formData.initial" placeholder="如 Z" :maxlength="1" style="width: 80px" />
          </NFormItem>
          <NFormItem label="排名" path="ranking">
            <NInputNumber v-model:value="formData.ranking" :min="0" placeholder="百家姓排名" style="width: 120px" />
          </NFormItem>
          <NFormItem label="图腾" path="totem">
            <div class="flex-y-center gap-8px w-full">
              <ImageUpload v-model:value="formData.totem" :size="120" />
              <span class="text-12px text-gray-500">支持点击或拖拽上传，保存后作为姓氏图腾展示</span>
            </div>
          </NFormItem>
          <NFormItem label="起源" path="origin">
            <NInput v-model:value="formData.origin" type="textarea" :rows="2" placeholder="姓氏起源描述" />
          </NFormItem>
          <NFormItem label="人口" path="population">
            <NInputNumber v-model:value="formData.population" placeholder="人口数量" :min="0" class="w-full" />
          </NFormItem>
          <NFormItem label="详细描述" path="description">
            <NInput v-model:value="formData.description" type="textarea" :rows="3" placeholder="详细描述（可选）" />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showModal = false">取消</NButton>
            <NButton type="primary" :loading="submitting" @click="handleSubmit">确认</NButton>
          </NSpace>
        </template>
      </NModal>
    </NCard>
  </div>
</template>
