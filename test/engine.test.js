/* engine.js 自测：纯 node 运行，无浏览器依赖 */
const E = require('/Users/jielanglang/projects/resume-forge/assets/engine.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b), 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); }

console.log('\n=== 1. analyzeBullet 量化识别 ===');
const cases = [
  ['首屏从 3.2s 降到 900ms（降幅 72%）', true],
  ['搭建组件库，被 5 条业务线复用', true],
  ['QPS 从 800 提升到 6000', true],
  ['负责后台管理系统开发', false],
  ['参与需求评审', false],
  ['提升 30% 转化率', true],
  ['培养了 12 人团队', true],
  ['优化了性能', false],
];
cases.forEach(([t, want]) => {
  const a = E.analyzeBullet(t);
  ok('hasMetric=' + want + ' :: ' + t.slice(0, 24), a.hasMetric === want, 'metrics=' + JSON.stringify(a.metrics));
});

console.log('\n=== 2. 弱动词 / 强动词 / 空话 ===');
ok('弱动词「负责」被识别', E.analyzeBullet('负责订单系统').weakVerbs.includes('负责'));
ok('强动词「主导」被识别', E.analyzeBullet('主导订单重构').strongVerbs.includes('主导'));
ok('空话「沟通能力强」被识别', E.analyzeBullet('性格开朗，沟通能力强').fluff.length > 0);
ok('英文弱动词 assisted 被识别', E.analyzeBullet('assisted the team').weakVerbs.length > 0);

console.log('\n=== 3. 日期解析与时长 ===');
eq('parseMonth 2022-03', E.parseMonth('2022-03'), { y: 2022, m: 3, idx: 2022 * 12 + 2 });
eq('parseMonth 中文年月', E.parseMonth('2022年3月'), { y: 2022, m: 3, idx: 2022 * 12 + 2 });
eq('parseMonth 2022.3', E.parseMonth('2022.3'), { y: 2022, m: 3, idx: 2022 * 12 + 2 });
eq('parseMonth 至今', E.parseMonth('至今'), { now: true });
eq('parseMonth present', E.parseMonth('present'), { now: true });
ok('2022-03 → 2022-06 = 4 个月', E.monthsBetween('2022-03', '2022-06') === 4, E.monthsBetween('2022-03', '2022-06'));
ok('跨年 2021-11 → 2022-02 = 4 个月', E.monthsBetween('2021-11', '2022-02') === 4, E.monthsBetween('2021-11', '2022-02'));
ok('垃圾输入返回 null', E.monthsBetween('abc', 'def') === null);

console.log('\n=== 4. audit 全流程 ===');
const good = {
  name: '张明', title: '前端工程师',
  summary: '5 年前端，主导主站性能治理，首屏从 3.2s 降到 900ms。',
  contact: { phone: '138-0000-0000', email: 'a@b.com', city: '杭州' },
  skills: [
    { group: '语言', items: ['JavaScript', 'TypeScript', 'Vue 3'] },
    { group: '工具', items: ['Vite', 'Webpack', 'Docker'] }
  ],
  experience: [
    { org: 'A 公司', role: '高级前端', start: '2022-03', end: '',
      bullets: ['主导主站性能治理，首屏从 3.2s 降到 900ms（降幅 72%）', '搭建组件库，覆盖 67 个组件，被 5 条业务线复用'] },
    { org: 'B 公司', role: '前端', start: '2019-07', end: '2022-02',
      bullets: ['负责直播课堂前端，支撑单场 8000 人同时在线'] }
  ],
  projects: [{ name: 'Mussel', role: '作者', start: '2021-05', end: '', desc: '', bullets: ['设计 CSS 变量主题体系，暗色模式零样式重写'] }],
  education: [{ school: '某大学', major: '计算机', degree: '本科', start: '2015-09', end: '2019-06' }],
  meta: { theme: 'classic', fontScale: 1 }
};
const rGood = E.audit(good);
ok('好简历 score >= 80', rGood.score >= 80, 'score=' + rGood.score);
ok('好简历有 grade', typeof rGood.grade.g === 'string', rGood.grade.g);
ok('7 个维度齐全', rGood.dims.length === 7, rGood.dims.length);
ok('权重合计 100', rGood.dims.reduce((n, d) => n + d.weight, 0) === 100);
ok('所有维度 score 在 0-100', rGood.dims.every(d => d.score >= 0 && d.score <= 100));
console.log('    好简历：' + rGood.score + ' 分 / ' + rGood.grade.g + ' / 问题 ' + rGood.issues.length + ' 条');
rGood.dims.forEach(d => console.log('      · ' + d.name + ' ' + d.score + ' — ' + d.detail.slice(0, 50)));

const bad = {
  name: '李四', title: '', summary: '',
  contact: { phone: 'abc', email: 'not-an-email' },
  skills: [],
  experience: [
    { org: 'C 公司', role: '开发', start: '2023-01', end: '2023-03',
      bullets: ['负责相关开发工作', '参与团队协作，沟通能力强', '协助处理线上问题'] }
  ],
  projects: [], education: [],
  meta: { theme: 'classic', fontScale: 1 }
};
const rBad = E.audit(bad);
ok('烂简历 score < 55', rBad.score < 55, 'score=' + rBad.score);
ok('烂简历 grade D', rBad.grade.g === 'D', rBad.grade.g);
ok('烂简历问题 >= 5 条', rBad.issues.length >= 5, rBad.issues.length);
ok('识别出短工期', rBad.dims.find(d => d.key === 'timeline').problems.length > 0);
console.log('    烂简历：' + rBad.score + ' 分 / ' + rBad.grade.g);
rBad.issues.forEach(i => console.log('      [' + i.sev + '] ' + i.title));

console.log('\n=== 5. 岗位方向识别 ===');
eq('前端岗位', E.detectRole('前端工程师 vue react'), 'frontend');
eq('后端岗位', E.detectRole('后端工程师 java spring 微服务'), 'backend');
eq('数据岗位', E.detectRole('数据仓库 etl hive sql'), 'data');

console.log('\n=== 6. JD 关键词匹配 ===');
const jd = '岗位要求：3 年以上 Vue 开发经验，熟悉 TypeScript、Vite、Webpack，了解 Node.js 与 Docker，有组件库建设经验优先，具备良好的沟通能力与团队合作精神。';
const m = E.matchJd(good, jd);
ok('JD 提取出关键词 >= 6 个', m.keywords.length >= 6, m.keywords.length);
ok('命中率在 0-100', m.percent >= 0 && m.percent <= 100, m.percent);
ok('命中包含 vue', m.hit.map(x => x.toLowerCase()).includes('vue'), JSON.stringify(m.hit.slice(0, 12)));
console.log('    JD 命中 ' + m.percent + '%  → 命中：' + m.hit.join('、'));
console.log('    缺失：' + m.miss.slice(0, 10).join('、'));
ok('缺失列表非空（该 JD 有简历没写的词）', m.miss.length > 0);

console.log('\n=== 7. 空简历不崩 ===');
const blank = { name: '', title: '', summary: '', contact: {}, skills: [], experience: [], projects: [], education: [] };
const rBlank = E.audit(blank);
ok('空简历 score 很低', rBlank.score < 40, rBlank.score);
ok('空简历有结构缺失提示', rBlank.dims.find(d => d.key === 'structure').missing.length >= 5);
ok('无条件崩溃', true);
const mBlank = E.matchJd(blank, jd);
ok('空简历匹配率 0%', mBlank.percent === 0, mBlank.percent);
ok('空 JD 不崩', E.matchJd(good, '').percent === 0);

console.log('\n=== 8. 边界输入 ===');
ok('analyzeBullet(undefined) 不崩', E.analyzeBullet(undefined).empty === true);
ok('analyzeBullet(null) 不崩', E.analyzeBullet(null).empty === true);
ok('audit 空对象不崩', typeof E.audit({}).score === 'number');
ok('极长要点被识别', E.analyzeBullet('x'.repeat(200)).len === 200);

console.log('\n────────────────────────────');
console.log(fail === 0 ? '✅ 全部通过：' + pass + ' / ' + (pass + fail) : '❌ 失败 ' + fail + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
