import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { AppModule } from '../src/app.module';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/**
 * 会员家族关联功能集成测试（真实数据库）
 * 覆盖：支系归属/成员绑定/分享码/编辑权限（功能、权限、边界）
 *
 * 关键权限模型：
 * - 家族创建者：全权（新增/编辑成员）
 * - 已绑定成员ID的会员：可编辑该成员（不受 VIP 状态限制）
 * - 已加入家族的会员：可新增成员
 * - 未加入家族：禁止新增/编辑（403）
 *
 * 依赖：本地 MySQL（.env 配置）已含 user 表 family_id/member_id/share_code 结构（原迁移 add-user-family-association.sql 已整合进 schema.sql）
 */
describe('会员家族关联（支系归属/成员绑定/分享码/编辑权限）(e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwtService: JwtService;

  // 测试数据
  const createdUsers: string[] = [];
  let familyAId: number;
  let familyBId: number;
  let memberA1Id = '';
  let memberA2Id = '';
  let memberB1Id = '';
  let userAId = '';
  let userBId = '';
  let userCId = '';
  let userDId = '';
  let shareCodeA = '';

  const token = (userId: string) => jwtService.sign({ sub: userId, type: 'user' });

  /** 直接插入一个用户并返回 ID（跳过短信/微信流程，聚焦关联逻辑） */
  const createTestUser = async (): Promise<string> => {
    const id = randomBytes(16).toString('hex');
    await dataSource.query(
      'INSERT INTO `user` (`id`, `nickname`, `status`) VALUES (?, ?, 1)',
      [id, '测试用户']
    );
    createdUsers.push(id);
    return id;
  };

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false })
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);

    // 准备测试用户
    userAId = await createTestUser(); // 家族A创建者
    userBId = await createTestUser(); // 通过分享码加入家族A，后绑定成员
    userCId = await createTestUser(); // 陌生人（未加入任何家族）
    userDId = await createTestUser(); // 家族B创建者
  }, 60000);

  afterAll(async () => {
    // 清理：软删除测试家族、删除成员分表数据、删除测试用户
    try {
      if (familyAId) {
        await dataSource.query(
          'DELETE FROM `family_members_' + familyAId + '` WHERE 1=1'
        );
        await dataSource.query('UPDATE `family` SET `status` = 0 WHERE `id` = ?', [familyAId]);
      }
      if (familyBId) {
        await dataSource.query(
          'DELETE FROM `family_members_' + familyBId + '` WHERE 1=1'
        );
        await dataSource.query('UPDATE `family` SET `status` = 0 WHERE `id` = ?', [familyBId]);
      }
      if (createdUsers.length > 0) {
        const placeholders = createdUsers.map(() => '?').join(', ');
        await dataSource.query('DELETE FROM `user` WHERE `id` IN (' + placeholders + ')', createdUsers);
      }
    } catch {
      // 清理失败不阻塞测试结果
    }
    if (app) await app.close();
  }, 60000);

  describe('功能：家族创建自动关联 + 登录进入关联支系', () => {
    it('F1 创建家族后创建者自动关联家族支系并生成分享码', async () => {
      const name = '测试家族A_' + Date.now();
      const res = await api()
        .post('/api/user/family/create')
        .set('Authorization', 'Bearer ' + token(userAId))
        .send({ name, founder: '始祖', origin: '测试地' });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      familyAId = Number(res.body.data.id);
      expect(familyAId).toBeGreaterThan(0);

      // 创建者已自动绑定该家族 + 分享码已生成（8位大写字母数字）
      const mine = await api()
        .get('/api/user/me/family')
        .set('Authorization', 'Bearer ' + token(userAId));
      expect(mine.status).toBe(200);
      expect(mine.body.code).toBe('0000');
      expect(Number(mine.body.data.familyId)).toBe(familyAId);
      expect(mine.body.data.family.name).toBe(name);
      shareCodeA = mine.body.data.shareCode;
      expect(shareCodeA).toMatch(/^[A-Z0-9]{8}$/);
    });

    it('F2 成员详情返回 canEdit 权限标识（创建者可编辑）', async () => {
      const res = await api()
        .post('/api/user/family/' + familyAId + '/members')
        .set('Authorization', 'Bearer ' + token(userAId))
        .send({ name: '始祖A', gender: 'male', generation: 1 });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      memberA1Id = res.body.data.id;
      expect(memberA1Id).toMatch(/^[a-f0-9]{32}$/);

      const detail = await api()
        .get('/api/user/family/' + familyAId + '/members/' + memberA1Id)
        .set('Authorization', 'Bearer ' + token(userAId));
      expect(detail.body.code).toBe('0000');
      expect(detail.body.data.canEdit).toBe(true);
    });

    it('F3 新会员通过分享码加入家族（大小写不敏感，幂等）', async () => {
      // 小写分享码应同样生效
      const res = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ shareCode: shareCodeA.toLowerCase() });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
      expect(Number(res.body.data.userInfo.familyId)).toBe(familyAId);
      expect(Number(res.body.data.family.id)).toBe(familyAId);
      // 加入后该会员也持有自己的分享码
      expect(res.body.data.shareCode).toMatch(/^[A-Z0-9]{8}$/);

      // 重复加入：幂等返回 200 且家族不变
      const again = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ shareCode: shareCodeA });
      expect(again.status).toBe(201);
      expect(Number(again.body.data.userInfo.familyId)).toBe(familyAId);
    });

    it('F4 会员绑定成员后 profile 返回 memberId，详情 canEdit=true', async () => {
      const bind = await api()
        .put('/api/user/family/bind-member')
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ memberId: memberA1Id });
      expect(bind.status).toBe(200);
      expect(bind.body.code).toBe('0000');
      expect(bind.body.data.memberId).toBe(memberA1Id);

      const detail = await api()
        .get('/api/user/family/' + familyAId + '/members/' + memberA1Id)
        .set('Authorization', 'Bearer ' + token(userBId));
      expect(detail.body.code).toBe('0000');
      expect(detail.body.data.canEdit).toBe(true);
    });
  });

  describe('权限：基于关联成员ID的编辑控制（不受 VIP 限制）', () => {
    it('P1 未绑定成员的用户编辑成员 → 403', async () => {
      const res = await api()
        .put('/api/user/family/' + familyAId + '/members/' + memberA1Id)
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ bio: '越权尝试' });
      expect(res.status).toBe(403);
    });

    it('P2 已绑定该成员的非VIP会员可编辑该成员 → 200（不受VIP限制）', async () => {
      // 该家族未开通任何订阅（免费版，capabilities 为空）；若编辑受 VIP 限制应返回 4001
      const res = await api()
        .put('/api/user/family/' + familyAId + '/members/' + memberA1Id)
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ bio: '我更新自己的信息' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
    });

    it('P3 绑定成员用户编辑其他成员 → 403', async () => {
      // 创建第二个成员（创建者）
      const created = await api()
        .post('/api/user/family/' + familyAId + '/members')
        .set('Authorization', 'Bearer ' + token(userAId))
        .send({ name: '成员甲', gender: 'male', generation: 1 });
      memberA2Id = created.body.data.id;

      const res = await api()
        .put('/api/user/family/' + familyAId + '/members/' + memberA2Id)
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ bio: '越权编辑他人' });
      expect(res.status).toBe(403);
    });

    it('P4 家族创建者可编辑任意成员 → 200', async () => {
      const res = await api()
        .put('/api/user/family/' + familyAId + '/members/' + memberA2Id)
        .set('Authorization', 'Bearer ' + token(userAId))
        .send({ bio: '创建者维护成员信息' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
    });

    it('P5 已加入家族的非绑定会员可新增成员 → 200', async () => {
      const res = await api()
        .post('/api/user/family/' + familyAId + '/members')
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ name: '成员乙', gender: 'female', generation: 1 });
      expect(res.status).toBe(201);
      expect(res.body.code).toBe('0000');
    });

    it('P6 未加入家族的用户新增成员 → 403', async () => {
      const res = await api()
        .post('/api/user/family/' + familyAId + '/members')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ name: '外人', gender: 'male', generation: 1 });
      expect(res.status).toBe(403);
    });

    it('P7 跨家族编辑 → 403（用户属家族A，编辑家族B成员）', async () => {
      // 用户D创建家族B并添加成员
      const createB = await api()
        .post('/api/user/family/create')
        .set('Authorization', 'Bearer ' + token(userDId))
        .send({ name: '测试家族B_' + Date.now(), founder: '始祖B' });
      familyBId = Number(createB.body.data.id);

      const addB = await api()
        .post('/api/user/family/' + familyBId + '/members')
        .set('Authorization', 'Bearer ' + token(userDId))
        .send({ name: '成员B', gender: 'male', generation: 1 });
      memberB1Id = addB.body.data.id;

      // 用户B属于家族A，编辑家族B的成员 → 403
      const res = await api()
        .put('/api/user/family/' + familyBId + '/members/' + memberB1Id)
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ bio: '跨家族越权' });
      expect(res.status).toBe(403);
    });

    it('P8 家族B创建者编辑家族B成员 → 200', async () => {
      const res = await api()
        .put('/api/user/family/' + familyBId + '/members/' + memberB1Id)
        .set('Authorization', 'Bearer ' + token(userDId))
        .send({ bio: '家族B创建者维护' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('0000');
    });

    it('P9 无关用户查看成员详情 canEdit=false', async () => {
      const detail = await api()
        .get('/api/user/family/' + familyAId + '/members/' + memberA1Id)
        .set('Authorization', 'Bearer ' + token(userCId));
      expect(detail.body.code).toBe('0000');
      expect(detail.body.data.canEdit).toBe(false);
    });
  });

  describe('边界：数据校验与安全性', () => {
    it('B1 不存在的分享码 → 400', async () => {
      const res = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ shareCode: 'ZZZZZZZZ' });
      expect(res.status).toBe(400);
    });

    it('B2 传家族ID直接加入 → 400（仅允许分享码）', async () => {
      const res = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ familyId: familyAId });
      expect(res.status).toBe(400);
    });

    it('B3 未传分享码 → 400', async () => {
      const res = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({});
      expect(res.status).toBe(400);
    });

    it('B4 绑定不属于自己家族的成员 → 400', async () => {
      const res = await api()
        .put('/api/user/family/bind-member')
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ memberId: memberB1Id });
      expect(res.status).toBe(400);
    });

    it('B5 未加入家族即绑定成员 → 400', async () => {
      const res = await api()
        .put('/api/user/family/bind-member')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ memberId: memberA1Id });
      expect(res.status).toBe(400);
    });

    it('B6 空成员ID绑定 → 400', async () => {
      const res = await api()
        .put('/api/user/family/bind-member')
        .set('Authorization', 'Bearer ' + token(userBId))
        .send({ memberId: '' });
      expect(res.status).toBe(400);
    });

    it('B7 加入已停用家族 → 404', async () => {
      // 通过创建者分享码加入已停用家族B
      const [familyBSeed] = await dataSource.query<{ seed_share_code: string }[]>(
        'SELECT `seed_share_code` FROM `family` WHERE `id` = ?',
        [familyBId]
      );
      await dataSource.query('UPDATE `family` SET `status` = 0 WHERE `id` = ?', [familyBId]);
      const res = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ shareCode: familyBSeed?.seed_share_code || '' });
      expect(res.status).toBe(404);
    });

    it('B8 陌生用户通过家族ID直接加入 → 400（已禁止）', async () => {
      const res = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ familyId: familyAId });
      expect(res.status).toBe(400);
    });

    it('B9 陌生用户通过家族种子分享码加入 → 200', async () => {
      const [familyASeed] = await dataSource.query<{ seed_share_code: string }[]>(
        'SELECT `seed_share_code` FROM `family` WHERE `id` = ?',
        [familyAId]
      );
      const res = await api()
        .post('/api/user/family/join')
        .set('Authorization', 'Bearer ' + token(userCId))
        .send({ shareCode: familyASeed?.seed_share_code || '' });
      expect(res.status).toBe(201);
      expect(Number(res.body.data.userInfo.familyId)).toBe(familyAId);
      expect(res.body.data.shareCode).toMatch(/^[A-Z0-9]{8}$/);
    });
  });
});
