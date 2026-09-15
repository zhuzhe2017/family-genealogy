<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { NCard, NSelect, NEmpty, NSpin, NTag, NSpace, NText, NButton, NDescriptions, NDescriptionsItem } from 'naive-ui';
// treeweave 是 UMD 模块，Vite 打包后 default 导出可能是包装对象，需解包取真正的构造类
import TreeWeaveModule from 'treeweave';
import type { TreeNode } from 'treeweave';
import 'treeweave/css';
import { fetchAllFamilies } from '@/service/api/family';
import { fetchAllMembers, type FamilyMemberItem } from '@/service/api/family-member';

const loading = ref(false);
const families = ref<Array<{ label: string; value: number }>>([]);
const selectedFamilyId = ref<number | null>(null);
const members = ref<FamilyMemberItem[]>([]);
const selectedMember = ref<FamilyMemberItem | null>(null);
const treeContainer = ref<HTMLElement | null>(null);

const familyOptions = computed(() => families.value);

// UMD 打包经 Vite 后 default 可能是 { default: TreeWeaveClass }，这里统一解包出真正的构造类
const TreeWeaveCtor = (TreeWeaveModule as any).default ?? TreeWeaveModule;

type TreeWeaveInstance = InstanceType<typeof TreeWeaveCtor>;

/** 当前 TreeWeave 实例 */
let weave: TreeWeaveInstance | null = null;

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
  selectedMember.value = null;
  try {
    const res = await fetchAllMembers(selectedFamilyId.value, { status: 1 });
    if (res.data) {
      members.value = res.data;
      await nextTick();
      renderTree();
    }
  } finally {
    loading.value = false;
  }
}

/** 将成员列表构建为 TreeWeave 数据（包一个虚拟总根以支持多根/孤立成员） */
function buildTreeData() {
  const map = new Map<string, FamilyMemberItem>();
  const roots: FamilyMemberItem[] = [];

  members.value.forEach(m => map.set(m.id, m));
  members.value.forEach(m => {
    if (m.father_id && map.has(m.father_id)) return;
    roots.push(m);
  });

  // 排序：世代 + sort_order
  const byOrder = (a: FamilyMemberItem, b: FamilyMemberItem) => {
    const gdiff = (a.generation || 0) - (b.generation || 0);
    if (gdiff !== 0) return gdiff;
    return (a.sort_order || 0) - (b.sort_order || 0);
  };

  const toNode = (m: FamilyMemberItem): TreeNode => {
    const children = members.value.filter(c => c.father_id && c.father_id === m.id).sort(byOrder);
    return {
      id: m.id,
      label: m.name,
      meta: {
        gender: m.gender === 'female' ? 'female' : 'male',
        photo: m.avatar_url || '',
        title: m.generation_name || `第${m.generation}代`,
        member: m
      },
      children: children.map(toNode)
    };
  };

  roots.sort(byOrder);

  const family = families.value.find(f => f.value === selectedFamilyId.value);
  return {
    id: '__root__',
    label: family ? family.label : '家族',
    meta: { gender: 'default' },
    children: roots.map(toNode)
  };
}

/** 渲染 / 重绘家族树 */
function renderTree() {
  const container = treeContainer.value;
  if (!container) return;

  // 清空容器再重建（避免残留旧实例 DOM）
  container.innerHTML = '';
  weave = null;

  if (members.value.length === 0) return;

  const data = buildTreeData();

  // 无成员时仍走 nextTick 后的空态展示
  if (data.children.length === 0) return;

  weave = new TreeWeaveCtor({
    data,
    options: {
      nodeWidth: 170,
      nodeHeight: 110,
      levelGap: 110,
      siblingGap: 36,
      connectors: 'line',
      enableCollapse: true,
      collapseOnNodeClick: false,
      enableZoom: true,
      showPhoto: true,
      showDOB: false,
      showGender: false,
      showTitle: true,
      onNodeClick: node => {
        // 虚拟总根无 member，点击忽略
        const m = node.meta && node.meta.member;
        if (m) {
          selectedMember.value = m as FamilyMemberItem;
        }
      }
    }
  });

  // 成员较多时，首屏默认只展开顶层成员、折叠其子孙，避免一次性渲染上万节点导致页面卡死；
  // 用户可点击节点下方的展开按钮逐级查看
  if (members.value.length > 300) {
    (data.children || []).forEach(child => {
      (weave as any)._collapsedNodes.add(String(child.id));
    });
  }

  container.appendChild(weave.render() as SVGSVGElement);
}

/** 跳转成员编辑页（复用成员管理页） */
function editMember() {
  if (!selectedMember.value || !selectedFamilyId.value) return;
  window.open(`/mini-program/members?familyId=${selectedFamilyId.value}&memberId=${selectedMember.value.id}`, '_blank');
}

onMounted(() => {
  loadFamilies();
});

onBeforeUnmount(() => {
  // 卸载时清空容器，释放引用
  const container = treeContainer.value;
  if (container) {
    container.innerHTML = '';
  }
  weave = null;
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
      <div v-else class="flex gap-4">
        <!-- TreeWeave 家族树 -->
        <NCard :bordered="true" class="flex-1" title="家族树">
          <NEmpty
            v-if="members.length === 0"
            description="暂无成员数据，请先在成员管理中录入"
          />
          <div
            v-else
            ref="treeContainer"
            class="family-tree-container"
          ></div>
        </NCard>

        <!-- 成员详情 -->
        <NCard v-if="selectedMember" :bordered="true" class="w-80" title="成员详情">
          <NDescriptions :column="1" size="small" bordered>
            <NDescriptionsItem label="姓名">{{ selectedMember.name }}</NDescriptionsItem>
            <NDescriptionsItem label="性别">{{ selectedMember.gender === 'male' ? '男' : '女' }}</NDescriptionsItem>
            <NDescriptionsItem label="世代">第 {{ selectedMember.generation }} 代</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.generation_name" label="字辈">{{ selectedMember.generation_name }}</NDescriptionsItem>
            <NDescriptionsItem label="状态">
              <NTag :type="selectedMember.is_alive ? 'success' : 'default'" size="small">
                {{ selectedMember.is_alive ? '在世' : '已故' }}
              </NTag>
            </NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.birth_date" label="出生">{{ selectedMember.birth_date }}</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.death_date" label="逝世">{{ selectedMember.death_date }}</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.birth_place" label="籍贯">{{ selectedMember.birth_place }}</NDescriptionsItem>
            <NDescriptionsItem v-if="selectedMember.bio" label="简介">{{ selectedMember.bio }}</NDescriptionsItem>
          </NDescriptions>
          <div class="mt-3 flex gap-2">
            <NButton size="small" type="primary" @click="editMember">编辑成员</NButton>
          </div>
        </NCard>
      </div>
    </NSpace>
  </NCard>
</template>

<style scoped>
.family-tree-container {
  width: 100%;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  min-height: 520px;
  max-height: 76vh;
  background: #fff;
}
</style>
