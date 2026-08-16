/**
 * 一次性脚本：生成小程序演示数据（张氏家族 5 代）
 * 流程：模拟微信登录 → 创建家族 → 添加成员(建立父子关系) → 发布动态/事件/相册
 * 幂等：家族已存在则跳过成员/内容创建
 */
const mysql = require('mysql2/promise');

const API = 'http://localhost:3000/api';
const CODE = 'demo_user_001';
const UPLOAD = 'http://localhost:3000/uploads';
const IMAGES = [
  `${UPLOAD}/1786521544391-4abkc3p1.jpg`,
  `${UPLOAD}/1786521568526-86dfbgz6.jpg`,
  `${UPLOAD}/1786605139385-7yy42ari.png`,
  `${UPLOAD}/1786689085528-7ru6j83g.jpg`,
  `${UPLOAD}/1786689379891-n9zo25pb.jpg`
];

let token = '';
let familyId = 0;

async function api(method, path, body, needAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (needAuth && token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!res.ok || data.code !== '0000') {
    throw new Error(`${method} ${path} 失败: HTTP ${res.status} ${JSON.stringify(data)}`);
  }
  return data.data;
}

async function main() {
  // 1. 微信登录（开发模式模拟 openid）
  const login = await api('POST', '/user/wx-login', { code: CODE }, false);
  token = login.token;
  console.log('[1/7] 微信登录成功, userId =', login.user?.id || login.id);

  // 2. 确保姓氏存在（管理端数据）
  const conn = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: 'root', password: 'root', database: 'family_genealogy'
  });
  const [surnames] = await conn.query("SELECT id FROM surname WHERE surname = '张'");
  let surnameId = surnames[0]?.id;
  if (!surnameId) {
    const [r] = await conn.query(
      "INSERT INTO surname (surname, pinyin, initial, ranking, origin, description, status) VALUES ('张','zhang','Z',3,'起源于姬姓，始祖挥公。','张姓为中华大姓之一，人口众多。',1)"
    );
    surnameId = r.insertId;
  }
  console.log('[2/7] 姓氏就绪, surnameId =', surnameId);

  // 3. 创建家族（已存在则复用）
  let families = await api('GET', '/user/family/all');
  let family = families.find((f) => f.name === '张氏宗族');
  if (family) {
    familyId = Number(family.id);
    console.log('[3/7] 家族已存在, familyId =', familyId);
  } else {
    const created = await api('POST', '/user/family/create', {
      surnameId,
      name: '张氏宗族',
      founder: '张伯言',
      origin: '浙江绍兴',
      description: '张氏一脉自明末迁居绍兴，耕读传家，至今五代。',
      isPublic: 1,
      allowJoin: 1
    });
    familyId = Number(created.id);
    console.log('[3/7] 家族创建成功, familyId =', familyId);
  }

  // 4. 添加成员（父子关系链，父先于子创建）
  const memberDefs = [
    { name: '张伯言', gender: 'male', generation: 1, generationName: '伯', birthDate: '1880-03-15', birthPlace: '浙江绍兴', isAlive: 0, deathDate: '1955-07-20', deathPlace: '浙江绍兴', bio: '一世祖，明末清初迁居绍兴，开基立业。', sortOrder: 1 },
    { name: '张仲德', gender: 'male', generation: 2, generationName: '仲', birthDate: '1905-09-10', birthPlace: '浙江绍兴', isAlive: 0, deathDate: '1978-12-03', deathPlace: '浙江绍兴', bio: '二世长子，继承家业，兴修族谱。', fatherId: null, sortOrder: 1 },
    { name: '张叔和', gender: 'male', generation: 2, generationName: '叔', birthDate: '1908-05-20', birthPlace: '浙江绍兴', isAlive: 0, deathDate: '1985-02-14', deathPlace: '浙江杭州', bio: '二世次子，经商起家。', fatherId: null, sortOrder: 2 },
    { name: '张文远', gender: 'male', generation: 3, generationName: '文', birthDate: '1935-06-01', birthPlace: '浙江绍兴', isAlive: 1, bio: '三世长孙，从事教育工作。', fatherId: null, sortOrder: 1 },
    { name: '张秀英', gender: 'female', generation: 3, generationName: '文', birthDate: '1938-02-11', birthPlace: '浙江绍兴', isAlive: 1, bio: '三世长女。', fatherId: null, sortOrder: 2 },
    { name: '张建国', gender: 'male', generation: 3, generationName: '文', birthDate: '1965-04-10', birthPlace: '浙江杭州', isAlive: 1, bio: '三世次孙，工程师。', fatherId: null, sortOrder: 3 },
    { name: '张伟民', gender: 'male', generation: 4, generationName: '德', birthDate: '1968-08-22', birthPlace: '浙江杭州', isAlive: 1, bio: '四世长孙。', fatherId: null, sortOrder: 1 },
    { name: '张丽华', gender: 'female', generation: 4, generationName: '德', birthDate: '1972-01-05', birthPlace: '浙江杭州', isAlive: 1, bio: '四世长女，医生。', fatherId: null, sortOrder: 2 },
    { name: '张思远', gender: 'male', generation: 5, generationName: '世', birthDate: '2000-09-18', birthPlace: '浙江杭州', isAlive: 1, bio: '五世长孙，大学生。', fatherId: null, sortOrder: 1 },
    { name: '张思源', gender: 'female', generation: 5, generationName: '世', birthDate: '2003-12-28', birthPlace: '浙江杭州', isAlive: 1, bio: '五世长女，高中生。', fatherId: null, sortOrder: 2 }
  ];
  // father 映射：伯言→[仲德,叔和]，仲德→[文远,秀英]，叔和→[建国]，建国→[伟民]，文远→[丽华]，伟民→[思远,思源]
  const fatherOf = { 张仲德: '张伯言', 张叔和: '张伯言', 张文远: '张仲德', 张秀英: '张仲德', 张建国: '张叔和', 张伟民: '张建国', 张丽华: '张文远', 张思远: '张伟民', 张思源: '张伟民' };

  const members = await api('GET', `/user/family/${familyId}/members`);
  if (members.length > 0) {
    console.log('[4/7] 成员已存在, 跳过创建 (', members.length, '人 )');
  } else {
    const idMap = {};
    for (const m of memberDefs) {
      const payload = { ...m };
      const f = fatherOf[m.name];
      if (f && idMap[f]) payload.fatherId = idMap[f];
      if (payload.fatherId === undefined) delete payload.fatherId;
      const created = await api('POST', `/user/family/${familyId}/members`, payload);
      idMap[m.name] = created.id;
    }
    console.log('[4/7] 成员创建成功, 共 10 人');
  }

  // 5. 发布动态
  let list = await api('GET', `/user/content/dynamic/list?familyId=${familyId}&page=1&pageSize=3`);
  if ((list.list || []).length > 0) {
    console.log('[5/7] 动态已存在, 跳过创建');
  } else {
    const dynamics = [
      { familyId, content: '清明时节，家族成员齐聚绍兴祭祖，缅怀先祖张伯言公。', images: [IMAGES[0], IMAGES[1]] },
      { familyId, content: '整理家族老照片，翻到祖父辈的珍贵合影，仿佛时光倒流。', images: [IMAGES[2]] },
      { familyId, content: '恭喜家族晚辈张思远同学金榜题名！为家族争光！', images: [] }
    ];
    for (const d of dynamics) {
      await api('POST', '/user/content/dynamic/create', d);
    }
    console.log('[5/7] 动态发布成功, 共 3 条');
  }

  // 6. 创建事件
  list = await api('GET', `/user/content/event/list?familyId=${familyId}&page=1&pageSize=3`);
  if ((list.list || []).length > 0) {
    console.log('[6/7] 事件已存在, 跳过创建');
  } else {
    const all = await api('GET', `/user/family/${familyId}/members`);
    const byName = Object.fromEntries(all.map((m) => [m.name, m]));
    const events = [
      { familyId, year: 1880, month: 3, day: 15, title: '张伯言出生', description: '始祖张伯言公出生于浙江绍兴。', type: 'birth', typeName: '出生', relatedMembers: [{ id: byName['张伯言'].id, name: '张伯言', gender: 'male', relation: '本人' }] },
      { familyId, year: 1955, month: 7, day: 20, title: '张伯言逝世', description: '始祖张伯言公仙逝，享年七十五岁。', type: 'death', typeName: '逝世', relatedMembers: [{ id: byName['张伯言'].id, name: '张伯言', gender: 'male', relation: '本人' }] },
      { familyId, year: 2024, month: 4, day: 4, title: '清明祭祖大典', description: '家族三十余人齐聚绍兴祖宅举行祭祖仪式。', type: 'other', typeName: '其他', relatedMembers: [{ id: byName['张建国'].id, name: '张建国', gender: 'male', relation: '主祭人' }] }
    ];
    for (const e of events) {
      await api('POST', '/user/content/event/create', e);
    }
    console.log('[6/7] 事件创建成功, 共 3 条');
  }

  // 7. 创建相册照片
  list = await api('GET', `/user/content/photo/list?familyId=${familyId}&page=1&pageSize=5`);
  if ((list.list || []).length > 0) {
    console.log('[7/7] 相册已存在, 跳过创建');
  } else {
    const photos = [
      { familyId, url: IMAGES[3], title: '祖宅合影', description: '1980年清明家族合影', year: '1980' },
      { familyId, url: IMAGES[4], title: '祭祖仪式', description: '2024年清明祭祖', year: '2024' },
      { familyId, url: IMAGES[0], title: '老宅一角', description: '祖宅修缮前留影', year: '1975' }
    ];
    for (const p of photos) {
      await api('POST', '/user/content/photo/create', p);
    }
    console.log('[7/7] 相册照片创建成功, 共 3 张');
  }

  // 汇总验证
  const fam = await api('GET', `/user/family/${familyId}`);
  const allMembers = await api('GET', `/user/family/${familyId}/members`);
  const dyn = await api('GET', `/user/content/dynamic/list?familyId=${familyId}&page=1&pageSize=10`);
  const evt = await api('GET', `/user/content/event/list?familyId=${familyId}&page=1&pageSize=10`);
  const pho = await api('GET', `/user/content/photo/list?familyId=${familyId}&page=1&pageSize=10`);
  console.log('\n===== 演示数据汇总 =====');
  console.log('家族:', fam.name, '| 始祖:', fam.founder, '| 成员数:', fam.member_count, '| 代数:', fam.gen_count);
  console.log('成员列表(实时):', allMembers.length, '人');
  console.log('动态:', (dyn.list || []).length, '条 | 事件:', (evt.list || []).length, '条 | 照片:', (pho.list || []).length, '张');
  console.log('小程序演示账号: wx.login code =', CODE, '(开发模式模拟登录)');

  await conn.end();
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
