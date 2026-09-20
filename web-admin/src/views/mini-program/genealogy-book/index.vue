<script setup lang="ts">
import { h, ref, reactive, onMounted, computed } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import {
  useMessage, useDialog, NTag, NSwitch, NButton, NSpace, NSelect,
  NFormItem, NInput, NInputNumber, NForm, NModal, NCard, NDescriptions, NDescriptionsItem,
  NRadioGroup, NRadioButton, NAlert, NPopconfirm, NSpin
} from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchAllFamilies,
  fetchGenealogyBookList, fetchCreateGenealogyBook, fetchUpdateGenealogyBook,
  fetchDeleteGenealogyBook, fetchToggleGenealogyBookStatus,
  fetchGenealogyBookPreview, exportGenealogyBook, fetchGenealogyBookTemplates,
  type GenealogyBookItem, type TemplateInfo, type BookTemplate,
  type BookPreviewResponse, type BookPreviewNode
} from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

// ===== 家族选择 =====
const families = ref<Array<{ label: string; value: number }>>([]);
const selectedFamilyId = ref<number | null>(null);
const familyLoading = ref(false);

// ===== 数据加载 =====
const loading = ref(false);
const tableData = ref<GenealogyBookItem[]>([]);
const templates = ref<TemplateInfo[]>([]);

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50]
});

// ===== 表格列定义 =====
const columns: DataTableColumn<GenealogyBookItem>[] = [
  { title: '书名', key: 'title', width: 180, fixed: 'left' },
  { title: '副标题', key: 'subtitle', width: 140, ellipsis: { tooltip: true }, render: row => row.subtitle || '-' },
  {
    title: '模板', key: 'template', width: 110, align: 'center',
    render: row => {
      const t = templates.value.find(t => t.key === row.template);
      return h(NTag, { size: 'small', bordered: false }, { default: () => t?.name || row.template });
    }
  },
  {
    title: '包含内容', key: 'includes', width: 200,
    render: row => {
      const items: string[] = [];
      if (row.include_generation_table) items.push('字辈表');
      if (row.include_member_bio) items.push('成员简介');
      if (row.include_tree_chart) items.push('世系图');
      if (row.include_index) items.push('索引');
      return items.length > 0 ? items.join('、') : '-';
    }
  },
  { title: '排序', key: 'sort_order', width: 70, align: 'center' },
  {
    title: '状态', key: 'status', width: 80, align: 'center',
    render: row => h(NSwitch, {
      value: row.status === 1,
      disabled: !hasAuth('system:genealogy-book:update'),
      'onUpdate:value': () => handleToggleStatus(row)
    })
  },
  { title: '创建时间', key: 'create_time', width: 170 },
  {
    title: '操作', key: 'actions', width: 220, fixed: 'right',
    render: row => h(NSpace, { size: 4 }, {
      default: () => [
        h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handlePreview(row) }, { default: () => '预览' }),
        hasAuth('system:genealogy-book:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
        hasAuth('system:genealogy-book:export') && h(NButton, { size: 'small', type: 'success', ghost: true, onClick: () => handleExport(row) }, { default: () => '导出' }),
        hasAuth('system:genealogy-book:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
      ]
    })
  }
];

// ===== 加载家族列表 =====
async function loadFamilies() {
  familyLoading.value = true;
  try {
    const { data } = await fetchAllFamilies({ status: 1 });
    families.value = (data || []).map((f: any) => ({ label: f.name, value: f.id }));
    if (families.value.length > 0 && !selectedFamilyId.value) {
      selectedFamilyId.value = families.value[0].value;
      await loadData();
    }
  } catch {
    message.error('加载家族列表失败');
  } finally {
    familyLoading.value = false;
  }
}

// ===== 加载模板 =====
async function loadTemplates() {
  if (!selectedFamilyId.value) return;
  try {
    const { data } = await fetchGenealogyBookTemplates(selectedFamilyId.value);
    templates.value = data || [];
  } catch {
    templates.value = [];
  }
}

// ===== 加载列表 =====
async function loadData() {
  if (!selectedFamilyId.value) return;
  loading.value = true;
  try {
    const { data } = await fetchGenealogyBookList(selectedFamilyId.value, {
      page: pagination.page,
      pageSize: pagination.pageSize
    });
    tableData.value = data?.list || [];
    pagination.itemCount = data?.total || 0;
  } catch (err: any) {
    message.error(err?.msg || '加载失败');
  } finally {
    loading.value = false;
  }
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

function handleFamilyChange() {
  pagination.page = 1;
  loadData();
  loadTemplates();
}

// ===== 新增/编辑 =====
const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<number | null>(null);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);

const formData = reactive({
  title: '',
  subtitle: '',
  template: 'european' as BookTemplate,
  preface: '',
  introduction: '',
  clanRules: '',
  generationPoem: '',
  appendix: '',
  coverStyle: 'default',
  fontFamily: 'serif',
  paperSize: 'A4',
  includeGenerationTable: 1,
  includeMemberBio: 1,
  includeTreeChart: 1,
  includeIndex: 1,
  sortOrder: 0
});

const formRules = {
  title: [{ required: true, message: '请输入家谱书名', trigger: 'blur' }]
};

const templateOptions = computed(() =>
  templates.value.map(t => ({ label: t.name, value: t.key }))
);

const fontOptions = [
  { label: '宋体（衬线）', value: 'serif' },
  { label: '黑体（无衬线）', value: 'sans' },
  { label: '楷体', value: 'kai' }
];

const paperOptions = [
  { label: 'A4', value: 'A4' },
  { label: 'A3', value: 'A3' },
  { label: '16开', value: '16K' }
];

const coverOptions = [
  { label: '默认', value: 'default' },
  { label: '古典', value: 'classical' },
  { label: '简约', value: 'minimal' }
];

function resetForm() {
  formData.title = '';
  formData.subtitle = '';
  formData.template = 'european';
  formData.preface = '';
  formData.introduction = '';
  formData.clanRules = '';
  formData.generationPoem = '';
  formData.appendix = '';
  formData.coverStyle = 'default';
  formData.fontFamily = 'serif';
  formData.paperSize = 'A4';
  formData.includeGenerationTable = 1;
  formData.includeMemberBio = 1;
  formData.includeTreeChart = 1;
  formData.includeIndex = 1;
  formData.sortOrder = 0;
}

function handleAdd() {
  if (!selectedFamilyId.value) {
    message.warning('请先选择家族');
    return;
  }
  isEdit.value = false;
  editId.value = null;
  resetForm();
  showModal.value = true;
}

function handleEdit(row: GenealogyBookItem) {
  isEdit.value = true;
  editId.value = row.id;
  formData.title = row.title;
  formData.subtitle = row.subtitle || '';
  formData.template = row.template;
  formData.preface = row.preface || '';
  formData.introduction = row.introduction || '';
  formData.clanRules = row.clan_rules || '';
  formData.generationPoem = row.generation_poem || '';
  formData.appendix = row.appendix || '';
  formData.coverStyle = row.cover_style || 'default';
  formData.fontFamily = row.font_family || 'serif';
  formData.paperSize = row.paper_size || 'A4';
  formData.includeGenerationTable = row.include_generation_table;
  formData.includeMemberBio = row.include_member_bio;
  formData.includeTreeChart = row.include_tree_chart;
  formData.includeIndex = row.include_index;
  formData.sortOrder = row.sort_order;
  showModal.value = true;
}

async function handleSubmit() {
  try { await formRef.value?.validate(); } catch { return; }
  if (!selectedFamilyId.value) return;

  submitting.value = true;
  try {
    const submitData = {
      title: formData.title,
      subtitle: formData.subtitle,
      template: formData.template,
      preface: formData.preface,
      introduction: formData.introduction,
      clanRules: formData.clanRules,
      generationPoem: formData.generationPoem,
      appendix: formData.appendix,
      coverStyle: formData.coverStyle,
      fontFamily: formData.fontFamily,
      paperSize: formData.paperSize,
      includeGenerationTable: formData.includeGenerationTable,
      includeMemberBio: formData.includeMemberBio,
      includeTreeChart: formData.includeTreeChart,
      includeIndex: formData.includeIndex,
      sortOrder: formData.sortOrder
    };

    if (isEdit.value && editId.value) {
      await fetchUpdateGenealogyBook(selectedFamilyId.value, editId.value, submitData);
      message.success('更新成功');
    } else {
      await fetchCreateGenealogyBook(selectedFamilyId.value, submitData);
      message.success('创建成功');
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
function handleDelete(row: GenealogyBookItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除家谱「${row.title}」吗？删除后不可恢复。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      if (!selectedFamilyId.value) return;
      try {
        await fetchDeleteGenealogyBook(selectedFamilyId.value, row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

// ===== 切换状态 =====
async function handleToggleStatus(row: GenealogyBookItem) {
  if (!selectedFamilyId.value) return;
  try {
    const { data } = await fetchToggleGenealogyBookStatus(selectedFamilyId.value, row.id);
    message.success(data?.status === 1 ? '已启用' : '已停用');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  }
}

// ===== 预览 =====
const showPreview = ref(false);
const previewData = ref<BookPreviewResponse | null>(null);
const previewLoading = ref(false);

async function handlePreview(row: GenealogyBookItem) {
  if (!selectedFamilyId.value) return;
  previewLoading.value = true;
  showPreview.value = true;
  try {
    const { data } = await fetchGenealogyBookPreview(selectedFamilyId.value, row.id);
    previewData.value = data;
  } catch (err: any) {
    message.error(err?.msg || '预览失败');
    showPreview.value = false;
  } finally {
    previewLoading.value = false;
  }
}

// ===== 导出 =====
async function handleExport(row: GenealogyBookItem) {
  if (!selectedFamilyId.value) return;
  try {
    await exportGenealogyBook(selectedFamilyId.value, row.id);
    message.success('导出成功');
  } catch (err: any) {
    message.error(err?.msg || '导出失败');
  }
}

// ===== 计算属性：预览模板样式 =====
const previewTemplateStyle = computed(() => {
  const t = previewData.value?.template;
  if (t === 'su_style' || t === 'classical') {
    return {
      direction: 'rtl' as const,
      writingMode: 'vertical-rl' as const,
      fontFamily: '"SimSun", "Songti SC", serif'
    };
  }
  return {
    direction: 'ltr' as const,
    writingMode: 'horizontal-tb' as const,
    fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif'
  };
});

onMounted(() => {
  loadFamilies();
  loadTemplates();
});
</script>

<template>
  <div>
    <NCard :bordered="false" title="家谱成书管理">
      <template #header-extra>
        <NSpace align="center" :size="12">
          <span>选择家族：</span>
          <NSelect
            v-model:value="selectedFamilyId"
            :options="families"
            :loading="familyLoading"
            placeholder="请选择家族"
            style="width: 220px"
            @update:value="handleFamilyChange"
          />
          <NButton v-if="hasAuth('system:genealogy-book:create')" type="primary" @click="handleAdd">新增家谱</NButton>
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
        :scroll-x="1200"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />
    </NCard>

    <!-- 新增/编辑弹窗 -->
    <NModal v-model:show="showModal" :title="isEdit ? '编辑家谱' : '新增家谱'" preset="card" style="width: 800px" :mask-closable="false">
      <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px">
        <div class="grid grid-cols-2 gap-x-4">
          <NFormItem label="家谱书名" path="title">
            <NInput v-model:value="formData.title" placeholder="请输入家谱书名" maxlength="100" show-count />
          </NFormItem>
          <NFormItem label="副标题" path="subtitle">
            <NInput v-model:value="formData.subtitle" placeholder="可选" maxlength="200" />
          </NFormItem>
        </div>

        <NFormItem label="模板" path="template">
          <NRadioGroup v-model:value="formData.template">
            <NRadioButton v-for="t in templateOptions" :key="t.value" :value="t.value">{{ t.label }}</NRadioButton>
          </NRadioGroup>
          <div v-if="formData.template" class="text-12px text-gray-500 mt-6px w-full">
            {{ templates.find(t => t.key === formData.template)?.description }}
          </div>
        </NFormItem>

        <div class="grid grid-cols-3 gap-x-4">
          <NFormItem label="正文字体" path="fontFamily">
            <NSelect v-model:value="formData.fontFamily" :options="fontOptions" />
          </NFormItem>
          <NFormItem label="纸张大小" path="paperSize">
            <NSelect v-model:value="formData.paperSize" :options="paperOptions" />
          </NFormItem>
          <NFormItem label="封面样式" path="coverStyle">
            <NSelect v-model:value="formData.coverStyle" :options="coverOptions" />
          </NFormItem>
        </div>

        <NFormItem label="包含内容">
          <NSpace :size="16">
            <NFormItem label="字辈表" :show-feedback="false" style="margin-bottom: 0">
              <NSwitch v-model:value="formData.includeGenerationTable" :checked-value="1" :unchecked-value="0" />
            </NFormItem>
            <NFormItem label="成员简介" :show-feedback="false" style="margin-bottom: 0">
              <NSwitch v-model:value="formData.includeMemberBio" :checked-value="1" :unchecked-value="0" />
            </NFormItem>
            <NFormItem label="世系图" :show-feedback="false" style="margin-bottom: 0">
              <NSwitch v-model:value="formData.includeTreeChart" :checked-value="1" :unchecked-value="0" />
            </NFormItem>
            <NFormItem label="索引目录" :show-feedback="false" style="margin-bottom: 0">
              <NSwitch v-model:value="formData.includeIndex" :checked-value="1" :unchecked-value="0" />
            </NFormItem>
          </NSpace>
        </NFormItem>

        <NFormItem label="序言" path="preface">
          <NInput v-model:value="formData.preface" type="textarea" :rows="3" placeholder="家谱序言（可选）" />
        </NFormItem>
        <NFormItem label="家族简介" path="introduction">
          <NInput v-model:value="formData.introduction" type="textarea" :rows="3" placeholder="家族简介（可选）" />
        </NFormItem>
        <NFormItem label="家训" path="clanRules">
          <NInput v-model:value="formData.clanRules" type="textarea" :rows="3" placeholder="家训内容（可选）" />
        </NFormItem>
        <NFormItem label="字辈诗" path="generationPoem">
          <NInput v-model:value="formData.generationPoem" type="textarea" :rows="3" placeholder="字辈诗（可选）" />
        </NFormItem>
        <NFormItem label="附录" path="appendix">
          <NInput v-model:value="formData.appendix" type="textarea" :rows="3" placeholder="附录内容（可选）" />
        </NFormItem>

        <NFormItem label="排序号" path="sortOrder">
          <NInputNumber v-model:value="formData.sortOrder" placeholder="数字越小越靠前" style="width: 200px" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" :loading="submitting" @click="handleSubmit">确认</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 预览弹窗 -->
    <NModal v-model:show="showPreview" title="家谱预览" preset="card" style="width: 900px; max-height: 85vh" :mask-closable="false">
      <div v-if="previewLoading" class="flex justify-center py-8">
        <NSpin size="large" />
      </div>
      <div v-else-if="previewData" class="book-preview" :style="previewTemplateStyle">
        <div class="preview-header">
          <h2 class="preview-title">{{ previewData.bookTitle }}</h2>
          <p class="preview-meta">共 {{ previewData.generationCount }} 代 · {{ previewData.memberCount }} 人</p>
        </div>

        <div class="preview-body">
          <div v-for="gen in previewData.generationLabels" :key="gen.generation" class="generation-section">
            <h3 class="generation-title">{{ gen.label }}</h3>
            <div class="member-list">
              <div v-for="member in gen.members" :key="member.id" class="member-card">
                <div class="member-name">{{ member.name }}</div>
                <div class="member-info">
                  <span v-if="member.generationName" class="gen-tag">{{ member.generationName }}</span>
                  <span v-if="member.birthDate">{{ member.birthDate }}</span>
                  <span v-if="member.birthPlace">{{ member.birthPlace }}</span>
                </div>
                <div v-if="member.spouseNames.length" class="member-spouse">
                  配偶：{{ member.spouseNames.join('、') }}
                </div>
                <div v-if="member.childrenIds.length" class="member-children">
                  子女：{{ member.childrenIds.length }}人
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showPreview = false">关闭</NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.book-preview {
  max-height: 65vh;
  overflow-y: auto;
}

.preview-header {
  text-align: center;
  padding-bottom: 16px;
  border-bottom: 2px solid #8b0000;
  margin-bottom: 20px;
}

.preview-title {
  font-size: 28px;
  color: #8b0000;
  margin-bottom: 8px;
}

.preview-meta {
  color: #666;
  font-size: 14px;
}

.generation-section {
  margin-bottom: 24px;
}

.generation-title {
  font-size: 18px;
  color: #8b0000;
  border-bottom: 1px solid #eee;
  padding-bottom: 8px;
  margin-bottom: 12px;
}

.member-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.member-card {
  padding: 12px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
}

.member-name {
  font-weight: bold;
  font-size: 15px;
  margin-bottom: 4px;
}

.member-info {
  font-size: 12px;
  color: #666;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.gen-tag {
  color: #8b0000;
  font-weight: 500;
}

.member-spouse,
.member-children {
  font-size: 12px;
  color: #888;
  margin-top: 4px;
}
</style>
