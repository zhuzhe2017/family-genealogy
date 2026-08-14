<script setup lang="ts">
import { h, ref, reactive, onMounted, computed } from 'vue';
import type { DataTableColumn, FormInst, TreeOption, FormRules } from 'naive-ui';
import { useMessage, useDialog, NSwitch, NButton, NSpace, NInput, NInputGroup, NTree } from 'naive-ui';
import {
  fetchMenuTree,
  fetchCreateMenu,
  fetchUpdateMenu,
  fetchDeleteMenu,
  fetchToggleStatus,
  fetchUpdateSort
} from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import SvgIcon from '@/components/custom/svg-icon.vue';

interface MenuItem {
  id: number;
  parentId: number;
  name: string;
  type: string;
  path: string;
  component: string;
  routeName: string;
  icon: string;
  permission: string;
  sortOrder: number;
  status: number;
  visible: number;
  keepAlive: number;
  operator?: string;
  createTime: string;
  parentName?: string;
  children?: MenuItem[];
}

const message = useMessage();
const dialog = useDialog();
const { hasAuth } = useAuth();

const loading = ref(false);
// 全量菜单树（一次性加载，避免树形+后端分页冲突）
const allMenuTree = ref<MenuItem[]>([]);
// 用于父菜单选择弹窗的树数据
const menuTreeData = ref<TreeOption[]>([]);
const menuNameMap = ref<Map<number, string>>(new Map());
// 编辑模式下需禁用的节点（自身 + 所有子孙）
const disabledTreeKeys = ref<number[]>([]);

const showParentModal = ref(false);
const tempParentIds = ref<number[]>([]);

const searchParams = reactive({
  keyword: '',
  status: null as number | null,
  type: null as string | null
});

const statusOptions = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 }
];

const typeOptions = [
  { label: '目录', value: 'directory' },
  { label: '菜单', value: 'menu' },
  { label: '按钮', value: 'button' }
];

// 客户端树过滤：保留命中节点及其祖先链
const filteredTree = computed<MenuItem[]>(() => filterTree(allMenuTree.value));

function filterTree(nodes: MenuItem[]): MenuItem[] {
  const kw = searchParams.keyword?.trim().toLowerCase();
  const status = searchParams.status;
  const type = searchParams.type;
  const result: MenuItem[] = [];
  for (const node of nodes) {
    let matched = true;
    if (kw) {
      matched =
        node.name.toLowerCase().includes(kw) ||
        (node.routeName || '').toLowerCase().includes(kw) ||
        (node.path || '').toLowerCase().includes(kw);
    }
    if (matched && status !== null) matched = node.status === status;
    if (matched && type) matched = node.type === type;

    const filteredChildren = node.children?.length ? filterTree(node.children) : [];
    if (matched || filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : undefined });
    }
  }
  return result;
}

function flattenTree(nodes: MenuItem[]): MenuItem[] {
  const list: MenuItem[] = [];
  for (const node of nodes) {
    list.push(node);
    if (node.children?.length) list.push(...flattenTree(node.children));
  }
  return list;
}

/** 在树中查找节点所在兄弟数组与索引 */
function findNodeLocation(nodes: MenuItem[], id: number): { node: MenuItem; list: MenuItem[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.id === id) {
      return { node, list: nodes, index: i };
    }
    if (node.children?.length) {
      const found = findNodeLocation(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 收集某节点自身及其所有子孙 ID（用于编辑时禁用父菜单选择） */
function collectSubtreeIds(nodes: MenuItem[], id: number): number[] {
  for (const node of nodes) {
    if (node.id === id) {
      const ids = [node.id];
      if (node.children?.length) {
        ids.push(...flattenTree(node.children).map(n => n.id));
      }
      return ids;
    }
    if (node.children?.length) {
      const found = collectSubtreeIds(node.children, id);
      if (found.length) return found;
    }
  }
  return [];
}

const columns = computed<DataTableColumn<MenuItem>[]>(() => [
  { title: '菜单名称', key: 'name', width: 200, tree: true },
  { title: '路由名称', key: 'routeName', width: 160, ellipsis: { tooltip: true } },
  {
    title: '图标',
    key: 'icon',
    width: 80,
    render: row => (row.icon ? h(SvgIcon, { icon: row.icon, style: 'font-size: 20px' }) : '-')
  },
  {
    title: '类型',
    key: 'type',
    width: 80,
    render: row => ({ directory: '目录', menu: '菜单', button: '按钮' })[row.type] || row.type
  },
  { title: '路由路径', key: 'path', ellipsis: { tooltip: true } },
  { title: '排序', key: 'sortOrder', width: 80 },
  {
    title: '状态',
    key: 'status',
    width: 100,
    render: row =>
      h(NSwitch, {
        value: row.status === 1,
        disabled: !hasAuth('system:menu:status'),
        'onUpdate:value': () => handleToggleStatus(row)
      })
  },
  {
    title: '操作',
    key: 'actions',
    width: 320,
    render: row =>
      h(NSpace, null, {
        default: () => [
          hasAuth('system:menu:sort') && h(NButton, { size: 'small', quaternary: true, onClick: () => handleMove(row, 'up') }, { default: () => '上移' }),
          hasAuth('system:menu:sort') && h(NButton, { size: 'small', quaternary: true, onClick: () => handleMove(row, 'down') }, { default: () => '下移' }),
          hasAuth('system:menu:update') && h(NButton, { size: 'small', type: 'primary', ghost: true, onClick: () => handleEdit(row) }, { default: () => '编辑' }),
          hasAuth('system:menu:delete') && h(NButton, { size: 'small', type: 'error', ghost: true, onClick: () => handleDelete(row) }, { default: () => '删除' }),
          hasAuth('system:menu:create') && h(NButton, { size: 'small', onClick: () => handleAddSub(row) }, { default: () => '新增子级' })
        ]
      })
  }
]);

const showModal = ref(false);
const isEdit = ref(false);
const editId = ref<number | null>(null);
const submitting = ref(false);
const formRef = ref<FormInst | null>(null);

const formData = reactive({
  parentId: null as number | null,
  name: '',
  type: 'menu',
  path: '',
  component: '',
  routeName: '',
  icon: '',
  permission: '',
  sortOrder: 0,
  visible: 1,
  keepAlive: 1
});

const parentMenuName = computed(() => {
  if (formData.parentId === null || formData.parentId === undefined) return '';
  return menuNameMap.value.get(formData.parentId) || '';
});

// 动态表单校验：按菜单类型差异化必填项
const formRules = computed<FormRules>(() => {
  const rules: FormRules = {
    name: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
    type: [{ required: true, message: '请选择菜单类型', trigger: 'change' }]
  };
  if (formData.type !== 'button') {
    rules.path = [{ required: true, message: '请输入路由路径', trigger: 'blur' }];
    rules.routeName = [{ required: true, message: '请输入路由名称', trigger: 'blur' }];
  }
  if (formData.type === 'menu') {
    rules.component = [{ required: true, message: '请输入组件路径', trigger: 'blur' }];
  }
  if (formData.type === 'button') {
    rules.permission = [{ required: true, message: '请输入权限标识', trigger: 'blur' }];
  }
  return rules;
});

async function loadData() {
  loading.value = true;
  try {
    const { data } = await fetchMenuTree();
    const items = (data || []).map(snakeToCamelMenu);
    allMenuTree.value = items;
    menuTreeData.value = buildMenuTreeData(items);
    menuNameMap.value = buildMenuNameMap(items);
  } catch (err: any) {
    message.error(err?.msg || '加载菜单列表失败');
  } finally {
    loading.value = false;
  }
}

function buildMenuTreeData(items: MenuItem[]): TreeOption[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    children: item.children?.length ? buildMenuTreeData(item.children) : undefined
  }));
}

function buildMenuNameMap(items: MenuItem[], map = new Map<number, string>()): Map<number, string> {
  for (const item of items) {
    map.set(item.id, item.name);
    if (item.children?.length) {
      buildMenuNameMap(item.children, map);
    }
  }
  return map;
}

/** 将后端 snake_case 菜单字段转换为前端 camelCase */
function snakeToCamelMenu(row: any): MenuItem {
  return {
    id: row.id,
    parentId: row.parent_id || null,
    name: row.name,
    type: row.type,
    path: row.path,
    component: row.component,
    routeName: row.route_name,
    icon: row.icon,
    permission: row.permission,
    sortOrder: row.sort_order,
    status: row.status,
    visible: row.visible,
    keepAlive: row.keep_alive,
    operator: row.operator,
    createTime: row.create_time,
    parentName: row.parentName,
    children: row.children?.length ? row.children.map(snakeToCamelMenu) : undefined
  };
}

function handleOpenParentPicker() {
  tempParentIds.value = formData.parentId !== null ? [formData.parentId] : [];
  showParentModal.value = true;
}

function handleParentCheck(keys: number[]) {
  const previousKeys = tempParentIds.value;
  const addedKeys = keys.filter(k => !previousKeys.includes(k));
  if (addedKeys.length > 0) {
    // 用户勾选了新节点，只保留最后勾选的（避免 tree 按键顺序返回导致选错）
    tempParentIds.value = [addedKeys[addedKeys.length - 1]];
  } else {
    // 取消勾选或无变化，保留剩余的第一个或清空
    tempParentIds.value = keys.length > 0 ? [keys[0]] : [];
  }
}

function handleConfirmParent() {
  formData.parentId = tempParentIds.value.length > 0 ? tempParentIds.value[0] : null;
  showParentModal.value = false;
}

function handleSearch() {
  // filteredTree 为计算属性，会自动响应搜索条件变化
}

function handleReset() {
  searchParams.keyword = '';
  searchParams.status = null;
  searchParams.type = null;
}

function resetForm() {
  formData.parentId = null;
  formData.name = '';
  formData.type = 'menu';
  formData.path = '';
  formData.component = '';
  formData.routeName = '';
  formData.icon = '';
  formData.permission = '';
  formData.sortOrder = 0;
  formData.visible = 1;
  formData.keepAlive = 1;
}

function handleAdd() {
  isEdit.value = false;
  editId.value = null;
  disabledTreeKeys.value = [];
  resetForm();
  showModal.value = true;
}

function handleAddSub(row: MenuItem) {
  isEdit.value = false;
  editId.value = null;
  disabledTreeKeys.value = [];
  resetForm();
  formData.parentId = row.id;
  formData.type = 'menu';
  showModal.value = true;
}

async function handleEdit(row: MenuItem) {
  isEdit.value = true;
  editId.value = row.id;
  // 编辑时禁用自身及所有子孙作为父菜单选项，防止循环
  disabledTreeKeys.value = collectSubtreeIds(allMenuTree.value, row.id);
  formData.parentId = row.parentId || null;
  formData.name = row.name;
  formData.type = row.type;
  formData.path = row.path;
  formData.component = row.component;
  formData.routeName = row.routeName;
  formData.icon = row.icon;
  formData.permission = row.permission;
  formData.sortOrder = row.sortOrder;
  formData.visible = row.visible;
  formData.keepAlive = row.keepAlive;
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
    if (isEdit.value && editId.value) {
      const updateData = { ...formData, parentId: formData.parentId ?? undefined };
      await fetchUpdateMenu(editId.value, updateData);
      message.success('更新成功');
    } else {
      await fetchCreateMenu(formData);
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

function handleDelete(row: MenuItem) {
  dialog.warning({
    title: '确认删除',
    content: `确定要删除菜单「${row.name}」吗？`,
    positiveText: '确定',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await fetchDeleteMenu(row.id);
        message.success('删除成功');
        loadData();
      } catch (err: any) {
        message.error(err?.msg || '删除失败');
      }
    }
  });
}

async function handleToggleStatus(row: MenuItem) {
  try {
    const { data } = await fetchToggleStatus(row.id);
    message.success(data?.status === 1 ? '已启用' : '已禁用');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '操作失败');
  }
}

/** 上移/下移：在兄弟节点内调整顺序，重新计算 sortOrder 并批量更新 */
async function handleMove(row: MenuItem, direction: 'up' | 'down') {
  const location = findNodeLocation(allMenuTree.value, row.id);
  if (!location) return;
  const { list, index } = location;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= list.length) {
    message.warning(direction === 'up' ? '已是第一个' : '已是最后一个');
    return;
  }
  // 交换兄弟位置
  const tmp = list[index];
  list[index] = list[targetIndex];
  list[targetIndex] = tmp;
  // 按当前顺序重新计算 sortOrder（从 1 开始）
  const sortList = list.map((item, i) => ({ id: item.id, sortOrder: i + 1 }));
  try {
    await fetchUpdateSort(sortList);
    message.success('排序已更新');
    loadData();
  } catch (err: any) {
    message.error(err?.msg || '排序失败');
    loadData();
  }
}

onMounted(() => {
  loadData();
});
</script>

<template>
  <div>
    <NCard :bordered="false" class="mb-16px">
      <NForm inline label-placement="left" :model="searchParams">
        <NFormItem label="菜单名称">
          <NInput v-model:value="searchParams.keyword" placeholder="名称/路由/路径" clearable @keyup.enter="handleSearch" />
        </NFormItem>
        <NFormItem label="状态">
          <NSelect v-model:value="searchParams.status" placeholder="全部" clearable :options="statusOptions" style="width: 120px" />
        </NFormItem>
        <NFormItem label="类型">
          <NSelect v-model:value="searchParams.type" placeholder="全部" clearable :options="typeOptions" style="width: 120px" />
        </NFormItem>
        <NFormItem>
          <NSpace>
            <NButton type="primary" @click="handleSearch">搜索</NButton>
            <NButton @click="handleReset">重置</NButton>
          </NSpace>
        </NFormItem>
      </NForm>
    </NCard>

    <NCard :bordered="false" title="菜单管理">
      <template #header-extra>
        <NButton v-if="hasAuth('system:menu:create')" type="primary" @click="handleAdd">新增菜单</NButton>
      </template>

      <NDataTable
        :columns="columns"
        :data="filteredTree"
        :loading="loading"
        :row-key="row => row.id"
        :pagination="false"
        :bordered="false"
        :single-line="false"
        default-expand-all
      />

      <NModal v-model:show="showParentModal" title="选择上级菜单" :mask-closable="false" preset="card" style="width: 480px">
        <NTree
          v-model:checked-keys="tempParentIds"
          :data="menuTreeData"
          :disabled-keys="disabledTreeKeys"
          checkable
          check-on-click
          :cascade="false"
          default-expand-all
          key-field="id"
          label-field="name"
          children-field="children"
          @update:checked-keys="handleParentCheck"
        />
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showParentModal = false">取消</NButton>
            <NButton type="primary" @click="handleConfirmParent">确认</NButton>
          </NSpace>
        </template>
      </NModal>

      <NModal v-model:show="showModal" :title="isEdit ? '编辑菜单' : '新增菜单'" :mask-closable="false" preset="card" style="width: 680px">
        <NForm ref="formRef" :model="formData" :rules="formRules" label-placement="left" label-width="100px" require-mark-placement="right-hanging">
          <NFormItem label="上级菜单" path="parentId">
            <NInputGroup>
              <NInput :value="parentMenuName" readonly placeholder="顶级菜单" style="flex: 1" />
              <NButton @click="handleOpenParentPicker">选择</NButton>
              <NButton v-if="formData.parentId !== null" @click="formData.parentId = null">清除</NButton>
            </NInputGroup>
          </NFormItem>

          <NFormItem label="菜单类型" path="type">
            <NRadioGroup v-model:value="formData.type">
              <NRadio value="directory">目录</NRadio>
              <NRadio value="menu">菜单</NRadio>
              <NRadio value="button">按钮</NRadio>
            </NRadioGroup>
          </NFormItem>

          <NFormItem label="菜单名称" path="name">
            <NInput v-model:value="formData.name" placeholder="请输入菜单名称" />
          </NFormItem>

          <NFormItem v-if="formData.type !== 'button'" label="路由路径" path="path">
            <NInput v-model:value="formData.path" placeholder="如 /system/menu" />
          </NFormItem>

          <NFormItem v-if="formData.type === 'menu'" label="组件路径" path="component">
            <NInput v-model:value="formData.component" placeholder="如 view.system_menu" />
          </NFormItem>

          <NFormItem v-if="formData.type !== 'button'" label="路由名称" path="routeName">
            <NInput v-model:value="formData.routeName" placeholder="如 system_menu" />
          </NFormItem>

          <NFormItem label="图标" path="icon">
            <IconPicker v-model="formData.icon" />
          </NFormItem>

          <NFormItem label="权限标识" path="permission">
            <NInput v-model:value="formData.permission" placeholder="如 system:menu:list（按钮类型必填）" />
          </NFormItem>

          <NFormItem label="排序号" path="sortOrder">
            <NInputNumber v-model:value="formData.sortOrder" :min="0" style="width: 100%" />
          </NFormItem>

          <NFormItem v-if="formData.type !== 'button'" label="显示状态">
            <NSwitch v-model:value="formData.visible" :checked-value="1" :unchecked-value="0" />
          </NFormItem>

          <NFormItem v-if="formData.type === 'menu'" label="缓存状态">
            <NSwitch v-model:value="formData.keepAlive" :checked-value="1" :unchecked-value="0" />
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
