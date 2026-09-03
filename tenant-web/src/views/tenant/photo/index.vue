<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  NButton, NCard, NEmpty, NForm, NFormItem, NInput, NList, NListItem, NModal,
  NPagination, NRadioButton, NRadioGroup, NSpace, NSpin, NUpload, NInputNumber
} from 'naive-ui';
import type { UploadCustomRequestOptions } from 'naive-ui';
import {
  fetchTenantContents, fetchTenantContentDetail, createTenantContent,
  updateTenantContent, deleteTenantContent, type ContentType
} from '@/service/api';
import { uploadImage } from '@/service/api/upload';

const route = useRoute();
const props = withDefaults(defineProps<{ type?: ContentType }>(), { type: 'photo' });

const familyId = ref<number>(0);
const loading = ref(false);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Record<string, unknown>[]>([]);

const titleMap: Record<ContentType, string> = {
  photo: '相册',
  document: '文档',
  event: '事件'
};

const typeOptions = [
  { label: '出生', value: 'birth' },
  { label: '婚嫁', value: 'marriage' },
  { label: '逝世', value: 'death' },
  { label: '其他', value: 'other' }
];
const typeNameMap: Record<string, string> = { birth: '出生', marriage: '婚嫁', death: '逝世', other: '其他' };

// ===== 新增/编辑弹窗 =====
const showForm = ref(false);
const formLoading = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  title: '',
  url: '',
  description: '',
  volume: '',
  year: null as number | null,
  month: null as number | null,
  day: null as number | null,
  eventType: 'other',
  uploading: false
});

function openCreate() {
  editingId.value = null;
  Object.assign(form, { title: '', url: '', description: '', volume: '', year: null, month: null, day: null, eventType: 'other', uploading: false });
  showForm.value = true;
}

async function openEdit(item: Record<string, unknown>) {
  editingId.value = String(item.id);
  Object.assign(form, {
    title: String(item.title || item.name || ''),
    url: String(item.url || item.file_url || ''),
    description: String(item.description || ''),
    volume: String(item.volume || ''),
    year: item.year ? Number(item.year) : null,
    month: item.month ? Number(item.month) : null,
    day: item.day ? Number(item.day) : null,
    eventType: String(item.type || 'other'),
    uploading: false
  });
  showForm.value = true;
}

// 图片上传（相册）
function customUploadRequest({ file, onFinish, onError, onProgress }: UploadCustomRequestOptions) {
  const f = file.file;
  if (!f) return;
  form.uploading = true;
  uploadImage(f, percent => {
    onProgress({ percent });
  }).then(({ data, error }) => {
    if (data?.url) {
      form.url = data.url;
      onFinish();
    } else {
      onError();
      window.$message?.error(error?.message || '上传失败');
    }
  }).finally(() => {
    form.uploading = false;
  });
}

async function submitForm() {
  if (!form.title.trim()) {
    window.$message?.warning(props.type === 'document' ? '请输入文档名称' : '请输入标题');
    return;
  }
  if (props.type === 'photo' && !form.url.trim()) {
    window.$message?.warning('请上传或填写图片地址');
    return;
  }
  if (props.type === 'event' && !form.year) {
    window.$message?.warning('请输入事件年份');
    return;
  }
  formLoading.value = true;
  try {
    let payload: Record<string, unknown>;
    if (props.type === 'photo') {
      payload = { title: form.title, url: form.url, description: form.description, year: form.year || undefined };
    } else if (props.type === 'document') {
      payload = { name: form.title, fileUrl: form.url, description: form.description, volume: form.volume || undefined };
    } else {
      payload = {
        title: form.title, description: form.description, year: form.year,
        month: form.month || 0, day: form.day || 0,
        type: form.eventType, typeName: typeNameMap[form.eventType] || '其他'
      };
    }
    if (editingId.value) {
      await updateTenantContent(familyId.value, props.type, editingId.value, payload);
      window.$message?.success('已更新');
    } else {
      await createTenantContent(familyId.value, props.type, payload);
      window.$message?.success('已创建');
    }
    showForm.value = false;
    await load();
  } finally {
    formLoading.value = false;
  }
}

// 后端 updateContent 目前仅 event 有完整保障
const canEdit = () => props.type === 'event';

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchTenantContents(familyId.value, props.type, {
      page: page.value, pageSize: pageSize.value, keyword: keyword.value || undefined
    });
    list.value = data?.list || [];
    total.value = data?.total || 0;
  } finally {
    loading.value = false;
  }
}

function search() {
  page.value = 1;
  load();
}

// ===== 详情弹窗 =====
const showDetail = ref(false);
const detailLoading = ref(false);
const detail = ref<Record<string, unknown> | null>(null);

async function viewDetail(item: Record<string, unknown>) {
  showDetail.value = true;
  detailLoading.value = true;
  try {
    const { data } = await fetchTenantContentDetail(familyId.value, props.type, String(item.id));
    detail.value = data || null;
  } finally {
    detailLoading.value = false;
  }
}

interface DetailRow {
  label: string;
  value: unknown;
  isImage?: boolean;
  isLink?: boolean;
}

function detailRows(d: Record<string, unknown>): DetailRow[] {
  if (props.type === 'photo') {
    return [
      { label: '标题', value: d.title },
      { label: '年份', value: d.year },
      { label: '描述', value: d.description },
      { label: '图片', value: d.url, isImage: true }
    ];
  }
  if (props.type === 'document') {
    return [
      { label: '名称', value: d.name },
      { label: '卷册', value: d.volume },
      { label: '页数', value: d.page_count },
      { label: '简介', value: d.description },
      { label: '文件', value: d.file_url, isLink: true }
    ];
  }
  return [
    { label: '标题', value: d.title },
    { label: '时间', value: `${d.year || ''}${d.month ? `-${d.month}` : ''}${d.day ? `-${d.day}` : ''}` },
    { label: '类型', value: d.type_name || typeNameMap[String(d.type || 'other')] },
    { label: '描述', value: d.description }
  ];
}

function remove(item: Record<string, unknown>) {
  window.$dialog?.warning({
    title: '确认删除',
    content: `确定删除「${displayTitle(item)}」吗？删除后无法恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteTenantContent(familyId.value, props.type, String(item.id));
      window.$message?.success('已删除');
      await load();
    }
  });
}

function displayTitle(item: Record<string, unknown>): string {
  return String(item.title || item.name || item.id || '未命名');
}

watch(
  () => route.params.familyId,
  v => {
    const id = Number(v);
    if (id) {
      familyId.value = id;
      load();
    }
  },
  { immediate: true }
);

onMounted(load);
</script>

<template>
  <NSpace vertical size="large">
    <NSpace justify="space-between" align="center">
      <NSpace>
        <h2 class="text-xl font-bold">
          {{ titleMap[type] }}
        </h2>
        <NInput v-model:value="keyword" :placeholder="`搜索${titleMap[type]}`" style="width: 200px" clearable @keyup.enter="search" />
        <NButton @click="search">
          搜索
        </NButton>
      </NSpace>
      <NButton type="primary" @click="openCreate">
        新增{{ titleMap[type] }}
      </NButton>
    </NSpace>
    <NSpin :show="loading">
      <NEmpty v-if="list.length === 0" description="暂无数据" />
      <NList v-else hoverable>
        <NListItem v-for="item in list" :key="String(item.id)">
          <NCard :title="displayTitle(item)">
            <template #header-extra>
              <NSpace>
                <NButton text type="primary" @click.stop="viewDetail(item)">
                  详情
                </NButton>
                <NButton text type="primary" @click.stop="openEdit(item)">
                  编辑
                </NButton>
                <NButton text type="error" @click.stop="remove(item)">
                  删除
                </NButton>
              </NSpace>
            </template>
            <p class="text-gray-600 truncate">
              {{ item.description || item.content || item.title || item.name || '' }}
            </p>
          </NCard>
        </NListItem>
      </NList>
      <div class="flex justify-end mt-4">
        <NPagination v-model:page="page" v-model:page-size="pageSize" :item-count="total" @update:page="load" @update:page-size="search" />
      </div>
    </NSpin>

    <!-- 详情弹窗 -->
    <NModal v-model:show="showDetail" preset="card" :title="`${titleMap[type]}详情`" style="width: 560px">
      <NSpin :show="detailLoading">
        <div v-if="detail" class="detail-list">
          <div v-for="row in detailRows(detail)" :key="row.label" class="detail-row">
            <span class="detail-label">{{ row.label }}</span>
            <span v-if="row.isImage" class="detail-value">
              <img :src="String(row.value)" alt="图片" class="max-w-full rounded">
            </span>
            <a v-else-if="row.isLink && row.value" :href="String(row.value)" target="_blank" rel="noreferrer" class="detail-value">
              查看文件
            </a>
            <span v-else class="detail-value">{{ row.value || '—' }}</span>
          </div>
        </div>
      </NSpin>
    </NModal>

    <!-- 新增/编辑弹窗 -->
    <NModal v-model:show="showForm" preset="card" :title="`${editingId ? '编辑' : '新增'}${titleMap[type]}`" style="width: 520px">
      <NForm label-placement="left" label-width="80">
        <NFormItem label="标题">
          <NInput v-model:value="form.title" :placeholder="type === 'document' ? '文档名称' : '标题'" />
        </NFormItem>

        <template v-if="type === 'photo'">
          <NFormItem label="图片">
            <NSpace vertical style="width: 100%">
              <NUpload
                :max="1"
                :default-upload="true"
                accept="image/*"
                :custom-request="customUploadRequest"
              >
                <NButton :loading="form.uploading">
                  上传图片
                </NButton>
              </NUpload>
              <NInput v-model:value="form.url" placeholder="或直接填写图片地址" />
            </NSpace>
          </NFormItem>
          <NFormItem label="年份">
            <NInputNumber v-model:value="form.year" placeholder="如 1990" style="width: 100%" />
          </NFormItem>
        </template>

        <template v-else-if="type === 'document'">
          <NFormItem label="文件地址">
            <NInput v-model:value="form.url" placeholder="文件 URL（选填）" />
          </NFormItem>
          <NFormItem label="卷册">
            <NInput v-model:value="form.volume" placeholder="卷册（选填）" />
          </NFormItem>
        </template>

        <template v-else>
          <NFormItem label="年份">
            <NInputNumber v-model:value="form.year" placeholder="必填，如 2024" style="width: 100%" />
          </NFormItem>
          <NFormItem label="月/日">
            <NSpace>
              <NInputNumber v-model:value="form.month" :min="1" :max="12" placeholder="月" style="width: 120px" />
              <NInputNumber v-model:value="form.day" :min="1" :max="31" placeholder="日" style="width: 120px" />
            </NSpace>
          </NFormItem>
          <NFormItem label="类型">
            <NRadioGroup v-model:value="form.eventType">
              <NRadioButton v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </NRadioButton>
            </NRadioGroup>
          </NFormItem>
        </template>

        <NFormItem label="描述">
          <NInput v-model:value="form.description" type="textarea" :rows="3" placeholder="描述（选填）" />
        </NFormItem>

        <NSpace justify="end">
          <NButton @click="showForm = false">
            取消
          </NButton>
          <NButton type="primary" :loading="formLoading" @click="submitForm">
            保存
          </NButton>
        </NSpace>
      </NForm>
    </NModal>
  </NSpace>
</template>

<style scoped>
.detail-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detail-row {
  display: flex;
  gap: 16px;
}
.detail-label {
  width: 70px;
  flex-shrink: 0;
  color: rgba(0, 0, 0, 0.45);
}
.detail-value {
  flex: 1;
  word-break: break-all;
}
</style>
