<script setup lang="ts">
import { h, ref, reactive, onMounted, watch, computed } from 'vue';
import {
  useMessage, useDialog, NTag, NSwitch, NButton, NSpace, NSelect,
  NModal, NInput, NInputNumber, NForm, NFormItem, NRadio, NRadioGroup, NCard,
  NScrollbar, NAlert, NUpload, NProgress
} from 'naive-ui';
import type { DataTableColumn, FormInst, FormRules, SelectOption, UploadCustomRequestOptions, UploadFileInfo } from 'naive-ui';
import { useAuth } from '@/hooks/business/auth';
import {
  fetchAllFamilies,
  fetchMemberList, fetchCreateMember, fetchUpdateMember,
  fetchMemberById,
  fetchDeleteMember, fetchToggleMemberAlive,
  fetchAllMembers, fetchImportMembersFile, fetchMemberImportTemplate,
  fetchFatherCandidates, fetchFatherSpouses,
  checkDuplicateMember, uploadImage
} from '@/service/api';
import type { FamilyMemberItem, FatherCandidate, FatherSpouse, MemberImportFileResult } from '@/service/api';
import { resolveImageUrl } from '@/utils/image-url';

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

// ===== 家族选择 =====
const familyOptions = ref<SelectOption[]>([]);
const selectedFamilyId = ref<number | null>(null);
const familyLoading = ref(false);

const pagination = reactive<Record<string, any>>({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50, 100],
  showQuickJumper: true,
  prefix: (info: { startIndex: number; endIndex: number; itemCount: number }) =>
    `共 ${info.itemCount} 条`
});

async function loadFamilyOptions() {
  familyLoading.value = true;
  try {
    const result = await Promise.race([
      fetchAllFamilies({ status: 1 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000))
    ]);
    const { data } = result as any;
    familyOptions.value = (data || []).map((f: any) => ({
      label: `${f.name}（ID: ${f.id}，成员: ${f.member_count}）`,
      value: f.id
    }));
  } catch {
    familyOptions.value = [
      { label: '【模拟】朱氏家族（ID: 1，成员: 128）', value: 1 },
      { label: '【模拟】朱氏家族（ID: 2，成员: 256）', value: 2 },
      { label: '【模拟】朱氏家族（ID: 3，成员: 64）', value: 3 }
    ];
  } finally {
    familyLoading.value = false;
  }
}

watch(selectedFamilyId, () => {
  if (selectedFamilyId.value) {
    pagination.page = 1;
    loadData();
  }
});

// ===== 搜索 & 列表 =====
const loading = ref(false);
const tableData = ref<FamilyMemberItem[]>([]);

const searchParams = reactive({
  keyword: '',
  generation: null as number | null,
  gender: null as string | null,
  status: null as number | null
});

const genderOptions = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' }
];

const statusOptions = [
  { label: '正常', value: 1 },
  { label: '已删除', value: 0 }
];

const columns: DataTableColumn<FamilyMemberItem>[] = [
  {
    title: '头像', key: 'avatar_url', width: 64, align: 'center',
    render: row => {
      const url = resolveImageUrl(row.avatar_url);
      if (url) {
        return h('img', {
          src: url,
          style: 'width:36px;height:36px;border-radius:50%;object-fit:cover;display:block;margin:0 auto;'
        });
      }
      return h('div', {
        style: `width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;flex-shrink:0;background:${row.gender === 'female' ? '#f56c6c' : '#409eff'};margin:0 auto;`
      }, (row.name || '?').charAt(0));
    }
  },
  { title: '姓名', key: 'name', width: 100, fixed: 'left' },
  {
    title: '性别', key: 'gender', width: 65, align: 'center',
    render: row => h(NTag, {
      type: row.gender === 'male' ? 'info' : 'error',
      size: 'small',
      bordered: false
    }, { default: () => row.gender === 'male' ? '男' : '女' })
  },
  { title: '代数', key: 'generation', width: 65, align: 'center' },
  { title: '字辈', key: 'generation_name', width: 80, render: row => row.generation_name || '-' },
  {
    title: '在世', key: 'is_alive', width: 70, align: 'center',
    render: row => h(NSwitch, {
      value: row.is_alive === 1,
      disabled: !hasAuth('system:family-member:update'),
      'onUpdate:value': () => handleToggleAlive(row)
    })
  },
  { title: '出生日期', key: 'birth_date', width: 110, render: row => row.birth_date || '-' },
  {
    title: '状态', key: 'status', width: 75, align: 'center',
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
        hasAuth('system:family-member:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
        hasAuth('system:family-member:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' })
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
  searchParams.generation = null;
  searchParams.gender = null;
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
  if (!selectedFamilyId.value) {
    tableData.value = [];
    return;
  }
  loading.value = true;
  try {
    const result = await Promise.race([
      fetchMemberList(selectedFamilyId.value, {
        page: pagination.page,
        pageSize: pagination.pageSize,
        keyword: searchParams.keyword || undefined,
        generation: searchParams.generation ?? undefined,
        gender: searchParams.gender ?? undefined,
        status: searchParams.status ?? undefined
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000))
    ]);
    const { data } = result as any;
    if (!data) {
      throw new Error('NO_DATA');
    }
    tableData.value = data.list || [];
    pagination.itemCount = data.total || 0;
  } catch {
    message.warning('后端未连接，显示模拟数据');
    const allMockMembers: FamilyMemberItem[] = [
      { id: 'a1b2c3d4', family_id: selectedFamilyId.value!, name: '朱伯言', gender: 'male', generation: 1, generation_name: '伯', birth_date: '1880-03-15', birth_place: '浙江绍兴', is_alive: 0, death_date: '1955-07-20', death_place: '浙江绍兴', longitude: 120.58, latitude: 30.03, bio: '一世祖', avatar_url: '', father_id: '', mother_id: '', spouse_info: '[{"name":"王氏","birthDate":"1882"}]', sort_order: 1, status: 1, create_time: '2024-01-01 10:00:00', update_time: '2024-01-01 10:00:00' },
      { id: 'b2c3d4e5', family_id: selectedFamilyId.value!, name: '朱仲德', gender: 'male', generation: 2, generation_name: '仲', birth_date: '1905-09-10', birth_place: '浙江绍兴', is_alive: 0, death_date: '1978-12-03', death_place: '浙江绍兴', longitude: null, latitude: null, bio: '二世', avatar_url: '', father_id: 'a1b2c3d4', mother_id: '', spouse_info: null, sort_order: 1, status: 1, create_time: '2024-01-02 10:00:00', update_time: '2024-01-02 10:00:00' },
      { id: 'c3d4e5f6', family_id: selectedFamilyId.value!, name: '朱叔和', gender: 'male', generation: 2, generation_name: '叔', birth_date: '1908-05-20', birth_place: '浙江绍兴', is_alive: 0, death_date: '1985-02-14', death_place: '浙江杭州', longitude: null, latitude: null, bio: '二世次子', avatar_url: '', father_id: 'a1b2c3d4', mother_id: '', spouse_info: null, sort_order: 2, status: 1, create_time: '2024-01-03 10:00:00', update_time: '2024-01-03 10:00:00' },
      { id: 'd4e5f6a7', family_id: selectedFamilyId.value!, name: '朱季芳', gender: 'female', generation: 2, generation_name: '季', birth_date: '1912-11-08', birth_place: '浙江绍兴', is_alive: 0, death_date: '1990-08-22', death_place: '浙江绍兴', longitude: null, latitude: null, bio: '二世长女', avatar_url: '', father_id: 'a1b2c3d4', mother_id: '', spouse_info: null, sort_order: 3, status: 1, create_time: '2024-01-04 10:00:00', update_time: '2024-01-04 10:00:00' },
      { id: 'e5f6a7b8', family_id: selectedFamilyId.value!, name: '朱文远', gender: 'male', generation: 3, generation_name: '文', birth_date: '1935-06-01', birth_place: '浙江绍兴', is_alive: 1, death_date: '', death_place: '', longitude: null, latitude: null, bio: '三世长孙', avatar_url: '', father_id: 'b2c3d4e5', mother_id: '', spouse_info: null, sort_order: 1, status: 1, create_time: '2024-02-01 10:00:00', update_time: '2024-02-01 10:00:00' },
      { id: 'f6a7b8c9', family_id: selectedFamilyId.value!, name: '朱文华', gender: 'male', generation: 3, generation_name: '文', birth_date: '1938-03-12', birth_place: '浙江杭州', is_alive: 1, death_date: '', death_place: '', longitude: null, latitude: null, bio: '', avatar_url: '', father_id: 'c3d4e5f6', mother_id: '', spouse_info: null, sort_order: 1, status: 1, create_time: '2024-02-02 10:00:00', update_time: '2024-02-02 10:00:00' },
      { id: 'a7b8c9d0', family_id: selectedFamilyId.value!, name: '朱文静', gender: 'female', generation: 3, generation_name: '文', birth_date: '1940-08-20', birth_place: '浙江绍兴', is_alive: 1, death_date: '', death_place: '', longitude: null, latitude: null, bio: '', avatar_url: '', father_id: 'b2c3d4e5', mother_id: '', spouse_info: null, sort_order: 2, status: 1, create_time: '2024-02-03 10:00:00', update_time: '2024-02-03 10:00:00' },
      { id: 'b8c9d0e1', family_id: selectedFamilyId.value!, name: '朱建国', gender: 'male', generation: 4, generation_name: '建', birth_date: '1965-04-10', birth_place: '浙江杭州', is_alive: 1, death_date: '', death_place: '', longitude: null, latitude: null, bio: '工程师', avatar_url: '', father_id: 'e5f6a7b8', mother_id: '', spouse_info: '[{"name":"李氏","birthDate":"1967","isAlive":1},{"name":"周氏","birthDate":"1970","isAlive":0,"deathDate":"2005"}]', sort_order: 1, status: 1, create_time: '2024-03-01 10:00:00', update_time: '2024-03-01 10:00:00' },
      { id: 'c9d0e1f2', family_id: selectedFamilyId.value!, name: '朱建民', gender: 'male', generation: 4, generation_name: '建', birth_date: '1968-07-15', birth_place: '浙江绍兴', is_alive: 1, death_date: '', death_place: '', longitude: null, latitude: null, bio: '教师', avatar_url: '', father_id: 'f6a7b8c9', mother_id: '', spouse_info: null, sort_order: 1, status: 1, create_time: '2024-03-02 10:00:00', update_time: '2024-03-02 10:00:00' },
      { id: 'd0e1f2a3', family_id: selectedFamilyId.value!, name: '朱小明', gender: 'male', generation: 5, generation_name: '小', birth_date: '1995-01-20', birth_place: '浙江杭州', is_alive: 1, death_date: '', death_place: '', longitude: null, latitude: null, bio: '', avatar_url: '', father_id: 'b8c9d0e1', mother_id: '', spouse_info: null, sort_order: 1, status: 1, create_time: '2024-04-01 10:00:00', update_time: '2024-04-01 10:00:00' },
      { id: 'e1f2a3b4', family_id: selectedFamilyId.value!, name: '朱小红', gender: 'female', generation: 5, generation_name: '小', birth_date: '1998-06-30', birth_place: '浙江杭州', is_alive: 1, death_date: '', death_place: '', longitude: null, latitude: null, bio: '', avatar_url: '', father_id: 'b8c9d0e1', mother_id: '', spouse_info: null, sort_order: 2, status: 1, create_time: '2024-04-02 10:00:00', update_time: '2024-04-02 10:00:00' }
    ];
    const offset = (pagination.page - 1) * pagination.pageSize;
    tableData.value = allMockMembers.slice(offset, offset + pagination.pageSize);
    pagination.itemCount = allMockMembers.length;
  } finally {
    loading.value = false;
  }
}

// ===== 新增/编辑弹窗 & 关系联动 =====
const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<string | null>(null);
const submitting = ref(false);
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
  /** 折叠状态：false 展开 / true 收起（仅影响展示，不影响数据） */
  collapsed: boolean;
}

const formData = reactive({
  name: '',
  gender: 'male' as string,
  generation: 1,
  generationName: '',
  birthDate: '',
  birthPlace: '',
  isAlive: 1,
  deathDate: '',
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

// 父亲查询/选择相关状态
const showFatherModal = ref(false);
const fatherSearchKeyword = ref('');
const fatherCandidates = ref<FatherCandidate[]>([]);
const fatherSearchLoading = ref(false);
const selectedFatherInfo = ref<{ id: string; name: string; generation: number } | null>(null);
// 弹窗内联合选择母亲
const selectedCandidateId = ref<string | null>(null);
const candidateMotherMap = ref<Record<string, FatherSpouse[]>>({});
const selectedCandidateMotherRank = ref<string | null>(null);
const loadingCandidateMothers = ref<Record<string, boolean>>({});

// 母亲选择相关状态
const motherCandidates = ref<FatherSpouse[]>([]);
const motherLoading = ref(false);

const fatherRequired = computed(() => formData.generation >= 2);
const fatherDisabled = computed(() => formData.generation === 1);
const showMotherSelect = computed(() => !!formData.fatherId && motherCandidates.value.length > 0);

const formRules = computed<FormRules>(() => ({
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  gender: [{ required: true, message: '请选择性别' }],
  generation: [{ required: true, message: '请选择代数', type: 'number' }],
  fatherId: fatherRequired.value
    ? [{ required: true, message: '第2代及以上成员必须通过「父亲查询」选择父亲', trigger: 'change' }]
    : []
}));

function resetForm() {
  formData.name = '';
  formData.gender = 'male';
  formData.generation = 1;
  formData.generationName = '';
  formData.birthDate = '';
  formData.birthPlace = '';
  formData.isAlive = 1;
  formData.deathDate = '';
  formData.deathPlace = '';
  formData.longitude = null;
  formData.latitude = null;
  formData.bio = '';
  formData.avatarUrl = '';
  formData.photos = [];
  formData.fatherId = '';
  formData.motherId = '';
  formData.spouseList = [];
  formData.sortOrder = 0;
  selectedFatherInfo.value = null;
  motherCandidates.value = [];
  fatherSearchKeyword.value = '';
  fatherCandidates.value = [];
  selectedCandidateId.value = null;
  selectedCandidateMotherRank.value = null;
  candidateMotherMap.value = {};
  loadingCandidateMothers.value = {};
  duplicateNameError.value = null;
}

function parseSpouseInfo(raw: string | null | unknown): SpouseItem[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    // 兼容字符串化的 JSON 与已解析的对象/数组
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

async function loadMotherCandidates(familyId: number, fatherId: string) {
  if (!fatherId) {
    motherCandidates.value = [];
    formData.motherId = '';
    return;
  }
  motherLoading.value = true;
  try {
    const { data, error } = await fetchFatherSpouses(familyId, fatherId);
    if (error) { motherCandidates.value = []; return; }
    const list = (data || []).filter(s => s.name);
    motherCandidates.value = list;
    // 编辑回填时保留已保存的母亲选择；新增时仅当唯一配偶自动选中
    const current = formData.motherId;
    if (list.some(s => String(s.rank) === current)) return;
    if (list.length === 1) {
      formData.motherId = String(list[0].rank);
    }
  } finally {
    motherLoading.value = false;
  }
}

async function loadSelectedFatherInfo(familyId: number, fatherId: string) {
  if (!fatherId) {
    selectedFatherInfo.value = null;
    return;
  }
  try {
    const { data, error } = await fetchMemberById(familyId, fatherId);
    if (!error && data) {
      selectedFatherInfo.value = { id: data.id, name: data.name, generation: data.generation };
    } else {
      selectedFatherInfo.value = { id: fatherId, name: '（已选父亲）', generation: formData.generation - 1 };
    }
  } catch {
    selectedFatherInfo.value = { id: fatherId, name: '（已选父亲）', generation: formData.generation - 1 };
  }
}

watch(() => formData.generation, (newVal, oldVal) => {
  if (newVal === 1) {
    // 第1代：清空父亲、母亲，禁用父亲选择
    formData.fatherId = '';
    formData.motherId = '';
    selectedFatherInfo.value = null;
    motherCandidates.value = [];
  } else if (oldVal === 1 && newVal >= 2) {
    // 从第1代切换到第2代及以上：清空旧父亲，等待用户选择
    formData.fatherId = '';
    formData.motherId = '';
    selectedFatherInfo.value = null;
    motherCandidates.value = [];
  }
  // 代数变化后，若已选父亲代数不匹配，需要重新验证（提交时后端会校验）
  // flush: 'sync' 保证 handleEdit 回填数据时 watch 先于 fatherId 赋值执行，
  // 否则异步 watch 会在回填之后清空 fatherId，导致编辑时父亲ID不显示
}, { flush: 'sync' });

watch(() => formData.fatherId, async (newVal) => {
  if (!selectedFamilyId.value) return;
  if (!newVal) {
    selectedFatherInfo.value = null;
    motherCandidates.value = [];
    formData.motherId = '';
    return;
  }
  await Promise.all([
    loadSelectedFatherInfo(selectedFamilyId.value, newVal),
    loadMotherCandidates(selectedFamilyId.value, newVal)
  ]);
});

// ===== 同父同名唯一性校验（实时） =====
const duplicateNameError = ref<string | null>(null);
let duplicateCheckTimer: ReturnType<typeof setTimeout> | null = null;

async function runDuplicateCheck() {
  const familyId = selectedFamilyId.value;
  const name = formData.name.trim();
  const fatherId = formData.fatherId.trim();
  // 第1代成员无父亲，无需校验；姓名或父亲为空时无法判断唯一性
  if (!familyId || !name || !fatherId || formData.generation === 1) {
    duplicateNameError.value = null;
    return;
  }
  try {
    const { data, error } = await checkDuplicateMember(familyId, {
      name,
      fatherId,
      excludeId: isEdit.value && editId.value ? editId.value : undefined
    });
    // 校验接口失败时不阻塞提交（例如后端未连接时）
    duplicateNameError.value = error ? null : (data?.exists ? '成员已经存在' : null);
  } catch {
    duplicateNameError.value = null;
  }
}

function onFormDuplicateFieldChanged() {
  if (duplicateCheckTimer) clearTimeout(duplicateCheckTimer);
  duplicateCheckTimer = setTimeout(runDuplicateCheck, 400);
}

watch(
  [() => formData.name, () => formData.fatherId],
  onFormDuplicateFieldChanged
);

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

async function handleEdit(row: FamilyMemberItem) {
  isEdit.value = true;
  editId.value = row.id;
  duplicateNameError.value = null;
  formData.name = row.name;
  formData.gender = row.gender;
  formData.generation = row.generation;
  formData.generationName = row.generation_name || '';
  formData.birthDate = row.birth_date || '';
  formData.birthPlace = row.birth_place || '';
  formData.isAlive = row.is_alive;
  formData.deathDate = row.death_date || '';
  formData.deathPlace = row.death_place || '';
  formData.longitude = row.longitude;
  formData.latitude = row.latitude;
  formData.bio = row.bio || '';
  formData.avatarUrl = row.avatar_url || '';
  formData.photos = row.photos || [];
  formData.fatherId = row.father_id || '';
  formData.motherId = row.mother_id || '';
  formData.spouseList = parseSpouseInfo(row.spouse_info);
  formData.sortOrder = row.sort_order;
  selectedFatherInfo.value = null;
  motherCandidates.value = [];
  showModal.value = true;
  // 列表接口不含照片数组，从详情接口补充回显
  if (selectedFamilyId.value) {
    try {
      const { data } = await fetchMemberById(selectedFamilyId.value, row.id);
      if (data) formData.photos = data.photos || [];
    } catch {
      /* 照片加载失败不阻塞编辑 */
    }
  }
  if (selectedFamilyId.value && formData.fatherId) {
    loadSelectedFatherInfo(selectedFamilyId.value, formData.fatherId);
    loadMotherCandidates(selectedFamilyId.value, formData.fatherId);
  }
}

async function openFatherSearch() {
  if (!selectedFamilyId.value) return;
  if (formData.generation < 2) {
    message.warning('第1代成员无需选择父ID');
    return;
  }
  fatherSearchKeyword.value = '';
  fatherCandidates.value = [];
  selectedCandidateId.value = null;
  selectedCandidateMotherRank.value = null;
  candidateMotherMap.value = {};
  loadingCandidateMothers.value = {};
  showFatherModal.value = true;
}

let fatherSearchTimer: ReturnType<typeof setTimeout> | null = null;
function onFatherKeywordInput(value: string) {
  fatherSearchKeyword.value = value;
  if (fatherSearchTimer) clearTimeout(fatherSearchTimer);
  fatherSearchTimer = setTimeout(() => {
    if (value.trim().length >= 1) {
      searchFatherCandidates();
    }
  }, 300);
}

async function searchFatherCandidates() {
  if (!selectedFamilyId.value || fatherSearchKeyword.value.trim().length < 1) return;
  fatherSearchLoading.value = true;
  selectedCandidateId.value = null;
  selectedCandidateMotherRank.value = null;
  candidateMotherMap.value = {};
  loadingCandidateMothers.value = {};
  try {
    const { data, error } = await fetchFatherCandidates(
      selectedFamilyId.value,
      formData.generation,
      fatherSearchKeyword.value.trim()
    );
    if (error) return;
    fatherCandidates.value = data || [];
  } finally {
    fatherSearchLoading.value = false;
  }
}

async function onSelectCandidate(candidate: FatherCandidate) {
  selectedCandidateId.value = candidate.id;
  selectedCandidateMotherRank.value = null;

  // 已缓存则直接复用
  if (candidateMotherMap.value[candidate.id]) return;

  if (!selectedFamilyId.value) return;
  loadingCandidateMothers.value[candidate.id] = true;
  try {
    const { data, error } = await fetchFatherSpouses(selectedFamilyId.value, candidate.id);
    if (error) {
      candidateMotherMap.value[candidate.id] = [];
      return;
    }
    const list = (data || []).filter(s => s.name);
    candidateMotherMap.value[candidate.id] = list;
    // 仅一位配偶时默认选中
    if (list.length === 1) {
      selectedCandidateMotherRank.value = String(list[0].rank);
    }
  } finally {
    loadingCandidateMothers.value[candidate.id] = false;
  }
}

function confirmSelectFather() {
  const candidate = fatherCandidates.value.find(c => c.id === selectedCandidateId.value);
  if (!candidate) {
    message.warning('请选择父亲');
    return;
  }
  const mothers = candidateMotherMap.value[candidate.id] || [];
  const hasMultipleMothers = mothers.length > 1;
  if (hasMultipleMothers && !selectedCandidateMotherRank.value) {
    message.warning('该父亲有多位配偶，请选择母亲');
    return;
  }

  formData.fatherId = candidate.id;
  selectedFatherInfo.value = { id: candidate.id, name: candidate.name, generation: candidate.generation };

  if (mothers.length === 1) {
    formData.motherId = String(mothers[0].rank);
  } else if (mothers.length > 1 && selectedCandidateMotherRank.value) {
    formData.motherId = selectedCandidateMotherRank.value;
  } else {
    formData.motherId = '';
  }

  showFatherModal.value = false;
  selectedCandidateId.value = null;
  selectedCandidateMotherRank.value = null;
  candidateMotherMap.value = {};
}

function selectFather(candidate: FatherCandidate) {
  // 单击父亲行直接走联合选择流程：单配偶自动填充母亲，多配偶需先选母亲
  onSelectCandidate(candidate).then(() => {
    confirmSelectFather();
  });
}

function clearFather() {
  formData.fatherId = '';
  formData.motherId = '';
  selectedFatherInfo.value = null;
  motherCandidates.value = [];
}

function buildSubmitData() {
  return {
    name: formData.name,
    gender: formData.gender,
    generation: formData.generation,
    generationName: formData.generationName || undefined,
    birthDate: formData.birthDate || undefined,
    birthPlace: formData.birthPlace || undefined,
    isAlive: formData.isAlive,
    deathDate: formData.deathDate || undefined,
    deathPlace: formData.deathPlace || undefined,
    longitude: formData.longitude ?? undefined,
    latitude: formData.latitude ?? undefined,
    bio: formData.bio || undefined,
    avatarUrl: formData.avatarUrl || undefined,
    // 始终提交照片列表（含空数组），保证编辑时清空照片能同步到后端
    photos: formData.photos,
    fatherId: formData.fatherId || undefined,
    motherId: formData.motherId || undefined,
    // 始终提交配偶列表（含空数组），保证编辑时清空配偶能同步到后端；剥离 collapsed 展示字段
    spouseInfo: formData.spouseList.map(({ collapsed: _collapsed, ...spouse }) => spouse),
    sortOrder: formData.sortOrder
  };
}

async function handleSubmit() {
  // 提交前强制做一次同父同名唯一性校验（实时防抖可能尚未完成）
  await runDuplicateCheck();
  if (duplicateNameError.value) {
    message.error(duplicateNameError.value);
    return;
  }

  try { await formRef.value?.validate(); } catch { return; }

  // 额外业务校验
  if (formData.generation >= 2 && !formData.fatherId) {
    message.error('第2代及以上成员必须选择父亲');
    return;
  }
  if (formData.generation === 1 && formData.fatherId) {
    message.error('第1代成员不能有父亲ID');
    return;
  }
  // 若存在母亲候选但尚未选择，且 fatherId 已选，提醒用户
  if (formData.fatherId && motherCandidates.value.length > 1 && !formData.motherId) {
    message.warning('父亲有多位配偶，请选择母亲');
    return;
  }

  if (!selectedFamilyId.value) return;
  submitting.value = true;
  try {
    const data = buildSubmitData();
    const { error } = isEdit.value && editId.value
      ? await fetchUpdateMember(selectedFamilyId.value, editId.value, data)
      : await fetchCreateMember(selectedFamilyId.value, data);
    if (error) return;
    message.success(isEdit.value ? '更新成功' : '新增成功');
    showModal.value = false;
    loadData();
  } finally {
    submitting.value = false;
  }
}

// ===== 删除 =====
function handleDelete(row: FamilyMemberItem) {
  if (!selectedFamilyId.value) return;
  dialog.warning({
    title: '确认删除',
    content: `确定要删除成员「${row.name}」吗？删除后该成员将被标记为已删除状态。`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      const { error } = await fetchDeleteMember(selectedFamilyId.value!, row.id);
      if (error) return;
      message.success('删除成功');
      loadData();
    }
  });
}

// ===== 切换在世状态 =====
async function handleToggleAlive(row: FamilyMemberItem) {
  if (!selectedFamilyId.value) return;
  const { data, error } = await fetchToggleMemberAlive(selectedFamilyId.value, row.id);
  if (error) return;
  message.success(data?.isAlive === 1 ? '已设为在世' : '已设为已故');
  loadData();
}

// ===== 批量导入（文件上传） =====
const showImportModal = ref(false);
const importing = ref(false);
const importResult = ref<MemberImportFileResult | null>(null);
const importFileName = ref('');
const importPercent = ref(0);
const importErrorMsg = ref('');
/** 每次打开弹窗递增，强制 NUpload 重新挂载以清空已选文件 */
const importUploadKey = ref(0);
/** NUpload 内部文件列表，上传结束后清空以便重新选择 */
const importFileList = ref<UploadFileInfo[]>([]);

function handleBatchImport() {
  if (!selectedFamilyId.value) {
    message.warning('请先选择家族');
    return;
  }
  importUploadKey.value += 1;
  importFileList.value = [];
  importResult.value = null;
  importFileName.value = '';
  importPercent.value = 0;
  importErrorMsg.value = '';
  showImportModal.value = true;
}

/** 上传前本地校验：文件格式与大小 */
function validateImportFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['xlsx', 'xls', 'csv'].includes(ext)) {
    return '仅支持 .xlsx / .xls / .csv 格式的文件';
  }
  if (file.size > 20 * 1024 * 1024) {
    return '文件大小不能超过 20MB';
  }
  return null;
}

/** NUpload 自定义上传：调用后端文件导入接口并展示上传/处理进度 */
async function handleImportUpload({ file, onProgress, onFinish, onError }: UploadCustomRequestOptions) {
  if (!selectedFamilyId.value) return;
  const rawFile = file.file;
  if (!rawFile) return;
  const errMsg = validateImportFile(rawFile);
  if (errMsg) {
    importErrorMsg.value = errMsg;
    message.error(errMsg);
    onError();
    return;
  }
  importing.value = true;
  importErrorMsg.value = '';
  importResult.value = null;
  importFileName.value = rawFile.name;
  importPercent.value = 0;
  try {
    const { data, error } = await fetchImportMembersFile(selectedFamilyId.value, rawFile, p => {
      importPercent.value = p;
      onProgress?.({ percent: p });
    });
    if (error) {
      importErrorMsg.value = error.message;
      message.error(error.message);
      onError();
      return;
    }
    importPercent.value = 100;
    importResult.value = data || null;
    if (data && data.imported > 0) loadData();
    onFinish();
  } catch (e: any) {
    importErrorMsg.value = e?.message || '导入失败';
    message.error(importErrorMsg.value);
    onError();
  } finally {
    importing.value = false;
  }
}

/** 下载 CSV 导入模板 */
async function handleDownloadTemplate() {
  if (!selectedFamilyId.value) return;
  const { data, error } = await fetchMemberImportTemplate(selectedFamilyId.value);
  if (error) {
    message.error(error.message);
    return;
  }
  const blob = data as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'member-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
  message.success('模板已下载');
}

// ===== 导出 =====
async function handleExport() {
  if (!selectedFamilyId.value) return;
  try {
    const { data, error } = await fetchAllMembers(selectedFamilyId.value, { status: 1 });
    if (error) return;
    const list = data || [];
    const jsonStr = JSON.stringify(list, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `家族成员_${selectedFamilyId.value}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    message.success(`导出成功，共 ${list.length} 条`);
  } catch (err: any) {
    message.error(err?.msg || '导出失败');
  }
}

// ===== 多配偶编辑 =====
function getEmptySpouse(): SpouseItem {
  return { name: '', birthDate: '', isAlive: 1, deathDate: '', deathPlace: '', longitude: null, latitude: null, bio: '', collapsed: false };
}

/** 添加配偶：自动折叠已有配偶（保留数据），新增的默认展开 */
function addSpouse() {
  formData.spouseList = formData.spouseList.map(s => ({ ...s, collapsed: true }));
  formData.spouseList.push(getEmptySpouse());
}

function removeSpouse(index: number) {
  formData.spouseList.splice(index, 1);
}

/** 展开/收起指定配偶表单（仅切换折叠状态，不影响已录入数据） */
function toggleSpouseCollapse(index: number) {
  formData.spouseList[index].collapsed = !formData.spouseList[index].collapsed;
}

// ===== 成员照片（多图） =====
const MAX_PHOTOS = 9;

async function handlePhotoUpload(options: UploadCustomRequestOptions) {
  const rawFile = options.file.file as File | null;
  if (!rawFile) {
    options.onError();
    return;
  }
  if (!/image\/(png|jpe?g|gif|webp)/.test(rawFile.type)) {
    message.error('仅支持 png/jpg/jpeg/gif/webp 格式的图片');
    options.onError();
    return;
  }
  if (rawFile.size > 5 * 1024 * 1024) {
    message.error('图片大小不能超过 5MB');
    options.onError();
    return;
  }
  if (formData.photos.length >= MAX_PHOTOS) {
    message.warning(`最多上传 ${MAX_PHOTOS} 张照片`);
    options.onError();
    return;
  }
  try {
    const { data, error } = await uploadImage(rawFile);
    if (error || !data) {
      message.error((error as Error)?.message || '上传失败');
      options.onError();
      return;
    }
    formData.photos.push(data.url);
    options.onFinish();
  } catch {
    options.onError();
  }
}

function removePhoto(index: number) {
  formData.photos.splice(index, 1);
}

onMounted(() => { loadFamilyOptions(); });
</script>

<template>
  <div>
    <!-- 家族选择 -->
    <NCard :bordered="false" class="mb-16px">
      <NForm inline label-placement="left">
        <NFormItem label="选择家族" required>
          <NSelect
            v-model:value="selectedFamilyId"
            placeholder="请选择要管理的家族"
            clearable
            filterable
            :loading="familyLoading"
            :options="familyOptions"
            style="width: 360px"
          />
        </NFormItem>
        <NFormItem>
          <NButton type="primary" :disabled="!selectedFamilyId" @click="handleSearch">查询</NButton>
        </NFormItem>
      </NForm>
    </NCard>

    <!-- 搜索栏 -->
    <NCard v-if="selectedFamilyId" :bordered="false" class="mb-16px">
      <NForm inline label-placement="left" :model="searchParams">
        <NFormItem label="姓名">
          <NInput v-model:value="searchParams.keyword" placeholder="请输入成员姓名" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="代数">
          <NInputNumber v-model:value="searchParams.generation" placeholder="代数" :min="1" style="width: 100px" clearable />
        </NFormItem>
        <NFormItem label="性别">
          <NSelect v-model:value="searchParams.gender" placeholder="全部" clearable :options="genderOptions" style="width: 100px" />
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
    <NCard v-if="selectedFamilyId" :bordered="false" title="成员管理">
      <template #header-extra>
        <NSpace>
          <NButton v-if="hasAuth('system:family-member:create')" type="primary" @click="handleAdd">新增成员</NButton>
          <NButton v-if="hasAuth('system:family-member:import')" @click="handleBatchImport">批量导入</NButton>
          <NButton @click="handleExport">导出数据</NButton>
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
        :scroll-x="1000"
        remote
        @update:page="handlePageChange"
        @update:page-size="handlePageSizeChange"
      />

      <!-- 新增/编辑弹窗 -->
      <NModal v-model:show="showModal" :title="isEdit ? '编辑成员' : '新增成员'" preset="card" style="width: 720px" :mask-closable="false">
        <NScrollbar style="max-height: 65vh">
          <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="90px">
            <NFormItem
              label="姓名"
              path="name"
              :validation-status="duplicateNameError ? 'error' : undefined"
              :feedback="duplicateNameError || undefined"
            >
              <NInput v-model:value="formData.name" placeholder="请输入姓名" />
            </NFormItem>
            <NFormItem label="头像" path="avatarUrl">
              <ImageUpload v-model:value="formData.avatarUrl" :size="80" />
            </NFormItem>
            <NFormItem label="成员照片">
              <NSpace vertical :size="10" style="width: 100%">
                <NUpload
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  multiple
                  :max="MAX_PHOTOS"
                  :show-file-list="false"
                  :custom-request="handlePhotoUpload"
                  :disabled="submitting"
                >
                  <NButton size="small" dashed>+ 上传照片</NButton>
                </NUpload>
                <div v-if="formData.photos.length" class="flex flex-wrap gap-8px">
                  <div
                    v-for="(url, idx) in formData.photos"
                    :key="idx"
                    class="group relative size-72px rd-8px overflow-hidden border-1px border-gray-200"
                  >
                    <img :src="resolveImageUrl(url)" alt="成员照片" class="size-full object-cover" />
                    <div class="absolute inset-0 hidden items-center justify-center bg-black/50 group-hover:flex">
                      <NButton size="tiny" type="error" ghost @click="removePhoto(idx)">删除</NButton>
                    </div>
                  </div>
                </div>
                <span class="text-12px text-gray-500">支持多张照片（最多 {{ MAX_PHOTOS }} 张，png/jpg/gif/webp ≤ 5MB）</span>
              </NSpace>
            </NFormItem>
            <NFormItem label="性别" path="gender">
              <NRadioGroup v-model:value="formData.gender">
                <NRadio value="male">男</NRadio>
                <NRadio value="female">女</NRadio>
              </NRadioGroup>
            </NFormItem>
            <NFormItem label="代数" path="generation">
              <NInputNumber v-model:value="formData.generation" :min="1" placeholder="代数" />
            </NFormItem>
            <NFormItem label="字辈" path="generationName">
              <NInput v-model:value="formData.generationName" placeholder="字辈（可选）" />
            </NFormItem>
            <NFormItem label="出生日期" path="birthDate">
              <NInput v-model:value="formData.birthDate" placeholder="如：1900-01-01" />
            </NFormItem>
            <NFormItem label="出生地" path="birthPlace">
              <NInput v-model:value="formData.birthPlace" placeholder="出生地（可选）" />
            </NFormItem>
            <NFormItem label="是否在世" path="isAlive">
              <NSwitch v-model:value="formData.isAlive" :checked-value="1" :unchecked-value="0" />
              <span class="ml-8px text-gray-500 text-12px">{{ formData.isAlive === 1 ? '在世' : '已故' }}</span>
            </NFormItem>
            <NFormItem v-if="formData.isAlive === 0" label="逝世日期" path="deathDate">
              <NInput v-model:value="formData.deathDate" placeholder="如：1980-06-15" />
            </NFormItem>
            <NFormItem v-if="formData.isAlive === 0" label="安葬地点" path="deathPlace">
              <NInput v-model:value="formData.deathPlace" placeholder="墓茔/安葬地点（可选）" />
            </NFormItem>
            <NFormItem v-if="formData.isAlive === 0" label="墓茔经度" path="longitude">
              <NInputNumber v-model:value="formData.longitude" placeholder="经度（可选）" :step="0.000001" />
            </NFormItem>
            <NFormItem v-if="formData.isAlive === 0" label="墓茔纬度" path="latitude">
              <NInputNumber v-model:value="formData.latitude" placeholder="纬度（可选）" :step="0.000001" />
            </NFormItem>

            <!-- 父亲关系联动 -->
            <NFormItem label="父亲" path="fatherId">
              <NSpace vertical :size="8" style="width: 100%">
                <NSpace align="center">
                  <NInput
                    v-model:value="formData.fatherId"
                    placeholder="父亲ID（只读）"
                    readonly
                    :disabled="fatherDisabled"
                    :class="fatherDisabled ? 'bg-gray-100' : ''"
                    style="width: 220px"
                  />
                  <NButton type="primary" :disabled="fatherDisabled" @click="openFatherSearch">
                    {{ fatherDisabled ? '无需选择' : '查询父亲' }}
                  </NButton>
                  <NButton v-if="formData.fatherId && !fatherDisabled" @click="clearFather">清除</NButton>
                  <span v-if="fatherRequired" class="text-red-500 text-12px">* 必填</span>
                </NSpace>
                <div v-if="selectedFatherInfo" class="text-12px text-gray-600">
                  已选父亲：{{ selectedFatherInfo.name }}（第 {{ selectedFatherInfo.generation }} 代）
                </div>
                <div v-if="formData.generation === 1" class="text-12px text-gray-500">第一代成员无父亲ID</div>
              </NSpace>
            </NFormItem>

            <!-- 母亲选择：根据父亲配偶动态渲染 -->
            <NFormItem v-if="showMotherSelect" label="母亲">
              <NSpace vertical :size="8" style="width: 100%">
                <NSelect
                  v-model:value="formData.motherId"
                  placeholder="请选择母亲（根据父亲配偶信息）"
                  clearable
                  :options="motherCandidates.map(s => ({ label: s.name, value: String(s.rank) }))"
                  style="width: 300px"
                />
                <div v-if="motherCandidates.length > 1" class="text-12px text-orange-500">
                  该父亲有多位配偶，请选择其中一位作为母亲
                </div>
              </NSpace>
            </NFormItem>
            <NFormItem v-else-if="formData.fatherId && !motherLoading" label="母亲">
              <div class="text-12px text-gray-500">父亲暂无配偶信息，无需选择母亲</div>
            </NFormItem>

            <NFormItem label="配偶信息">
              <NSpace vertical :size="8" style="width: 100%">
                <div
                  v-for="(spouse, idx) in formData.spouseList"
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
                        <NInputNumber v-model:value="spouse.longitude" placeholder="经度" :step="0.000001" style="width: 140px" />
                        <NInputNumber v-model:value="spouse.latitude" placeholder="纬度" :step="0.000001" style="width: 140px" />
                      </NSpace>
                      <NInput v-model:value="spouse.bio" placeholder="生平简介" type="textarea" :rows="2" />
                    </NSpace>
                  </div>
                </div>
                <NButton dashed type="primary" block @click="addSpouse">+ 添加配偶</NButton>
              </NSpace>
            </NFormItem>
            <NFormItem label="同辈排序" path="sortOrder">
              <NInputNumber v-model:value="formData.sortOrder" :min="0" placeholder="排序号" />
            </NFormItem>
            <NFormItem label="生平简介" path="bio">
              <NInput v-model:value="formData.bio" type="textarea" :rows="3" placeholder="生平简介（可选）" />
            </NFormItem>
          </NForm>
        </NScrollbar>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showModal = false">取消</NButton>
            <NButton type="primary" :loading="submitting" @click="handleSubmit">确认</NButton>
          </NSpace>
        </template>
      </NModal>

      <!-- 父亲查询弹窗 -->
      <NModal v-model:show="showFatherModal" title="选择父亲与母亲" preset="card" style="width: 600px" :mask-closable="false">
        <NSpace vertical :size="12">
          <NAlert type="info" :show-icon="false">
            输入至少1个字符，系统将在第 {{ formData.generation - 1 }} 代男性成员中按父亲姓名或母亲姓名模糊搜索。
          </NAlert>
          <NInput
            v-model:value="fatherSearchKeyword"
            placeholder="请输入父亲姓名或母亲姓名关键字"
            clearable
            @input="onFatherKeywordInput"
          />
          <div v-if="fatherSearchLoading" class="py-20px text-center text-gray-500">搜索中...</div>
          <div v-else-if="fatherSearchKeyword.trim().length < 1 && fatherCandidates.length === 0" class="py-20px text-center text-gray-500">
            请输入至少1个字符开始搜索
          </div>
          <div v-else-if="fatherCandidates.length === 0" class="py-20px text-center text-gray-500">
            未找到匹配的父亲成员
          </div>
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
                <NRadioGroup v-else v-model:value="selectedCandidateMotherRank" class="mother-radio-group">
                  <NSpace vertical :size="4">
                    <NRadio
                      v-for="m in candidateMotherMap[c.id]"
                      :key="m.rank"
                      :value="String(m.rank)"
                    >
                      {{ m.name }}
                      <span v-if="m.birthDate" class="text-12px text-gray-500">（{{ m.birthDate }}）</span>
                    </NRadio>
                  </NSpace>
                </NRadioGroup>
              </div>
            </div>
          </div>
        </NSpace>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showFatherModal = false">取消</NButton>
            <NButton type="primary" :disabled="!selectedCandidateId" @click="confirmSelectFather">
              确认选择
            </NButton>
          </NSpace>
        </template>
      </NModal>

      <!-- 批量导入弹窗 -->
      <NModal v-model:show="showImportModal" title="批量导入成员" preset="card" style="width: 640px" :mask-closable="false">
        <NSpace vertical :size="12">
          <NAlert type="info" :show-icon="false">
            <div>支持 .xlsx / .xls / .csv 格式文件（≤ 20MB，最多 20000 行）。</div>
            <div>通过模板中的「外部ID / 父亲外部ID / 母亲外部ID」列可一次性建立父子关系，未填写则导入后可在「编辑成员」中补充。</div>
          </NAlert>
          <NSpace>
            <NButton size="small" @click="handleDownloadTemplate">下载导入模板</NButton>
            <span class="text-12px text-gray-500">模板含示例数据，请按规范准备后上传</span>
          </NSpace>
          <NUpload
            :key="importUploadKey"
            v-model:file-list="importFileList"
            accept=".xlsx,.xls,.csv"
            :max="1"
            :show-file-list="false"
            :custom-request="handleImportUpload"
            :disabled="importing"
          >
            <NButton type="primary" :loading="importing">{{ importFileName ? '重新选择文件' : '选择文件并导入' }}</NButton>
          </NUpload>
          <div v-if="importFileName" class="text-13px text-gray-500">已选择: {{ importFileName }}</div>
          <NProgress
            v-if="importing || importPercent > 0"
            type="line"
            :percentage="importPercent"
            :processing="importing"
            :show-indicator="true"
            :height="12"
          />
          <NAlert v-if="importErrorMsg" type="error" :show-icon="false">
            <div>{{ importErrorMsg }}</div>
          </NAlert>
          <div v-if="importResult">
            <NAlert :type="importResult.errors.length > 0 ? 'warning' : 'success'" :show-icon="false">
              <div>导入成功: {{ importResult.imported }} 条</div>
              <div v-if="importResult.skipped > 0">跳过: {{ importResult.skipped }} 条</div>
              <div v-if="importResult.errors.length > 0">
                <div v-for="(err, i) in importResult.errors" :key="i" class="text-red-500">{{ err }}</div>
              </div>
            </NAlert>
          </div>
        </NSpace>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showImportModal = false">关闭</NButton>
          </NSpace>
        </template>
      </NModal>
    </NCard>

    <!-- 未选择家族时的提示 -->
    <NCard v-if="!selectedFamilyId" :bordered="false" class="text-center py-60px">
      <div class="text-gray-400 text-16px">请先在上方选择一个家族，再管理其成员数据</div>
    </NCard>
  </div>
</template>

<style scoped>
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
/* 多配偶折叠卡片 */
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
