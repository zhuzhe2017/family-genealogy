<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { loginModuleRecord } from '@/constants/app';
import { useAuthStore } from '@/store/modules/auth';
import { useRouterPush } from '@/hooks/common/router';
import { useFormRules, useNaiveForm } from '@/hooks/common/form';
import { $t } from '@/locales';
import { fetchCaptcha, fetchLoginConfig } from '@/service/api';

defineOptions({
  name: 'PwdLogin'
});

const authStore = useAuthStore();
const { toggleLoginModule } = useRouterPush();
const { formRef, validate } = useNaiveForm();

interface FormModel {
  userName: string;
  password: string;
  captchaCode: string;
}

const model: FormModel = reactive({
  userName: '',
  password: '',
  captchaCode: ''
});

const captchaEnabled = ref(false);
const captchaLoading = ref(false);
const captcha = ref<{ token: string; svg: string } | null>(null);

/** 加载登录页配置并决定是否展示验证码 */
async function initCaptcha() {
  try {
    const { data } = await fetchLoginConfig();
    captchaEnabled.value = Boolean(data?.captchaEnabled);
    if (captchaEnabled.value) {
      await refreshCaptcha();
    }
  } catch {
    captchaEnabled.value = false;
  }
}

/** 刷新验证码 */
async function refreshCaptcha() {
  captchaLoading.value = true;
  try {
    const { data } = await fetchCaptcha();
    captcha.value = data;
    model.captchaCode = '';
  } catch {
    captcha.value = null;
  } finally {
    captchaLoading.value = false;
  }
}

onMounted(() => {
  initCaptcha();
});

const rules = computed<Record<keyof FormModel, App.Global.FormRule[]>>(() => {
  // inside computed to make locale reactive, if not apply i18n, you can define it without computed
  const { formRules, defaultRequiredRule } = useFormRules();

  return {
    userName: formRules.userName,
    password: formRules.pwd,
    captchaCode: captchaEnabled.value ? [defaultRequiredRule] : []
  };
});

async function handleSubmit() {
  await validate();
  await authStore.login(
    model.userName,
    model.password,
    captchaEnabled.value && captcha.value ? { token: captcha.value.token, code: model.captchaCode } : undefined
  );

  // 登录失败（未跳转）时刷新验证码
  if (captchaEnabled.value) {
    refreshCaptcha();
  }
}

type AccountKey = 'super' | 'admin' | 'user';

interface Account {
  key: AccountKey;
  label: string;
  userName: string;
  password: string;
}

const accounts = computed<Account[]>(() => []);

async function handleAccountLogin(account: Account) {
  await authStore.login(account.userName, account.password);
}
</script>

<template>
  <NForm ref="formRef" :model="model" :rules="rules" size="large" :show-label="false" @keyup.enter="handleSubmit">
    <NFormItem path="userName">
      <NInput v-model:value="model.userName" :placeholder="$t('page.login.common.userNamePlaceholder')" />
    </NFormItem>
    <NFormItem path="password">
      <NInput
        v-model:value="model.password"
        type="password"
        show-password-on="click"
        :placeholder="$t('page.login.common.passwordPlaceholder')"
      />
    </NFormItem>
    <NFormItem v-if="captchaEnabled" path="captchaCode">
      <div class="flex items-center gap-12px w-full">
        <NInput
          v-model:value="model.captchaCode"
          maxlength="4"
          :placeholder="$t('page.login.common.captchaPlaceholder')"
        />
        <div
          class="captcha-box flex-shrink-0 cursor-pointer select-none"
          :class="{ 'pointer-events-none opacity-60': captchaLoading }"
          :title="$t('page.login.common.refreshCaptcha')"
          @click="refreshCaptcha"
        >
          <div v-if="captcha" class="captcha-svg" v-html="captcha.svg" />
          <span v-else class="text-12px text-#999">{{ $t('page.login.common.loading') }}</span>
        </div>
      </div>
    </NFormItem>
    <NSpace vertical :size="24">
      <div class="flex-y-center justify-between">
        <NCheckbox>{{ $t('page.login.pwdLogin.rememberMe') }}</NCheckbox>
        <NButton quaternary @click="toggleLoginModule('reset-pwd')">
          {{ $t('page.login.pwdLogin.forgetPassword') }}
        </NButton>
      </div>
      <NButton type="primary" size="large" round block :loading="authStore.loginLoading" @click="handleSubmit">
        {{ $t('common.confirm') }}
      </NButton>
      <div class="flex-y-center justify-between gap-12px">
        <NButton class="flex-1" block @click="toggleLoginModule('code-login')">
          {{ $t(loginModuleRecord['code-login']) }}
        </NButton>
        <NButton class="flex-1" block @click="toggleLoginModule('register')">
          {{ $t(loginModuleRecord.register) }}
        </NButton>
      </div>
      <NDivider v-if="accounts.length > 0" class="text-14px text-#666 !m-0">{{ $t('page.login.pwdLogin.otherAccountLogin') }}</NDivider>
      <div v-if="accounts.length > 0" class="flex-center gap-12px">
        <NButton v-for="item in accounts" :key="item.key" type="primary" @click="handleAccountLogin(item)">
          {{ item.label }}
        </NButton>
      </div>
    </NSpace>
  </NForm>
</template>

<style scoped>
.captcha-box {
  width: 120px;
  height: 40px;
  border: 1px solid rgb(var(--n-border-color) / 0.8);
  border-radius: 4px;
  overflow: hidden;
  background: #f5f6f8;
}

.captcha-svg {
  width: 100%;
  height: 100%;
}

.captcha-svg :deep(svg) {
  width: 100%;
  height: 100%;
}
</style>
