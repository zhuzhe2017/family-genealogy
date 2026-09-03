import { SetMetadata } from '@nestjs/common';

/** 跳过家族权限校验的标记（用于不携带 familyId 的接口，如"我的家族列表"） */
export const SKIP_FAMILY_CHECK_KEY = 'skipFamilyCheck';

export const SkipFamilyCheck = () => SetMetadata(SKIP_FAMILY_CHECK_KEY, true);
