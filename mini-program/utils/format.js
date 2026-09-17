/**
 * 后端字段归一化工具
 * 后端返回 snake_case 行记录，小程序本地数据使用 camelCase，
 * 统一在此转换为页面可直接渲染的对象，保证两种数据源兼容。
 */

const { API_BASE_URL } = require('./config');

/** 图片静态资源基地址:上传接口返回 /uploads/xxx 相对路径,静态资源挂在 /uploads(不带 /api 前缀) */
const IMAGE_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

/** 图片相对路径 → 完整可访问 URL（空值/http 开头原样返回） */
function resolveImageUrl(url) {
  if (!url) return '';
  if (typeof url !== 'string') return url;
  if (url.indexOf('http') === 0) return url;
  if (url.indexOf('/uploads/') === 0) return IMAGE_BASE_URL + url;
  return url;
}

/** 图片数组相对路径 → 完整 URL 数组 */
function resolveImageUrls(urls) {
  if (!Array.isArray(urls)) return [];
  return urls.map(resolveImageUrl);
}

/** 家族行 → 页面对象 */
function normalizeFamily(row) {
  if (!row) return {};
  return {
    id: row.id,
    name: row.name || '',
    logo: resolveImageUrl(row.logo),
    founder: row.founder || '',
    hallName: row.hall_name || '',
    origin: row.origin || '',
    description: row.description || '',
    memberCount: row.member_count != null ? row.member_count : (row.memberCount || 0),
    generationCount: row.gen_count != null ? row.gen_count : (row.generationCount || 0),
    generationNames: generationNamesOf(row),
    // 透传原始字辈序列(结构 {代: [字1,字2]}),供首页按代分组展示多字辈
    generationSequence: row.generation_sequence || row.generationSequence || '',
    createTime: row.create_time || '',
    isPublic: row.is_public != null ? row.is_public : 1,
    allowJoin: row.allow_join != null ? row.allow_join : 1,
    isAdmin: row.isAdmin || false
  };
}

/** 从 generation_sequence 提取字辈字符串（取每代第一个字，顿号连接）
 *  同代多字辈：对象形态取 arr[0]，数组形态取项首字符（"文武贤良"->"文"） */
function generationNamesOf(row) {
  if (row.generationNames) return row.generationNames;
  const seq = row.generation_sequence;
  if (!seq) return '';
  let obj = seq;
  if (typeof seq === 'string') {
    try {
      obj = JSON.parse(seq);
    } catch (e) {
      return seq;
    }
  }
  if (Array.isArray(obj)) {
    // 数组形态：每项即一代，同代多字辈取首字符，保持与首页卡片 firstChar 一致
    return obj
      .map(item => {
        if (Array.isArray(item)) return (item[0] || '').trim().charAt(0);
        return String(item == null ? '' : item).trim().charAt(0);
      })
      .filter(Boolean)
      .join('、');
  }
  if (obj && typeof obj === 'object') {
    return Object.keys(obj)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => {
        const arr = obj[k];
        return Array.isArray(arr) ? arr[0] : arr;
      })
      .filter(Boolean)
      .join('、');
  }
  return '';
}

/** 成员行 → 页面对象 */
function normalizeMember(row) {
  if (!row) return {};
  const spouseList = parseSpouseList(row.spouse_info);
  return {
    id: row.id,
    name: row.name || '',
    gender: row.gender || 'male',
    generation: row.generation || 1,
    generationName: row.generation_name || '',
    birthDate: row.birth_date || '',
    birthYear: (row.birth_date || '').substring(0, 4),
    birthPlace: row.birth_place || '',
    isAlive: row.is_alive != null ? !!Number(row.is_alive) : true,
    deathDate: row.death_date || '',
    deathPlace: row.death_place || '',
    longitude: row.longitude != null ? Number(row.longitude) : null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    bio: row.bio || '',
    avatar: resolveImageUrl(row.avatar_url),
    fatherId: row.father_id || '',
    motherId: row.mother_id || '',
    spouseInfo: spouseList[0] || null,
    spouseList,
    spouseNames: spouseList.map(s => s.name).join('、'),
    photos: resolveImageUrls(row.photos),
    sortOrder: row.sort_order || 0
  };
}

/** 解析 spouse_info JSON 字符串/对象，返回规范化配偶列表（多配偶场景） */
function parseSpouseList(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list
    .map(s => ({
      name: s.name || '',
      birthDate: s.birthDate || s.birth_date || '',
      // 显式 isAlive 优先；否则按是否有逝世日期推断
      isAlive: s.isAlive != null ? Number(s.isAlive) : (s.deathDate || s.death_date ? 0 : 1),
      deathDate: s.deathDate || s.death_date || '',
      deathPlace: s.deathPlace || s.death_place || '',
      longitude: s.longitude != null ? String(s.longitude) : '',
      latitude: s.latitude != null ? String(s.latitude) : '',
      bio: s.bio || '',
      // 默认展开；仅首条保留展开，其余自动折叠
      collapsed: false
    }))
    .filter(s => s.name);
}

/** 内容行 → 动态对象 */
function normalizeDynamic(row) {
  if (!row) return {};
  return {
    id: row.id,
    userName: row.user_name || '',
    gender: row.user_gender || 'male',
    time: formatTime(row.create_time),
    content: row.content || '',
    images: resolveImageUrls(row.images),
    likeCount: row.like_count || 0,
    commentCount: row.comment_count || 0,
    isLiked: row.isLiked ? true : false,
    comments: row.comments || []
  };
}

/** 内容行 → 照片对象 */
function normalizePhoto(row) {
  if (!row) return {};
  return {
    id: row.id,
    url: resolveImageUrl(row.url),
    title: row.title || '',
    description: row.description || '',
    year: row.year || '',
    category: row.category_id || '',
    uploaderName: row.uploader_name || '',
    createTime: row.create_time || ''
  };
}

/** 内容行 → 文档对象 */
function normalizeDocument(row) {
  if (!row) return {};
  return {
    id: row.id,
    name: row.name || '',
    volume: row.volume || '',
    description: row.description || '',
    // 保留文件 URL 供详情页阅读器跳转（normalize 后透传）
    fileUrl: row.file_url || '',
    updateTime: row.update_time || row.create_time || '',
    pages: row.page_count || 0,
    category: row.category_id || ''
  };
}

/** 内容行 → 事件对象 */
function normalizeEvent(row) {
  if (!row) return {};
  return {
    id: row.id,
    year: row.year || 0,
    month: row.month || 0,
    day: row.day || 0,
    title: row.title || '',
    description: row.description || '',
    type: row.type || 'other',
    typeName: row.type_name || '',
    createTime: row.create_time || ''
  };
}

/** 后端时间字符串 → 'MM-DD HH:mm' 简写 */
function formatTime(time) {
  if (!time) return '';
  return String(time).replace('T', ' ').substring(5, 16);
}

module.exports = {
  resolveImageUrl,
  resolveImageUrls,
  normalizeFamily,
  generationNamesOf,
  normalizeMember,
  parseSpouseList,
  normalizeDynamic,
  normalizePhoto,
  normalizeDocument,
  normalizeEvent
};
