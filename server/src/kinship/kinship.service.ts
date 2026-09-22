import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getSafeMemberTableName } from '../common/utils/family-member-table';
import {
  type AncestorPathNode,
  type RelationshipInfo,
  type CommonAncestorResult,
  type MemberSearchResult
} from './types/kinship.types';

/** 称谓计算支持的最大路径深度 */
const MAX_KINSHIP_DEPTH = 6;
/** 祖先链递归 CTE 深度上限（防脏数据成环导致死循环） */
const MAX_ANCESTOR_DEPTH = 100;

@Injectable()
export class KinshipService {
  constructor(private readonly dataSource: DataSource) {}

  /** 校验用户是否属于该家族（支持 family_permission 多家族权限） */
  async validateFamilyAccess(userId: string, familyId: number): Promise<void> {
    // 途径1：family_permission 表记录
    const [perm] = await this.dataSource.query<{ id: number }[]>(
      'SELECT `id` FROM `family_permission` WHERE `family_id` = ? AND `user_id` = ? AND `status` = 1',
      [familyId, userId]
    );
    if (perm) return;

    // 途径2：user.family_id 直接绑定
    const [user] = await this.dataSource.query<{ family_id: number | null; status: number }[]>(
      'SELECT `family_id`, `status` FROM `user` WHERE `id` = ? LIMIT 1',
      [userId]
    );
    if (!user || user.status !== 1) {
      throw new HttpException('用户不存在或已禁用', HttpStatus.FORBIDDEN);
    }
    if (user.family_id && Number(user.family_id) === familyId) return;

    // 途径3：家族创建者
    const [family] = await this.dataSource.query<{ creator_user_id: string | null }[]>(
      'SELECT `creator_user_id` FROM `family` WHERE `id` = ? AND `status` = 1',
      [familyId]
    );
    if (family && String(family.creator_user_id || '') === String(userId)) return;

    throw new HttpException('您不属于该家族，无权访问', HttpStatus.FORBIDDEN);
  }

  /** 确保家族成员表存在 */
  private async ensureMemberTable(familyId: number): Promise<string> {
    const tableName = getSafeMemberTableName(familyId);
    const [rows] = await this.dataSource.query<{ exists: 0 | 1 }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ?) AS \`exists\``,
      [tableName]
    );
    if (Number(rows?.exists) !== 1) {
      throw new HttpException('家族成员表不存在', HttpStatus.NOT_FOUND);
    }
    return tableName;
  }

  /** 转义 LIKE 通配符，防止用户输入 %/_ 被当作通配符 */
  private escapeLike(name: string): string {
    return name.replace(/[\\%_]/g, '\\$&');
  }

  /** 按姓名搜索成员（支持同名候选） */
  async searchMembers(familyId: number, name: string): Promise<MemberSearchResult[]> {
    const tableName = await this.ensureMemberTable(familyId);
    const keyword = `%${this.escapeLike(name)}%`;
    const rows = await this.dataSource.query<{
      id: string; name: string; gender: string; generation: number;
      generation_name: string; birth_date: string; father_id: string;
    }[]>(
      `SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
              \`birth_date\`, \`father_id\`
       FROM \`${tableName}\`
       WHERE \`name\` LIKE ? AND \`status\` = 1
       ORDER BY \`generation\` ASC, \`sort_order\` ASC
       LIMIT 50`,
      [keyword]
    );

    // 补充父亲姓名用于候选区分
    const fatherIds = [...new Set(rows.map(r => r.father_id).filter(Boolean))];
    const fatherMap = new Map<string, string>();
    if (fatherIds.length > 0) {
      const fathers = await this.dataSource.query<{ id: string; name: string }[]>(
        `SELECT \`id\`, \`name\` FROM \`${tableName}\` WHERE \`id\` IN (?)`,
        [fatherIds]
      );
      fathers.forEach(f => fatherMap.set(f.id, f.name));
    }

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      generation: r.generation,
      generationName: r.generation_name || '',
      birthDate: r.birth_date || '',
      fatherName: r.father_id ? fatherMap.get(r.father_id) || '' : ''
    }));
  }

  /**
   * 向上遍历父系祖先链（含自身，递归 CTE 一次查询）。
   * 返回顺序：[成员本人, 父, 祖父, ..., 顶层祖先]
   */
  private async buildAncestorChain(familyId: number, startId: string): Promise<AncestorPathNode[]> {
    const tableName = await this.ensureMemberTable(familyId);
    const rows = await this.dataSource.query<{
      id: string; name: string; gender: string; generation: number;
      generation_name: string; birth_date: string; death_date: string; is_alive: number;
    }[]>(
      `WITH RECURSIVE \`ancestors\` AS (
         SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
                \`birth_date\`, \`death_date\`, \`is_alive\`, \`father_id\`, 0 AS \`depth\`
         FROM \`${tableName}\`
         WHERE \`id\` = ? AND \`status\` = 1
         UNION ALL
         SELECT m.\`id\`, m.\`name\`, m.\`gender\`, m.\`generation\`, m.\`generation_name\`,
                m.\`birth_date\`, m.\`death_date\`, m.\`is_alive\`, m.\`father_id\`, a.\`depth\` + 1
         FROM \`${tableName}\` m
         JOIN \`ancestors\` a ON m.\`id\` = a.\`father_id\`
         WHERE m.\`status\` = 1 AND a.\`depth\` < ${MAX_ANCESTOR_DEPTH}
       )
       SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
              \`birth_date\`, \`death_date\`, \`is_alive\`
       FROM \`ancestors\`
       ORDER BY \`depth\` ASC`,
      [startId]
    );

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      generation: r.generation,
      generationName: r.generation_name || '',
      birthDate: r.birth_date || '',
      deathDate: r.death_date || '',
      isAlive: r.is_alive
    }));
  }

  /** 计算两人世代差和关系（本系统世代号越小辈分越高） */
  private computeRelationship(
    memberA: AncestorPathNode,
    memberB: AncestorPathNode,
    pathToA: AncestorPathNode[],
    pathToB: AncestorPathNode[]
  ): RelationshipInfo {
    const genDiff = memberA.generation - memberB.generation;
    const commonAncestor = pathToA[pathToA.length - 1];

    // 共同祖先在各自路径中的深度（从本人到共同祖先的边数）
    const caDepthA = pathToA.length - 1;
    const caDepthB = pathToB.length - 1;

    // 直系血亲判断：一人是另一人的直系祖先
    if (caDepthA === 0) {
      // A 是共同祖先本人，即 A 是 B 的直系长辈
      return {
        label: `${memberA.name} 是 ${memberB.name} 的${this.getLinealLabel(memberA.gender, caDepthB)}`,
        closeness: `直系血亲（父系），相差 ${caDepthB} 代`,
        generationDiff: genDiff
      };
    }
    if (caDepthB === 0) {
      // B 是共同祖先本人，即 B 是 A 的直系长辈
      return {
        label: `${memberB.name} 是 ${memberA.name} 的${this.getLinealLabel(memberB.gender, caDepthA)}`,
        closeness: `直系血亲（父系），相差 ${caDepthA} 代`,
        generationDiff: genDiff
      };
    }

    // 旁系血亲：祖先链仅沿 father_id 追溯，共同祖先必然在父系线上
    const collateralDegree = Math.min(caDepthA, caDepthB);
    const genderA = memberA.gender;

    // 同辈
    if (genDiff === 0) {
      if (collateralDegree === 1) {
        // 同父亲的兄弟姐妹（同父异母无法区分母方，统一按同父描述）
        return {
          label: genderA === 'male' ? '兄弟' : '姐妹',
          closeness: '旁系血亲（父系），同父亲',
          generationDiff: 0
        };
      }
      if (collateralDegree === 2) {
        // 共享祖父（父系），为堂亲
        return {
          label: genderA === 'male' ? '堂兄弟' : '堂姐妹',
          closeness: `旁系血亲（父系），共同祖先为第 ${commonAncestor.generation} 代`,
          generationDiff: 0
        };
      }
      return {
        label: `远房${genderA === 'male' ? '兄弟' : '姐妹'}`,
        closeness: `旁系血亲（父系），共同祖先为第 ${commonAncestor.generation} 代`,
        generationDiff: 0
      };
    }

    // 不同辈：叔侄、姑侄等（世代号小者为长辈）
    const senior = genDiff < 0 ? memberA : memberB;
    const junior = genDiff < 0 ? memberB : memberA;
    const seniorGender = senior.gender;

    if (Math.abs(genDiff) === 1) {
      // 差一代：叔/伯（长辈为男）与 侄，姑（长辈为女）与 甥
      if (seniorGender === 'male') {
        return {
          label: `叔伯与侄${junior.gender === 'male' ? '子' : '女'}`,
          closeness: '旁系血亲（父系），相差 1 代',
          generationDiff: genDiff
        };
      }
      return {
        label: `姑与侄${junior.gender === 'male' ? '子' : '女'}`,
        closeness: '旁系血亲（父系），相差 1 代',
        generationDiff: genDiff
      };
    }

    return {
      label: `远房亲属（相差 ${Math.abs(genDiff)} 代）`,
      closeness: `旁系血亲（父系），共同祖先为第 ${commonAncestor.generation} 代`,
      generationDiff: genDiff
    };
  }

  /** 直系血亲称谓（返回长辈一方相对于晚辈的称谓） */
  private getLinealLabel(gender: string, generations: number): string {
    const g = Math.abs(generations);
    if (gender === 'male') {
      if (g === 1) return '父亲';
      if (g === 2) return '祖父';
      if (g === 3) return '曾祖父';
      if (g === 4) return '高祖父';
      return `${g} 世祖`;
    }
    if (g === 1) return '母亲';
    if (g === 2) return '祖母';
    if (g === 3) return '曾祖母';
    if (g === 4) return '高祖母';
    return `${g} 世祖母`;
  }

  /** 共同祖先查询 */
  async findCommonAncestor(
    familyId: number,
    memberAId: string,
    memberBId: string
  ): Promise<CommonAncestorResult> {
    if (memberAId === memberBId) {
      throw new HttpException('不能选择同一位成员', HttpStatus.BAD_REQUEST);
    }

    const [chainA, chainB] = await Promise.all([
      this.buildAncestorChain(familyId, memberAId),
      this.buildAncestorChain(familyId, memberBId)
    ]);

    if (chainA.length === 0 || chainB.length === 0) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }

    // 链首即成员本人
    const nodeA = chainA[0];
    const nodeB = chainB[0];

    // 构建 B 的祖先 ID 集合
    const ancestorSetB = new Map<string, number>();
    chainB.forEach((node, idx) => ancestorSetB.set(node.id, idx));

    // 找共同祖先：沿 A 的祖先链自下而上首个命中即为距两人最近的共同祖先
    let commonIdxA = -1;
    let commonIdxB = -1;

    for (let i = 0; i < chainA.length; i++) {
      const idxB = ancestorSetB.get(chainA[i].id);
      if (idxB !== undefined) {
        commonIdxA = i;
        commonIdxB = idxB;
        break;
      }
    }

    if (commonIdxA === -1) {
      // 判断是否为单亲家庭（缺少父亲记录导致链条断裂）
      const hasFatherA = chainA.length > 1;
      const hasFatherB = chainB.length > 1;
      let reason = '两人没有共同的父系祖先记录（亲缘查询仅支持父系追溯）';

      if (!hasFatherA && !hasFatherB) {
        reason = '两位成员的父亲信息均不完整，无法追溯共同祖先（仅支持父系追溯）';
      } else if (!hasFatherA) {
        reason = `${nodeA.name} 的父亲信息不完整，无法追溯其祖先链（仅支持父系追溯）`;
      } else if (!hasFatherB) {
        reason = `${nodeB.name} 的父亲信息不完整，无法追溯其祖先链（仅支持父系追溯）`;
      }

      return {
        hasCommonAncestor: false,
        commonAncestor: null,
        path: null,
        relationship: null,
        memberA: nodeA,
        memberB: nodeB,
        noCommonReason: reason
      };
    }

    // 截取从成员本人到共同祖先的路径（[本人, ..., 共同祖先]）
    const pathToA = chainA.slice(0, commonIdxA + 1);
    const pathToB = chainB.slice(0, commonIdxB + 1);

    // 检查路径深度是否超过称谓计算范围
    if (pathToA.length > MAX_KINSHIP_DEPTH || pathToB.length > MAX_KINSHIP_DEPTH) {
      const ca = pathToA[pathToA.length - 1];
      return {
        hasCommonAncestor: true,
        commonAncestor: ca,
        path: { pathToA, pathToB },
        relationship: null,
        memberA: nodeA,
        memberB: nodeB,
        noCommonReason: `血缘关系超过 ${MAX_KINSHIP_DEPTH} 代，无法计算具体称谓`
      };
    }

    const relationship = this.computeRelationship(nodeA, nodeB, pathToA, pathToB);

    return {
      hasCommonAncestor: true,
      commonAncestor: pathToA[pathToA.length - 1],
      path: { pathToA, pathToB },
      relationship,
      memberA: nodeA,
      memberB: nodeB
    };
  }
}
