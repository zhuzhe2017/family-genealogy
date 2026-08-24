<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import type { FormInst, FormRules } from 'naive-ui';
import { useMessage, NForm, NFormItem, NInput, NButton, NTabs, NTabPane, NModal, NDivider } from 'naive-ui';
import ImageUpload from '@/components/common/image-upload/index.vue';
import { useAuthStore } from '@/store/modules/auth';
import { fetchUpdateProfile, fetchChangePassword } from '@/service/api';

defineOptions({
  name: 'ProfileModal'
});

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
}>();

const message = useMessage();
const authStore = useAuthStore();

// ===== 基本信息 =====
const profileTab = ref('info');
const profileSaving = ref(false);
const profileFormRef = ref<FormInst | null>(null);
const profileForm = reactive({
  nickname: '',
  phone: '',
  email: '',
  avatarUrl: ''
});

/** 手机号正则（中国大陆 11 位） */
const PHONE_REGEX = /^1[3-9]\d{9}$/;
/** 邮箱正则 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const profileRules: FormRules = {
  nickname: [
    { required: true, message: '请输入昵称', trigger: ['blur', 'input'] },
    { max: 50, message: '昵称长度不能超过 50 个字符', trigger: ['blur', 'input'] }
  ],
  phone: [
    {
      validator: (_rule, value: string) => !value || PHONE_REGEX.test(value),
      message: '请输入正确的 11 位手机号',
      trigger: ['blur', 'input']
    }
  ],
  email: [
    {
      validator: (_rule, value: string) => !value || EMAIL_REGEX.test(value),
      message: '请输入正确的邮箱地址',
      trigger: ['blur', 'input']
    }
  ]
};

// ===== 修改密码 =====
const passwordSaving = ref(false);
const passwordFormRef = ref<FormInst | null>(null);
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: ['blur', 'input'] }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: ['blur', 'input'] },
    { min: 6, message: '新密码长度不能少于 6 位', trigger: ['blur', 'input'] }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: ['blur', 'input'] },
    {
      validator: (_rule, value: string) => value === passwordForm.newPassword,
      message: '两次输入的新密码不一致',
      trigger: ['blur', 'input']
    }
  ]
};

function resetForms() {
  profileTab.value = 'info';
  const info = authStore.userInfo;
  profileForm.nickname = info.nickname || '';
  profileForm.phone = info.phone || '';
  profileForm.email = info.email || '';
  profileForm.avatarUrl = info.avatarUrl || '';
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
}

watch(
  () => props.show,
  show => {
    if (show) {
      resetForms();
    }
  }
);

/** 保存基本信息 */
async function submitProfile() {
  try {
    await profileFormRef.value?.validate();
  } catch {
    return;
  }
  profileSaving.value = true;
  try {
    const { error } = await fetchUpdateProfile({
      nickname: profileForm.nickname.trim(),
      phone: profileForm.phone.trim() || undefined,
      email: profileForm.email.trim() || undefined,
      avatarUrl: profileForm.avatarUrl || undefined
    });
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('个人资料已更新');
    // 刷新本地用户信息（顶部昵称/头像即时生效）
    await authStore.initUserInfo();
    emit('update:show', false);
  } catch (err: any) {
    message.error(err?.msg || err?.message || '保存失败');
  } finally {
    profileSaving.value = false;
  }
}

/** 修改密码 */
async function submitPassword() {
  try {
    await passwordFormRef.value?.validate();
  } catch {
    return;
  }
  passwordSaving.value = true;
  try {
    const { error } = await fetchChangePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    });
    if (error) {
      message.error(error.message);
      return;
    }
    message.success('密码修改成功');
    passwordForm.oldPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
    profileTab.value = 'info';
    emit('update:show', false);
  } catch (err: any) {
    message.error(err?.msg || err?.message || '修改失败');
  } finally {
    passwordSaving.value = false;
  }
}
</script>

<template>
  <NModal
    :show="props.show"
    preset="card"
    title="个人资料"
    style="width: 480px"
    :mask-closable="false"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NTabs v-model:value="profileTab" type="line">
      <!-- 基本信息 -->
      <NTabPane name="info" tab="基本信息">
        <NForm ref="profileFormRef" :model="profileForm" :rules="profileRules" label-placement="left" label-width="90px">
          <NFormItem label="头像">
            <ImageUpload v-model:value="profileForm.avatarUrl" :size="72" />
          </NFormItem>
          <NFormItem label="登录账号">
            <span class="text-14px">{{ authStore.userInfo.userName }}</span>
          </NFormItem>
          <NFormItem label="昵称">
            <NInput v-model:value="profileForm.nickname" placeholder="请输入昵称" maxlength="50" />
          </NFormItem>
          <NFormItem label="手机号">
            <NInput v-model:value="profileForm.phone" placeholder="选填" maxlength="11" />
          </NFormItem>
          <NFormItem label="邮箱">
            <NInput v-model:value="profileForm.email" placeholder="选填" maxlength="100" />
          </NFormItem>
        </NForm>
        <div class="mt-8px flex justify-end">
          <NButton type="primary" :loading="profileSaving" @click="submitProfile">保存资料</NButton>
        </div>
      </NTabPane>

      <!-- 修改密码 -->
      <NTabPane name="password" tab="修改密码">
        <NForm ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-placement="left" label-width="90px">
          <NFormItem label="原密码">
            <NInput v-model:value="passwordForm.oldPassword" type="password" show-password-on="click" placeholder="请输入原密码" />
          </NFormItem>
          <NFormItem label="新密码">
            <NInput v-model:value="passwordForm.newPassword" type="password" show-password-on="click" placeholder="长度不少于 6 位" />
          </NFormItem>
          <NFormItem label="确认新密码">
            <NInput v-model:value="passwordForm.confirmPassword" type="password" show-password-on="click" placeholder="再次输入新密码" />
          </NFormItem>
        </NForm>
        <NDivider style="margin-top: 4px" />
        <div class="mb-16px text-12px text-gray-400">
          新密码需符合系统密码策略（长度、大小写、数字、特殊字符要求），不符合时后端会返回具体提示。
        </div>
        <div class="flex justify-end">
          <NButton type="primary" :loading="passwordSaving" @click="submitPassword">修改密码</NButton>
        </div>
      </NTabPane>
    </NTabs>
  </NModal>
</template>
