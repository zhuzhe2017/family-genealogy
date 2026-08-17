/** 祭祀操作类型：incense-上香 pray-祈福 offer-献祭 wish-许愿 */
export const WORSHIP_TYPES = ['incense', 'pray', 'offer', 'wish'] as const;
export type WorshipType = (typeof WORSHIP_TYPES)[number];

/** family_worship_record 行记录（手写 SQL 返回） */
export interface WorshipRecordRow {
  id: number;
  family_id: number;
  user_id: string;
  user_name: string;
  type: WorshipType;
  content: string;
  create_time: string;
}

/** 今日各类型统计（按 DB 服务器时区 CURDATE） */
export interface WorshipStats {
  incenseCount: number;
  prayCount: number;
  offerCount: number;
  wishCount: number;
  totalCount: number;
}

/** 记录条目（对外返回 camelCase） */
export interface WorshipRecordItem {
  id: number;
  userName: string;
  type: WorshipType;
  content: string;
  createTime: string;
}

/** 祭祀页面汇总：今日统计 + 最近记录 */
export interface WorshipSummary {
  familyId: number;
  stats: WorshipStats;
  records: WorshipRecordItem[];
}

/** 祭祀纪念对象行记录（family_worship_memorial） */
export interface WorshipMemorialRow {
  id: number;
  family_id: number;
  member_id: string;
  member_name: string;
  avatar_url: string;
  epitaph: string;
  creator_user_id: string;
  create_time: string;
}

/** 纪念对象条目（对外返回） */
export interface WorshipMemorialItem {
  id: number;
  memberId: string;
  memberName: string;
  avatarUrl: string;
  epitaph: string;
  birthDate: string;
  deathDate: string;
  createTime: string;
}

/** 可创建纪念的已故成员条目 */
export interface WorshipMemorialCandidate {
  memberId: string;
  name: string;
  avatarUrl: string;
  birthDate: string;
  deathDate: string;
}

/** 祈福记录分页结果 */
export interface WorshipRecordPageResult {
  list: WorshipRecordItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** 纪念对象详情：纪念信息 + 家族最近祭祀记录 */
export interface WorshipMemorialDetail {
  memorial: WorshipMemorialItem;
  records: WorshipRecordItem[];
}

/** 纪念日/生日提醒类型：birth-生日 death-忌日 */
export type WorshipRemindType = 'birth' | 'death';

/** 纪念日提醒条目（由成员 birth_date/death_date 周年自动推导） */
export interface WorshipReminderItem {
  memberId: string;
  memberName: string;
  remindType: WorshipRemindType;
  /** 周年日期 MM-DD */
  date: string;
  /** 距今天数（0=今天，1=明天） */
  daysUntil: number;
  /** 展示文案：如「生日 05-20」/「忌日 08-15」 */
  desc: string;
}

/** 纪念日提醒结果（按 daysUntil 升序） */
export interface WorshipReminderResult {
  familyId: number;
  days: number;
  list: WorshipReminderItem[];
}
