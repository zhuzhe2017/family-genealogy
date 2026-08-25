/* 临时复现脚本：模拟 ValidationPipe(whitelist) 对云存储保存请求体的处理 */
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');

class TencentCosConfigDto {
  enabled;
  secretId;
  secretKey;
  bucket;
  region;
  appId;
  domain;
}
class AliyunOssConfigDto {
  enabled;
  accessKeyId;
  accessKeySecret;
  bucket;
  region;
  endpoint;
  domain;
}
class QiniuKodoConfigDto {
  enabled;
  accessKey;
  secretKey;
  bucket;
  region;
  domain;
}
class SaveCloudStorageConfigDto {
  provider;
  tencent;
  aliyun;
  qiniu;
}

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

async function main() {
  const instance = plainToInstance(SaveCloudStorageConfigDto, sampleBody);
  console.log('转换后 top-level keys:', Object.keys(instance));
  console.log('tencent 是否为 undefined:', instance.tencent === undefined);

  const errors = await validate(instance, { whitelist: true });
  console.log('校验错误数:', errors.length);
  if (errors.length) {
    for (const e of errors) {
      console.log('字段:', e.property, '约束:', JSON.stringify(e.constraints));
    }
  }
}

main().catch(err => console.error('执行出错:', err));
