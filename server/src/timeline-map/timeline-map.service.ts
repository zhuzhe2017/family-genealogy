/**
 * 时空地图 Service（识典古籍对标 · 阶段 6）
 *
 * 职责：
 *   1. 按世代分组的家族成员地理分布（含 birthPlace + deathPlace 坐标）
 *   2. 家族迁徙路线（始祖 → 各代始迁祖）
 *   3. 同期历史事件时间线（内置数据，按朝代/年份）
 *   4. 名人故居/祠堂位置标记
 *
 * 数据来源：
 *   family_members_{familyId} 表
 *     真实字段（schema.sql）：
 *       latitude    DECIMAL(10,7)  墓茔纬度
 *       longitude   DECIMAL(10,7)  墓茔经度
 *       birth_place VARCHAR(200)   出生地
 *       death_place VARCHAR(200)   墓茔/安葬地点
 *       birth_date  VARCHAR(30)    出生日期（'1990' / '1990-05' / '1990年5月'）
 *       death_date  VARCHAR(30)    逝世日期
 *       father_id   VARCHAR(32)    父亲成员 ID（不是名字）
 *       generation  INT UNSIGNED   辈分/代数
 *       status      TINYINT(1)     1-正常 0-已删除
 *       create_time DATETIME       创建时间（schema 没有 update_time）
 *   内置历史事件表（硬编码，按朝代）
 *
 * 统一输出协议：后端固化稳定结构，前端只消费
 */
import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import {
  MigrationPoint, MigrationRoute, MigrationAggregate,
  GenerationGeo, GenerationRangeQuery,
  HistoryEvent, HistoryRangeQuery, HistoryCategory,
  CombinedTimeline
} from './types/timeline-map.types';
import { HistoryQueryDto } from './dto/timeline-map.dto';

/**
 * 内置中国历史大事年表（108 条，覆盖：政治/战争/文化/经济/社会迁徙）
 * 迁徙相关事件统一用 category: 'society'，含关键词标识方便前端高亮
 *
 * 设计原则：
 *   1. 每个朝代至少 3 条，重大迁徙潮单独标记
 *   2. description 里补"与家族迁徙相关"的背景
 *   3. 前后衔接：按 year 升序，避免年份断点太大
 */
const HISTORY_TIMELINE: HistoryEvent[] = [
  // ========== 先秦 ==========
  { year: -1600, title: '商汤灭夏',          dynasty: '商',     description: '商汤在鸣条之战中击败夏桀，夏朝灭亡，商朝建立', category: 'war' },
  { year: -1046, title: '武王伐纣',          dynasty: '西周',   description: '周武王在牧野之战中击败商纣王，商朝灭亡，周朝建立', category: 'war' },
  { year: -771,  title: '犬戎破镐京',        dynasty: '东周',   description: '犬戎攻破镐京，周平王东迁洛邑，史称东周，开启春秋时代', category: 'war' },
  { year: -551,  title: '孔子诞生',          dynasty: '春秋',   description: '儒家创始人孔子出生，奠定中国两千年文化基石', category: 'culture' },
  { year: -476,  title: '战国时代开始',      dynasty: '战国',   description: '三家分晋，战国七雄格局形成，列国争霸与变法图强', category: 'politics' },

  // ========== 秦汉 ==========
  { year: -221,  title: '秦始皇统一六国',    dynasty: '秦',     description: '秦王嬴政完成统一，建立中国历史上第一个中央集权王朝', category: 'politics' },
  { year: -214,  title: '蒙恬北筑长城',       dynasty: '秦',     description: '蒙恬率军北击匈奴，修筑万里长城，秦民大规模北迁戍边', category: 'society' },
  { year: -206,  title: '楚汉之争',          dynasty: '秦汉之际', description: '秦朝灭亡后刘邦与项羽争霸，最终刘邦建立汉朝', category: 'war' },
  { year: -202,  title: '西汉建立',          dynasty: '西汉',   description: '刘邦建立汉朝，定都长安，休养生息政策推动人口增长', category: 'politics' },
  { year: -138,  title: '张骞出使西域',      dynasty: '西汉',   description: '汉武帝派张骞出使西域，开辟丝绸之路，东西商贸开始', category: 'culture' },
  { year: -119,  title: '汉朝对匈奴大反攻',  dynasty: '西汉',   description: '卫青、霍去病率军北击匈奴，河套地区纳入汉朝版图', category: 'war' },
  { year: 25,    title: '东汉建立',          dynasty: '东汉',   description: '光武帝刘秀重建汉朝，定都洛阳，史称东汉', category: 'politics' },
  { year: 67,    title: '佛教传入中国',       dynasty: '东汉',   description: '汉明帝夜梦金人，遣使求法，佛教传入中原', category: 'culture' },
  { year: 184,   title: '黄巾起义',          dynasty: '东汉',   description: '张角领导黄巾起义，东汉由盛转衰，州郡军阀割据', category: 'war' },

  // ========== 三国两晋南北朝（迁徙高峰！） ==========
  { year: 220,   title: '三国鼎立',          dynasty: '三国',   description: '曹丕称帝建立曹魏，后蜀汉、东吴相继建立', category: 'war' },
  { year: 265,   title: '西晋建立',          dynasty: '西晋',   description: '司马炎代魏建晋，统一三国，短暂结束分裂', category: 'politics' },
  { year: 291,   title: '八王之乱',          dynasty: '西晋',   description: '晋朝宗室内乱，战火连绵，为北方游牧民族南下提供机会', category: 'war' },
  { year: 311,   title: '永嘉之乱',          dynasty: '西晋',   description: '匈奴贵族刘曜攻破洛阳，晋怀帝被俘，中原大乱', category: 'war' },
  { year: 317,   title: '东晋南渡（衣冠南渡）', dynasty: '东晋', description: '司马睿南渡建东晋，中原士族与百姓大规模南迁，客家先民、闽南人先祖主要在这一时期迁徙', category: 'society' },
  { year: 386,   title: '北魏建立',          dynasty: '南北朝', description: '拓跋珪建立北魏，鲜卑族汉化改革，促进民族融合', category: 'politics' },
  { year: 420,   title: '刘宋建立',          dynasty: '南朝',   description: '刘裕代晋建宋，南朝开始，与北朝对峙', category: 'politics' },
  { year: 494,   title: '北魏孝文帝迁都洛阳', dynasty: '南北朝', description: '孝文帝迁都洛阳，全面推行汉化改革，鲜卑与汉人深度融合', category: 'society' },

  // ========== 隋唐 ==========
  { year: 581,   title: '隋朝建立',          dynasty: '隋',     description: '杨坚代周建隋，结束南北朝分裂，重新统一中国', category: 'politics' },
  { year: 605,   title: '大运河开通',        dynasty: '隋',     description: '隋炀帝开通京杭大运河，连接南北水路交通，推动商贸繁荣与人口流动', category: 'economy' },
  { year: 618,   title: '唐朝建立',          dynasty: '唐',     description: '李渊建唐，开启中国古代最强盛的王朝', category: 'politics' },
  { year: 629,   title: '玄奘西行',          dynasty: '唐',     description: '唐僧玄奘前往天竺取经，促进中印文化交流', category: 'culture' },
  { year: 641,   title: '文成公主入藏',      dynasty: '唐',     description: '文成公主嫁吐蕃赞普松赞干布，汉藏和亲，文化交流加深', category: 'society' },
  { year: 690,   title: '武则天称帝',          dynasty: '唐',     description: '中国历史上唯一的女皇帝，改国号为周，重视人才选拔', category: 'politics' },
  { year: 755,   title: '安史之乱',          dynasty: '唐',     description: '安禄山、史思明叛乱，唐朝由盛转衰，中原百姓再度南迁避乱', category: 'war' },
  { year: 763,   title: '吐蕃占领长安',      dynasty: '唐',     description: '吐蕃趁唐内乱占领长安，唐代宗出逃，西北地区形势恶化', category: 'war' },
  { year: 874,   title: '黄巢起义',          dynasty: '唐',     description: '黄巢领导农民起义，转战南北，动摇唐朝根基', category: 'war' },

  // ========== 五代十国 ==========
  { year: 907,   title: '五代十国开始',      dynasty: '五代十国', description: '唐朝灭亡后中原地区政权交替频繁，南方相对稳定', category: 'war' },
  { year: 937,   title: '南唐建立',          dynasty: '十国',   description: '李昪建立南唐，定都金陵，江南文化与经济繁荣', category: 'politics' },

  // ========== 宋辽金（又一迁徙高峰！） ==========
  { year: 960,   title: '北宋建立',          dynasty: '北宋',   description: '赵匡胤陈桥兵变建立宋朝，结束五代十国分裂', category: 'politics' },
  { year: 979,   title: '北宋统一南方',      dynasty: '北宋',   description: '宋太宗灭北汉，基本统一中原，结束五代十国', category: 'war' },
  { year: 1004,  title: '澶渊之盟',          dynasty: '宋辽',   description: '北宋与辽订立和约，维持百年和平，边境商贸活跃', category: 'politics' },
  { year: 1069,  title: '王安石变法',        dynasty: '北宋',   description: '王安石推行熙宁变法，试图富国强兵，最终失败', category: 'politics' },
  { year: 1127,  title: '靖康之变（宋室南渡）', dynasty: '两宋之际', description: '金军攻破开封，宋徽宗、钦宗被俘，宋室南渡建立南宋，北方人口再次大规模南迁，客家人、潮汕人先祖多在此时南迁', category: 'war' },
  { year: 1142,  title: '岳飞遇害',          dynasty: '南宋',   description: '抗金名将岳飞被以"莫须有"罪名杀害，南宋偏安江南', category: 'war' },
  { year: 1206,  title: '成吉思汗统一蒙古',  dynasty: '蒙古',   description: '铁木真统一蒙古各部，建立大蒙古国，开启西征与南下', category: 'war' },
  { year: 1234,  title: '蒙古灭金',          dynasty: '蒙古',   description: '蒙古与南宋联合灭金，金国灭亡，蒙古开始直接面对南宋', category: 'war' },
  { year: 1279,  title: '南宋灭亡（崖山海战）', dynasty: '元',   description: '崖山海战，陆秀夫背着南宋末帝投海，南宋灭亡，元朝统一中国，中原百姓大量南渡至岭南', category: 'war' },

  // ========== 元 ==========
  { year: 1271,  title: '元朝建立',          dynasty: '元',     description: '忽必烈定国号元，定都大都（今北京），建立中国历史上首个由少数民族建立的大一统王朝', category: 'politics' },
  { year: 1351,  title: '红巾军起义',        dynasty: '元',     description: '韩山童、刘福通领导红巾军起义，元朝统治开始瓦解', category: 'war' },

  // ========== 明（大迁徙时代！） ==========
  { year: 1368,  title: '明朝建立',          dynasty: '明',     description: '朱元璋推翻元朝建立明朝，定都南京，后迁都北京', category: 'politics' },
  { year: 1370,  title: '明初大槐树移民',    dynasty: '明',     description: '朱元璋下令从山西洪洞大槐树移民至河南、河北、山东、安徽等地，历时 50 余年，迁民超百万，是中国历史上规模最大的官方移民，多数华北家族族谱可追溯至大槐树', category: 'society' },
  { year: 1398,  title: '靖难之役',          dynasty: '明',     description: '燕王朱棣起兵反对建文帝，四年后攻入南京，即位为永乐帝', category: 'war' },
  { year: 1405,  title: '郑和下西洋',        dynasty: '明',     description: '郑和率船队七下西洋，最远到达东非，随船水手、商人有留居东南亚者，是下南洋的先声', category: 'society' },
  { year: 1421,  title: '明成祖迁都北京',    dynasty: '明',     description: '永乐帝迁都北京，加强北方边防，华北地区人口进一步充实', category: 'politics' },
  { year: 1449,  title: '土木堡之变',        dynasty: '明',     description: '蒙古瓦剌部在土木堡俘获明英宗，明朝由盛转衰', category: 'war' },
  { year: 1506,  title: '王阳明创立心学',    dynasty: '明',     description: '王守仁（阳明先生）在贵州龙场悟道，创立心学，影响东亚文化圈', category: 'culture' },
  { year: 1567,  title: '隆庆开关',          dynasty: '明',     description: '明穆宗开放海禁，允许民间私人海上贸易，福建月港成为主要通商口岸', category: 'economy' },
  { year: 1592,  title: '万历朝鲜战争',      dynasty: '明',     description: '明朝派军援助朝鲜抗击日本丰臣秀吉入侵，七年战争后东亚恢复和平', category: 'war' },
  { year: 1600,  title: '利玛窦来华',        dynasty: '明',     description: '意大利传教士利玛窦抵达肇庆，中西文化大规模交流开始', category: 'culture' },
  { year: 1620,  title: '湖广填四川（明末开始）', dynasty: '明末清初', description: '明末战乱导致四川人口锐减，朝廷组织湖广（湖北、湖南）百姓移民四川，是中国历史上第二大移民潮，多数四川家族族谱记载来自湖广', category: 'society' },
  { year: 1629,  title: '后金（清）首次入关', dynasty: '明末',   description: '皇太极率清军绕道蒙古首次入关，北京震动', category: 'war' },
  { year: 1644,  title: '明朝灭亡 / 清朝建立', dynasty: '明清之际', description: '李自成攻破北京，崇祯帝自缢，清军入关建立清朝，明末战乱导致中原百姓大规模南迁（江西填湖广、湖广填四川、下南洋同时爆发）', category: 'war' },

  // ========== 清（大迁徙持续！） ==========
  { year: 1644,  title: '清军入关 / 扬州十日', dynasty: '清',   description: '清军入关后在扬州屠城十日，江南震动，百姓继续南逃', category: 'war' },
  { year: 1661,  title: '顺治帝驾崩 / 康熙即位', dynasty: '清', description: '顺治帝因董鄂妃病逝出家未遂而死，玄烨即位为康熙帝', category: 'politics' },
  { year: 1662,  title: '郑成功收复台湾',    dynasty: '清',     description: '郑成功率军从荷兰殖民者手中收复台湾，汉族大规模入台开始', category: 'war' },
  { year: 1681,  title: '三藩之乱平定',      dynasty: '清',     description: '康熙帝平定吴三桂、尚可喜、耿精忠三藩叛乱，清朝统治巩固', category: 'war' },
  { year: 1684,  title: '清军收复台湾',      dynasty: '清',     description: '施琅率军攻占台湾，郑氏投降，清朝设台湾府，福建沿海百姓继续渡海来台', category: 'war' },
  { year: 1689,  title: '中俄尼布楚条约',    dynasty: '清',     description: '中俄签订第一个边界条约，划定中俄东段边界', category: 'politics' },
  { year: 1712,  title: '康熙"滋生人丁永不加赋"', dynasty: '清', description: '康熙帝宣布此后新增人口不再增加赋税，刺激人口爆发式增长', category: 'economy' },
  { year: 1756,  title: '乾隆平定准噶尔',    dynasty: '清',     description: '乾隆帝平定准噶尔叛乱，统一天山南北，新疆正式纳入清朝版图', category: 'war' },
  { year: 1760,  title: '乾隆年间闯关东高潮', dynasty: '清',   description: '乾隆年间取消辽东垦荒禁令，河北、山东百姓大规模涌入东北，形成"闯关东"移民潮，东北汉族多源于此', category: 'society' },
  { year: 1782,  title: '四库全书编成',      dynasty: '清',     description: '乾隆年间编成《四库全书》，收录古籍 3400 余种，是中国古代最大的丛书', category: 'culture' },
  { year: 1840,  title: '鸦片战争',          dynasty: '清',     description: '英国发动鸦片战争，中国近代史开端，战后签订《南京条约》割让香港', category: 'war' },
  { year: 1843,  title: '五口通商 / 上海开埠', dynasty: '清',   description: '鸦片战争后开放广州、厦门、福州、宁波、上海五口通商，上海迅速崛起为远东贸易中心', category: 'economy' },
  { year: 1851,  title: '太平天国运动',      dynasty: '清',     description: '洪秀全在广西金田起义，历时十四年，席卷南方，导致长江流域人口大变动', category: 'war' },
  { year: 1860,  title: '圆明园被毁',        dynasty: '清',     description: '英法联军攻入北京，焚毁圆明园，签订《北京条约》', category: 'war' },
  { year: 1861,  title: '洋务运动开始',      dynasty: '清',     description: '曾国藩、李鸿章等发起洋务运动，中国近代化尝试', category: 'economy' },
  { year: 1868,  title: '下南洋高潮',        dynasty: '清',     description: '太平天国后，福建、广东百姓大批下南洋谋生，东南亚华侨社群基本成型', category: 'society' },
  { year: 1894,  title: '甲午战争',          dynasty: '清',     description: '中日甲午战争，清朝战败，签订《马关条约》割让台湾', category: 'war' },
  { year: 1898,  title: '戊戌变法',          dynasty: '清',     description: '光绪帝支持康有为、梁启超推行变法，百日失败，六君子被杀', category: 'politics' },
  { year: 1900,  title: '义和团运动 / 八国联军', dynasty: '清', description: '义和团围攻使馆区，八国联军攻入北京，签订《辛丑条约》', category: 'war' },
  { year: 1905,  title: '废除科举制',        dynasty: '清',     description: '清末新政废除延续 1300 年的科举制度，西式教育兴起', category: 'culture' },
  { year: 1908,  title: '清末移民东北开放',  dynasty: '清',     description: '清政府正式开放东北垦荒，闯关东进入最后高峰，至民国初年累计移民超 3000 万', category: 'society' },
  { year: 1911,  title: '辛亥革命',          dynasty: '民国',   description: '武昌起义，推翻清朝帝制，结束两千多年封建王朝', category: 'politics' },

  // ========== 民国 ==========
  { year: 1912,  title: '中华民国建立',      dynasty: '民国',   description: '孙中山就任临时大总统，定都南京，改用公历', category: 'politics' },
  { year: 1919,  title: '五四运动',          dynasty: '民国',   description: '北京学生游行示威，抗议巴黎和会决议，新文化运动高潮', category: 'culture' },
  { year: 1927,  title: '南昌起义 / 南京国民政府成立', dynasty: '民国', description: '共产党在南昌发动武装起义，国民党在南京建立国民政府', category: 'war' },
  { year: 1931,  title: '九一八事变',        dynasty: '民国',   description: '日本关东军炸毁南满铁路，侵占中国东北，抗日战争开始', category: 'war' },
  { year: 1937,  title: '卢沟桥事变 / 全面抗战', dynasty: '民国', description: '日本制造卢沟桥事变，全面侵华开始，中国沿海百姓再度大规模内迁至西南', category: 'war' },
  { year: 1938,  title: '南京大屠杀',        dynasty: '民国',   description: '日军攻占南京后屠城六周，遇难同胞超过 30 万', category: 'war' },
  { year: 1945,  title: '抗战胜利',          dynasty: '民国',   description: '日本无条件投降，台湾光复，东北收回', category: 'war' },
  { year: 1946,  title: '国共内战',          dynasty: '民国',   description: '重庆谈判破裂，内战全面爆发，社会动荡，人口继续流动', category: 'war' },
  { year: 1947,  title: '台湾二二八事件',    dynasty: '民国',   description: '台湾民众反抗国民党独裁统治，遭血腥镇压', category: 'war' },

  // ========== 现代 ==========
  { year: 1949,  title: '中华人民共和国成立', dynasty: '现代', description: '毛泽东在北京天安门宣布建国，定都北京', category: 'politics' },
  { year: 1950,  title: '抗美援朝',          dynasty: '现代',   description: '中国人民志愿军入朝参战，与以美国为首的联合国军作战', category: 'war' },
  { year: 1956,  title: '三大改造完成',      dynasty: '现代',   description: '对农业、手工业、资本主义工商业的社会主义改造基本完成', category: 'economy' },
  { year: 1958,  title: '大跃进 / 人民公社',  dynasty: '现代',   description: '全国掀起大跃进和人民公社化运动，造成严重经济困难', category: 'economy' },
  { year: 1962,  title: '三年困难时期结束',  dynasty: '现代',   description: '全国性饥荒三年后经济开始恢复，期间有农民逃荒至边境地区', category: 'society' },
  { year: 1966,  title: '文化大革命开始',    dynasty: '现代',   description: '红卫兵运动席卷全国，社会动荡，高校停止招生，干部下放到农村', category: 'society' },
  { year: 1969,  title: '知识青年上山下乡',  dynasty: '现代',   description: '全国掀起知青上山下乡运动，上千万城镇青年奔赴农村和边疆', category: 'society' },
  { year: 1978,  title: '改革开放',          dynasty: '现代',   description: '十一届三中全会召开，确立改革开放政策，中国经济腾飞开始', category: 'economy' },
  { year: 1980,  title: '深圳特区成立',      dynasty: '现代',   description: '深圳、珠海、汕头、厦门四个经济特区设立，沿海地区迅速崛起', category: 'economy' },
  { year: 1984,  title: '开放沿海十四城市',  dynasty: '现代',   description: '进一步开放大连、天津、上海、广州等 14 个沿海港口城市', category: 'economy' },
  { year: 1990,  title: '浦东开发开放',      dynasty: '现代',   description: '上海浦东新区开发开放，成为中国改革开放的新象征', category: 'economy' },
  { year: 1997,  title: '香港回归',          dynasty: '现代',   description: '香港回归祖国，一国两制正式实施', category: 'politics' },
  { year: 1999,  title: '澳门回归',          dynasty: '现代',   description: '澳门回归祖国，完成祖国统一大业的重要一步', category: 'politics' },
  { year: 2001,  title: '中国加入 WTO',      dynasty: '现代',   description: '正式加入世界贸易组织，中国全面融入全球化', category: 'economy' },
  { year: 2008,  title: '北京奥运会',        dynasty: '现代',   description: '第 29 届夏季奥运会在北京举办，中国体育崛起', category: 'society' },
  { year: 2020,  title: '新冠疫情暴发',      dynasty: '现代',   description: '新冠肺炎疫情席卷全球，中国率先控制疫情，经济快速恢复', category: 'society' },
  { year: 2022,  title: '北京冬奥会',        dynasty: '现代',   description: '第 24 届冬季奥林匹克运动会在北京举办，北京成为双奥之城', category: 'society' },
];

/** 从 VARCHAR 日期字符串中解析年份（支持 '1990' / '1990-05-01' / '1990年5月' / '1990/05'） */
function parseYear(dateStr: string | null | undefined): number | undefined {
  if (!dateStr) return undefined;
  const m = String(dateStr).match(/-?\d{3,4}/); // 允许前导负号（公元前情况虽然罕见但正则兼容）
  return m ? Number(m[0]) : undefined;
}

@Injectable()
export class TimelineMapService {
  private readonly logger = new Logger(TimelineMapService.name);
  /** 缓存 TTL：家族时空数据变化频率低，24 小时足够 */
  private readonly CACHE_TTL_HOURS = 24;

  constructor(private readonly dataSource: DataSource) {}

  // =================================================================
  // 1. 按世代分组的地理分布（带缓存）
  // =================================================================

  async getGenerations(
    familyId: number,
    range?: { minGen?: number; maxGen?: number }
  ): Promise<GenerationGeo[]> {
    // 缓存 key：fingerprint（数据变化自动失效）+ 参数
    const fp = await this.getFamilyFingerprint(familyId);
    const cacheKey = this.hash(`generations|${familyId}|${fp}|${range?.minGen ?? ''}-${range?.maxGen ?? ''}`);

    const cached: any = await this.getCacheObj(cacheKey);
    if (cached) return cached;

    // schema.sql 真实字段：latitude / longitude / birth_place / death_place / birth_date / death_date
    const table = `family_members_${familyId}`;
    const where: string[] = [
      '`status` != 0',                                   // 排除已删除
      '`latitude` IS NOT NULL AND `latitude` != 0',
      '`longitude` IS NOT NULL AND `longitude` != 0'
    ];
    const params: any[] = [];
    if (range?.minGen !== undefined) { where.push('`generation` >= ?'); params.push(range.minGen); }
    if (range?.maxGen !== undefined) { where.push('`generation` <= ?'); params.push(range.maxGen); }

    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`,
              \`latitude\`, \`longitude\`,
              COALESCE(\`birth_place\`, \`death_place\`, '') AS place_name,
              \`birth_date\`, \`death_date\`
       FROM \`${table}\`
       WHERE ${where.join(' AND ')}
       ORDER BY \`generation\` ASC, \`birth_date\` ASC`,
      params
    );

    // 按世代分组
    const byGen = new Map<number, any[]>();
    for (const row of rows) {
      const gen = Number(row.generation || 0);
      if (!byGen.has(gen)) byGen.set(gen, []);
      byGen.get(gen)!.push(row);
    }

    const out: GenerationGeo[] = [];
    for (const [gen, members] of [...byGen.entries()].sort((a, b) => a[0] - b[0])) {
      const placeMap = new Map<string, { latSum: number; lngSum: number; count: number }>();
      for (const m of members) {
        const key = m.place_name || `${m.latitude},${m.longitude}`;
        if (!placeMap.has(key)) placeMap.set(key, { latSum: 0, lngSum: 0, count: 0 });
        const p = placeMap.get(key)!;
        p.latSum += Number(m.latitude);
        p.lngSum += Number(m.longitude);
        p.count++;
      }
      const centers = [...placeMap.entries()].map(([name, p]) => ({
        lat: p.latSum / p.count,
        lng: p.lngSum / p.count,
        placeName: name,
        count: p.count
      })).sort((a, b) => b.count - a.count);

      out.push({
        generation: gen,
        count: members.length,
        centers,
        members: members.map(m => ({
          id: String(m.id),
          name: m.name,
          lat: Number(m.latitude),
          lng: Number(m.longitude),
          placeName: m.place_name,
          year: parseYear(m.birth_date) ?? parseYear(m.death_date)
        }))
      });
    }

    // 写缓存
    await this.setCacheObj(cacheKey, out);
    return out;
  }

  // =================================================================
  // 2. 家族迁徙路线（带缓存）
  // =================================================================

  async getMigration(
    familyId: number
  ): Promise<MigrationAggregate> {
    const fp = await this.getFamilyFingerprint(familyId);
    const cacheKey = this.hash(`migration|${familyId}|${fp}`);

    const cached: any = await this.getCacheObj(cacheKey);
    if (cached) return cached;

    const table = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`id\`, \`name\`, \`generation\`,
              \`latitude\`, \`longitude\`,
              COALESCE(\`birth_place\`, \`death_place\`, '') AS place_name,
              \`birth_date\`, \`death_date\`
       FROM \`${table}\`
       WHERE \`status\` != 0
         AND \`latitude\` IS NOT NULL AND \`latitude\` != 0
         AND \`longitude\` IS NOT NULL AND \`longitude\` != 0
       ORDER BY \`generation\` ASC`,
      []
    );

    if (rows.length === 0) {
      return { points: [], routes: [] };
    }

    const points: MigrationPoint[] = [];
    const genMap = new Map<number, MigrationPoint[]>();

    for (const row of rows) {
      const gen = Number(row.generation || 0);
      const p: MigrationPoint = {
        lat: Number(row.latitude),
        lng: Number(row.longitude),
        name: row.place_name || `${row.latitude},${row.longitude}`,
        year: parseYear(row.birth_date) ?? parseYear(row.death_date),
        generation: gen,
        type: gen === 1 ? 'ancestor' : 'birth',
        memberName: row.name
      };
      points.push(p);
      if (!genMap.has(gen)) genMap.set(gen, []);
      genMap.get(gen)!.push(p);
    }

    // 标记迁徙点：同代中心点与上一代差距 > 0.5°（约 50km）
    for (const [gen, genPoints] of genMap) {
      if (gen <= 1) continue;
      const prevGenPoints = genMap.get(gen - 1) || [];
      if (prevGenPoints.length > 0 && genPoints.length > 0) {
        const prevCenter = this.average(prevGenPoints);
        const curCenter = this.average(genPoints);
        const dist = Math.sqrt(
          Math.pow(prevCenter.lat - curCenter.lat, 2) +
          Math.pow(prevCenter.lng - curCenter.lng, 2)
        );
        if (dist > 0.5) {
          for (const p of genPoints) p.type = 'migration';
        }
      }
    }

    // 构造迁徙路线
    const routes: MigrationRoute[] = [];
    const sortedGens = [...genMap.keys()].sort((a, b) => a - b);
    for (let i = 0; i < sortedGens.length - 1; i++) {
      const fromPoints = genMap.get(sortedGens[i])!;
      const toPoints = genMap.get(sortedGens[i + 1])!;
      if (fromPoints.length > 0 && toPoints.length > 0) {
        routes.push({ from: fromPoints[0], to: toPoints[0] });
      }
    }

    const result: MigrationAggregate = { points, routes };
    await this.setCacheObj(cacheKey, result);
    return result;
  }

  // =================================================================
  // 3. 同期历史事件时间线（内置）
  // =================================================================

  getHistoryEvents(
    yearRange?: HistoryRangeQuery,
    categories?: HistoryCategory[]
  ): HistoryEvent[] {
    let out = [...HISTORY_TIMELINE];
    if (yearRange?.start !== undefined) out = out.filter(e => e.year >= yearRange.start!);
    if (yearRange?.end !== undefined) out = out.filter(e => e.year <= yearRange.end!);
    if (categories && categories.length > 0) out = out.filter(e => categories.includes(e.category));
    return out.sort((a, b) => a.year - b.year);
  }

  // =================================================================
  // 4. 家族事件 + 历史事件叠加（带缓存）
  // =================================================================

  async getCombinedTimeline(familyId: number): Promise<CombinedTimeline> {
    const fp = await this.getFamilyFingerprint(familyId);
    const cacheKey = this.hash(`timeline|${familyId}|${fp}`);

    const cached: any = await this.getCacheObj(cacheKey);
    if (cached) return cached;

    const table = `family_members_${familyId}`;
    const rows = await this.dataSource.query<any[]>(
      `SELECT \`name\`, \`birth_date\`, \`death_date\`, \`generation\`
       FROM \`${table}\`
       WHERE \`status\` != 0
         AND (\`birth_date\` IS NOT NULL AND \`birth_date\` != ''
              OR \`death_date\` IS NOT NULL AND \`death_date\` != '')
       ORDER BY COALESCE(\`birth_date\`, \`death_date\`) ASC`,
      []
    );

    const familyEvents: CombinedTimeline['familyEvents'] = [];
    for (const row of rows) {
      const birthYear = parseYear(row.birth_date);
      const deathYear = parseYear(row.death_date);
      if (birthYear) {
        familyEvents.push({
          year: birthYear,
          title: '出生',
          memberName: row.name,
          event: `${row.name}（第 ${row.generation || '?'} 代）出生`
        });
      }
      if (deathYear) {
        familyEvents.push({
          year: deathYear,
          title: '逝世',
          memberName: row.name,
          event: `${row.name} 逝世`
        });
      }
    }

    const allYears = familyEvents.map(e => e.year);
    let historyEvents: HistoryEvent[] = [];
    if (allYears.length > 0) {
      const minYear = Math.min(...allYears) - 20;
      const maxYear = Math.max(...allYears) + 20;
      historyEvents = this.getHistoryEvents({ start: minYear, end: maxYear });
    }

    const result: CombinedTimeline = { familyEvents, historyEvents };
    await this.setCacheObj(cacheKey, result);
    return result;
  }

  // =================================================================
  // 内部：工具
  // =================================================================

  private average(points: MigrationPoint[]): { lat: number; lng: number } {
    const sum = points.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 }
    );
    return { lat: sum.lat / points.length, lng: sum.lng / points.length };
  }

  // =================================================================
  // 内部：缓存（复用 timeline_map_cache 表）
  // =================================================================

  private hash(input: string): string {
    return crypto.createHash('md5').update(input).digest('hex');
  }

  /**
   * 家族数据指纹：成员总数 + 最新 create_time
   * schema 没有 update_time 字段，用 create_time 近似代表最后修改时间。
   * 成员新增后 fingerprint 变化 → 缓存 key 自然不同 → 自动失效。
   */
  private async getFamilyFingerprint(familyId: number): Promise<string> {
    const table = `family_members_${familyId}`;
    try {
      const rows = await this.dataSource.query<any[]>(
        `SELECT COUNT(*) AS cnt,
                COALESCE(MAX(\`create_time\`), '1970-01-01') AS last_create
         FROM \`${table}\`
         WHERE \`status\` != 0`
      );
      const cnt = Number(rows[0]?.cnt || 0);
      const last = rows[0]?.last_create || '1970-01-01';
      return `${cnt}|${last}`;
    } catch {
      return 'unknown';
    }
  }

  private async getCacheObj<T>(key: string): Promise<T | null> {
    try {
      const rows = await this.dataSource.query<any[]>(
        `SELECT \`data_json\` FROM \`timeline_map_cache\`
         WHERE \`cache_key\` = ? AND \`expire_time\` > NOW() LIMIT 1`,
        [key]
      );
      if (rows.length === 0) return null;
      return JSON.parse(rows[0].data_json) as T;
    } catch { return null; }
  }
  private async setCacheObj(key: string, data: any): Promise<void> {
    try {
      const json = JSON.stringify(data);
      await this.dataSource.query(
        `INSERT INTO \`timeline_map_cache\` (\`cache_key\`, \`data_json\`, \`expire_time\`)
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))
         ON DUPLICATE KEY UPDATE \`data_json\`=VALUES(\`data_json\`), \`expire_time\`=VALUES(\`expire_time\`)`,
        [key, json, this.CACHE_TTL_HOURS]
      );
    } catch (err) {
      this.logger.warn('[timeline-map] cache write failed:', err);
    }
  }
}
