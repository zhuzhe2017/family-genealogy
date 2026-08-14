import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 动态家族成员表名工具
 * 所有家族成员均按 family_members_{familyId} 分表存储
 */
const MEMBER_TABLE_PREFIX = 'family_members';

/** 获取家族成员分表名，例如 family_members_1 */
export function getFamilyMemberTableName(familyId: number): string {
  if (!familyId || !Number.isInteger(familyId) || familyId <= 0) {
    throw new HttpException('家族ID无效', HttpStatus.BAD_REQUEST);
  }
  return `${MEMBER_TABLE_PREFIX}_${familyId}`;
}

/** 安全校验表名（仅允许数字、字母、下划线） */
export function validateMemberTableName(name: string): void {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new HttpException('成员表名不合法', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/** 校验家族ID并返回安全表名 */
export function getSafeMemberTableName(familyId: number): string {
  const tableName = getFamilyMemberTableName(familyId);
  validateMemberTableName(tableName);
  return tableName;
}

/** 获取成员照片分表名，例如 family_members_1_photo */
export function getSafeMemberPhotoTableName(familyId: number): string {
  const tableName = `${getFamilyMemberTableName(familyId)}_photo`;
  validateMemberTableName(tableName);
  return tableName;
}
