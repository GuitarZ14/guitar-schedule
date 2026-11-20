'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 940 }, serviceWorkers: 'block' });
      await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:8769/') ? route.continue() : route.abort());
      await page.goto('http://127.0.0.1:8769/');
      await page.evaluate(() => {
        document.body.innerHTML = '<main class="hw-detail" id="test"></main>';
        window.modelCalls = [];
        window.cloudWrites = [];
        window.TeachingDesktopHomework.scope = async () => 'teacher-test';
        window.TeachingDesktopHomework.request = async (input, scope) => {
          if (input.action === 'teacherCoursePlan') return { plan: null };
          if (input.action === 'generateHomeworkDraft') {
            modelCalls.push({ input, scope });
            return new Promise(resolve => {
              window.finishGeneration = () => resolve({ workspaceId: 'teacher-test', draft: {
                title: '主歌换和弦', tasks: [{ contentText: '保持拍点循环换和弦', acceptanceCriteria: '不看提示也能保持拍点' }],
              } });
            });
          }
          if (input.action === 'saveMixedDraft' || input.action === 'publishMixed') {
            cloudWrites.push(input);
            return { revision: cloudWrites.length };
          }
          throw Error('Unexpected operation ' + input.action);
        };
        window.openCourse = id => TeachingHomeworkEditor.openEditor(document.querySelector('#test'), {
          id, studentId: 'student-test', studentName: '模拟学员', date: '2026-11-18', instrument: 'guitar',
          lessonContent: '练习主歌换和弦', focus: '换和弦漏拍', note: '教师私人备注',
        }, null, () => {});
      });
      await page.evaluate(() => openCourse('course-1'));
      const button = page.locator('[data-generate-homework]');
      const generate = async () => {
        await page.evaluate(() => { window.finishGeneration = null; });
        await button.click();
        await page.waitForFunction(() => Boolean(window.finishGeneration));
      };
      await generate();
      await page.evaluate(() => finishGeneration());
      await page.locator('[data-message]').filter({ hasText: '已生成本机草稿' }).waitFor();
      assert.equal(await page.locator('[name=title]').inputValue(), '主歌换和弦');
      assert.equal(await page.locator('[data-task=acceptanceCriteria]').inputValue(), '不看提示也能保持拍点');
      assert.deepEqual(await page.evaluate(() => modelCalls[0]), {
        input: { action: 'generateHomeworkDraft', courseId: 'course-1', studentId: 'student-test',
          lessonContent: '练习主歌换和弦', focus: '换和弦漏拍' },
        scope: 'teacher-test',
      });
      assert.deepEqual(await page.evaluate(() => cloudWrites), []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 1440 && process.env.SCREENSHOT_DIR && fs.existsSync(process.env.SCREENSHOT_DIR))
        await page.screenshot({ path: process.env.SCREENSHOT_DIR + '/工作台作业草稿.png' });

      await page.locator('[data-task=acceptanceCriteria]').fill('教师确认：独立换和弦时不漏拍');
      await page.evaluate(() => openCourse('course-1'));
      assert.equal(await page.locator('[data-task=acceptanceCriteria]').inputValue(), '教师确认：独立换和弦时不漏拍');
      await button.click();
      await page.getByText('已有作业草稿，请继续编辑原草稿').waitFor();
      assert.equal(await page.evaluate(() => modelCalls.length), 1);
      await page.locator('[data-save]').click();
      await page.waitForFunction(() => cloudWrites.length === 1);
      assert.deepEqual(await page.evaluate(() => cloudWrites.map(row => row.action)), ['saveMixedDraft']);

      await page.evaluate(() => openCourse('course-2'));
      await generate();
      await page.locator('[data-task=contentText]').fill('教师手动填写');
      await page.evaluate(() => finishGeneration());
      await page.getByText('作业表单已修改，已保留当前内容').waitFor();
      assert.equal(await page.locator('[data-task=contentText]').inputValue(), '教师手动填写');

      await page.evaluate(() => openCourse('course-3'));
      await generate();
      await page.evaluate(() => openCourse('course-4'));
      await page.evaluate(() => finishGeneration());
      assert.equal(await page.locator('[data-task=contentText]').inputValue(), '');
      await page.close();
      console.log(width + 'px PASS: generation, local edits, explicit save, and stale response isolation');
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
