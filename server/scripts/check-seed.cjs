const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname, '../database/cultural-seed-data.sql'), 'utf8');

// 找所有 INSERT IGNORE INTO cultural_document
const docBlock = sql.match(/INSERT IGNORE INTO `cultural_document`[\s\S]*?(?=INSERT IGNORE INTO|$)/g);
if (docBlock) {
  for (const block of docBlock) {
    // 提取 VALUES 后的内容直到分号
    const valuesMatch = block.match(/VALUES\s*([\s\S]*?);/);
    if (valuesMatch) {
      // 数顶层括号数量（values 被 (x), (y), (z) 包围）
      const valuesContent = valuesMatch[1];
      // 提取每个 (...) 里的内容（处理字符串里的括号）
      const groups = [];
      let depth = 0, cur = '', inStr = false, quote = '';
      for (let i = 0; i < valuesContent.length; i++) {
        const ch = valuesContent[i];
        if (!inStr && (ch === "'" || ch === '"')) { inStr = true; quote = ch; cur += ch; continue; }
        if (inStr) { cur += ch; if (ch === quote && valuesContent[i-1] !== '\\') inStr = false; continue; }
        if (ch === '(') { depth++; if (depth === 1) cur = ''; else cur += ch; }
        else if (ch === ')') { depth--; if (depth === 0) { groups.push(cur.trim()); cur = ''; } else cur += ch; }
        else if (depth > 0) cur += ch;
      }
      console.log(`cultural_document: ${groups.length} 个 VALUES 组`);
      for (const g of groups) {
        // 数顶层逗号（字符串外的逗号）
        let count = 0, inS = false, q = '';
        for (let i = 0; i < g.length; i++) {
          const ch = g[i];
          if (!inS && (ch === "'" || ch === '"')) { inS = true; q = ch; continue; }
          if (inS) { if (ch === q && g[i-1] !== '\\') inS = false; continue; }
          if (ch === ',') count++;
        }
        console.log(`  值数=${count+1} | 开头: ${g.substring(0, 40)}...`);
      }
    }
  }
}
