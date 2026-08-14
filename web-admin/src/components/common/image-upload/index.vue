<script setup lang="ts">
import { ref, watch } from 'vue';
import { NUpload, NButton, NProgress } from 'naive-ui';
import { Icon } from '@iconify/vue';
import type { UploadCustomRequestOptions, UploadInst } from 'naive-ui';
import { uploadImage } from '@/service/api';
import { resolveImageUrl } from '@/utils/image-url';

defineOptions({
  name: 'ImageUpload'
});

interface Props {
  /** 当前图片相对 URL（/uploads/xxx.png 或完整 http 地址），v-model:value */
  value: string;
  /** 上传区域边长（正方形） */
  size?: number;
  /** 单个文件大小上限（MB） */
  maxSize?: number;
  /** 是否禁用上传 */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 120,
  maxSize: 5
});

const emit = defineEmits<{
  'update:value': [value: string];
}>();

const uploadRef = ref<UploadInst | null>(null);
const uploading = ref(false);
const uploadPercent = ref(0);
const errorMsg = ref('');

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// 外部值变化时清空内部文件列表，避免 max=1 阻挡重新选择（预览由 value 驱动）
watch(() => props.value, () => {
  uploadRef.value?.clear();
});

function openFileDialog() {
  uploadRef.value?.openOpenFileDialog?.();
}

async function handleCustomRequest(options: UploadCustomRequestOptions) {
  const rawFile = options.file.file as File | null;
  if (!rawFile) {
    options.onError();
    return;
  }

  // 客户端前置校验
  if (!ALLOWED_TYPES.includes(rawFile.type)) {
    errorMsg.value = '仅支持 png/jpg/jpeg/gif/webp 格式的图片';
    options.onError();
    return;
  }
  if (rawFile.size > props.maxSize * 1024 * 1024) {
    errorMsg.value = `图片大小不能超过 ${props.maxSize}MB`;
    options.onError();
    return;
  }

  uploading.value = true;
  uploadPercent.value = 0;
  errorMsg.value = '';
  try {
    const { data, error } = await uploadImage(rawFile, percent => {
      uploadPercent.value = percent;
      options.onProgress({ percent });
    });
    if (error || !data) {
      errorMsg.value = (error as Error)?.message || '上传失败';
      options.onError();
      return;
    }
    emit('update:value', data.url);
    options.onFinish();
  } finally {
    uploading.value = false;
  }
}

/** 删除已上传图片并允许重新上传 */
function handleRemove() {
  uploadRef.value?.clear();
  emit('update:value', '');
}
</script>

<template>
  <NUpload
    ref="uploadRef"
    accept="image/png,image/jpeg,image/gif,image/webp"
    :max="1"
    :show-file-list="false"
    :custom-request="handleCustomRequest"
    :disabled="props.disabled"
  >
    <div
      class="image-upload-box relative overflow-hidden rd-8px border-1px border-dashed"
      :class="{ disabled: props.disabled }"
      :style="{ width: `${size}px`, height: `${size}px` }"
    >
      <!-- 上传中：进度指示 -->
      <div v-if="uploading" class="absolute inset-0 flex flex-col items-center justify-center gap-8px bg-white/80 px-12px">
        <NProgress type="circle" :percentage="uploadPercent" :stroke-width="6" :show-indicator="false" />
        <span class="text-12px text-gray-600">{{ uploadPercent }}%</span>
      </div>

      <!-- 已有图片：预览 + 悬停操作 -->
      <div
        v-else-if="value"
        class="group relative size-full"
        :class="{ 'cursor-not-allowed': props.disabled }"
      >
        <img :src="resolveImageUrl(value)" alt="上传图片" class="size-full object-cover" />
        <div
          v-if="!props.disabled"
          class="absolute inset-0 hidden flex-col items-center justify-center gap-6px bg-black/50 group-hover:flex"
        >
          <NButton size="tiny" type="primary" ghost @click.stop="openFileDialog">更换</NButton>
          <NButton size="tiny" type="error" ghost @click.stop="handleRemove">删除</NButton>
        </div>
      </div>

      <!-- 空状态：点击或拖拽上传 -->
      <div
        v-else
        class="absolute inset-0 flex flex-col items-center justify-center gap-6px text-gray-500"
        :class="props.disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-primary'"
      >
        <Icon icon="carbon:add" :width="28" />
        <span class="text-12px">{{ props.disabled ? '暂无图片' : '点击或拖拽上传' }}</span>
        <span v-if="!props.disabled" class="text-10px text-gray-400">png/jpg/gif/webp ≤ {{ maxSize }}MB</span>
      </div>
    </div>
  </NUpload>

  <!-- 错误提示 -->
  <div v-if="errorMsg" class="mt-6px text-12px text-red-500">{{ errorMsg }}</div>
</template>

<style scoped>
.image-upload-box {
  border-color: var(--n-border-color);
  background: var(--n-color-1);
  transition: border-color 0.2s;
}
.image-upload-box:hover {
  border-color: #2080f0;
}
</style>
