<script setup lang="ts">
import { h, ref, reactive, onMounted } from 'vue';
import type { DataTableColumn, FormInst, UploadCustomRequestOptions } from 'naive-ui';
import { useMessage, useDialog, NTag, NSwitch, NImage, NButton, NSpace, NUpload } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import ImageUpload from '@/components/common/image-upload/index.vue';
import { resolveImageUrl } from '@/utils/image-url';
import {
  fetchFamilyList, fetchCreateFamily, fetchUpdateFamily,
  fetchDeleteFamily, fetchRestoreFamily, fetchToggleFamilyPublic,
  fetchAllSurnames, fetchAllGenerationTables,
  fetchImportFamily, exportFamily, downloadFamilyImportTemplate
} from '@/service/api';
import type { FamilyItem, GenerationTableItem } from '@/service/api';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();
const noImageUrl = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect fill=%22%23f0f0f0%22 width=%2240%22 height=%2240%22/%3E%3Ctext x=%2220%22 y=%2220%22 text-anchor=%22middle%22 dominant-baseline=%22central%22 fill=%22%23999%22 font-size=%2212%22%3E无%3C/text%3E%3C/svg%3E';

const loading = ref(false);
const tableData = ref<FamilyItem[]>([]);

const searchParams = reactive({
  keyword: '',
  status: null as number | null,
  isPublic: null as number | null
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100]
});

const statusOptions = [
  { label: '正常', value: 1 },
  { label: '已删除', value: 0 }
];

const publicOptions = [
  { label: '公开', value: 1 },
  { label: '私密', value: 0 }
];

// 姓氏下拉选项（从 surname 表加载）
const surnameOptions = ref<{ label: string; value: number }[]>([]);
// 字辈表下拉选项（从 generation_table 表加载）
const generationTableOptions = ref<{ label: string; value: string; info?: GenerationTableItem }[]>([]);

async function loadSurnameOptions() {
  try {
    const { data } = await fetchAllSurnames({ status: 1 });
    surnameOptions.value = (data || []).map((s: any) => ({ label: `${s.surname}（${s.pinyin}）`, value: s.id }));
  } catch {
    surnameOptions.value = [];
  }
}

async function loadGenerationTableOptions() {
  try {
    const { data } = await fetchAllGenerationTables({ status: 1 });
    generationTableOptions.value = (data || []).map((gt: any) => {
      const seqLen = Array.isArray(gt.generation_sequence) ? gt.generation_sequence.length : 0;
      return {
        label: `${gt.surname} · ${gt.founder}（${seqLen}代）`,
        value: gt.id,
        info: gt
      };
    });
  } catch {
    generationTableOptions.value = [];
  }
}

const columns: DataTableColumn<FamilyItem>[] = [
  { title: '家族名称', key: 'name', width: 160, fixed: 'left' },
  { title: '姓氏', key: 'surname_name', width: 80, render: row => row.surname_name || '-' },
  {
    title: 'LOGO', key: 'logo', width: 80,
    render: row => {
      if (!row.logo) return '-';
      return h(NImage, {
        src: resolveImageUrl(row.logo),
        width: 36,
        height: 36,
        'fallback-src': noImageUrl,
        style: 'object-fit: contain; border-radius: 4px;',
        'img-props': { style: 'object-fit: contain;' }
      });
    }
  },
  { title: '始祖', key: 'founder', width: 90 },
  { title: '堂号', key: 'hall_name', width: 100, ellipsis: { tooltip: true }, render: row => row.hall_name || '-' },
  {
    title: '关联字辈', key: 'generation_table_id', width: 180, ellipsis: { tooltip: true },
    render: row => {
      if (!row.generation_table_id) return h('span', { class: 'text-gray-400' }, '未关联');
      return `${row.generation_table_surname || ''} · ${row.generation_table_founder || ''}`;
    }
  },
  { title: '发源地', key: 'origin', ellipsis: { tooltip: true }, width: 140 },
  { title: '成员数', key: 'realMemberCount', width: 80, align: 'center',
    render: row => row.realMemberCount ?? row.member_count ?? 0
  },
  {
    title: '种子邀请码', key: 'seed_share_code', width: 150,
    render: row => {
      if (!row.seed_share_code) return h('span', { class: 'text-gray-400' }, '-');
      return h(NSpace, { size: 4, align: 'center' }, {
        default: () => [
          h('span', { style: 'font-family: monospace; font-weight: 500;' }, row.seed_share_code),
          h(NButton, {
            size: 'tiny', quaternary: true, type: 'primary',
            onClick: () => copySeedCode(row.seed_share_code!)
          }, { default: () => '复制' })
        ]
      });
    }
  },
  { title: '代数', key: 'gen_count', width: 70, align: 'center' },
  { title: '事件', key: 'eventCount', width: 70, align: 'center' },
  { title: '照片', key: 'photoCount', width: 70, align: 'center' },
  { title: '文档', key: 'documentCount', width: 70, align: 'center' },
  { title: '动态', key: 'dynamicCount', width: 70, align: 'center' },
  {
    title: '公开', key: 'is_public', width: 75, align: 'center',
    render: row => h(NSwitch, {
      value: row.is_public === 1,
      disabled: !hasAuth('system:family:update'),
      'onUpdate:value': () => handleTogglePublic(row)
    })
  },
  {
    title: '状态', key: 'status', width: 80, align: 'center',
    render: row => h(NTag, {
      type: row.status === 1 ? 'success' : 'error',
      size: 'small',
      bordered: false
    }, { default: () => row.status === 1 ? '正常' : '已删除' })
  },
  { title: '创建时间', key: 'create_time', width: 170 },
  {
    title: '操作', key: 'actions', width: 150, fixed: 'right',
    render: row => h(NSpace, null, {
      default: () => [
        row.status === 1 && hasAuth('system:family:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
        row.status === 1
          ? hasAuth('system:family:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
          : hasAuth('system:family:update') && h(NButton, { size: 'small', type: 'warning', ghost: true, onClick: () => handleRestore(row) }, { default: () => '恢复' })
      ]
    })
  }
];

function handleSearch() {
  pagination.page = 1;
  loadData();
}

/** 复制种子邀请码 */
async function copySeedCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    message.success('种子邀请码已复制，可发给会员加入家族');
  } catch {
    message.error('复制失败，请手动复制');
  }
}

function handleReset() {
  searchParams.keyword = '';
  searchParams.status = null;
  searchParams.isPublic = null;
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
    const { data } = await fetchFamilyList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchParams.keyword || undefined,
      status: searchParams.status ?? undefined,
      isPublic: searchParams.isPublic ?? undefined
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
  name: '',
  surnameId: null as number | null,
  generationTableId: null as string | null,
  founder: '',
  hallName: '',
  origin: '',
  description: '',
  logo: '',
  isPublic: 1,
  allowJoin: 1
});

/** 堂号字符白名单：中英文、数字、空格及常见安全标点 */
const hallNamePattern = /^[\u4e00-\u9fa5A-Za-z0-9\s·._\-()（）,，、。:：]*$/;

const formRules = {
  name: [{ required: true, message: '请输入家族名称', trigger: 'blur' }],
  hallName: [
    {
      validator: (_rule: any, value: string) => {
        if (!value) return Promise.resolve();
        if (value.length > 50) return Promise.reject('堂号长度不能超过50个字符');
        if (!hallNamePattern.test(value)) return Promise.reject('堂号包含不允许的特殊字符');
        return Promise.resolve();
      },
      trigger: 'blur'
    }
  ]
};

function resetForm() {
  formData.name = '';
  formData.surnameId = null;
  formData.generationTableId = null;
  formData.founder = '';
  formData.hallName = '';
  formData.origin = '';
  formData.description = '';
  formData.logo = '';
  formData.isPublic = 1;
  formData.allowJoin = 1;
}

function handleAdd() {
  isEdit.value = false;
  editId.value = null;
  resetForm();
  loadGenerationTableOptions();
  showModal.value = true;
}

async function handleEdit(row: FamilyItem) {
  isEdit.value = true;
  editId.value = row.id;
  formData.name = row.name;
  formData.surnameId = row.surname_id || null;
  formData.generationTableId = row.generation_table_id || null;
  formData.founder = row.founder;
  formData.hallName = row.hall_name || '';
  formData.origin = row.origin;
  formData.description = row.description || '';
  formData.logo = row.logo;
  formData.isPublic = row.is_public;
  formData.allowJoin = row.allow_join;
  await loadGenerationTableOptions();
  showModal.value = true;
}

async function handleSubmit() {
  try { await formRef.value?.validate(); } catch { return; }
  submitting.value = true;
  try {
    if (isEdit.value && editId.value) {
      await fetchUpdateFamily(editId.value, formData);
      message.success('更新成功');
    } else {
      const { data } = await fetchCreateFamily(formData);
      message.success(data?.seedShareCode ? `新增成功，种子邀请码：${data.seedShareCode}` : '新增成功');
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
function handleDelete(row: FamilyItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除家族「${row.name}」吗？删除后该家族将标记为已删除状态，关联数据保留。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteFamily(row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

// ===== 恢复已删除 =====
function handleRestore(row: FamilyItem) {
  dialog.warning({
    title: '确认恢复',
    content: `恢复后该家族将重新启用，确定恢复「${row.name}」吗？`,
    positiveText: '确认恢复',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchRestoreFamily(row.id);
        message.success('恢复成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '恢复失败');
      }
    }
  });
}

// ===== 切换公开状态 =====
async function handleTogglePublic(row: FamilyItem) {
  try {
    const { data } = await fetchToggleFamilyPublic(row.id);
    message.success(data?.isPublic === 1 ? '已设为公开' : '已设为私密');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  }
}

// ===== 导出 =====
async function handleExport() {
  try {
    await exportFamily({
      keyword: searchParams.keyword || undefined,
      status: searchParams.status ?? undefined,
      isPublic: searchParams.isPublic ?? undefined
    });
  } catch (err: any) {
    message.error(err?.msg || '导出失败');
  }
}

// ===== 导入 =====
async function handleImportRequest({ file, onFinish, onError }: UploadCustomRequestOptions) {
  const f = file.file;
  if (!f) {
    message.error('请选择文件');
    onError();
    return;
  }
  try {
    const { data } = await fetchImportFamily(f);
    onFinish();
    if (data?.errors?.length) {
      dialog.warning({
        title: '导入完成，部分失败',
        content: `共 ${data.total} 行：新增 ${data.created}，更新 ${data.updated}，失败 ${data.errors.length}。\n${data.errors.slice(0, 10).join('\n')}`,
        positiveText: '确定'
      });
    } else {
      message.success(`导入完成：新增 ${data?.created ?? 0}，更新 ${data?.updated ?? 0}`);
    }
    loadData();
  } catch (err: any) {
    onError();
    message.error(err?.msg || '导入失败');
  }
}

// ===== 下载导入模板 =====
async function handleDownloadTemplate() {
  try {
    await downloadFamilyImportTemplate();
  } catch (err: any) {
    message.error(err?.msg || '模板下载失败');
  }
}

onMounted(() => { loadData(); loadSurnameOptions(); loadGenerationTableOptions(); });
</script>

<template>
  <div>
    <!-- 搜索栏 -->
    <NCard :bordered="false" class="mb-16px">
      <NForm inline label-placement="left" :model="searchParams">
        <NFormItem label="名称/始祖/发源地">
          <NInput v-model:value="searchParams.keyword" placeholder="请输入家族名称、始祖或发源地" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="公开状态">
          <NSelect v-model:value="searchParams.isPublic" placeholder="全部" clearable :options="publicOptions" style="width: 120px" />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect v-model:value="searchParams.status" placeholder="默认正常" clearable :options="statusOptions" style="width: 120px" />
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
    <NCard :bordered="false" title="家族管理">
      <template #header-extra>
        <NSpace>
          <NButton v-if="hasAuth('system:family:export')" @click="handleExport">导出</NButton>
          <NButton v-if="hasAuth('system:family:import')" @click="handleDownloadTemplate">下载导入模板</NButton>
          <NUpload
            v-if="hasAuth('system:family:import')"
            accept=".csv,.xlsx,.xls"
            :show-file-list="false"
            :custom-request="handleImportRequest"
          >
            <NButton type="primary" ghost>导入家族</NButton>
          </NUpload>
          <NButton v-if="hasAuth('system:family:create')" type="primary" @click="handleAdd">新增家族</NButton>
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
        :scroll-x="1800"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />

      <!-- 新增/编辑弹窗 -->
      <NModal v-model:show="showModal" :title="isEdit ? '编辑家族' : '新增家族'" preset="card" style="width: 720px" :mask-closable="false">
        <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px">
          <NFormItem label="家族名称" path="name">
            <NInput v-model:value="formData.name" placeholder="请输入家族名称" />
          </NFormItem>
          <NFormItem label="姓氏" path="surnameId">
            <NSelect v-model:value="formData.surnameId" placeholder="选择关联姓氏（可选）" clearable filterable :options="surnameOptions" />
          </NFormItem>
          <NFormItem label="关联字辈" path="generationTableId">
            <NSelect
              v-model:value="formData.generationTableId"
              placeholder="选择字辈表（可选）"
              clearable
              filterable
              :options="generationTableOptions"
              :disabled="generationTableOptions.length === 0"
            />
            <div v-if="generationTableOptions.length === 0" class="text-12px text-orange-500 mt-6px">暂无可用字辈表，请先在字辈管理中创建并启用字辈表</div>
            <div v-else class="text-gray-500 text-12px mt-6px">关联后家族成员可依据该字辈表选择字辈</div>
          </NFormItem>
          <NFormItem label="LOGO" path="logo">
            <div class="flex-y-center gap-8px w-full">
              <ImageUpload v-model:value="formData.logo" :size="120" />
              <span class="text-12px text-gray-500">支持点击或拖拽上传，保存后作为家族 LOGO 展示</span>
            </div>
          </NFormItem>
          <NFormItem label="始祖" path="founder">
            <NInput v-model:value="formData.founder" placeholder="始祖姓名" />
          </NFormItem>
          <NFormItem label="堂号" path="hallName">
            <NInput v-model:value="formData.hallName" placeholder="请输入堂号，如：颍川堂（可选）" :maxlength="50" show-count />
            <div class="text-gray-500 text-12px mt-6px">支持中文，最长50字符，不可包含特殊字符</div>
          </NFormItem>
          <NFormItem label="发源地" path="origin">
            <NInput v-model:value="formData.origin" placeholder="家族发源地" />
          </NFormItem>
          <NFormItem label="家族简介" path="description">
            <NInput v-model:value="formData.description" type="textarea" :rows="3" placeholder="家族简介（可选）" />
          </NFormItem>
          <NFormItem label="是否公开" path="isPublic">
            <NSwitch v-model:value="formData.isPublic" :checked-value="1" :unchecked-value="0" />
            <span class="ml-8px text-gray-500 text-12px">公开后小程序用户可查看</span>
          </NFormItem>
          <NFormItem label="允许加入" path="allowJoin">
            <NSwitch v-model:value="formData.allowJoin" :checked-value="1" :unchecked-value="0" />
            <span class="ml-8px text-gray-500 text-12px">允许小程序用户申请加入</span>
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
