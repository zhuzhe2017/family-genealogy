<script setup lang="ts">
import { h, onMounted, reactive, ref, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import {
  NButton, NDataTable, NDatePicker, NForm, NFormItem, NInput, NModal, NPagination,
  NRadio, NRadioGroup, NSelect, NSpace, NSpin, NTag, NSwitch, NInputNumber,
  NScrollbar, NAlert, NUpload, NCard, NGrid, NGi
} from 'naive-ui';
import type { FormInst, FormRules, UploadCustomRequestOptions, UploadFileInfo } from 'naive-ui';
import {
  fetchTenantMembers, fetchTenantMemberDetail, createTenantMember, updateTenantMember,
  deleteTenantMember, toggleTenantMemberAlive, fetchTenantFatherCandidates, fetchTenantFatherSpouses,
  uploadImage
} from '@/service/api';
import { resolveImageUrl } from '@/utils/image-url';
import ImageUpload from '@/components/common/image-upload/index.vue';

const route = useRoute();
const familyId = ref<number>(0);
const loading = ref(false);
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const list = ref<Api.Tenant.MemberItem[]>([]);

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

async function load() {
  if (!familyId.value) return;
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
  { label: '墓茔经度', value: d.longitude },
  { label: '墓茔纬度', value: d.latitude },
  { label: '同辈排序', value: d.sort_order },
  { label: '简介', value: d.bio },
  { label: '子女数', value: d.children?.length ? `${d.children.length} 人` : '' }
];

// ===== 新增/编辑弹窗 =====
const showForm = ref(false);
const formLoading = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInst | null>(null);

interface SpouseItem {
  name: string;
  birthDate: string;
  isAlive: number;
  deathDate: string;
  deathPlace: string;
  longitude: number | null;
  latitude: number | null;
  bio: string;
  collapsed: boolean;
}

const form = reactive({
  name: '',
  gender: 'male',
  generation: 1,
  generationName: '',
  birthDate: null as number | null,
  birthPlace: '',
  isAlive: 1,
  deathDate: null as number | null,
  deathPlace: '',
  longitude: null as number | null,
  latitude: null as number | null,
  bio: '',
  avatarUrl: '',
  photos: [] as string[],
  fatherId: '',
  motherId: '',
  spouseList: [] as SpouseItem[],
  sortOrder: 0
});

const fatherRequired = computed(() => form.generation >= 2);
const fatherDisabled = computed(() => form.generation === 1);
const showMotherSelect = computed(() => !!form.fatherId && motherCandidates.value.length > 0);

const formRules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
  generation: [{ required: true, message: '请选择代数', type: 'number', trigger: 'change' }],
  fatherId: [
    {
      validator() {
        if (form.generation >= 2 && !form.fatherId) {
          return new Error('第2代及以上成员必须选择父亲');
        }
        return true;
      },
      trigger: 'change'
    }
  ]
};

// 母亲候选
const motherCandidates = ref<Api.Tenant.FatherSpouse[]>([]);
const motherLoading = ref(false);

// 父亲选择弹窗
const showFatherModal = ref(false);
const fatherSearchKeyword = ref('');
const fatherCandidates = ref<Api.Tenant.FatherCandidate[]>([]);
const fatherSearchLoading = ref(false);
let fatherSearchPage = 1;
const fatherHasMore = ref(false);
const selectedCandidateId = ref<string | null>(null);
const candidateMotherMap = ref<Record<string, Api.Tenant.FatherSpouse[]>>({});
const selectedCandidateMotherIndex = ref<string | null>(null);
const loadingCandidateMothers = ref<Record<string, boolean>>({});
const selectedFatherInfo = ref<{ id: string; name: string; generation: number } | null>(null);

const generationOptions = Array.from({ length: 30 }, (_, i) => ({ label: `第 ${i + 1} 代`, value: i + 1 }));

function resetForm() {
  Object.assign(form, {
    name: '', gender: 'male', generation: 1, generationName: '', birthDate: null,
    birthPlace: '', isAlive: 1, deathDate: null, deathPlace: '', longitude: null,
    latitude: null, bio: '', avatarUrl: '', photos: [], fatherId: '', motherId: '',
    spouseList: [], sortOrder: 0
  });
  selectedFatherInfo.value = null;
  motherCandidates.value = [];
  fatherSearchKeyword.value = '';
  fatherCandidates.value = [];
  fatherHasMore.value = false;
  fatherSearchPage = 1;
  selectedCandidateId.value = null;
  selectedCandidateMotherIndex.value = null;
  candidateMotherMap.value = {};
  loadingCandidateMothers.value = {};
}

function openCreate() {
  editingId.value = null;
  resetForm();
  showForm.value = true;
}

async function openEdit(row: Api.Tenant.MemberItem) {
  editingId.value = row.id;
  resetForm();
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
    longitude: row.longitude ?? null,
    latitude: row.latitude ?? null,
    bio: row.bio || '',
    avatarUrl: row.avatar_url || '',
    fatherId: row.father_id || '',
    motherId: row.mother_id || '',
    sortOrder: row.sort_order ?? 0
  });
  form.spouseList = parseSpouseInfo(row.spouse_info);
  showForm.value = true;

  if (familyId.value && form.fatherId) {
    await loadSelectedFatherInfo(familyId.value, form.fatherId);
    await loadMotherCandidates(familyId.value, form.fatherId);
  }
  // 编辑时照片从详情接口补充
  if (familyId.value) {
    try {
      const { data } = await fetchTenantMemberDetail(familyId.value, row.id);
      if (data) form.photos = data.photos || [];
    } catch {
      // ignore
    }
  }
}

function parseSpouseInfo(raw: string | null | unknown): SpouseItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return []; }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .map((s: any) => ({
      name: s.name || '',
      birthDate: s.birthDate || s.birth_date || '',
      isAlive: s.isAlive ?? 1,
      deathDate: s.deathDate || s.death_date || '',
      deathPlace: s.deathPlace || s.death_place || '',
      longitude: s.longitude ?? s.lng ?? null,
      latitude: s.latitude ?? s.lat ?? null,
      bio: s.bio || '',
      collapsed: false
    }))
    .filter((s: { name: string }) => s.name);
}

watch(() => form.generation, (newVal, oldVal) => {
  if (newVal === 1) {
    form.fatherId = '';
    form.motherId = '';
    selectedFatherInfo.value = null;
    motherCandidates.value = [];
  } else if (oldVal === 1 && newVal >= 2) {
    form.fatherId = '';
    form.motherId = '';
    selectedFatherInfo.value = null;
    motherCandidates.value = [];
  } else if (form.fatherId && selectedFatherInfo.value && selectedFatherInfo.value.generation !== newVal - 1) {
    window.$message?.warning(`已选父亲为第 ${selectedFatherInfo.value.generation} 代，与当前第 ${newVal} 代不符，请重新选择父亲`);
    form.fatherId = '';
    form.motherId = '';
    selectedFatherInfo.value = null;
    motherCandidates.value = [];
  }
}, { flush: 'sync' });

watch(() => form.fatherId, async (newVal) => {
  if (!familyId.value || !newVal) {
    selectedFatherInfo.value = null;
    motherCandidates.value = [];
    form.motherId = '';
    return;
  }
  await Promise.all([
    loadSelectedFatherInfo(familyId.value, newVal),
    loadMotherCandidates(familyId.value, newVal)
  ]);
});

async function loadSelectedFatherInfo(fid: number, fatherId: string) {
  if (!fatherId) { selectedFatherInfo.value = null; return; }
  try {
    const { data } = await fetchTenantMemberDetail(fid, fatherId);
    if (data) selectedFatherInfo.value = { id: data.id, name: data.name, generation: data.generation };
  } catch {
    selectedFatherInfo.value = { id: fatherId, name: '（已选父亲）', generation: form.generation - 1 };
  }
}

async function loadMotherCandidates(fid: number, fatherId: string) {
  if (!fatherId) { motherCandidates.value = []; form.motherId = ''; return; }
  motherLoading.value = true;
  try {
    const { data } = await fetchTenantFatherSpouses(fid, fatherId);
    const list = (data || []).filter((s: Api.Tenant.FatherSpouse) => s.name);
    motherCandidates.value = list;
    const current = form.motherId;
    if (current && !list.some((_s, i) => String(i) === current)) {
      form.motherId = '';
    }
    if (list.length === 1) form.motherId = '0';
  } finally {
    motherLoading.value = false;
  }
}

async function openFatherSearch() {
  if (!familyId.value) return;
  if (form.generation < 2) {
    window.$message?.warning('第1代成员无需选择父亲');
    return;
  }
  fatherSearchKeyword.value = '';
  fatherCandidates.value = [];
  fatherHasMore.value = false;
  fatherSearchPage = 1;
  selectedCandidateId.value = null;
  selectedCandidateMotherIndex.value = null;
  candidateMotherMap.value = {};
  loadingCandidateMothers.value = {};
  showFatherModal.value = true;
  await searchFatherCandidates();
}

let fatherSearchTimer: ReturnType<typeof setTimeout> | null = null;
function onFatherKeywordInput(value: string) {
  fatherSearchKeyword.value = value;
  if (fatherSearchTimer) clearTimeout(fatherSearchTimer);
  fatherSearchTimer = setTimeout(() => searchFatherCandidates(), 300);
}

async function searchFatherCandidates(append = false) {
  if (!familyId.value) return;
  fatherSearchLoading.value = true;
  if (!append) {
    fatherSearchPage = 1;
    selectedCandidateId.value = null;
    selectedCandidateMotherIndex.value = null;
    candidateMotherMap.value = {};
    loadingCandidateMothers.value = {};
  }
  try {
    const { data } = await fetchTenantFatherCandidates(familyId.value, {
      generation: String(form.generation - 1),
      keyword: fatherSearchKeyword.value.trim() || undefined,
      page: fatherSearchPage,
      pageSize: 20
    });
    const list = data?.list || [];
    fatherCandidates.value = append ? [...fatherCandidates.value, ...list] : list;
    fatherSearchPage += 1;
    fatherHasMore.value = fatherCandidates.value.length < Number(data?.total || 0);
  } finally {
    fatherSearchLoading.value = false;
  }
}

function loadMoreFatherCandidates() {
  if (fatherHasMore.value && !fatherSearchLoading.value) {
    searchFatherCandidates(true);
  }
}

async function onSelectCandidate(candidate: Api.Tenant.FatherCandidate) {
  selectedCandidateId.value = candidate.id;
  selectedCandidateMotherIndex.value = null;
  if (candidateMotherMap.value[candidate.id]) return;
  if (!familyId.value) return;
  loadingCandidateMothers.value[candidate.id] = true;
  try {
    const { data } = await fetchTenantFatherSpouses(familyId.value, candidate.id);
    const list = (data || []).filter((s: Api.Tenant.FatherSpouse) => s.name);
    candidateMotherMap.value[candidate.id] = list;
    if (list.length === 1) selectedCandidateMotherIndex.value = '0';
  } finally {
    loadingCandidateMothers.value[candidate.id] = false;
  }
}

function confirmSelectFather() {
  const candidate = fatherCandidates.value.find(c => c.id === selectedCandidateId.value);
  if (!candidate) {
    window.$message?.warning('请选择父亲');
    return;
  }
  const mothers = candidateMotherMap.value[candidate.id] || [];
  if (mothers.length > 1 && !selectedCandidateMotherIndex.value) {
    window.$message?.warning('该父亲有多位配偶，请选择母亲');
    return;
  }
  form.fatherId = candidate.id;
  selectedFatherInfo.value = { id: candidate.id, name: candidate.name, generation: candidate.generation };
  if (mothers.length === 1) form.motherId = '0';
  else if (mothers.length > 1 && selectedCandidateMotherIndex.value) form.motherId = selectedCandidateMotherIndex.value;
  else form.motherId = '';
  showFatherModal.value = false;
}

function selectFather(candidate: Api.Tenant.FatherCandidate) {
  onSelectCandidate(candidate).then(() => confirmSelectFather());
}

function clearFather() {
  form.fatherId = '';
  form.motherId = '';
  selectedFatherInfo.value = null;
  motherCandidates.value = [];
}

// ===== 配偶编辑 =====
function getEmptySpouse(): SpouseItem {
  return { name: '', birthDate: '', isAlive: 1, deathDate: '', deathPlace: '', longitude: null, latitude: null, bio: '', collapsed: false };
}

function addSpouse() {
  form.spouseList = form.spouseList.map(s => ({ ...s, collapsed: true }));
  form.spouseList.push(getEmptySpouse());
}

function removeSpouse(index: number) {
  form.spouseList.splice(index, 1);
}

function toggleSpouseCollapse(index: number) {
  form.spouseList[index].collapsed = !form.spouseList[index].collapsed;
}

// ===== 照片 =====
const MAX_PHOTOS = 9;

async function handlePhotoUpload(options: UploadCustomRequestOptions) {
  const rawFile = options.file.file as File | null;
  if (!rawFile) { options.onError(); return; }
  if (!/image\/(png|jpe?g|gif|webp)/.test(rawFile.type)) {
    window.$message?.error('仅支持 png/jpg/jpeg/gif/webp 格式');
    options.onError(); return;
  }
  if (rawFile.size > 5 * 1024 * 1024) {
    window.$message?.error('图片大小不能超过 5MB');
    options.onError(); return;
  }
  if (form.photos.length >= MAX_PHOTOS) {
    window.$message?.warning(`最多上传 ${MAX_PHOTOS} 张照片`);
    options.onError(); return;
  }
  try {
    const { data, error } = await uploadImage(rawFile);
    if (error || !data) {
      window.$message?.error((error as Error)?.message || '上传失败');
      options.onError(); return;
    }
    form.photos.push(data.url);
    options.onFinish();
  } catch {
    options.onError();
  }
}

function removePhoto(index: number) {
  form.photos.splice(index, 1);
}

// ===== 提交 =====
function buildSubmitData() {
  const isFirstGen = form.generation === 1;
  return {
    name: form.name,
    gender: form.gender,
    generation: form.generation,
    generationName: form.generationName || undefined,
    birthDate: form.birthDate ? new Date(form.birthDate).toISOString().slice(0, 10) : undefined,
    birthPlace: form.birthPlace || undefined,
    isAlive: form.isAlive,
    deathDate: form.deathDate ? new Date(form.deathDate).toISOString().slice(0, 10) : undefined,
    deathPlace: form.deathPlace || undefined,
    longitude: form.longitude ?? undefined,
    latitude: form.latitude ?? undefined,
    bio: form.bio || undefined,
    avatarUrl: form.avatarUrl || undefined,
    photos: form.photos,
    fatherId: isFirstGen ? undefined : (form.fatherId || undefined),
    motherId: isFirstGen ? undefined : (form.motherId || undefined),
    spouseInfo: form.spouseList.map(({ collapsed: _collapsed, ...spouse }) => spouse),
    sortOrder: form.sortOrder
  };
}

async function validateFatherOnSubmit(): Promise<string | null> {
  const fatherId = form.fatherId.trim();
  if (!fatherId || form.generation === 1) return null;
  if (selectedFatherInfo.value) {
    if (selectedFatherInfo.value.generation !== form.generation - 1) {
      return `所选父亲「${selectedFatherInfo.value.name}」为第 ${selectedFatherInfo.value.generation} 代，与当前代数（第 ${form.generation} 代）不符，请重新选择父亲`;
    }
    return null;
  }
  if (!familyId.value) return '家族信息缺失';
  try {
    const { data } = await fetchTenantMemberDetail(familyId.value, fatherId);
    if (!data) return '所选父亲不存在或已失效，请重新选择父亲';
    if (data.gender !== 'male') return '所选父亲不是男性成员，请重新选择父亲';
    if (data.generation !== form.generation - 1) {
      return `所选父亲「${data.name}」为第 ${data.generation} 代，与当前代数（第 ${form.generation} 代）不符，请重新选择父亲`;
    }
    selectedFatherInfo.value = { id: data.id, name: data.name, generation: data.generation };
    return null;
  } catch {
    return '所选父亲校验失败，请重新选择父亲';
  }
}

async function submitForm() {
  try { await formRef.value?.validate(); } catch { return; }

  const fatherError = await validateFatherOnSubmit();
  if (fatherError) { window.$message?.error(fatherError); return; }

  if (form.generation >= 2 && !form.fatherId) {
    window.$message?.error('第2代及以上成员必须选择父亲');
    return;
  }
  if (form.generation === 1 && form.fatherId) {
    window.$message?.error('第1代成员不能有父亲');
    return;
  }
  if (form.fatherId && motherCandidates.value.length > 1 && !form.motherId) {
    window.$message?.warning('父亲有多位配偶，请选择母亲');
    return;
  }

  formLoading.value = true;
  try {
    const payload = buildSubmitData();
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

const columns: DataTableColumn<Api.Tenant.MemberItem>[] = [
  {
    title: '头像', key: 'avatar_url', width: 64, align: 'center',
    render: (row: Api.Tenant.MemberItem) => {
      const url = resolveImageUrl(row.avatar_url);
      if (url) {
        return h('img', { src: url, style: 'width:36px;height:36px;border-radius:50%;object-fit:cover;display:block;margin:0 auto;' });
      }
      return h('div', {
        style: `width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;flex-shrink:0;background:${row.gender === 'female' ? '#f56c6c' : '#409eff'};margin:0 auto;`
      }, (row.name || '?').charAt(0));
    }
  },
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
    title: '配偶信息', key: 'spouse_info', width: 160,
    render: (row: Api.Tenant.MemberItem) => {
      const spouses = parseSpouseInfo(row.spouse_info);
      if (!spouses.length) return '-';
      return h('span', { style: 'display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, spouses.map(s => s.name).join('、'));
    }
  },
  {
    title: '操作', key: 'actions', width: 240,
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
      <NDataTable :columns="columns" :data="list" :bordered="false" :scroll-x="1000" />
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
    <NModal v-model:show="showForm" preset="card" :title="editingId ? '编辑成员' : '新增成员'" style="width: 720px" :mask-closable="false">
      <NScrollbar style="max-height: 65vh">
        <NForm ref="formRef" :model="form" :rules="formRules" label-placement="left" label-width="90px">
          <NFormItem label="姓名" path="name">
            <NInput v-model:value="form.name" placeholder="请输入姓名" />
          </NFormItem>
          <NFormItem label="头像">
            <ImageUpload v-model:value="form.avatarUrl" :size="80" />
          </NFormItem>
          <NFormItem label="成员照片">
            <NSpace vertical :size="10" style="width: 100%">
              <NUpload
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                :max="MAX_PHOTOS"
                :show-file-list="false"
                :custom-request="handlePhotoUpload"
                :disabled="formLoading"
              >
                <NButton size="small" dashed>+ 上传照片</NButton>
              </NUpload>
              <div v-if="form.photos.length" class="flex flex-wrap gap-8px">
                <div
                  v-for="(url, idx) in form.photos"
                  :key="idx"
                  class="group relative size-72px rd-8px overflow-hidden border-1px border-gray-200"
                >
                  <img :src="resolveImageUrl(url)" alt="成员照片" class="size-full object-cover" />
                  <div class="absolute inset-0 hidden items-center justify-center bg-black/50 group-hover:flex">
                    <NButton size="tiny" type="error" ghost @click="removePhoto(idx)">删除</NButton>
                  </div>
                </div>
              </div>
              <span class="text-12px text-gray-500">最多 {{ MAX_PHOTOS }} 张，png/jpg/gif/webp ≤ 5MB</span>
            </NSpace>
          </NFormItem>
          <NFormItem label="性别" path="gender">
            <NRadioGroup v-model:value="form.gender">
              <NRadio value="male">男</NRadio>
              <NRadio value="female">女</NRadio>
            </NRadioGroup>
          </NFormItem>
          <NFormItem label="代数" path="generation">
            <NSelect v-model:value="form.generation" :options="generationOptions" placeholder="请选择代数" />
          </NFormItem>
          <NFormItem label="字辈">
            <NInput v-model:value="form.generationName" placeholder="字辈（可选）" />
          </NFormItem>
          <NFormItem label="出生日期">
            <NDatePicker v-model:value="form.birthDate" type="date" style="width: 100%" />
          </NFormItem>
          <NFormItem label="出生地">
            <NInput v-model:value="form.birthPlace" placeholder="出生地（可选）" />
          </NFormItem>
          <NFormItem label="在世状态">
            <NSwitch v-model:value="form.isAlive" :checked-value="1" :unchecked-value="0" />
            <span class="ml-8px text-gray-500 text-12px">{{ form.isAlive === 1 ? '在世' : '已故' }}</span>
          </NFormItem>
          <NFormItem v-if="form.isAlive === 0" label="逝世日期">
            <NDatePicker v-model:value="form.deathDate" type="date" style="width: 100%" />
          </NFormItem>
          <NFormItem v-if="form.isAlive === 0" label="安葬地点">
            <NInput v-model:value="form.deathPlace" placeholder="安葬地点（可选）" />
          </NFormItem>
          <NFormItem v-if="form.isAlive === 0" label="墓茔经度">
            <NInputNumber v-model:value="form.longitude" :step="0.000001" placeholder="经度（可选）" style="width: 100%" />
          </NFormItem>
          <NFormItem v-if="form.isAlive === 0" label="墓茔纬度">
            <NInputNumber v-model:value="form.latitude" :step="0.000001" placeholder="纬度（可选）" style="width: 100%" />
          </NFormItem>

          <!-- 父亲选择 -->
          <NFormItem label="父亲" path="fatherId">
            <NSpace vertical :size="8" style="width: 100%">
              <NSpace align="center">
                <NInput v-model:value="form.fatherId" placeholder="父亲ID（只读）" readonly :disabled="fatherDisabled" :class="fatherDisabled ? 'bg-gray-100' : ''" style="width: 220px" />
                <NButton type="primary" :disabled="fatherDisabled" @click="openFatherSearch">
                  {{ fatherDisabled ? '无需选择' : '查询父亲' }}
                </NButton>
                <NButton v-if="form.fatherId && !fatherDisabled" @click="clearFather">清除</NButton>
                <span v-if="fatherRequired" class="text-red-500 text-12px">* 必填</span>
              </NSpace>
              <div v-if="selectedFatherInfo" class="text-12px text-gray-600">
                已选父亲：{{ selectedFatherInfo.name }}（第 {{ selectedFatherInfo.generation }} 代）
              </div>
              <div v-if="form.generation === 1" class="text-12px text-gray-500">第一代成员无父亲ID</div>
            </NSpace>
          </NFormItem>

          <!-- 母亲选择 -->
          <NFormItem v-if="showMotherSelect" label="母亲">
            <NSpace vertical :size="8" style="width: 100%">
              <NSelect
                v-model:value="form.motherId"
                placeholder="请选择母亲（根据父亲配偶信息）"
                clearable
                :options="motherCandidates.map((s, i) => ({ label: s.name, value: String(i) }))"
                style="width: 300px"
              />
              <div v-if="motherCandidates.length > 1" class="text-12px text-orange-500">
                该父亲有多位配偶，请选择其中一位作为母亲
              </div>
            </NSpace>
          </NFormItem>
          <NFormItem v-else-if="form.fatherId && !motherLoading" label="母亲">
            <div class="text-12px text-gray-500">父亲暂无配偶信息，无需选择母亲</div>
          </NFormItem>

          <!-- 配偶信息 -->
          <NFormItem label="配偶信息">
            <NSpace vertical :size="8" style="width: 100%">
              <div
                v-for="(spouse, idx) in form.spouseList"
                :key="idx"
                class="spouse-card"
                :class="{ 'spouse-card-collapsed': spouse.collapsed }"
              >
                <div class="spouse-card-header" @click="toggleSpouseCollapse(idx)">
                  <span class="spouse-card-title">配偶 {{ idx + 1 }}</span>
                  <span v-if="spouse.collapsed" class="spouse-card-summary">{{ spouse.name || '未填写姓名' }}（已收起）</span>
                  <NSpace :size="8" style="margin-left: auto" @click.stop>
                    <NButton size="tiny" :type="spouse.collapsed ? 'primary' : 'default'" tertiary @click="toggleSpouseCollapse(idx)">
                      {{ spouse.collapsed ? '展开' : '收起' }}
                    </NButton>
                    <NButton size="tiny" type="error" tertiary @click="removeSpouse(idx)">删除</NButton>
                  </NSpace>
                </div>
                <div v-if="!spouse.collapsed" class="spouse-card-body">
                  <NSpace vertical :size="4">
                    <NSpace align="center">
                      <NInput v-model:value="spouse.name" placeholder="姓名" style="width: 120px" />
                      <NInput v-model:value="spouse.birthDate" placeholder="出生日期" style="width: 140px" />
                      <NSpace align="center" :size="4">
                        <span class="text-12px text-gray-500">在世</span>
                        <NSwitch v-model:value="spouse.isAlive" :checked-value="1" :unchecked-value="0" size="small" />
                      </NSpace>
                    </NSpace>
                    <NSpace v-if="spouse.isAlive === 0">
                      <NInput v-model:value="spouse.deathDate" placeholder="逝世日期" style="width: 140px" />
                      <NInput v-model:value="spouse.deathPlace" placeholder="安葬地点" style="width: 200px" />
                    </NSpace>
                    <NSpace v-if="spouse.isAlive === 0">
                      <NInputNumber v-model:value="spouse.longitude" :step="0.000001" placeholder="经度" style="width: 140px" />
                      <NInputNumber v-model:value="spouse.latitude" :step="0.000001" placeholder="纬度" style="width: 140px" />
                    </NSpace>
                    <NInput v-model:value="spouse.bio" placeholder="生平简介" type="textarea" :rows="2" />
                  </NSpace>
                </div>
              </div>
              <NButton dashed type="primary" block @click="addSpouse">+ 添加配偶</NButton>
            </NSpace>
          </NFormItem>

          <NFormItem label="同辈排序">
            <NInputNumber v-model:value="form.sortOrder" :min="0" placeholder="排序号" style="width: 100%" />
          </NFormItem>
          <NFormItem label="生平简介">
            <NInput v-model:value="form.bio" type="textarea" :rows="3" placeholder="生平简介（可选）" />
          </NFormItem>
        </NForm>
      </NScrollbar>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showForm = false">取消</NButton>
          <NButton type="primary" :loading="formLoading" @click="submitForm">确认</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 父亲查询弹窗 -->
    <NModal v-model:show="showFatherModal" title="选择父亲与母亲" preset="card" style="width: 600px" :mask-closable="false">
      <NSpace vertical :size="12">
        <NAlert type="info" :show-icon="false">
          已列出第 {{ form.generation - 1 }} 代男性成员，可输入关键字过滤；每页 20 条，超过可点击「加载更多」。
        </NAlert>
        <NInput v-model:value="fatherSearchKeyword" placeholder="请输入父亲姓名关键字" clearable @input="onFatherKeywordInput" />
        <div v-if="fatherSearchLoading && fatherCandidates.length === 0" class="py-20px text-center text-gray-500">搜索中...</div>
        <div v-else-if="fatherCandidates.length === 0" class="py-20px text-center text-gray-500">未找到匹配的父亲成员</div>
        <div v-else class="candidate-list">
          <div
            v-for="c in fatherCandidates"
            :key="c.id"
            class="candidate-item"
            :class="{ selected: selectedCandidateId === c.id }"
            @click="onSelectCandidate(c)"
          >
            <div class="candidate-name">{{ c.name }}</div>
            <div class="candidate-meta">
              第 {{ c.generation }} 代 {{ c.generation_name ? `（${c.generation_name}字辈）` : '' }} · ID: {{ c.id }}
            </div>
            <div v-if="c.spouse_names" class="candidate-meta text-orange-500">
              配偶：{{ c.spouse_names }}
            </div>
            <div v-if="selectedCandidateId === c.id" class="mt-8px pl-12px border-l-2 border-primary">
              <div v-if="loadingCandidateMothers[c.id]" class="text-12px text-gray-500">加载母亲信息...</div>
              <div v-else-if="(candidateMotherMap[c.id] || []).length === 0" class="text-12px text-gray-500">暂无配偶信息</div>
              <NRadioGroup v-else v-model:value="selectedCandidateMotherIndex" class="mother-radio-group">
                <NSpace vertical :size="4">
                  <NRadio v-for="(m, mi) in candidateMotherMap[c.id]" :key="mi" :value="String(mi)">
                    {{ m.name }}
                    <span v-if="m.birthDate" class="text-12px text-gray-500">（{{ m.birthDate }}）</span>
                  </NRadio>
                </NSpace>
              </NRadioGroup>
            </div>
          </div>
          <div class="py-12px text-center">
            <NButton v-if="fatherHasMore" text type="primary" :loading="fatherSearchLoading" @click="loadMoreFatherCandidates">
              加载更多
            </NButton>
            <span v-else class="text-12px text-gray-500">已加载全部 {{ fatherCandidates.length }} 名候选成员</span>
          </div>
        </div>
      </NSpace>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showFatherModal = false">取消</NButton>
          <NButton type="primary" :disabled="!selectedCandidateId" @click="confirmSelectFather">确认选择</NButton>
        </NSpace>
      </template>
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
.candidate-list {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
}
.candidate-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background-color 0.2s;
}
.candidate-item:last-child {
  border-bottom: none;
}
.candidate-item:hover {
  background-color: #f5f5f5;
}
.candidate-item.selected {
  background-color: #e6f7ff;
  border-left: 3px solid #1890ff;
}
.candidate-item.selected .candidate-name {
  color: #1890ff;
}
.candidate-name {
  font-weight: 600;
  font-size: 14px;
  color: #333;
}
.candidate-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #888;
}
.spouse-card {
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  padding: 12px;
  transition: border-color 0.2s, background-color 0.2s;
}
.spouse-card-collapsed {
  background-color: #fafafa;
  border-style: dashed;
  border-color: #d9c3c3;
}
.spouse-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.spouse-card-title {
  font-weight: 600;
  flex-shrink: 0;
}
.spouse-card-summary {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.spouse-card-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}
.spouse-card-collapsed .spouse-card-body {
  display: none;
}
</style>
