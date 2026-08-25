import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveCloudStorageConfigDto } from './dto/save-cloud-storage-config.dto';

describe('临时复现：云存储保存 DTO 校验', () => {
  const sampleBody = {
    provider: 'tencent',
    tencent: {
      enabled: true,
      secretId: 'AKIDxxx',
      secretKey: 'secretKey123',
      bucket: 'bucket-1234567890',
      region: 'ap-guangzhou',
      appId: '1250000000',
      domain: ''
    },
    aliyun: {
      enabled: false,
      accessKeyId: '',
      accessKeySecret: '',
      bucket: '',
      region: '',
      endpoint: '',
      domain: ''
    },
    qiniu: {
      enabled: false,
      accessKey: '',
      secretKey: '',
      bucket: '',
      region: '',
      domain: ''
    }
  };

  it('模拟 ValidationPipe(whitelist: true) 的转换结果', async () => {
    const instance = plainToInstance(SaveCloudStorageConfigDto, sampleBody);
    console.log('top-level keys:', Object.keys(instance));
    console.log('tencent:', JSON.stringify(instance.tencent));
    console.log('aliyun:', JSON.stringify(instance.aliyun));
    console.log('qiniu:', JSON.stringify(instance.qiniu));

    const errors = await validate(instance, { whitelist: true });
    console.log('校验错误数:', errors.length);
    for (const e of errors) {
      console.log('字段:', e.property, '值:', JSON.stringify(e.value), '约束:', JSON.stringify(e.constraints));
      if (e.children?.length) {
        for (const child of e.children) {
          console.log('  子字段:', child.property, '约束:', JSON.stringify(child.constraints));
        }
      }
    }
    expect(true).toBe(true);
  });
});
