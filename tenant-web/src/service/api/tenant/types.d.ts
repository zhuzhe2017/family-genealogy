declare namespace Api.Tenant {
  /** 家族项（当前用户可管理的家族） */
  interface TenantFamilyItem {
    familyId: number;
    name: string;
    logo: string;
    role: 'admin' | 'creator' | 'member';
    status: number;
  }

  /** 家族概览 */
  interface FamilyOverview {
    id: number;
    name: string;
    logo: string;
    member_count: number;
    gen_count: number;
    memberCount: number;
    photoCount: number;
    documentCount: number;
    eventCount: number;
  }

  /** 家族设置 */
  interface FamilySettings {
    id: number;
    name: string;
    logo: string;
    hall_name: string;
    origin: string;
    description: string;
    is_public: number;
    allow_join: number;
  }

  /** 成员列表查询参数 */
  interface MemberQueryParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
    gender?: string;
    sort?: string;
  }

  /** 分页结果 */
  interface MemberListResult {
    list: MemberItem[];
    total: number;
    page: number;
    pageSize: number;
  }

  /** 成员项（与后端 family_member 分表字段一致） */
  interface MemberItem {
    id: string;
    family_id: number;
    name: string;
    gender: string;
    generation: number;
    generation_name: string;
    birth_date: string;
    birth_place: string;
    is_alive: number;
    death_date: string;
    death_place: string;
    longitude: number | null;
    latitude: number | null;
    bio: string | null;
    avatar_url: string;
    father_id: string;
    mother_id: string;
    spouse_info: string | null;
    sort_order: number;
    status: number;
    create_time: string;
    update_time: string;
  }

  interface MemberDetail extends MemberItem {
    photos: string[];
    children: MemberItem[];
  }

  /** 创建成员数据 */
  interface MemberCreateData {
    name: string;
    gender?: string;
    generation?: number;
    generationName?: string;
    birthDate?: string;
    birthPlace?: string;
    isAlive?: number;
    deathDate?: string;
    deathPlace?: string;
    longitude?: number;
    latitude?: number;
    bio?: string;
    avatarUrl?: string;
    fatherId?: string;
    motherId?: string;
    spouseInfo?: unknown;
    sortOrder?: number;
  }

  type MemberUpdateData = Partial<MemberCreateData> & { status?: number; photos?: string[] };

  /** 父亲候选查询 */
  interface FatherCandidateQuery {
    generation: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }

  /** 父亲候选 */
  interface FatherCandidate {
    id: string;
    name: string;
    gender: string;
    generation: number;
    generation_name: string;
    spouse_names?: string;
    father_name?: string;
  }

  interface FatherCandidateResult {
    list: FatherCandidate[];
    total: number;
  }

  interface FatherSpouse {
    name: string;
    birthDate?: string;
    deathDate?: string;
    deathPlace?: string;
    bio?: string;
    isAlive?: number;
  }

  /** 内容查询参数 */
  interface ContentQueryParams {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }

  interface ContentListResult {
    list: Record<string, unknown>[];
    total: number;
    page: number;
    pageSize: number;
  }

  interface ContentDetail extends Record<string, unknown> {}
}

declare namespace Api.Common {
  interface IdResult {
    id: number | string;
  }

  interface SuccessResult {
    success: boolean;
  }
}
