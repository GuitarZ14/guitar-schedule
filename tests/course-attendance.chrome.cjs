'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 940 }, serviceWorkers: 'block' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8769/') ? route.continue() : route.abort());
      await page.goto('http://127.0.0.1:8769/');
      await page.evaluate(() => {
        students.push({ id: 'attendance-test-student', name: '状态测试学员' });
        courses.push({
          id: 'attendance-test-course', studentId: 'attendance-test-student',
          date: '2026-11-21', start: '16:20', end: '17:10',
          courseType: 'regular', instrument: 'guitar', status: 'done',
          lessonContent: '原有的上课内容', homework: '原有作业',
        });
        openCourseModal('attendance-test-course');
      });
      const options = page.locator('#fStatusGroup');
      assert(await options.getByText('学生请假').isVisible(), 'Leave option is immediately visible');
      assert(await options.getByText('取消课程').isVisible(), 'Cancel option is immediately visible');
      assert.equal(await page.locator('#cwOverviewStatus').innerText(), '已上课');
      await options.getByText('学生请假').click();
      assert.equal(await page.evaluate(() => getRadio('fStatus')), 'absent');
      assert.equal(await page.locator('#cwOverviewStatus').innerText(), '已请假');
      assert.match(await page.locator('#cwStatusSaveHint').innerText(), /点击底部/);
      assert.equal(await page.evaluate(() => courses.find(c => c.id === 'attendance-test-course').status), 'done',
        'Unsaved state must not change the actual course');
      await page.locator('#courseSave').click();
      assert.equal(await page.evaluate(() => courses.find(c => c.id === 'attendance-test-course').status), 'absent');
      await page.evaluate(() => openCourseModal('attendance-test-course'));
      assert.equal(await page.evaluate(() => getRadio('fStatus')), 'absent');
      await options.getByText('取消课程').click();
      assert.equal(await page.evaluate(() => getRadio('fStatus')), 'cancelled');
      assert.equal(await page.locator('#cwOverviewStatus').innerText(), '已取消');
      await page.locator('#courseSave').click();
      const saved = await page.evaluate(() => courses.find(c => c.id === 'attendance-test-course'));
      assert.equal(saved.status, 'cancelled');
      assert.equal(saved.lessonContent, '原有的上课内容');
      assert.equal(saved.homework, '原有作业');
      assert.deepEqual(saved.attendanceHistory.map(h => [h.from, h.to]), [
        ['done', 'absent'], ['absent', 'cancelled'],
      ]);
      await page.evaluate(() => openCourseModal('attendance-test-course'));
      assert.equal(await page.evaluate(() => getRadio('fStatus')), 'cancelled');
      assert.equal(await page.locator('#cwOverviewStatus').innerText(), '已取消');
      assert.deepEqual(errors, []);
      console.log(width + 'px PASS: direct absence/cancel UI, unsaved guard, saved status, history and preserved data');
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
