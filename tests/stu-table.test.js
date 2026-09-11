/**
 * 学员管理表格视图 — 工具函数回归测试
 * ------------------------------------------------------------------
 * 覆盖：电话脱敏 maskPhone / 日期标签 dateTags（全展开、只显日号、3 天内高亮）/
 *       本月上课详情 stuMonthRecords（导出数据源）。
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

console.log('\n=== 2. 日期标签 dateTags（全展开 · 只显日号）===');
t('空数组 → 占位符 —', () => ok(dateTags([], TODAY).indexOf('dtag-none') >= 0));
t('只显示日号，不再带 MM/ 前缀（月份由表头承载）', () => {
  const h = dateTags(['2026-09-01', '2026-09-03'], TODAY);
  ok(h.indexOf('>1<') >= 0 && h.indexOf('>3<') >= 0, '应显示日号 1 / 3');
  ok(h.indexOf('09/') < 0, '不应再出现 MM/ 前缀');
});
t('超过 3 个全部展开，不折叠 +N，也不依赖悬停 title', () => {
  const h = dateTags(['2026-09-01','2026-09-02','2026-09-05','2026-09-08','2026-09-20'], TODAY);
  ['>1<','>2<','>5<','>8<','>20<'].forEach(k=>ok(h.indexOf(k) >= 0, '应可见日号 ' + k));
  ok(h.indexOf('+') < 0, '不应出现 +N 折叠');
  ok(h.indexOf('title=') < 0, '不应再依赖 title 悬停提示');
});
t('7 个日期渲染 7 个标签（不再截断到前 3 个）', () => {
  const h = dateTags(['2026-09-03','2026-09-04','2026-09-06','2026-09-07','2026-09-08','2026-09-09','2026-09-10'], TODAY);
  ok((h.match(/class="dtag/g)||[]).length === 7, '应渲染 7 个标签');
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
  ok(h.indexOf('>1<') < h.indexOf('>2<') && h.indexOf('>2<') < h.indexOf('>3<'));
});

console.log('\n=== 3. 页面静态检查 ===');
t('renderEdit 使用表格 + 全部必需列（表头为动态月份文案）', () => {
  ["mLabel+'已上日期","mLabel+'待上日期","mLabel+'已上/计划 ",'剩余课时','课程类型','状态','排课','data-stu-book','stuClearFilter','stuPrev','stuNext'].forEach(k=>{
    ok(HTML.indexOf(k) >= 0, 'index.html 缺少关键字：' + k);
  });
});
t('列表与搜索已移除电话/老师（弹窗录入字段保留）', () => {
  ['<th>联系电话</th>','<th>老师</th>','class="phone"','搜索姓名 / 手机号',
   "String(r.s.phone||'').indexOf(kw)",'完整电话'].forEach(k=>{
    ok(HTML.indexOf(k) < 0, '应已移除：' + k);
  });
  ok(HTML.indexOf('id="sPhone"') >= 0, '弹窗录入字段应保留（避免存量数据丢失）');
});
t('表格 8 列且 colspan 一致（无空列/错位）', () => {
  ok(HTML.indexOf('colspan="8"') >= 0, '空态行与详情行 colspan 应为 8');
  ok(HTML.indexOf('colspan="10"') < 0, '不应残留 colspan="10"');
});
t('导出入口：按钮 + 两列 CSV + 空数据提示', () => {
  ['id="expStuMonth"','stuMonthRecords','exportStuMonth',
   "['学员名字','已上日期']",'暂无上课记录','-学员上课详情.csv'].forEach(k=>{
    ok(HTML.indexOf(k) >= 0, 'index.html 缺少导出关键字：' + k);
  });
});
t('月份切换：状态变量 + 选择器 + 回本月 + 空占位文案', () => {
  ["let stuMonth=","id=\"stuMonthPick\"","id=\"stuMonthBack\"","stuMonth||today.slice(0,7)",'该月无待上'].forEach(k=>{
    ok(HTML.indexOf(k) >= 0, 'index.html 缺少月份切换关键字：' + k);
  });
});
t('日期全展开样式：可换行 + 宽度上限 + 字号提升 + 旧折叠样式移除', () => {
  ok(HTML.indexOf('.dtags{display:flex; gap:4px; align-items:center; flex-wrap:wrap; max-width:210px;}') >= 0, '.dtags 应可换行且有宽度上限');
  ok(HTML.indexOf('font-size:13px; font-weight:600; padding:2px 7px') >= 0, '.dtag 字号应提升到 13px');
  ok(HTML.indexOf('.dtag.more') < 0, '旧 +N 折叠样式应已移除');
  ok(HTML.indexOf("class=\"dtag more\"") < 0, '旧 +N 折叠渲染逻辑应已移除');
});
t('弹窗含新增字段（电话/老师/在读状态）', () => {
  ['id="sPhone"','id="sTeacher"','id="sStuStatus"'].forEach(k=>{
    ok(HTML.indexOf(k) >= 0, '学员弹窗缺少：' + k);
  });
});
t('旧卡片视图的删除按钮已收进弹窗，表格操作列无删除', () => {
  ok(HTML.indexOf('data-stu-del') < 0, 'data-stu-del 应已移除（删除入口在编辑弹窗内）');
});

console.log('\n=== 4. 本月上课详情 stuMonthRecords（导出数据源）===');
const buildRecs = new Function('students', 'courses',
  extractFn('stuMonthRecords') + '\nreturn stuMonthRecords;');
const STU = [
  {id:'s1', name:'小明'},
  {id:'s2', name:'乐乐'},
  {id:'s3', name:'张同学'}
];
const CRS = [
  {studentId:'s1', date:'2026-09-03', status:'done'},
  {studentId:'s1', date:'2026-09-10', status:'done'},
  {studentId:'s1', date:'2026-09-20', status:'planned'},   // 待上：不计
  {studentId:'s1', date:'2026-09-05', status:'absent'},    // 请假：不计
  {studentId:'s1', date:'2026-08-31', status:'done'},      // 上月：不计
  {studentId:'s2', date:'2026-09-02', status:'done'},
  {studentId:'s3', date:'2026-09-09', status:'cancelled'}, // 取消：不计
];
const recs = buildRecs(STU, CRS)('2026-09');
t('只取 done 且限定所选自然月', () => {
  ok(recs.length === 3, '应为 3 条（待上/请假/上月/取消均排除），实际 ' + recs.length);
  ok(recs.every(r => String(r.date).indexOf('2026-09') === 0), '日期应都在 2026-09');
});
t('同一学员多次上课按日期分行且升序', () => {
  const m = recs.filter(r => r.name === '小明').map(r => r.date);
  ok(m.join(',') === '2026-09-03,2026-09-10', '小明应为 09-03、09-10，实际 ' + m.join(','));
});
t('学员按姓名升序；每条仅含 name/date 两字段', () => {
  const order = [...new Set(recs.map(r => r.name))].join(',');
  ok(order === '乐乐,小明', '学员顺序应为 乐乐、小明，实际 ' + order);
  ok(Object.keys(recs[0]).sort().join(',') === 'date,name', '仅应有 name/date 两字段');
});
t('该月无记录 → 空数组（触发「暂无上课记录」提示）', () => {
  ok(buildRecs(STU, CRS)('2026-07').length === 0);
});

console.log('\n' + '─'.repeat(52));
console.log(fail === 0 ? `全部通过：${pass} 项 ✓` : `通过 ${pass} 项，失败 ${fail} 项 ✗`);
process.exit(fail === 0 ? 0 : 1);
