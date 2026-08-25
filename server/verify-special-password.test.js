/* eslint-disable */
/**
 * 临时验证脚本：验证密码特殊字符支持（前后端规则一致性与 bcrypt 兼容性）。
 * 覆盖：
 *  1) 后端 checkPasswordAgainstPolicy：各类特殊字符组合应通过、控制字符应拒绝
 *  2) bcrypt 对含特殊字符密码的 hash/compare 兼容性
 *  3) 前端 REG_PWD 正则（内联副本）与后端允许集的一致性
 * 使用后即删除。
 */
const bcrypt = require('bcrypt');
const { SystemSecurityService } = require('./dist/system-security/system-security.service');

// 与 web-admin/src/constants/reg.ts 中 REG_PWD 保持一致的内联副本
const FRONTEND_REG_PWD = /^[\w!@#$%^&*()+\-=\[\]{}|;:,.<>?]{6,18}$/;

let passed = 0;
let failed = 0;
function report(name, ok, detail) {
  if (ok) { passed += 1; console.log(`  [PASS] ${name}`); }
  else { failed += 1; console.log(`  [FAIL] ${name} :: ${detail}`); }
}

// 全策略开启（最严格场景）
const strictPolicy = { minLength: 6, requireUpper: true, requireLower: true, requireNumber: true, requireSpecial: true, expireDays: 0 };
// 仅最小长度策略
const loosePolicy = { minLength: 6, requireUpper: false, requireLower: false, requireNumber: false, requireSpecial: false, expireDays: 0 };

async function main() {
  console.log('— 后端策略校验：特殊字符组合应通过（全策略开启） —');
  const passCases = [
    'Ab1!@#', 'Ab1$%^', 'Ab1&*()', 'Ab1_+-=', 'Ab1[]{}', 'Ab1|;:,', 'Ab1.<>?',
    'Ab1!@#$%^&*()_+-=[]{}|;:,.<>?', 'p@ssW0rd!', 'S3cur3#P@ss', 'Zx9?;aB', 'A1{}|<>'
  ];
  for (const pwd of passCases) {
    const err = SystemSecurityService.checkPasswordAgainstPolicy(pwd, strictPolicy);
    report(`通过: ${pwd}`, err === '', err || '');
  }

  console.log('— 后端策略校验：控制字符应拒绝 —');
  const controlCases = ['Ab1\x00\x01', 'Ab1\n\t\r', 'Ab1\x1f', 'Ab1\x7f'];
  for (const pwd of controlCases) {
    const err = SystemSecurityService.checkPasswordAgainstPolicy(pwd, loosePolicy);
    report(`拒绝控制字符: ${JSON.stringify(pwd)}`, err.includes('控制字符'), err || '未拒绝');
  }

  console.log('— 后端策略校验：常规不满足策略场景仍拒绝 —');
  const failCases = [
    ['abc123', '必须包含大写'],
    ['ABC123', '必须包含小写'],
    ['Abcdef', '必须包含数字'],
    ['Abc123', '必须包含特殊字符'],
    ['A1!', '长度不能少于 6']
  ];
  for (const [pwd, expectPart] of failCases) {
    const err = SystemSecurityService.checkPasswordAgainstPolicy(pwd, strictPolicy);
    report(`拒绝: ${pwd}`, err !== '' && err.includes(expectPart), err || '未拒绝');
  }

  console.log('— bcrypt 兼容性：含特殊字符密码 hash/compare —');
  const bcryptCases = ['p@ssW0rd!#$%', 'A1!@#$%^&*()_+-=[]{}|;:,.<>?', '普通@密码123', '!@#aB9'];
  for (const pwd of bcryptCases) {
    const hash = await bcrypt.hash(pwd, 10);
    const ok = await bcrypt.compare(pwd, hash);
    const wrong = await bcrypt.compare(pwd + 'x', hash);
    report(`bcrypt round-trip: ${pwd}`, ok === true && wrong === false, `ok=${ok} wrong=${wrong}`);
  }

  console.log('— 前端 REG_PWD：特殊字符密码应通过 —');
  for (const pwd of passCases) {
    report(`前端通过: ${pwd}`, FRONTEND_REG_PWD.test(pwd), `正则不匹配`);
  }
  console.log('— 前端 REG_PWD：非法字符/长度应拒绝 —');
  const frontRejects = [
    ['Ab1\x00', '控制字符'],
    ['Ab1 cde', '空格'],
    ['Ab1`~', '反引号波浪号'],
    ['Ab1"\'', '引号'],
    ['A1!', '过短'],
    ['A1!'.padEnd(19, 'x'), '过长'],
    ['abcDEF', '仅字母'],
    ['1234567890123456789', '纯数字超长']
  ];
  for (const [pwd, desc] of frontRejects) {
    report(`前端拒绝(${desc}): ${JSON.stringify(pwd)}`, !FRONTEND_REG_PWD.test(pwd), `正则意外匹配`);
  }

  // 一致性：后端允许的字符集不排斥前端允许的字符（前端白名单样本全部能被后端策略接受）
  console.log('— 前后端一致性：前端允许样本可被后端最小策略接受 —');
  for (const pwd of passCases) {
    const err = SystemSecurityService.checkPasswordAgainstPolicy(pwd, loosePolicy);
    report(`后端接受前端样本: ${pwd}`, err === '', err || '');
  }

  console.log(`\n结果: 通过 ${passed} 项，失败 ${failed} 项`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(err => {
  console.error('脚本异常:', err);
  process.exitCode = 1;
});
