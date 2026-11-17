'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../teaching-core');

test('capacityReport 空工作区：字节为正、无流水、不告警', () => {
  const cap = core.capacityReport({ students: [], courses: [], extraIncome: [] });
  assert.ok(cap.workspaceBytes > 0);
  assert.equal(cap.workspaceMax, 800000);
  assert.equal(cap.entriesTotal, 0);
  assert.equal(cap.maxStudentEntries, 0);
  assert.equal(cap.entriesMax, 120);
  assert.equal(cap.nearWorkspace, false);
  assert.equal(cap.overWorkspace, false);
  assert.equal(cap.nearEntries, false);
  assert.equal(cap.overEntries, false);
});

test('capacityReport 单学员流水接近 120 条时触发 ≥70% 告警', () => {
  const entries = Array.from({ length: 90 }, (_, i) => ({
    id: 'e' + i, type: 'recharge', delta: 1, date: '2026-11-02', note: '测试流水', createdAt: '2026-11-01T00:00:00Z'
  }));
  const cap = core.capacityReport({ students: [{ id: 's1', name: '甲', lessonAccount: { asOf: '2026-11-01', opening: 0, entries } }], courses: [], extraIncome: [] });
  assert.equal(cap.entriesTotal, 90);
  assert.equal(cap.maxStudentEntries, 90);
  assert.equal(cap.nearEntries, true);
  assert.equal(cap.overEntries, false);
});

test('capacityReport 工作区超过 800KB 时触发告警', () => {
  const courses = [];
  for (let i = 0; i < 2500; i++) {
    courses.push({ id: 'c' + i, studentId: 's1', date: '2026-11-01', start: '09:00', end: '09:50', status: 'done', lessonContent: 'x'.repeat(300) });
  }
  const cap = core.capacityReport({ students: [{ id: 's1', name: '甲' }], courses, extraIncome: [] });
  assert.ok(cap.workspaceBytes > 800000, '2500 条长内容课程应超过 800KB，实际 ' + cap.workspaceBytes);
  assert.equal(cap.overWorkspace, true);
  assert.equal(cap.nearWorkspace, true);
});
