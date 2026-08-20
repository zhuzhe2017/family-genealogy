/** 聚会状态 */
export type GatheringStatus = 0 | 1 | 2 | 3 | 4;

/** 报名状态 */
export type RegistrationStatus = 1 | 2 | 3;

/** 聚会主表行 */
export interface GatheringRow {
  id: number;
  family_id: number;
  title: string;
  description: string | null;
  cover_image: string;
  location: string;
  address_detail: string;
  start_time: Date | null;
  end_time: Date | null;
  signup_deadline: Date | null;
  agenda: string | null;
  capacity: number;
  status: number;
  organizer_user_id: string;
  create_time: Date;
  update_time: Date;
}

/** 场次行 */
export interface GatheringSessionRow {
  id: number;
  gathering_id: number;
  name: string;
  start_time: Date | null;
  end_time: Date | null;
  capacity: number;
  signed_count: number;
  create_time: Date;
}

/** 报名行 */
export interface RegistrationRow {
  id: number;
  gathering_id: number;
  session_id: number;
  user_id: string;
  member_id: number;
  name: string;
  phone: string;
  diet_type: string;
  diet_note: string;
  special_need: string;
  guest_count: number;
  status: number;
  checkin_code: string;
  checkin_time: Date | null;
  checkin_method: string;
  create_time: Date;
  update_time: Date;
}

/** 归档行 */
export interface ArchiveRow {
  id: number;
  gathering_id: number;
  title: string;
  file_url: string;
  file_type: string;
  description: string;
  creator_user_id: string;
  create_time: Date;
}

/** 议程项 */
export interface AgendaItem {
  time: string;
  item: string;
  remark?: string;
}

/** 报名数据 */
export interface RegisterData {
  sessionId?: number;
  memberId?: number;
  name: string;
  phone?: string;
  dietType?: string;
  dietNote?: string;
  specialNeed?: string;
  guestCount?: number;
}

/** 聚会保存数据（创建/编辑共用） */
export interface GatheringUpsertData {
  familyId?: number;
  title?: string;
  description?: string;
  coverImage?: string;
  location?: string;
  addressDetail?: string;
  startTime?: string;
  endTime?: string;
  signupDeadline?: string;
  agenda?: AgendaItem[] | string;
  capacity?: number;
  status?: number;
  sessions?: Array<{
    id?: number;
    name?: string;
    startTime?: string;
    endTime?: string;
    capacity?: number;
  }>;
}
