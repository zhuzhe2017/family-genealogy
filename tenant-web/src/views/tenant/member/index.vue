<script setup lang="ts">
import { h, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  NButton, NDataTable, NDatePicker, NForm, NFormItem, NInput, NModal, NPagination,
  NRadioButton, NRadioGroup, NSelect, NSpace, NSpin, NTag
} from 'naive-ui';
import type { FormInst } from 'naive-ui';
import {
  fetchTenantMembers, fetchTenantMemberDetail, createTenantMember, updateTenantMember,
  deleteTenantMember, toggleTenantMemberAlive, fetchTenantFatherCandidates
} from '@/service/api';

const route = useRoute();
const familyId = ref<number>(0);
const loading = ref(false);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Api.Tenant.MemberItem[]>([]);

// ===== 详情弹窗 =====
const showDetail = ref(false);
const detailLoading = ref(false);
const detail = ref<Api.Tenant.MemberDetail | null>(null);

async function viewDetail(id: string) {
  showDetail.value = true;
  detailLoading.value = true;
  try {
    const { data } = await fetchTenantMemberDetail(familyId.value, id);
    detail.value = data || null;
  } finally {
    detailLoading.value = false;
  }
}

// ===== 新增/编辑弹窗 =====
const showForm = ref(false);
const formLoading = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInst | null>(null);
const form = reactive({
  name: '',
  gender: 'male',
  generation: 1 as number | null,
  generationName: '',
  birthDate: null as number | null,
  birthPlace: '',
  isAlive: 1,
  deathDate: null as number | null,
  deathPlace: '',
  bio: '',
  fatherId: null as string | null
});

// 父系候选（按代数搜索）
const fatherOptions = ref<{ label: string; value: string }[]>([]);
const fatherSearching = ref(false);

async function searchFatherCandidates(generation: string, keywordStr = '') {
  if (!generation) return;
  fatherSearching.value = true;
  try {
    const { data } = await fetchTenantFatherCandidates(familyId.value, {
      generation, keyword: keywordStr || undefined, page: 1, pageSize: 20
    });
    fatherOptions.value = (data?.list || []).map((item: Api.Tenant.FatherCandidate) => ({
      label: `${item.name}（第${item.generation}代${item.generation_name ? `·${item.generation_name}` : ''}）`,
      value: item.id
    }));
  } finally {
    fatherSearching.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    name: '', gender: 'male', generation: 1, generationName: '', birthDate: null,
    birthPlace: '', isAlive: 1, deathDate: null, deathPlace: '', bio: '', fatherId: null
  });
  fatherOptions.value = [];
  showForm.value = true;
}

async function openEdit(row: Api.Tenant.MemberItem) {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    gender: row.gender || 'male',
    generation: row.generation || 1,
    generationName: row.generation_name || '',
    birthDate: row.birth_date ? new Date(row.birth_date).getTime() : null,
    birthPlace: row.birth_place || '',
    isAlive: row.is_alive ?? 1,
    deathDate: row.death_date ? new Date(row.death_date).getTime() : null,
    deathPlace: row.death_place || '',
    bio: row.bio || '',
    fatherId: row.father_id || null
  });
  showForm.value = true;
  if (row.generation) {
    searchFatherCandidates(String(row.generation));
  }
}

function handleGenerationChange(val: number | null) {
  form.fatherId = null;
  fatherOptions.value = [];
  if (val) {
    searchFatherCandidates(String(val));
  }
}

function onFatherSearch(query: string) {
  if (form.generation) {
    searchFatherCandidates(String(form.generation), query);
  }
}

async function submitForm() {
  await formRef.value?.validate();
  formLoading.value = true;
  try {
    const payload: Api.Tenant.MemberCreateData = {
      name: form.name,
      gender: form.gender,
      generation: form.generation ?? undefined,
      generationName: form.generationName || undefined,
      birthDate: form.birthDate ? new Date(form.birthDate).toISOString().slice(0, 10) : undefined,
      birthPlace: form.birthPlace || undefined,
      isAlive: form.isAlive,
      deathDate: form.deathDate ? new Date(form.deathDate).toISOString().slice(0, 10) : undefined,
      deathPlace: form.deathPlace || undefined,
      bio: form.bio || undefined,
      fatherId: form.fatherId || undefined
    };
    if (editingId.value) {
      await updateTenantMember(familyId.value, editingId.value, payload);
      window.$message?.success('成员已更新');
    } else {
      await createTenantMember(familyId.value, payload);
      window.$message?.success('成员已创建');
    }
    showForm.value = false;
    await load();
  } finally {
    formLoading.value = false;
  }
}

// ===== 删除/在世切换 =====
function handleDelete(row: Api.Tenant.MemberItem) {
  window.$dialog?.warning({
    title: '确认删除',
    content: `删除后将无法恢复，确定删除成员「${row.name}」吗？`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await deleteTenantMember(familyId.value, row.id);
      window.$message?.success('已删除');
      await load();
    }
  });
}

async function handleToggleAlive(row: Api.Tenant.MemberItem) {
  await toggleTenantMemberAlive(familyId.value, row.id);
  window.$message?.success(row.is_alive === 1 ? '已标记为已故' : '已标记为在世');
  await load();
}

// ===== 列表 =====
const columns = [
  { title: '姓名', key: 'name', width: 120 },
  { title: '性别', key: 'gender', width: 70, render: (row: Api.Tenant.MemberItem) => (row.gender === 'male' ? '男' : '女') },
  { title: '代数', key: 'generation', width: 70 },
  { title: '字辈', key: 'generation_name', width: 100 },
  {
    title: '状态', key: 'is_alive', width: 80,
    render: (row: Api.Tenant.MemberItem) =>
      h(NTag, { type: row.is_alive === 1 ? 'success' : 'default', size: 'small' }, { default: () => (row.is_alive === 1 ? '在世' : '已故') })
  },
  { title: '出生日期', key: 'birth_date', width: 110 },
  {
    title: '操作', key: 'actions', width: 230,
    render: (row: Api.Tenant.MemberItem) => {
      return h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, { text: true, type: 'primary', onClick: () => viewDetail(row.id) }, { default: () => '详情' }),
          h(NButton, { text: true, type: 'primary', onClick: () => openEdit(row) }, { default: () => '编辑' }),
          h(NButton, { text: true, type: 'warning', onClick: () => handleToggleAlive(row) }, { default: () => (row.is_alive === 1 ? '标记已故' : '标记在世') }),
          h(NButton, { text: true, type: 'error', onClick: () => handleDelete(row) }, { default: () => '删除' })
        ]
      });
    }
  }
];

async function load() {
  loading.value = true;
  try {
    const { data } = await fetchTenantMembers(familyId.value, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value
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

const detailItems = (d: Api.Tenant.MemberDetail) => [
  { label: '姓名', value: d.name },
  { label: '性别', value: d.gender === 'male' ? '男' : '女' },
  { label: '代数', value: d.generation ? `第${d.generation}代` : '' },
  { label: '字辈', value: d.generation_name },
  { label: '状态', value: d.is_alive === 1 ? '在世' : '已故' },
  { label: '出生日期', value: d.birth_date },
  { label: '出生地', value: d.birth_place },
  { label: '逝世日期', value: d.death_date },
  { label: '逝世地', value: d.death_place },
  { label: '简介', value: d.bio },
  { label: '子女数', value: d.children?.length ? `${d.children.length} 人` : '' }
];

const formRules = {
  name: { required: true, message: '请输入姓名', trigger: 'blur' },
  generation: { required: true, type: 'number' as const, message: '请选择代数', trigger: 'change' }
};

const generationOptions = Array.from({ length: 30 }, (_, i) => ({ label: `第 ${i + 1} 代`, value: i + 1 }));

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
    <NSpace>
      <NInput v-model:value="keyword" placeholder="搜索姓名" style="width: 240px" @keyup.enter="search" />
      <NButton type="primary" @click="search">
        搜索
      </NButton>
      <NButton type="primary" @click="openCreate">
        新增成员
      </NButton>
    </NSpace>
    <NSpin :show="loading">
      <NDataTable :columns="columns" :data="list" :bordered="false" :scroll-x="900" />
      <div class="flex justify-end mt-4">
        <NPagination v-model:page="page" v-model:page-size="pageSize" :item-count="total" @update:page="load" @update:page-size="search" />
      </div>
    </NSpin>

    <!-- 详情弹窗 -->
    <NModal v-model:show="showDetail" preset="card" title="成员详情" style="width: 560px">
      <NSpin :show="detailLoading">
        <div v-if="detail" class="detail-list">
          <div v-for="item in detailItems(detail)" :key="item.label" class="detail-row">
            <span class="detail-label">{{ item.label }}</span>
            <span class="detail-value">{{ item.value || '—' }}</span>
          </div>
        </div>
        <div v-if="detail?.children?.length" class="mt-4">
          <div class="font-bold mb-2">
            子女
          </div>
          <NSpace>
            <NTag v-for="child in detail.children" :key="child.id" size="small">
              {{ child.name }}
            </NTag>
          </NSpace>
        </div>
      </NSpin>
    </NModal>

    <!-- 新增/编辑弹窗 -->
    <NModal v-model:show="showForm" preset="card" :title="editingId ? '编辑成员' : '新增成员'" style="width: 560px">
      <NForm ref="formRef" :model="form" :rules="formRules" label-placement="left" label-width="90">
        <NFormItem label="姓名" path="name">
          <NInput v-model:value="form.name" placeholder="成员姓名" />
        </NFormItem>
        <NFormItem label="性别" path="gender">
          <NRadioGroup v-model:value="form.gender">
            <NRadioButton value="male">
              男
            </NRadioButton>
            <NRadioButton value="female">
              女
            </NRadioButton>
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="代数" path="generation">
          <NSelect v-model:value="form.generation" :options="generationOptions" @update:value="handleGenerationChange" />
        </NFormItem>
        <NFormItem label="字辈">
          <NInput v-model:value="form.generationName" placeholder="字辈名称（选填）" />
        </NFormItem>
        <NFormItem label="父亲">
          <NSelect
            v-model:value="form.fatherId"
            :options="fatherOptions"
            :loading="fatherSearching"
            filterable
            clearable
            remote
            placeholder="选择父亲（选填）"
            @search="onFatherSearch"
          />
        </NFormItem>
        <NFormItem label="在世状态">
          <NRadioGroup v-model:value="form.isAlive">
            <NRadioButton :value="1">
              在世
            </NRadioButton>
            <NRadioButton :value="0">
              已故
            </NRadioButton>
          </NRadioGroup>
        </NFormItem>
        <NFormItem label="出生日期">
          <NDatePicker v-model:value="form.birthDate" type="date" style="width: 100%" />
        </NFormItem>
        <NFormItem label="出生地">
          <NInput v-model:value="form.birthPlace" placeholder="出生地（选填）" />
        </NFormItem>
        <NFormItem v-if="form.isAlive === 0" label="逝世日期">
          <NDatePicker v-model:value="form.deathDate" type="date" style="width: 100%" />
        </NFormItem>
        <NFormItem v-if="form.isAlive === 0" label="逝世地">
          <NInput v-model:value="form.deathPlace" placeholder="逝世地（选填）" />
        </NFormItem>
        <NFormItem label="简介">
          <NInput v-model:value="form.bio" type="textarea" :rows="3" placeholder="生平简介（选填）" />
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
  gap: 8px;
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
