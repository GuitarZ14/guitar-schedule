/**
 * 学员管理表格视图 — 工具函数回归测试
 * ------------------------------------------------------------------
 * 覆盖：电话脱敏 maskPhone / 日期紧凑标签 dateTags（折叠 +N、3 天内高亮）。
 * 与 extra-income-month.test.js 相同思路：直接从 index.html 抽取真实函数运行。
 *
 * 运行：TZ=Asia/Shanghai node tests/stu-table.test.js
 */
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(HTML);
  if (!m) throw new Error('index.html 中找不到函数：' + name);
  let i = HTML.indexOf('{', m.index), depth = 0, end = -1;
  for (let p = i; p < HTML.length; p++) {
    if (HTML[p] === '{') depth++;
    else if (HTML[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } }
  }
  if (end < 0) throw new Error('函数体括号不匹配：' + name);
  return HTML.slice(m.index, end);
}

const src = [
  'function pad(n){ return String(n).padStart(2,"0"); }',
  extractFn('ymd'),
  extractFn('parseYMD'),
  extractFn('maskPhone'),
  extractFn('dateTags'),
  'return { maskPhone, dateTags };'
].join('\n');
const { maskPhone, dateTags } = new Function(src)();

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || '断言失败'); }

const TODAY = '2026-09-04';

console.log('\n=== 1. 电话脱敏 maskPhone ===');
t('11 位手机号 → 前3后4保留，中间4位掩码', () => ok(maskPhone('13812345678') === '138****5678'));
t('空号码 → 空串（调用方显示 —）', () => ok(maskPhone('') === '' && maskPhone(null) === ''));
t('带空格先清洗', () => ok(maskPhone('138 1234 5678') === '138****5678'));
t('非 11 位但有 7 位以上 → 首3尾2掩码', () => ok(maskPhone('021655588') === '021****88'));
t('过短号码原样返回', () => ok(maskPhone('12345') === '12345'));

console.log('\n=== 2. 日期紧凑标签 dateTags ===');
t('空数组 → 占位符 —', () => ok(dateTags([], TODAY).indexOf('dtag-none') >= 0));
t('不超过 3 个全部展示，MM-DD 格式', () => {
  const h = dateTags(['2026-09-01', '2026-09-03'], TODAY);
  ok(h.indexOf('09/01') >= 0 && h.indexOf('09/03') >= 0);
  ok(h.indexOf('+') < 0, '不应出现 +N');
});
t('超过 3 个 → 前 3 个 + "+N"，且 N 正确', () => {
  const h = dateTags(['2026-09-01','2026-09-02','2026-09-05','2026-09-08','2026-09-20'], TODAY);
  ok(h.indexOf('+2') >= 0, '应有 +2');
  ok(h.indexOf('<span class="dtag">09/08') < 0 && h.indexOf('<span class="dtag">09/20') < 0, '第 4 个起不作为可见标签展示');
  ok(h.indexOf('title="09/08、09/20"') >= 0, '剩余日期放进 +N 的 title 提示里');
});
t('3 天内（今天 2026-09-04 → 截止 09-07）待上日期高亮 soon', () => {
  const h = dateTags(['2026-09-06'], TODAY);
  ok(h.indexOf('dtag soon') >= 0, '09-06 应带 soon');
});
t('超出 3 天不高亮', () => {
  const h = dateTags(['2026-09-20'], TODAY);
  ok(h.indexOf('soon') < 0, '09-20 不应高亮');
});
t('过去的日期不高亮（只高亮今天起 3 天内）', () => {
  const h = dateTags(['2026-09-01'], TODAY);
  ok(h.indexOf('soon') < 0);
});
t('边界：第 3 天（09-07）高亮，第 4 天（09-08）不高亮', () => {
  ok(dateTags(['2026-09-07'], TODAY).indexOf('soon') >= 0);
  ok(dateTags(['2026-09-08'], TODAY).indexOf('soon') < 0);
});
t('乱序输入自动升序', () => {
  const h = dateTags(['2026-09-08','2026-09-01','2026-09-03','2026-09-05','2026-09-02'], TODAY);
  ok(h.indexOf('09/01') < h.indexOf('09/02') && h.indexOf('09/02') < h.indexOf('09/03'));
});

console.log('\n=== 3. 页面静态检查 ===');
t('renderEdit 使用表格 + 全部必需列', () => {
  ['本月已上日期','本月待上日期','剩余课时','课程类型','联系电话','老师','状态','排课','data-stu-book','stuClearFilter','stuPrev','stuNext'].forEach(k=>{
    ok(HTML.indexOf(k) >= 0, 'index.html 缺少关键字：' + k);
  });
});
t('弹窗含新增字段（电话/老师/在读状态）', () => {
  ['id="sPhone"','id="sTeacher"','id="sStuStatus"'].forEach(k=>{
    ok(HTML.indexOf(k) >= 0, '学员弹窗缺少：' + k);
  });
});
t('旧卡片视图的删除按钮已收进弹窗，表格操作列无删除', () => {
  ok(HTML.indexOf('data-stu-del') < 0, 'data-stu-del 应已移除（删除入口在编辑弹窗内）');
});

console.log('\n' + '─'.repeat(52));
console.log(fail === 0 ? `全部通过：${pass} 项 ✓` : `通过 ${pass} 项，失败 ${fail} 项 ✗`);
process.exit(fail === 0 ? 0 : 1);
