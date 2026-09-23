import { MemberImportService } from './member-import.service';
import { HttpStatus } from '@nestjs/common';
import * as XLSX from 'xlsx';

describe('MemberImportService', () => {
  let service: MemberImportService;
  let dataSourceMock: { transaction: jest.Mock; query: jest.Mock };
  let familyMemberServiceMock: { ensureTable: jest.Mock; importItems: jest.Mock };
  let systemLogMock: { write: jest.Mock };

  const csv = (text: string) => Buffer.from('\uFEFF' + text, 'utf8');
  const xlsxOf = (rows: unknown[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  };

  beforeEach(() => {
    dataSourceMock = { transaction: jest.fn(), query: jest.fn() };
    familyMemberServiceMock = {
      ensureTable: jest.fn().mockResolvedValue(undefined),
      importItems: jest.fn().mockResolvedValue(2)
    };
    systemLogMock = { write: jest.fn().mockResolvedValue(undefined) };
    service = new MemberImportService(
      dataSourceMock as any,
      familyMemberServiceMock as any,
      systemLogMock as any
    );
  });

  describe('parseSpreadsheet', () => {
    it('解析 CSV：中文表头、性别/在世换算、父子关系映射', () => {
      const result = service.parseSpreadsheet(
        csv(`外部ID,姓名,性别,代数,字辈,出生日期,是否在世,父亲外部ID,母亲ID\nf1,朱伯言,男,1,伯,1880-03-15,否,,\nm1,陈氏,女,1,,1885-06-01,否,,\nc1,朱文远,男,2,文,1905-09-10,是,f1,0\n`),
        'members.csv'
      );
      expect(result.items).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(result.total).toBe(3);
      expect(result.items[0]).toMatchObject({ refId: 'f1', name: '朱伯言', gender: 'male', generation: 1, isAlive: 0 });
      expect(result.items[2]).toMatchObject({ fatherRefId: 'f1', motherRefId: '0', isAlive: 1 });
      expect(result.rowNos).toEqual([2, 3, 4]);
    });

    it('解析 xlsx：支持英文表头', () => {
      const result = service.parseSpreadsheet(
        xlsxOf([
          ['refId', 'name', 'gender', 'generation', 'fatherRefId'],
          ['a', '张三', 'female', '2', 'p'],
          ['p', '张父', 'male', '1', '']
        ]),
        'members.xlsx'
      );
      expect(result.errors).toHaveLength(0);
      expect(result.items[0]).toMatchObject({ refId: 'a', name: '张三', gender: 'female', generation: 2, fatherRefId: 'p' });
    });

    it('行级错误被收集：非法性别、重复外部ID，不影响其他行', () => {
      const result = service.parseSpreadsheet(
        csv(`外部ID,姓名,性别,代数\nx,朱甲,male,1\n,朱乙,unknown,1\nx,朱丙,male,1\n`),
        'members.csv'
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.errors.some(e => e.includes('性别只能填写 男/女'))).toBe(true);
      expect(result.errors.some(e => e.includes('外部ID「x」重复'))).toBe(true);
      expect(result.errors.some(e => e.includes('第 3 行'))).toBe(true);
      expect(result.errors.some(e => e.includes('第 4 行'))).toBe(true);
    });

    it('父子关系引用校验：父亲引用不存在/指向自己；母亲ID必须是数字序号', () => {
      const result = service.parseSpreadsheet(
        csv(`外部ID,姓名,代数,父亲外部ID,母亲ID\nc1,朱子,2,missing,\nc2,朱二,2,c2,\nc3,朱三,2,,abc\n`),
        'members.csv'
      );
      expect(result.items).toHaveLength(2);
      expect(result.errors.some(e => e.includes('父亲外部ID「missing」不存在'))).toBe(true);
      expect(result.errors.some(e => e.includes('父亲外部ID不能指向自己'))).toBe(true);
      expect(result.errors.some(e => e.includes('母亲ID必须是数字'))).toBe(true);
    });

    it('父为空时同名不判重；父非空时才做同名同父亲去重', () => {
      const result = service.parseSpreadsheet(
        csv(`外部ID,姓名,父亲外部ID\n,朱氏,\n,朱氏,\nf1,朱大,f2\nf2,朱父,\nf3,朱大,f2\n`),
        'members.csv'
      );
      expect(result.items).toHaveLength(4);
      expect(result.total).toBe(5);
      expect(result.errors.some(e => e.includes('第 6 行：与第 4 行重复（同名同父亲）'))).toBe(true);
    });

    it('支持「父亲ID」列名与32位hex系统ID引用（引用库中已有成员）', () => {
      const sysId = 'a'.repeat(32);
      const result = service.parseSpreadsheet(
        csv(`外部ID,姓名,父亲ID\nc1,朱子,${sysId}\n`),
        'members.csv'
      );
      expect(result.items).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.items[0]).toMatchObject({ refId: 'c1', name: '朱子', fatherRefId: sysId });
    });

    it('支持外部表导出格式：ID列 + 父亲ID列（父亲也在文件内，两遍映射）', () => {
      const result = service.parseSpreadsheet(
        csv(`ID,姓名,代数,父亲ID\n1,朱伯言,1,\n2,朱文远,2,1\n`),
        'members.csv'
      );
      expect(result.items).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.items[0]).toMatchObject({ refId: '1', name: '朱伯言' });
      expect(result.items[1]).toMatchObject({ refId: '2', name: '朱文远', fatherRefId: '1' });
    });

    it('解析配偶信息列：分号分隔的姓名列表，数组顺序即母亲序号', () => {
      const result = service.parseSpreadsheet(
        csv(`外部ID,姓名,配偶信息\nf1,朱伯言,陈氏;李氏;王氏\n`),
        'members.csv'
      );
      expect(result.items).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
      expect(result.items[0].spouseInfo).toEqual([
        { name: '陈氏' },
        { name: '李氏' },
        { name: '王氏' }
      ]);
    });

    it('解析配偶信息列：空字符串/连续分号/首尾分号均忽略，输出合法JSON数组', () => {
      const cases: [string, { name: string }[]][] = [
        ['', []],
        [';', []],
        [';;陈氏;;', [{ name: '陈氏' }]],
        [';陈氏;', [{ name: '陈氏' }]],
        ['陈氏; ;', [{ name: '陈氏' }]],
        ['陈氏;李氏', [{ name: '陈氏' }, { name: '李氏' }]]
      ];
      for (const [input, expected] of cases) {
        const result = service.parseSpreadsheet(
          csv(`外部ID,姓名,配偶信息\nf1,朱伯言,${input}\n`),
          'members.csv'
        );
        expect(result.items[0].spouseInfo).toEqual(expected);
        // 结果必须能被标准 JSON 解析
        expect(() => JSON.parse(JSON.stringify(result.items[0].spouseInfo))).not.toThrow();
      }
    });

    it('缺少姓名列时抛 BAD_REQUEST', () => {
      expect(() => service.parseSpreadsheet(csv('foo,bar\n1,2\n'), 'members.csv')).toThrow(/姓名/);
    });
  });

  describe('importFromFile', () => {
    it('事务内导入并返回报告、写入审计日志', async () => {
      const managerQuery = jest.fn().mockResolvedValue({ affectedRows: 1 });
      dataSourceMock.transaction.mockImplementation((cb: (m: any) => unknown) => cb({ query: managerQuery }));
      familyMemberServiceMock.importItems.mockImplementation(async (query: any) => {
        await query('INSERT INTO `family_members_1` ...', []);
        return 2;
      });

      const report = await service.importFromFile(
        1,
        { originalname: 'members.csv', size: 100, buffer: csv('外部ID,姓名,性别,代数\nf1,朱父,male,1\nc1,朱子,male,2\n') },
        { username: 'admin', id: 1 }
      );

      expect(familyMemberServiceMock.ensureTable).toHaveBeenCalledWith(1);
      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      expect(managerQuery).toHaveBeenCalled(); // member_count 更新在事务内
      expect(report).toMatchObject({ imported: 2, total: 2, skipped: 0, errors: [] });
      expect(systemLogMock.write).toHaveBeenCalledWith(
        expect.objectContaining({ logType: 'operation', action: '批量导入成员', success: true, operator: 'admin' })
      );
    });

    it('不支持的文件类型抛 BAD_REQUEST', async () => {
      await expect(
        service.importFromFile(1, { originalname: 'members.txt', size: 10, buffer: Buffer.from('x') })
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });

    it('未解析到有效数据时抛 BAD_REQUEST 并给出行错误', async () => {
      await expect(
        service.importFromFile(1, { originalname: 'members.csv', size: 20, buffer: csv('外部ID,姓名,性别\n,朱甲,bad\n') })
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    });
  });

  describe('buildTemplate', () => {
    it('返回带 BOM 的 CSV 模板（含表头与自洽示例行）', () => {
      const tpl = service.buildTemplate();
      expect(tpl.startsWith('\uFEFF')).toBe(true);
      expect(tpl).toContain('外部ID');
      expect(tpl).toContain('姓名');
      expect(tpl).toContain('父亲外部ID');
      expect(tpl).toContain('母亲ID');
      expect(tpl).toContain('配偶信息');
      expect(tpl).toContain('朱伯言');
    });
  });
});
