<script setup lang="ts">
import { h, ref, reactive, onMounted, computed } from 'vue';
import type { DataTableColumn, FormInst } from 'naive-ui';
import {
  useMessage, useDialog, NTag, NButton, NSpace, NSelect, NInput, NInputNumber,
  NFormItem, NForm, NModal, NCard, NTabs, NTabPane, NAlert, NPopconfirm,
  NSwitch, NUpload, NImage, NEmpty, NSpin
} from 'naive-ui';
import type { UploadFileInfo } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import { fetchAllFamilies } from '@/service/api/family';
import {
  fetchCulturalDocList, fetchCulturalDocById,
  fetchCreateCulturalDoc, fetchUpdateCulturalDoc, fetchDeleteCulturalDoc,
  fetchCulturalDocPages, fetchUploadCulturalDocPages,
  fetchPublicDocList, fetchPublicDocById,
  fetchCreatePublicDoc, fetchUpdatePublicDoc, fetchDeletePublicDoc,
  fetchUploadPublicDocPages,
  type CulturalDocItem, type CreateCulturalDocData, type UpdateCulturalDocData,
  type DocPageItem, type DocumentType,
  DOCUMENT_TYPE_OPTIONS
} from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

// ========== Tab 状态 ==========
const activeTab = ref<'family' | 'public'>('family');

// ========== 家族选择（仅家族 Tab 用） ==========
const families = ref<Array<{ label: string; value: number }>>([]);
const selectedFamilyId = ref<number | null>(null);
const familyLoading = ref(false);

// ========== 筛选条件 ==========
const filterKeyword = ref('');
const filterType = ref<DocumentType | null>(null);

// ========== 表格数据 ==========
const loading = ref(false);
const tableData = ref<CulturalDocItem[]>([]);

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50]
});

// ========== 表格列定义 ==========
function makeColumns(): DataTableColumn<CulturalDocItem>[] {
  return [
    {
      title: '类型', key: 'type', width: 90, align: 'center',
      render: row => {
        const typeMap: Record<DocumentType, { label: string; color: string }> = {
          genealogy: { label: '家族谱', color: 'primary' },
          ancient: { label: '公共古籍', color: 'success' },
          handwritten: { label: '手写稿', color: 'warning' }
        };
        const info = typeMap[row.type] || { label: row.type, color: 'default' };
        return h(NTag, { size: 'small', type: info.color as any, bordered: false }, { default: () => info.label });
      }
    },
    { title: '标题', key: 'title', width: 200, fixed: 'left', ellipsis: { tooltip: true } },
    { title: '副标题', key: 'subtitle', width: 140, ellipsis: { tooltip: true }, render: row => row.subtitle || '-' },
    { title: '作者', key: 'author', width: 100, render: row => row.author || '-' },
    { title: '朝代/年代', key: 'dynasty', width: 110, render: row => row.dynasty || '-' },
    { title: '页数', key: 'pages', width: 70, align: 'center', render: () => '-' }, // 预留，可后续联查
    { title: '阅读量', key: 'view_count', width: 80, align: 'center' },
    { title: '排序', key: 'sort_order', width: 70, align: 'center' },
    {
      title: '状态', key: 'status', width: 80, align: 'center',
      render: row => h(NTag, {
        size: 'small',
        type: row.status === 1 ? 'success' : 'default',
        bordered: false
      }, { default: () => row.status === 1 ? '启用' : '停用' })
    },
    { title: '创建时间', key: 'create_time', width: 170 },
    {
      title: '操作', key: 'actions', width: 240, fixed: 'right',
      render: row => h(NSpace, { size: 4 }, {
        default: () => [
          h(NButton, {
            size: 'small', type: 'primary', ghost: true,
            onClick: () => handleEdit(row)
          }, { default: () => '编辑' }),
          hasAuth('system:cultural-doc:page') && h(NButton, {
            size: 'small', type: 'info', ghost: true,
            onClick: () => handleManagePages(row)
          }, { default: () => '原页' }),
          hasAuth('system:cultural-doc:delete') && h(NPopconfirm, {
            onPositiveClick: () => handleDelete(row)
          }, {
            trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true }, { default: () => '删除' }),
            default: () => `确认删除「${row.title}」吗？关联的原页和章节也会一并删除。`
          })
        ]
      })
    }
  ];
}

const columns = computed(makeColumns);

// ========== 数据加载 ==========
async function loadFamilies() {
  familyLoading.value = true;
  try {
    const { data } = await fetchAllFamilies({ status: 1 });
    families.value = (data || []).map((f: any) => ({ label: f.name, value: f.id }));
    if (families.value.length > 0 && !selectedFamilyId.value) {
      selectedFamilyId.value = families.value[0].value;
      loadData();
    }
  } catch {
    message.error('加载家族列表失败');
  } finally {
    familyLoading.value = false;
  }
}

async function loadData() {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      type: filterType.value || undefined,
      keyword: filterKeyword.value || undefined
    };

    if (activeTab.value === 'family') {
      if (!selectedFamilyId.value) {
        tableData.value = [];
        pagination.itemCount = 0;
        loading.value = false;
        return;
      }
      const { data } = await fetchCulturalDocList(selectedFamilyId.value, params);
      tableData.value = data?.list || [];
      pagination.itemCount = data?.total || 0;
    } else {
      const { data } = await fetchPublicDocList(params);
      tableData.value = data?.list || [];
      pagination.itemCount = data?.total || 0;
    }
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
function handleTabChange() {
  pagination.page = 1;
  loadData();
}
function handleFamilyChange() {
  pagination.page = 1;
  loadData();
}
function handleSearch() {
  pagination.page = 1;
  loadData();
}

// ========== 新增/编辑弹窗 ==========
const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<string | null>(null);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);

const formData = reactive<CreateCulturalDocData>({
  type: 'genealogy',
  title: '',
  subtitle: '',
  author: '',
  dynasty: '',
  coverUrl: '',
  summary: '',
  tags: [],
  sortOrder: 0
});

const formRules = {
  type: [{ required: true, message: '请选择文档类型', trigger: 'change' }],
  title: [{ required: true, message: '请输入文档标题', trigger: 'blur' }]
};

function resetForm() {
  formData.type = activeTab.value === 'public' ? 'ancient' : 'genealogy';
  formData.title = '';
  formData.subtitle = '';
  formData.author = '';
  formData.dynasty = '';
  formData.coverUrl = '';
  formData.summary = '';
  formData.tags = [];
  formData.sortOrder = 0;
}

function handleAdd() {
  if (activeTab.value === 'family' && !selectedFamilyId.value) {
    message.warning('请先选择家族');
    return;
  }
  isEdit.value = false;
  editId.value = null;
  resetForm();
  showModal.value = true;
}

function handleEdit(row: CulturalDocItem) {
  isEdit.value = true;
  editId.value = row.id;
  formData.type = row.type;
  formData.title = row.title;
  formData.subtitle = row.subtitle || '';
  formData.author = row.author || '';
  formData.dynasty = row.dynasty || '';
  formData.coverUrl = row.cover_url || '';
  formData.summary = row.summary || '';
  formData.tags = Array.isArray(row.tag_json)
    ? row.tag_json
    : typeof row.tag_json === 'string'
      ? (() => { try { return JSON.parse(row.tag_json); } catch { return []; } })()
      : [];
  formData.sortOrder = row.sort_order;
  showModal.value = true;
}

async function handleSubmit() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }

  submitting.value = true;
  try {
    if (activeTab.value === 'family') {
      if (!selectedFamilyId.value) return;
      if (isEdit.value && editId.value) {
        await fetchUpdateCulturalDoc(selectedFamilyId.value, editId.value, formData);
        message.success('更新成功');
      } else {
        await fetchCreateCulturalDoc(selectedFamilyId.value, { ...formData, type: formData.type });
        message.success('创建成功');
      }
    } else {
      if (isEdit.value && editId.value) {
        await fetchUpdatePublicDoc(editId.value, formData);
        message.success('更新成功');
      } else {
        await fetchCreatePublicDoc({ ...formData, type: formData.type });
        message.success('创建成功');
      }
    }
    showModal.value = false;
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: CulturalDocItem) {
  try {
    if (activeTab.value === 'family' && selectedFamilyId.value) {
      await fetchDeleteCulturalDoc(selectedFamilyId.value, row.id);
    } else {
      await fetchDeletePublicDoc(row.id);
    }
    message.success('删除成功');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '删除失败');
  }
}

// ========== 原页管理弹窗 ==========
const showPagesModal = ref(false);
const editingDoc = ref<CulturalDocItem | null>(null);
const pagesLoading = ref(false);
const pages = ref<DocPageItem[]>([]);
const uploadingPages = ref(false);

// 新上传的本地文件（临时用，简化：直接让用户填 URL）
const newPageForm = reactive({
  page_no: 0,
  image_url: ''
});

async function handleManagePages(row: CulturalDocItem) {
  editingDoc.value = row;
  showPagesModal.value = true;
  newPageForm.page_no = (pages.value.length || 0) + 1;
  newPageForm.image_url = '';
  await loadPages();
}

async function loadPages() {
  if (!editingDoc.value) return;
  pagesLoading.value = true;
  try {
    if (activeTab.value === 'family' && selectedFamilyId.value) {
      const { data } = await fetchCulturalDocPages(selectedFamilyId.value, editingDoc.value.id);
      pages.value = data || [];
    } else {
      const { data } = await fetchCulturalDocPages(0 as any, editingDoc.value.id);
      pages.value = data || [];
    }
  } catch (err: any) {
    message.error(err?.msg || '加载原页失败');
  } finally {
    pagesLoading.value = false;
  }
}

function addTempPage() {
  if (!newPageForm.image_url.trim()) {
    message.warning('请填写图片 URL');
    return;
  }
  const pageNo = Number(newPageForm.page_no) || (pages.value.length + 1);
  pages.value.push({
    page_no: pageNo,
    image_url: newPageForm.image_url.trim()
  });
  // 自动排序
  pages.value.sort((a, b) => a.page_no - b.page_no);
  newPageForm.page_no = pages.value.length + 1;
  newPageForm.image_url = '';
}

function removePage(idx: number) {
  pages.value.splice(idx, 1);
}

async function savePages() {
  if (!editingDoc.value) return;
  uploadingPages.value = true;
  try {
    if (activeTab.value === 'family' && selectedFamilyId.value) {
      await fetchUploadCulturalDocPages(selectedFamilyId.value, editingDoc.value.id, pages.value);
    } else {
      await fetchUploadPublicDocPages(editingDoc.value.id, pages.value);
    }
    message.success(`已保存 ${pages.value.length} 页原页图片`);
    showPagesModal.value = false;
  } catch (err: any) {
    message.error(err?.msg || '保存原页失败');
  } finally {
    uploadingPages.value = false;
  }
}

// ========== 初始化 ==========
onMounted(() => {
  loadFamilies();
});
</script>

<template>
  <NCard :bordered="false" size="small">
    <!-- 顶部 Tabs + 筛选栏 -->
    <div class="flex items-center justify-between mb-4">
      <NTabs v-model:value="activeTab" animated>
        <NTabPane name="family" tab="家族文档" />
        <NTabPane name="public" tab="公共古籍" />
      </NTabs>
      <NSpace>
        <NSelect
          v-if="activeTab === 'family'"
          v-model:value="selectedFamilyId"
          :options="families.map(f => ({ label: f.label, value: f.value }))"
          placeholder="选择家族"
          style="width: 200px"
          :loading="familyLoading"
          @update:value="handleFamilyChange"
        />
        <NInput
          v-model:value="filterKeyword"
          placeholder="搜索标题/作者"
          clearable
          style="width: 200px"
          @keyup.enter="handleSearch"
        />
        <NSelect
          v-model:value="filterType"
          :options="DOCUMENT_TYPE_OPTIONS"
          placeholder="类型"
          clearable
          style="width: 130px"
          @update:value="handleSearch"
        />
        <NButton type="primary" ghost @click="handleAdd">
          新增{{ activeTab === 'family' ? '家族文档' : '公共古籍' }}
        </NButton>
      </NSpace>
    </div>

    <!-- 表格 -->
    <NDataTable
      v-if="activeTab === 'family' ? selectedFamilyId : true"
      :columns="columns"
      :data="tableData"
      :loading="loading"
      :pagination="pagination"
      :bordered="false"
      stripe
      @update:page="handlePageChange"
      @update:page-size="handlePageSizeChange"
    />
    <NEmpty v-else description="请先选择家族" />
  </NCard>

  <!-- 新增/编辑弹窗 -->
  <NModal v-model:show="showModal" preset="card" :title="isEdit ? '编辑文档' : '新增文档'" style="width: 680px">
    <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100">
      <NFormItem label="文档类型" path="type">
        <NSelect
          v-model:value="formData.type"
          :options="DOCUMENT_TYPE_OPTIONS.filter(o =>
            activeTab === 'family' ? o.value !== 'ancient' : true
          )"
          :disabled="isEdit"
        />
      </NFormItem>
      <NFormItem label="标题" path="title">
        <NInput v-model:value="formData.title" maxlength="200" :show-count="true" placeholder="必填，不超过 200 字符" />
      </NFormItem>
      <NFormItem label="副标题">
        <NInput v-model:value="formData.subtitle" placeholder="可选" />
      </NFormItem>
      <NSpace size="medium" align="center" style="width: 100%">
        <NFormItem label="作者" style="flex: 1">
          <NInput v-model:value="formData.author" placeholder="编者/作者" />
        </NFormItem>
        <NFormItem label="朝代" style="flex: 1">
          <NInput v-model:value="formData.dynasty" placeholder="如：清代 / 洪武三年" />
        </NFormItem>
      </NSpace>
      <NSpace size="medium" align="center" style="width: 100%">
        <NFormItem label="封面URL" style="flex: 1">
          <NInput v-model:value="formData.coverUrl" placeholder="https://..." />
        </NFormItem>
        <NFormItem label="排序" style="width: 120px">
          <NInputNumber v-model:value="formData.sortOrder" :min="0" :max="9999" style="width: 100%" />
        </NFormItem>
      </NSpace>
      <NFormItem label="标签">
        <NSelect
          v-model:value="formData.tags"
          multiple
          allow-create
          filterable
          placeholder="可自由输入标签，按回车确认"
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem label="内容摘要">
        <NInput v-model:value="formData.summary" type="textarea" :rows="3" placeholder="AI 摘要或手工填写，展示在列表预览中" />
      </NFormItem>
    </NForm>
    <div class="flex justify-end gap-2 mt-4">
      <NButton @click="showModal = false">取消</NButton>
      <NButton type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '创建' }}
      </NButton>
    </div>
  </NModal>

  <!-- 原页图片管理弹窗 -->
  <NModal
    v-model:show="showPagesModal"
    preset="card"
    :title="`原页图片管理 · ${editingDoc?.title || ''}`"
    style="width: 720px; max-height: 80vh"
  >
    <NAlert type="info" show-icon class="mb-3">
      原页图片为扫描件或照片，按页码顺序上传后可在小程序阅读器中浏览。删除旧页后保存即生效。
    </NAlert>

    <!-- 当前页列表 -->
    <div v-if="pages.length > 0" class="mb-3">
      <div class="text-sm text-gray-500 mb-2">当前共 {{ pages.length }} 页：</div>
      <div class="grid grid-cols-3 gap-3 max-h-[360px] overflow-y-auto p-1">
        <NSpin :show="pagesLoading">
          <div v-for="(p, idx) in pages" :key="idx" class="relative group">
            <div class="border rounded overflow-hidden bg-gray-50">
              <NImage
                :src="p.thumbnail_url || p.image_url"
                object-fit="cover"
              />
            </div>
            <div class="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
              第 {{ p.page_no }} 页
            </div>
            <NButton
              class="absolute top-1 right-1"
              size="tiny" type="error" :bordered="false"
              quaternary
              @click="removePage(idx)"
            >删除</NButton>
          </div>
        </NSpin>
      </div>
    </div>
    <NEmpty v-else-if="!pagesLoading" description="暂无原页图片" class="mb-3" />

    <!-- 添加新页 -->
    <NDivider style="margin: 12px 0" />
    <div class="flex items-center gap-2">
      <NInputNumber v-model:value="newPageForm.page_no" :min="1" placeholder="页码" style="width: 100px" />
      <NInput v-model:value="newPageForm.image_url" placeholder="图片 URL（需已上传到对象存储）" style="flex: 1" />
      <NButton type="primary" ghost @click="addTempPage">＋ 添加</NButton>
    </div>

    <div class="flex justify-end gap-2 mt-4">
      <NButton @click="showPagesModal = false">取消</NButton>
      <NButton type="primary" :loading="uploadingPages" @click="savePages">
        保存（覆盖现有）
      </NButton>
    </div>
  </NModal>
</template>

<style scoped>
.grid { display: grid; }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.mb-2 { margin-bottom: 0.5rem; }
.mb-3 { margin-bottom: 0.75rem; }
.mt-2 { margin-top: 0.5rem; }
.mt-4 { margin-top: 1rem; }
.flex { display: flex; }
.items-center { align-items: center; }
.justify-end { justify-content: flex-end; }
.justify-between { justify-content: space-between; }
.max-h-\[360px\] { max-height: 360px; }
.overflow-y-auto { overflow-y: auto; }
.p-1 { padding: 0.25rem; }
.p-2 { padding: 0.5rem; }
.relative { position: relative; }
.absolute { position: absolute; }
.top-1 { top: 0.25rem; }
.left-1 { left: 0.25rem; }
.right-1 { right: 0.25rem; }
.bg-black\/60 { background-color: rgba(0, 0, 0, 0.6); }
.text-white { color: #fff; }
.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-gray-500 { color: #6b7280; }
.px-1\.5 { padding-left: 0.375rem; padding-right: 0.375rem; }
.py-0\.5 { padding-top: 0.125rem; padding-bottom: 0.125rem; }
.rounded { border-radius: 0.25rem; }
.overflow-hidden { overflow: hidden; }
.w-full { width: 100%; }
</style>
