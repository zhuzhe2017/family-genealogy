<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import { useMessage, useDialog, NTag, NSwitch, NButton, NSpace, NTooltip } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchGenerationTableList, fetchCreateGenerationTable, fetchUpdateGenerationTable,
  fetchDeleteGenerationTable, fetchToggleGenerationTableStatus,
  fetchAllGenerationTables, fetchBatchImportGenerationTables
} from '@/service/api';
import type { GenerationTableItem } from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

const loading = ref(false);
const tableData = ref<GenerationTableItem[]>([]);

const searchParams = reactive({
  keyword: '',
  region: '',
  status: null as number | null
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100]
});

const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 }
];

const columns: DataTableColumn<GenerationTableItem>[] = [
  { title: '姓氏', key: 'surname', width: 80, fixed: 'left' },
  { title: '始祖', key: 'founder', width: 110 },
  {
    title: '字辈序列', key: 'generation_sequence', width: 360,
    render: row => {
      const seq = row.generation_sequence || [];
      if (seq.length === 0) return '-';
      const previewText = seq.map((g, i) => {
        // 同代多字辈统一用「、」展示，诗句模式保持完整
        const clean = g.replace(/[\s,，]+/g, '、');
        return `第${i + 1}代：${clean}`;
      }).join(' / ');
      return h(NTooltip, { placement: 'top' }, {
        trigger: () => h('span', { style: 'cursor: default;' }, previewText.length > 32 ? previewText.slice(0, 32) + '…' : previewText),
        default: () => previewText
      });
    }
  },
  {
    title: '常见区域', key: 'common_regions', width: 180,
    render: row => {
      const regions = row.common_regions || [];
      if (regions.length === 0) return '-';
      return h(NSpace, { size: 4, wrap: true }, {
        default: () => regions.map((r: string) => h(NTag, { size: 'small', type: 'info', bordered: false }, { default: () => r }))
      });
    }
  },
  {
    title: '状态', key: 'status', width: 75, align: 'center',
    render: row => h(NSwitch, {
      value: row.status === 1,
      disabled: !hasAuth('system:generation-table:status'),
      'onUpdate:value': () => handleToggleStatus(row)
    })
  },
  { title: '创建人', key: 'create_by', width: 100, render: row => row.create_by || '-' },
  { title: '创建时间', key: 'create_time', width: 170 },
  {
    title: '操作', key: 'actions', width: 150, fixed: 'right',
    render: row => h(NSpace, null, {
      default: () => [
        hasAuth('system:generation-table:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
        hasAuth('system:generation-table:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
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
  searchParams.region = '';
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
    const { data } = await fetchGenerationTableList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchParams.keyword || undefined,
      region: searchParams.region || undefined,
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
const editId = ref<string | null>(null);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);

const formData = reactive({
  surname: '',
  founder: '',
  generationSequence: [] as string[],
  commonRegions: [] as string[]
});

const formRules = {
  surname: [{ required: true, message: '请输入姓氏（1-4个汉字或1-20个非空白字符）', trigger: 'blur' }],
  founder: [{ required: true, message: '请输入始祖/支系（1-20个汉字）', trigger: 'blur' }]
};

function resetForm() {
  formData.surname = '';
  formData.founder = '';
  formData.generationSequence = [];
  formData.commonRegions = [];
}

function addGeneration() {
  if (formData.generationSequence.length >= 100) {
    message.warning('字辈序列最多 100 代');
    return;
  }
  formData.generationSequence.push('');
}

function removeGeneration(index: number) {
  formData.generationSequence.splice(index, 1);
}

function handleAdd() {
  isEdit.value = false;
  editId.value = null;
  resetForm();
  addGeneration();
  showModal.value = true;
}

function handleEdit(row: GenerationTableItem) {
  isEdit.value = true;
  editId.value = row.id;
  formData.surname = row.surname;
  formData.founder = row.founder;
  formData.generationSequence = [...(row.generation_sequence || [])];
  if (formData.generationSequence.length === 0) addGeneration();
  formData.commonRegions = [...(row.common_regions || [])];
  showModal.value = true;
}

async function handleSubmit() {
  try { await formRef.value?.validate(); } catch { return; }
  // 前端轻量校验：字辈序列 ≥1、区域 ≥1（详细规则由后端 DTO 把关）
  if (formData.generationSequence.length < 1) {
    message.warning('字辈序列至少1代');
    return;
  }
  // 过滤掉空字符串代
  const trimmedSeq = formData.generationSequence.map(s => s.trim()).filter(Boolean);
  if (trimmedSeq.length < 1) {
    message.warning('请至少填写一代有效字辈');
    return;
  }
  if (formData.commonRegions.length < 1) {
    message.warning('常见区域至少1项');
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value && editId.value) {
      await fetchUpdateGenerationTable(editId.value, {
        surname: formData.surname,
        founder: formData.founder,
        generationSequence: trimmedSeq,
        commonRegions: formData.commonRegions
      });
      message.success('更新成功');
    } else {
      await fetchCreateGenerationTable({
        surname: formData.surname,
        founder: formData.founder,
        generationSequence: trimmedSeq,
        commonRegions: formData.commonRegions
      });
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
function handleDelete(row: GenerationTableItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除「${row.surname}」姓「${row.founder}」支系的字辈表吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteGenerationTable(row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

// ===== 状态切换 =====
async function handleToggleStatus(row: GenerationTableItem) {
  try {
    const { data } = await fetchToggleGenerationTableStatus(row.id);
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

const importTemplate = `[\n  {\n    "surname": "王",\n    "founder": "王诩",\n    "generationSequence": ["文", "才", "廷", "啟", "大"],\n    "commonRegions": ["浙江", "江苏"],\n    "createBy": "admin"\n  },\n  {\n    "surname": "王",\n    "founder": "王诩（诗句派）",\n    "generationSequence": ["文才廷啟", "仁义礼智", "信忠孝悌", "国泰民安", "家和万事兴"],\n    "commonRegions": ["浙江", "江苏"],\n    "createBy": "admin"\n  }\n]`;

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
    const { data } = await fetchBatchImportGenerationTables(items);
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
    const res = await fetchAllGenerationTables({
      keyword: searchParams.keyword || undefined,
      region: searchParams.region || undefined,
      status: searchParams.status ?? undefined
    });
    const jsonStr = JSON.stringify(res.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `字辈表数据_${new Date().toISOString().slice(0, 10)}.json`;
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
        <NFormItem label="姓氏/始祖">
          <NInput v-model:value="searchParams.keyword" placeholder="请输入姓氏或始祖" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="区域">
          <NInput v-model:value="searchParams.region" placeholder="请输入常见区域" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect v-model:value="searchParams.status" placeholder="全部" clearable :options="statusOptions" style="width: 120px" />
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
    <NCard :bordered="false" title="字辈管理">
      <template #header-extra>
        <NSpace>
          <NButton v-if="hasAuth('system:generation-table:import')" @click="handleBatchImport">批量导入</NButton>
          <NButton @click="handleExport">导出数据</NButton>
          <NButton v-if="hasAuth('system:generation-table:create')" type="primary" @click="handleAdd">新增字辈表</NButton>
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
        :scroll-x="1100"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />

      <!-- 批量导入弹窗 -->
      <NModal v-model:show="showImportModal" title="批量导入字辈表" preset="card" style="width: 640px" :mask-closable="false">
        <NAlert type="info" class="mb-16px" :show-icon="false">
          <template #header><span class="text-14px">请准备 JSON 数据，格式示例（字段使用 camelCase）：</span></template>
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
      <NModal v-model:show="showModal" :title="isEdit ? '编辑字辈表' : '新增字辈表'" preset="card" style="width: 720px" :mask-closable="false">
        <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px">
          <NFormItem label="姓氏" path="surname">
            <NInput v-model:value="formData.surname" placeholder="1-4个汉字或1-20个非空白字符，如：王、欧阳" />
          </NFormItem>
          <NFormItem label="始祖/支系" path="founder">
            <NInput v-model:value="formData.founder" placeholder="1-20个汉字，如：王诩或某分支堂号" />
          </NFormItem>
          <NFormItem label="字辈序列" path="generationSequence">
            <div class="generation-sequence-wrapper w-full">
              <div class="generation-list">
                <div
                  v-for="(item, index) in formData.generationSequence"
                  :key="index"
                  class="generation-row"
                >
                  <div class="generation-index">第{{ index + 1 }}代</div>
                  <NInput
                    v-model:value="formData.generationSequence[index]"
                    :placeholder="'请输入第' + (index + 1) + '代字辈（可输入单字、多字或诗句）'"
                    clearable
                  />
                  <NButton
                    v-if="formData.generationSequence.length > 1"
                    quaternary
                    type="error"
                    size="small"
                    @click="removeGeneration(index)"
                  >
                    <template #icon>
                      <SvgIcon icon="material-symbols:delete-outline" />
                    </template>
                  </NButton>
                </div>
              </div>
              <NButton
                class="add-generation-btn"
                dashed
                type="primary"
                block
                @click="addGeneration"
              >
                <template #icon>
                  <SvgIcon icon="material-symbols:add" />
                </template>
                添加代数
              </NButton>
              <div class="text-gray-500 text-12px mt-6px">按代顺序填写，每代可录入单字、多字或一句诗；同代成员可任选其中一字作为字辈</div>
            </div>
          </NFormItem>
          <NFormItem label="常见区域" path="commonRegions">
            <div class="w-full">
              <NDynamicTags v-model:value="formData.commonRegions" :max="50" type="success" placeholder="输入区域后回车，如：浙江" />
              <div class="text-gray-500 text-12px mt-6px">该姓氏该始祖/支系的常见分布区域，至少1项</div>
            </div>
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

<style scoped lang="scss">
.generation-sequence-wrapper {
  .generation-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: 360px;
    overflow-y: auto;
    padding-right: 4px;
    margin-bottom: 12px;
  }

  .generation-row {
    display: flex;
    align-items: center;
    gap: 10px;

    .generation-index {
      flex: none;
      width: 60px;
      color: var(--primary-color);
      font-size: 14px;
      font-weight: 500;
      text-align: right;
    }

    .n-input {
      flex: 1;
      min-width: 0;
    }

    .n-button {
      flex: none;
    }
  }

  .add-generation-btn {
    margin-bottom: 6px;
  }
}

@media (max-width: 768px) {
  .generation-sequence-wrapper {
    .generation-list {
      max-height: 280px;
    }

    .generation-row {
      gap: 8px;

      .generation-index {
        width: 52px;
        font-size: 13px;
      }
    }
  }
}
</style>
