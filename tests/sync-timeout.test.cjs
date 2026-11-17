'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../teaching-core');
const sync = require('../teaching-sync');

const student = { id: 'stu_timeout', name: '合成学员', stuStatus: 'active' };
const course = { id: 'course_timeout', studentId: student.id, date: '2026-11-17', start: '10:00', end: '10:50', status: 'done', instrument: 'guitar', courseCategory: 'regular' };
const data = { students: [student], courses: [course], extraIncome: [] };
const versions = { students_stu_timeout: 1, courses_course_timeout: 1 };

test('a timed-out sync releases the running promise and keeps the local draft', async () => {
  let calls = 0;
  const client = sync.create({
    load: () => ({ base: structuredClone(data), data: structuredClone(data), versions: structuredClone(versions), revision: 1 }),
    save: () => {},
    request: async () => {
      calls += 1;
      const e = new Error('同步请求超时，结果未知，本地修改已保留');
      e.code = 'TIMEOUT';
      throw e;
    },
  });
  const first = await client.sync();
  assert.equal(first, false);
  assert.equal(calls, 1);
  // The local draft must survive an unknown result (no state rollback).
  assert.equal(client.dirty(), false);
  // A second sync must issue a fresh request instead of reusing a stuck promise.
  const second = await client.sync();
  assert.equal(second, false);
  assert.equal(calls, 2);
});

test('an unknown-result timeout is distinguishable from a confirmed rejection', async () => {
  let lastError = null;
  const client = sync.create({
    load: () => ({ base: structuredClone(data), data: structuredClone(data), versions: structuredClone(versions), revision: 1 }),
    save: () => {},
    request: async () => { const e = new Error('同步请求超时'); e.code = 'TIMEOUT'; throw e; },
    onChange: (state, detail) => { if (state === 'error') lastError = detail; },
  });
  await client.sync();
  assert.equal(lastError && lastError.code, 'TIMEOUT');
});
