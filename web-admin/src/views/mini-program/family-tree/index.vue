<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { NCard, NSelect, NTree, NEmpty, NSpin, NTag, NSpace, NText, NButton, NDescriptions, NDescriptionsItem } from 'naive-ui';
import type { TreeOption } from 'naive-ui';
import { fetchAllFamilies } from '@/service/api/family';
import { fetchAllMembers, type FamilyMemberItem } from '@/service/api/family-member';

interface TreeNodeData extends TreeOption {
  member?: FamilyMemberItem;
  generation?: number;
  isRoot?: boolean;
}

const loading = ref(false);
const families = ref<Array<{ label: string; value: number }>>([]);
const selectedFamilyId = ref<number | null>(null);
const members = ref<FamilyMemberItem[]>([]);
const treeData = ref<TreeNodeData[]>([]);
const expandedKeys = ref<string[]>([]);
const selectedMember = ref<FamilyMemberItem | null>(null);

const familyOptions = computed(() => families.value);

/** 加载家族下拉 */
async function loadFamilies() {
  const res = await fetchAllFamilies({ status: 1 });
  if (res.data) {
    families.value = res.data.map((f: { id: number; name: string }) => ({
      label: f.name,
      value: f.id
    }));
    if (families.value.length > 0 && !selectedFamilyId.value) {
      selectedFamilyId.value = families.value[0].value;
      await loadFamilyTree();
    }
  }
}

/** 加载家族成员并构建树 */
async function loadFamilyTree() {
  if (!selectedFamilyId.value) return;
  loading.value = true;
  members.value = [];
  treeData.value = [];
  selectedMember.value = null;
  try {
    const res = await fetchAllMembers(selectedFamilyId.value, { status: 1 });
    if (res.data) {
      members.value = res.data;
      buildTree();
    }
  } finally {
    loading.value = false;
  }
}

/** 根据 father_id 构建树形结构 */
function buildTree() {
  const map = new Map<string, TreeNodeData>();
  const roots: TreeNodeData[] = [];

  // 第一遍：创建所有节点
  members.value.forEach(m => {
    map.set(m.id, {
      key: m.id,
      label: m.name,
      member: m,
      generation: m.generation,
      isLeaf: false
    });
  });

  // 第二遍：建立父子关系
  members.value.forEach(m => {
    const node = map.get(m.id)!;
    if (m.father_id && map.has(m.father_id)) {
      const parent = map.get(m.father_id)!;
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      // 无父亲或父亲不在列表中，作为根节点（通常是始祖）
      roots.push(node);
    }
  });

  // 按世代和 sort_order 排序
  const sortTree = (nodes: TreeNodeData[]) => {
    nodes.sort((a, b) => {
      const ga = a.generation || 0;
      const gb = b.generation || 0;
      if (ga !== gb) return ga - gb;
      const sa = a.member?.sort_order || 0;
      const sb = b.member?.sort_order || 0;
      return sa - sb;
    });
    nodes.forEach(n => {
      if (n.children) sortTree(n.children as TreeNodeData[]);
    });
  };
  sortTree(roots);

  treeData.value = roots;
  expandedKeys.value = roots.map(r => String(r.key));

  // 自动选中第一个节点
  if (roots.length > 0) {
    selectedMember.value = roots[0].member || null;
  }
}

/** 树节点渲染标签 */
function renderLabel({ option }: { option: TreeNodeData }) {
  const m = option.member;
  if (!m) return option.label as string;
  const gen = m.generation_name || `第${m.generation}代`;
  const alive = m.is_alive ? '' : '（已故）';
  return `${m.name} ${gen}${alive}`;
}

/** 点击节点 */
function handleSelect(keys: Array<string | number>, option: TreeNodeData[]) {
  if (option.length > 0 && option[0].member) {
    selectedMember.value = option[0].member;
  }
}

/** 切换在世状态显示 */
function aliveTag(isAlive: number) {
  return isAlive ? { type: 'success', text: '在世' } : { type: 'default', text: '已故' };
}

/** 跳转成员编辑页（复用成员管理页） */
function editMember() {
  if (!selectedMember.value || !selectedFamilyId.value) return;
  window.open(`/mini-program/members?familyId=${selectedFamilyId.value}&memberId=${selectedMember.value.id}`, '_blank');
}

/** 跳转世系图详情（小程序端页面） */
function viewInTree() {
  if (!selectedMember.value || !selectedFamilyId.value) return;
  window.open(`/mini-program/family-tree-detail?familyId=${selectedFamilyId.value}&memberId=${selectedMember.value.id}`, '_blank');
}

onMounted(() => {
  loadFamilies();
});
</script>

<template>
  <NCard :bordered="false" title="家族树管理">
    <NSpace vertical :size="16">
      <!-- 家族选择器 -->
      <NSpace align="center" :size="12">
        <span>选择家族：</span>
        <NSelect
          v-model:value="selectedFamilyId"
          :options="familyOptions"
          placeholder="请选择家族"
          style="width: 280px"
          @update:value="loadFamilyTree"
        />
        <NText depth="3" class="text-sm">共 {{ members.length }} 位成员</NText>
      </NSpace>

      <!-- 树形展示 -->
      <div v-if="loading" class="flex justify-center py-12">
        <NSpin size="large" />
      </div>
      <NEmpty v-else-if="treeData.length === 0" description="暂无成员数据，请先在成员管理中录入" />
      <div v-else class="flex gap-4">
        <!-- 树 -->
        <NCard :bordered="true" class="flex-1" title="家族树">
          <NTree
            :data="treeData"
            :render-label="renderLabel"
            :expanded-keys="expandedKeys"
            :default-expand-all="true"
            :selectable="true"
            @update:selected-keys="handleSelect"
          />
        </NCard>

        <!-- 成员详情 -->
        <NCard v-if="selectedMember" :bordered="true" class="w-80" title="成员详情">
          <NDescriptions :column="1" size="small" bordered>
            <NDescriptionsItem label="姓名">{{ selectedMember.name }}</NDescriptionsItem>
            <NDescriptionsItem label="性别">{{ selectedMember.gender === 'male' ? '男' : '女' }}</NDescriptionsItem>
            <NDescriptionsItem label="世代">第 {{ selectedMember.generation }} 代</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.generation_name" label="字辈">{{ selectedMember.generation_name }}</NDescriptionsItem>
            <NDescriptionsItem label="状态">
              <NTag :type="aliveTag(selectedMember.is_alive).type" size="small">
                {{ aliveTag(selectedMember.is_alive).text }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.birth_date" label="出生">{{ selectedMember.birth_date }}</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.death_date" label="逝世">{{ selectedMember.death_date }}</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.birth_place" label="籍贯">{{ selectedMember.birth_place }}</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.bio" label="简介">{{ selectedMember.bio }}</NDescriptionsItem>
          </NDescriptions>
          <div class="mt-3 flex gap-2">
            <NButton size="small" type="primary" @click="editMember">编辑成员</NButton>
            <NButton size="small" @click="viewInTree">在世系图中查看</NButton>
          </div>
        </NCard>
      </div>
    </NSpace>
  </NCard>
</template>
