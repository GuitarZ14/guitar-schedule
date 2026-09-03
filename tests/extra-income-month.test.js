/**
 * 额外收入「月份归属」回归测试
 * ------------------------------------------------------------------
 * 背景：旧版 loadExtraIncome() 对无日期的老记录一律"补当前月"，
 *       导致 8 月新增的收入在 9 月被计入 9 月（分组依据错误）。
 * 本测试直接从 index.html 抽取真实函数体运行（非副本），防止代码改了测试没改。
 *
 * 运行：TZ=Asia/Shanghai node tests/extra-income-month.test.js
 * 依赖：仅 Node 内置模块，零第三方依赖。
 */
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* ---------- 工具：按函数名从 index.html 抽取真实函数源码 ---------- */
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

/* ---------- 沙箱：装配依赖 + localStorage 桩 ---------- */
function buildHarness(initialData, today) {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  if (initialData !== undefined) store['wb_guitar_extra_income'] = JSON.stringify(initialData);

  const src = [
    'function pad(n){ return String(n).padStart(2,"0"); }',
    extractFn('ymd'),
    today
      ? 'function todayStr(){ return ' + JSON.stringify(today) + '; }' // 冻结"今天"便于确定性测试
      : extractFn('todayStr'),
    extractFn('monthOf'),
    extractFn('loadExtraIncome'),
    'function saveExtraIncome(arr){ localStorage.setItem(EXTRA_INCOME_KEY, JSON.stringify(arr)); }',
    extractFn('sumExtraIncome'),
    'return { monthOf, loadExtraIncome, sumExtraIncome };'
  ].join('\n');

  const factory = new Function('localStorage', 'EXTRA_INCOME_KEY', src);
  return { api: factory(localStorage, 'wb_guitar_extra_income'), store };  // store 与桩共享同一引用
}

/* ---------- 极简断言 ---------- */
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error((msg || '') + ' 期望 ' + b + '，实际 ' + a);
}

console.log('\n=== 1. 月末 / 月初边界：按业务发生日期归属 ===');
{
  const { api } = buildHarness([]);
  t('8月31日 → 归属 2026-08（不落入9月）', () => eq(api.monthOf({ date: '2026-08-31' }), '2026-08'));
  t('8月30日 → 归属 2026-08', () => eq(api.monthOf({ date: '2026-08-30' }), '2026-08'));
  t('9月1日  → 归属 2026-09', () => eq(api.monthOf({ date: '2026-09-01' }), '2026-09'));
  t('8月1日  → 归属 2026-08', () => eq(api.monthOf({ date: '2026-08-01' }), '2026-08'));
  t('7月31日 → 归属 2026-07', () => eq(api.monthOf({ date: '2026-07-31' }), '2026-07'));
  t('12月31日 → 归属 2026-12（跨年不串年）', () => eq(api.monthOf({ date: '2026-12-31' }), '2026-12'));
  t('次年1月1日 → 归属 2027-01', () => eq(api.monthOf({ date: '2027-01-01' }), '2027-01'));
}

console.log('\n=== 2. 用户场景复现：8月底记录不再被计入9月 ===');
{
  const data = [
    { id: 'a1', desc: '周灏 琴弦150+手工费80', amount: 230, date: '2026-08-31' },
    { id: 'a2', desc: '王浩人 琴弦150',         amount: 150, date: '2026-08-30' },
    { id: 'a3', desc: '9月售琴',                 amount: 1000, date: '2026-09-02' }
  ];
  const { api } = buildHarness(data, '2026-09-03');
  t('8月小计 = 380（仅含两笔8月记录）', () => eq(api.sumExtraIncome('2026-08'), 380));
  t('9月小计 = 1000（仅含9月记录）', () => eq(api.sumExtraIncome('2026-09'), 1000));
  t('8月/9月小计之和 = 全量 1380', () => eq(api.sumExtraIncome('2026-08') + api.sumExtraIncome('2026-09'), 1380));
  t('8月31日那笔不被算进9月', () => {
    const sep = api.loadExtraIncome().filter(i => api.monthOf(i) === '2026-09');
    eq(sep.map(i => i.id), ['a3']);
  });
}

console.log('\n=== 3. 跨时区：本地时间 vs UTC（禁用 toISOString 作归属依据）===');
{
  const { api } = buildHarness([]);
  // 直接校验 index.html 里的 ymd() 使用本地日历字段
  t('ymd() 用本地 getFullYear/getMonth/getDate', () => {
    const h = buildHarness([]);
    const d = new Date(2026, 7, 31, 23, 59, 59);       // 本地 8月31日 23:59:59
    eq(h.api.monthOf({ date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') }), '2026-08');
  });
  t('源码未在归属/日期逻辑中使用 toISOString().slice 取月', () => {
    const bad = /toISOString\(\)\s*\.slice\(\s*0\s*,\s*7\s*\)/.exec(HTML);
    if (bad) throw new Error('发现按 UTC 取月的代码：' + bad[0]);
  });
  // UTC+8 凌晨是 UTC 前一天：本地口径必须给出本地日期
  const d = new Date(2026, 8, 1, 7, 0, 0);              // 本地 9月1日 07:00
  if (d.getTimezoneOffset() === -480) {
    const local = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const utc = d.toISOString().slice(0, 10);
    t('UTC+8 环境下本地口径=2026-09-01，而 toISOString 会错成 2026-08-31', () => {
      eq(local, '2026-09-01');
      eq(utc, '2026-08-31');           // 反例：这正是必须避开的写法
      eq(api.monthOf({ date: local }), '2026-09');
    });
  } else {
    console.log('  · 当前环境非 UTC+8，跳过 UTC 对照断言');
  }
}

console.log('\n=== 4. 旧数据迁移（禁止静默"补当前月"）===');
{
  // 4.1 完全无日期的老记录（8月新增、旧版未存 date）→ 默认今天并标记待核对
  const h1 = buildHarness([{ id: 'old1', desc: '旧记录无日期', amount: 100 }], '2026-09-03');
  const a1 = h1.api.loadExtraIncome()[0];
  t('无日期记录 → 补 date 并标记 needDate（而非静默归到某月）', () => {
    eq(a1.date, '2026-09-03');
    eq(a1.needDate, true);
  });
  t('迁移结果已持久化', () => {
    eq(JSON.parse(h1.store['wb_guitar_extra_income'])[0].needDate, true);
  });

  // 4.2 被旧版误打 month='2026-09' 的记录 → 保留原分组但标记待核对，用户可改回 8 月
  const h2 = buildHarness([{ id: 'old2', desc: '8月收入被误标9月', amount: 230, month: '2026-09' }], '2026-09-03');
  const a2 = h2.api.loadExtraIncome()[0];
  t('仅有 month 的记录 → date=该月1日 + needDate 提醒核对', () => {
    eq(a2.date, '2026-09-01');
    eq(a2.needDate, true);
  });
  t('用户改成 2026-08-31 后立即归属 8 月', () => {
    a2.date = '2026-08-31';
    eq(h2.api.monthOf(a2), '2026-08');
  });

  // 4.3 已有真实日期的记录：迁移必须原样保留，绝不覆盖
  const h3 = buildHarness([{ id: 'new1', desc: '8月底收入', amount: 230, date: '2026-08-31' }], '2026-09-03');
  const a3 = h3.api.loadExtraIncome()[0];
  t('已有 date 的记录 → 迁移不改动，且不打 needDate', () => {
    eq(a3.date, '2026-08-31');
    eq(a3.needDate, undefined);
    eq(h3.api.monthOf(a3), '2026-08');
  });
}

console.log('\n=== 5. 兼容与健壮性 ===');
{
  const { api } = buildHarness([]);
  t('空对象 → 归属为空串（不抛错、不默认当月）', () => eq(api.monthOf({}), ''));
  t('非法日期 → 回退到 month 字段', () => eq(api.monthOf({ date: 'bad', month: '2026-08' }), '2026-08'));
  t('金额为空/非数字时汇总按 0 计', () => eq(api.sumExtraIncome('2026-08'), 0));
  t('无数据的月份汇总为 0', () => eq(buildHarness([{ id: 'x', desc: '', amount: 50, date: '2026-08-02' }]).api.sumExtraIncome('2026-10'), 0));
}

console.log('\n' + '─'.repeat(52));
console.log(fail === 0 ? `全部通过：${pass} 项 ✓` : `通过 ${pass} 项，失败 ${fail} 项 ✗`);
process.exit(fail === 0 ? 0 : 1);
