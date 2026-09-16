<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { NCard, NSelect, NEmpty, NSpin, NTag, NSpace, NText, NButton, NAlert, NDescriptions, NDescriptionsItem } from 'naive-ui';
import * as d3 from 'd3';
import { fetchAllFamilies } from '@/service/api/family';
import { fetchAllMembers, type FamilyMemberItem } from '@/service/api/family-member';

const loading = ref(false);
/** 成员拉取/渲染错误信息 */
const loadError = ref('');
/** 渲染结果说明（可见节点数、是否折叠等） */
const renderInfo = ref('');
const families = ref<Array<{ label: string; value: number }>>([]);
const selectedFamilyId = ref<number | null>(null);
const members = ref<FamilyMemberItem[]>([]);
const selectedMember = ref<FamilyMemberItem | null>(null);
const treeContainer = ref<HTMLElement | null>(null);

const familyOptions = computed(() => families.value);

/** 当前 D3 svg 实例 */
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

interface TreeNodeDatum {
  id: string;
  name: string;
  gender: string;
  generation: number;
  member: FamilyMemberItem | null;
  children?: TreeNodeDatum[];
}

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
  loadError.value = '';
  renderInfo.value = '';
  members.value = [];
  selectedMember.value = null;
  try {
    const res = await fetchAllMembers(selectedFamilyId.value, { status: 1 });
    if (res.data) {
      members.value = res.data;
      await nextTick();
      await renderTree();
    } else {
      loadError.value = '未获取到成员数据，请稍后重试';
    }
  } catch (e: any) {
    loadError.value = e?.message || '加载家族成员失败，请检查网络后重试';
  } finally {
    loading.value = false;
  }
}

/** 将成员列表构建为 D3 层级数据 */
function buildTreeData(): TreeNodeDatum {
  const map = new Map<string, FamilyMemberItem>();
  const roots: FamilyMemberItem[] = [];

  members.value.forEach(m => map.set(m.id, m));
  members.value.forEach(m => {
    if (m.father_id && map.has(m.father_id)) return;
    roots.push(m);
  });

  // 兜底：所有成员的 father_id 都指向集合内成员（闭环/缺始祖）时 roots 为空，
  // 此时取世代最小的成员作为根，避免静默渲染不出树
  if (roots.length === 0 && members.value.length > 0) {
    const minGeneration = Math.min(...members.value.map(m => m.generation || 0));
    members.value.forEach(m => {
      if ((m.generation || 0) === minGeneration) roots.push(m);
    });
  }

  // 排序：世代 + sort_order
  const byOrder = (a: FamilyMemberItem, b: FamilyMemberItem) => {
    const gdiff = (a.generation || 0) - (b.generation || 0);
    if (gdiff !== 0) return gdiff;
    return (a.sort_order || 0) - (b.sort_order || 0);
  };

  const toNode = (m: FamilyMemberItem): TreeNodeDatum => {
    const children = members.value.filter(c => c.father_id && c.father_id === m.id).sort(byOrder);
    return {
      id: m.id,
      name: m.name,
      gender: m.gender === 'female' ? 'female' : 'male',
      generation: m.generation || 0,
      member: m,
      children: children.map(toNode)
    };
  };

  roots.sort(byOrder);

  const family = families.value.find(f => f.value === selectedFamilyId.value);
  return {
    id: '__root__',
    name: family ? family.label : '家族',
    gender: 'default',
    generation: 0,
    member: null,
    children: roots.map(toNode)
  };
}

/** 渲染 / 重绘家族树 */
async function renderTree() {
  const container = treeContainer.value;
  if (!container) return;

  // 清空容器再重建
  container.innerHTML = '';
  svg = null;
  zoomBehavior = null;
  renderInfo.value = '';

  if (members.value.length === 0) return;

  const data = buildTreeData();
  if (!data.children || data.children.length === 0) {
    loadError.value = '未找到家族根节点（所有成员的父级均指向其他成员，可能缺少始祖数据），无法绘制家族树';
    return;
  }

  const isLargeTree = members.value.length > 300;

  try {
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 创建 SVG
    svg = d3
      .select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('viewBox', [0, 0, width, height]);

    // 创建缩放行为
    zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', event => {
        g.attr('transform', event.transform);
      });

    svg.call(zoomBehavior);

    // 主容器
    const g = svg.append('g');

    // 创建层级布局
    const root = d3.hierarchy(data);

    // 大数据量时首屏折叠
    if (isLargeTree && root.children) {
      root.children.forEach(child => {
        if (child.children) {
          child._children = child.children;
          child.children = undefined;
        }
      });
    }

    // 树布局
    const treeLayout = d3.tree<TreeNodeDatum>().nodeSize([140, 200]);
    treeLayout(root as d3.HierarchyPointNode<TreeNodeDatum>);

    // 绘制连线
    const link = g
      .selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d3.linkVertical<any, d3.HierarchyPointNode<TreeNodeDatum>>()
        .x(d => d.x)
        .y(d => d.y)
      )
      .attr('fill', 'none')
      .attr('stroke', '#d4d4d4')
      .attr('stroke-width', 1.5);

    // 绘制节点
    const node = g
      .selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        // 点击切换折叠/展开
        if (d.children) {
          d._children = d.children;
          d.children = undefined;
          update(root);
        } else if (d._children) {
          d.children = d._children;
          d._children = undefined;
          update(root);
        }
        // 点击成员节点显示详情
        if (d.data.member) {
          selectedMember.value = d.data.member;
        }
      });

    // 节点圆形背景
    node
      .append('circle')
      .attr('r', 28)
      .attr('fill', d => {
        if (d.data.gender === 'female') return '#fce4ec';
        if (d.data.gender === 'male') return '#e3f2fd';
        return '#f5f5f5';
      })
      .attr('stroke', d => {
        if (d.data.gender === 'female') return '#f48fb1';
        if (d.data.gender === 'male') return '#64b5f6';
        return '#bdbdbd';
      })
      .attr('stroke-width', 2);

    // 节点文字
    node
      .append('text')
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', '#333')
      .text(d => d.data.name);

    // 世代标签
    node
      .append('text')
      .attr('dy', '3.5em')
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#999')
      .text(d => {
        if (!d.data.member) return '';
        return d.data.member.generation_name || `第${d.data.generation}代`;
      });

    // 更新函数（用于折叠/展开）
    function update(source: d3.HierarchyPointNode<TreeNodeDatum>) {
      if (!svg) return;

      // 重新计算布局
      treeLayout(root as d3.HierarchyPointNode<TreeNodeDatum>);

      // 更新连线
      const linkUpdate = g
        .selectAll('.link')
        .data(root.links(), (d: any) => d.target.data.id);

      // 新连线（展开折叠节点时补齐父子连线，否则连线会永久丢失）
      linkUpdate
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('fill', 'none')
        .attr('stroke', '#d4d4d4')
        .attr('stroke-width', 1.5)
        .attr('d', d3.linkVertical<any, d3.HierarchyPointNode<TreeNodeDatum>>()
          .x(d => d.x)
          .y(d => d.y)
        );

      linkUpdate
        .transition()
        .duration(300)
        .attr('d', d3.linkVertical<any, d3.HierarchyPointNode<TreeNodeDatum>>()
          .x(d => d.x)
          .y(d => d.y)
        );

      // 更新节点
      const nodeUpdate = g
        .selectAll('.node')
        .data(root.descendants(), (d: any) => d.data.id);

      nodeUpdate
        .transition()
        .duration(300)
        .attr('transform', d => `translate(${d.x},${d.y})`);

      // 新节点
      const nodeEnter = nodeUpdate
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .style('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          if (d.children) {
            d._children = d.children;
            d.children = undefined;
            update(root);
          } else if (d._children) {
            d.children = d._children;
            d._children = undefined;
            update(root);
          }
          if (d.data.member) {
            selectedMember.value = d.data.member;
          }
        });

      nodeEnter
        .append('circle')
        .attr('r', 0)
        .attr('fill', d => {
          if (d.data.gender === 'female') return '#fce4ec';
          if (d.data.gender === 'male') return '#e3f2fd';
          return '#f5f5f5';
        })
        .attr('stroke', d => {
          if (d.data.gender === 'female') return '#f48fb1';
          if (d.data.gender === 'male') return '#64b5f6';
          return '#bdbdbd';
        })
        .attr('stroke-width', 2)
        .transition()
        .duration(300)
        .attr('r', 28);

      nodeEnter
        .append('text')
        .attr('dy', '.35em')
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#333')
        .text(d => d.data.name);

      nodeEnter
        .append('text')
        .attr('dy', '3.5em')
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('fill', '#999')
        .text(d => {
          if (!d.data.member) return '';
          return d.data.member.generation_name || `第${d.data.generation}代`;
        });

      // 移除退出节点
      nodeUpdate.exit().remove();
      linkUpdate.exit().remove();
    }

    // 初始适配缩放
    if (zoomBehavior && svg) {
      const bounds = g.node()?.getBBox();
      if (bounds) {
        const fullWidth = width;
        const fullHeight = height;
        const widthScale = fullWidth / bounds.width;
        const heightScale = fullHeight / bounds.height;
        const scale = Math.min(widthScale, heightScale, 1) * 0.9;
        const translateX = (fullWidth - bounds.width * scale) / 2 - bounds.x * scale;
        const translateY = (fullHeight - bounds.height * scale) / 2 - bounds.y * scale;

        svg.call(
          zoomBehavior.transform,
          d3.zoomIdentity.translate(translateX, translateY).scale(scale)
        );
      }
    }

    // 渲染结果反馈
    const visibleCount = root.descendants().length;
    if (isLargeTree) {
      renderInfo.value = `已加载 ${members.value.length} 位成员。因人数较多，首屏仅展示 ${data.children.length} 位顶层成员，点击节点展开/折叠。`;
    } else {
      renderInfo.value = `已渲染全部 ${visibleCount} 位成员。`;
    }
  } catch (e: any) {
    loadError.value = e?.message || '家族树渲染失败，请刷新重试';
  }
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
  svg = null;
  zoomBehavior = null;
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

      <!-- 异常提示 -->
      <NAlert v-if="loadError" type="error" :bordered="false">
        {{ loadError }}
      </NAlert>

      <!-- 加载中：拉取成员 + 渲染阶段 -->
      <div v-if="loading" class="flex flex-col items-center justify-center gap-3 py-16">
        <NSpin size="large" />
        <NText depth="3" class="text-sm">正在加载并生成家族树，成员较多时请稍候…</NText>
      </div>
      <div v-else class="flex gap-4">
        <!-- D3 家族树 -->
        <NCard :bordered="true" class="flex-1" title="家族树">
          <!-- 渲染结果说明，便于判断当前状态 -->
          <NAlert
            v-if="renderInfo"
            type="info"
            :bordered="false"
            class="mb-3"
          >
            {{ renderInfo }}
          </NAlert>
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
