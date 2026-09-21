import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getSafeMemberTableName } from '../common/utils/family-member-table';
import {
  type MemberNode,
  type AncestorPathNode,
  type CommonAncestorInfo,
  type KinshipPath,
  type RelationshipInfo,
  type CommonAncestorResult,
  type MemberSearchResult
} from './types/kinship.types';

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

  /** 查询单个成员 */
  private async getMember(familyId: number, memberId: string): Promise<MemberNode> {
    const tableName = await this.ensureMemberTable(familyId);
    const [row] = await this.dataSource.query<MemberNode[]>(
      `SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
              \`birth_date\`, \`death_date\`, \`is_alive\`, \`father_id\`, \`sort_order\`
       FROM \`${tableName}\`
       WHERE \`id\` = ? AND \`status\` = 1 LIMIT 1`,
      [memberId]
    );
    if (!row) {
      throw new HttpException('成员不存在', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  /** 按姓名搜索成员（支持同名候选） */
  async searchMembers(familyId: number, name: string): Promise<MemberSearchResult[]> {
    const tableName = await this.ensureMemberTable(familyId);
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
      [`%${name}%`]
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

  /** 向上遍历祖先链（含自身） */
  private async buildAncestorChain(familyId: number, startId: string): Promise<AncestorPathNode[]> {
    const tableName = await this.ensureMemberTable(familyId);
    const chain: AncestorPathNode[] = [];
    let currentId = startId;
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const [row] = await this.dataSource.query<{
        id: string; name: string; gender: string; generation: number;
        generation_name: string; birth_date: string; death_date: string;
        is_alive: number; father_id: string;
      }[]>(
        `SELECT \`id\`, \`name\`, \`gender\`, \`generation\`, \`generation_name\`,
                \`birth_date\`, \`death_date\`, \`is_alive\`, \`father_id\`
         FROM \`${tableName}\`
         WHERE \`id\` = ? AND \`status\` = 1 LIMIT 1`,
        [currentId]
      );
      if (!row) break;

      chain.push({
        id: row.id,
        name: row.name,
        gender: row.gender,
        generation: row.generation,
        generationName: row.generation_name || '',
        birthDate: row.birth_date || '',
        deathDate: row.death_date || '',
        isAlive: row.is_alive
      });

      currentId = row.father_id || '';
    }

    return chain;
  }

  /** 计算两人世代差和关系 */
  private computeRelationship(
    memberA: AncestorPathNode,
    memberB: AncestorPathNode,
    pathToA: AncestorPathNode[],
    pathToB: AncestorPathNode[]
  ): RelationshipInfo {
    const genDiff = memberA.generation - memberB.generation;

    // 共同祖先在各自路径中的深度
    const caDepthA = pathToA.length - 1; // 从共同祖先到 A 的边数
    const caDepthB = pathToB.length - 1;

    // 直系血亲判断：一人是另一人的直系祖先
    if (caDepthA === 0) {
      // A 是共同祖先本人，即 A 是 B 的直系祖先
      return {
        label: this.getLinealLabel(memberA.gender, Math.abs(genDiff)),
        closeness: `直系${memberA.gender === 'male' ? '父系' : '母系'}血亲，相差 ${Math.abs(genDiff)} 代`,
        generationDiff: genDiff
      };
    }
    if (caDepthB === 0) {
      return {
        label: this.getLinealLabel(memberB.gender, Math.abs(genDiff)),
        closeness: `直系${memberB.gender === 'male' ? '父系' : '母系'}血亲，相差 ${Math.abs(genDiff)} 代`,
        generationDiff: genDiff
      };
    }

    // 旁系血亲：通过共同祖先确定旁系关系
    // 用 caDepth 和 caDepthB 确定旁系代数
    const collateralDegree = Math.min(caDepthA, caDepthB);
    const genderA = memberA.gender;

    // 同辈
    if (genDiff === 0) {
      if (collateralDegree === 1) {
        // 亲兄弟姐妹
        return {
          label: genderA === 'male' ? '兄弟' : '姐妹',
          closeness: '直系亲属，同父母',
          generationDiff: 0
        };
      }
      if (collateralDegree === 2) {
        // 堂/表兄弟姐妹
        const isPaternal = pathToA[1]?.gender === 'male' && pathToB[1]?.gender === 'male';
        return {
          label: isPaternal
            ? (genderA === 'male' ? '堂兄弟' : '堂姐妹')
            : (genderA === 'male' ? '表兄弟' : '表姐妹'),
          closeness: `旁系血亲，共同祖先为第 ${pathToA[0]?.generation} 代`,
          generationDiff: 0
        };
      }
      return {
        label: `远房${genderA === 'male' ? '兄弟' : '姐妹'}`,
        closeness: `旁系血亲，共同祖先为第 ${pathToA[0]?.generation} 代`,
        generationDiff: 0
      };
    }

    // 不同辈：叔侄、舅甥等
    const senior = genDiff > 0 ? memberA : memberB;
    const junior = genDiff > 0 ? memberB : memberA;
    const seniorGender = senior.gender;

    if (Math.abs(genDiff) === 1) {
      // 差一代：叔/伯/姑/舅/姨 与 侄/甥
      if (seniorGender === 'male') {
        return {
          label: `叔伯与侄${junior.gender === 'male' ? '子' : '女'}`,
          closeness: `旁系血亲，相差 1 代`,
          generationDiff: genDiff
        };
      }
      return {
        label: `姑/姨与甥${junior.gender === 'male' ? '子' : '女'}`,
        closeness: `旁系血亲，相差 1 代`,
        generationDiff: genDiff
      };
    }

    return {
      label: `远房亲属（相差 ${Math.abs(genDiff)} 代）`,
      closeness: `旁系血亲，共同祖先为第 ${pathToA[0]?.generation} 代`,
      generationDiff: genDiff
    };
  }

  /** 直系血亲称谓 */
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

    const [memberA, memberB] = await Promise.all([
      this.getMember(familyId, memberAId),
      this.getMember(familyId, memberBId)
    ]);

    const [chainA, chainB] = await Promise.all([
      this.buildAncestorChain(familyId, memberAId),
      this.buildAncestorChain(familyId, memberBId)
    ]);

    // 构建 B 的祖先 ID 集合
    const ancestorSetB = new Map<string, number>();
    chainB.forEach((node, idx) => ancestorSetB.set(node.id, idx));

    // 找共同祖先（世代最小者 = 离两人最近）
    let commonIdxA = -1;
    let commonIdxB = -1;
    let commonGen = Infinity;

    for (let i = 0; i < chainA.length; i++) {
      const idxB = ancestorSetB.get(chainA[i].id);
      if (idxB !== undefined && chainA[i].generation < commonGen) {
        commonGen = chainA[i].generation;
        commonIdxA = i;
        commonIdxB = idxB;
      }
    }

    const nodeA: AncestorPathNode = {
      id: memberA.id, name: memberA.name, gender: memberA.gender,
      generation: memberA.generation, generationName: memberA.generation_name,
      birthDate: memberA.birth_date, deathDate: memberA.death_date, isAlive: memberA.is_alive
    };
    const nodeB: AncestorPathNode = {
      id: memberB.id, name: memberB.name, gender: memberB.gender,
      generation: memberB.generation, generationName: memberB.generation_name,
      birthDate: memberB.birth_date, deathDate: memberB.death_date, isAlive: memberB.is_alive
    };

    if (commonIdxA === -1) {
      // 判断是否为单亲家庭（缺少父亲记录导致链条断裂）
      const hasFatherA = chainA.length > 1;
      const hasFatherB = chainB.length > 1;
      let reason = '两人没有共同祖先记录';

      if (!hasFatherA && !hasFatherB) {
        reason = '两位成员的父亲信息均不完整，无法追溯共同祖先';
      } else if (!hasFatherA) {
        reason = `${memberA.name} 的父亲信息不完整，无法追溯其祖先链`;
      } else if (!hasFatherB) {
        reason = `${memberB.name} 的父亲信息不完整，无法追溯其祖先链`;
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

    // 截取从共同祖先到各自的路径
    const pathToA = chainA.slice(0, commonIdxA + 1);
    const pathToB = chainB.slice(0, commonIdxB + 1);

    // 检查路径深度是否超过称谓计算范围
    const MAX_KINSHIP_DEPTH = 6;
    if (pathToA.length > MAX_KINSHIP_DEPTH || pathToB.length > MAX_KINSHIP_DEPTH) {
      const ca = chainA[commonIdxA];
      return {
        hasCommonAncestor: true,
        commonAncestor: {
          id: ca.id, name: ca.name, gender: ca.gender,
          generation: ca.generation, generationName: ca.generationName,
          birthDate: ca.birthDate, deathDate: ca.deathDate, isAlive: ca.isAlive
        },
        path: { pathToA, pathToB },
        relationship: null,
        memberA: nodeA,
        memberB: nodeB,
        noCommonReason: `血缘关系超过 ${MAX_KINSHIP_DEPTH} 代，无法计算具体称谓`
      };
    }

    const ca = chainA[commonIdxA];
    const commonAncestor: CommonAncestorInfo = {
      id: ca.id, name: ca.name, gender: ca.gender,
      generation: ca.generation, generationName: ca.generationName,
      birthDate: ca.birthDate, deathDate: ca.deathDate, isAlive: ca.isAlive
    };

    const relationship = this.computeRelationship(nodeA, nodeB, pathToA, pathToB);

    return {
      hasCommonAncestor: true,
      commonAncestor,
      path: { pathToA, pathToB },
      relationship,
      memberA: nodeA,
      memberB: nodeB
    };
  }
}
