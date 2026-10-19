/* ============================================================
   ResumeForge — 简历工坊
   engine.js：纯逻辑层。评分、诊断、关键词匹配、文本分析。
   无依赖，不碰 DOM，可被单测直接引用（window.RF_ENGINE / module.exports）。
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RF_ENGINE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- 常量 ---------------- */

  // 弱动词：写了等于没写，不能体现"我做了什么导致什么变化"
  var WEAK_VERBS = [
    '负责', '参与', '协助', '帮忙', '配合', '跟进', '支持', '了解', '熟悉',
    '接触', '涉及', '承担', '从事', '做一些', '完成相关', '相关工作',
    'responsible for', 'helped', 'assisted', 'participated', 'involved in',
    'worked on', 'in charge of', 'supported'
  ];

  // 强动词：动作 + 结果导向
  var STRONG_VERBS = [
    '主导', '牵头', '搭建', '设计', '重构', '优化', '提升', '降低', '缩短',
    '提升至', '从 0 到 1', '定位', '排查', '交付', '推动', '落地', '制定',
    '量化', '压测', '迁移', '合并', '拆分', '自动化', '沉淀', '复用',
    'led', 'built', 'designed', 'refactored', 'optimized', 'improved',
    'reduced', 'increased', 'shipped', 'delivered', 'migrated', 'automated',
    'launched', 'architected', 'scaled', 'eliminated'
  ];

  // 空话黑名单：招聘方读到的全部是"我应该很厉害"却拿不到证据
  var FLUFF = [
    '性格开朗', '积极向上', '沟通能力强', '团队合作精神', '吃苦耐劳',
    '学习能力强', '责任心强', '抗压能力强', '有较强的', '良好的',
    '优秀的', '出色的', '热爱技术', '对技术有热情', '工作认真',
    'team player', 'hard working', 'passionate', 'excellent communication',
    'detail-oriented', 'self-motivated', 'quick learner'
  ];

  // 量化信号的多种表达
  var METRIC_PATTERNS = [
    /\d+(\.\d+)?\s*%/,                       // 35%
    /\d+(\.\d+)?\s*(倍|个百分点)/,
    /\d+(\.\d+)?\s*(万|亿|k|K|w|W)\b/,        // 120万 / 30k
    /(提升|提高|增长|降低|下降|减少|缩短|节约|节省|压缩|扩大|翻)[^。；;\n]{0,10}?\d/,
    /\d+\s*(人|名|个|款|条|台|次|天|小时|周|月|年)/,
    /\d+(\.\d+)?\s*(ms|s|秒|min|分钟|小时|day|天)/i,
    /\d+\s*(QPS|TPS|RPS|pv|PV|uv|UV|DAU|MAU|GMV)/,
    /\$\s*\d+|￥\s*\d+|RMB\s*\d+/i,
    /(from|到|至)\s*\d+[^。；;\n]{0,6}→\s*\d+/,
    /\d+\s*[→>]\s*\d+/                      // 2s → 300ms
  ];

  // 常见岗位关键词库：用于 JD 匹配。
  var ROLE_KEYWORDS = {
    frontend: ['vue', 'react', 'typescript', 'javascript', 'webpack', 'vite', 'rollup',
      'css', 'sass', 'node', '组件库', '性能优化', '工程化', '小程序', 'uni-app',
      'next.js', 'nuxt', 'pinia', 'redux', 'websocket', 'ssr', '可视化', 'echarts'],
    backend: ['java', 'go', 'golang', 'python', 'node', 'spring', 'mysql', 'redis',
      'kafka', 'rabbitmq', 'docker', 'kubernetes', 'k8s', '微服务', '分布式', '高并发',
      'rpc', 'grpc', 'mongodb', 'postgresql', 'elasticsearch', '性能调优', 'jvm'],
    data: ['sql', 'python', 'spark', 'flink', 'hive', 'etl', '数仓', '数据建模',
      'bi', 'tableau', 'powerbi', 'pandas', '机器学习', '特征工程', 'abtest', 'ab test',
      '指标', '看板', '埋点'],
    product: ['需求分析', 'prd', '原型', 'axure', 'figma', '用户调研', '竞品分析',
      '数据驱动', '增长', '留存', '转化率', 'a/b', '迭代', 'roadmap', '项目管理'],
    design: ['figma', 'sketch', 'photoshop', 'illustrator', 'ae', '动效', '交互设计',
      '视觉设计', '设计规范', '组件化', '用户研究', '可用性', 'ui', 'ux', '平面'],
    ops: ['linux', 'nginx', 'shell', 'python', 'prometheus', 'grafana', 'ci/cd',
      'jenkins', 'ansible', 'terraform', 'aws', '阿里云', '监控', '告警', '日志',
      '自动化运维', '容器化'],
    marketing: ['seo', 'sem', '投放', 'roi', '转化率', '私域', '社群', '内容运营',
      '活动策划', '用户增长', '留存', '复购', 'crm', 'kol', '小红书', '抖音'],
    general: ['项目管理', '跨部门', '汇报', '流程', '标准化', '培训', '文档',
      '效率', '成本', '预算', '合规', '质量', '复盘', 'sop']
  };

  // 中文岗位名直接映射到方向：JD 和简历标题里都是这种写法
  var ROLE_ALIAS = {
    frontend: ['前端', '前端开发', 'web前端', 'web 前端', 'h5', '大前端', '客户端', '小程序'],
    backend: ['后端', '服务端', '后端开发', 'java', 'golang', 'php', 'c++', '架构师'],
    data: ['数据', '数据分析', '数据开发', '数据仓库', '数仓', '算法', '机器学习', 'bi'],
    product: ['产品经理', '产品设计', '产品运营', 'pm'],
    design: ['设计', 'ui', 'ux', '交互', '视觉', '平面'],
    ops: ['运维', 'devops', 'sre', '系统工程师', 'dba', '测试'],
    marketing: ['运营', '市场', '增长', '新媒体', '内容运营', '用户运营', '营销', '电商']
  };

  // 学历/时间 解析用的月份表
  var MONTH_RE = /(\d{4})\s*[年.\-/]\s*(\d{1,2})?\s*月?/;

  /* ---------------- 小工具 ---------------- */

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function round1(n) { return Math.round(n * 10) / 10; }

  function isEmpty(v) {
    return v === undefined || v === null || String(v).trim() === '';
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().trim();
  }

  function hasAny(text, list) {
    var t = norm(text);
    for (var i = 0; i < list.length; i++) {
      if (t.indexOf(norm(list[i])) >= 0) return true;
    }
    return false;
  }

  function matchedOf(text, list) {
    var t = norm(text), out = [];
    for (var i = 0; i < list.length; i++) {
      if (t.indexOf(norm(list[i])) >= 0) out.push(list[i]);
    }
    return out;
  }

  // 把任意日期串解析成"月序列"（用于算时长），失败返回 null
  function parseMonth(str) {
    if (isEmpty(str)) return null;
    var s = String(str).trim();
    if (/^(至今|现在|now|present|current)$/i.test(s)) return { now: true };
    var m = s.match(MONTH_RE);
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var mo = m[2] ? parseInt(m[2], 10) : 1;
    if (mo < 1 || mo > 12) mo = 1;
    return { y: y, m: mo, idx: y * 12 + mo - 1 };
  }

  // 计算一段经历的月数（end 可空 = 至今）
  function monthsBetween(startStr, endStr, nowRef) {
    var a = parseMonth(startStr), b = parseMonth(endStr);
    if (!a) return null;
    var now = nowRef || new Date();
    var endIdx;
    if (!b || b.now) endIdx = now.getFullYear() * 12 + now.getMonth();
    else endIdx = b.idx;
    if (a.idx === undefined) return null;
    var d = endIdx - a.idx + 1;
    return d > 0 ? d : null;
  }

  // 判断一段经历是否"太短"，返回月数
  function shortTenure(exp, nowRef) {
    var mo = monthsBetween(exp.start, exp.end, nowRef);
    if (mo !== null && mo < 6) return mo;
    return null;
  }

  /* ---------------- 文本层分析 ---------------- */

  // 分析一条要点（bullet / 职责描述）
  function analyzeBullet(text) {
    var raw = String(text || '').trim();
    var isEmptyLine = raw === '';
    var metrics = [];
    for (var i = 0; i < METRIC_PATTERNS.length; i++) {
      var m = raw.match(METRIC_PATTERNS[i]);
      if (m) metrics.push(m[0].trim());
    }
    var weak = matchedOf(raw, WEAK_VERBS);
    var strong = matchedOf(raw, STRONG_VERBS);
    var fluff = matchedOf(raw, FLUFF);
    return {
      text: raw,
      empty: isEmptyLine,
      len: raw.length,
      metrics: metrics,
      hasMetric: metrics.length > 0,
      weakVerbs: weak,
      strongVerbs: strong,
      fluff: fluff,
      // 该要点是否"有效"：有长度、不空话、且至少有一点可验证信息
      effective: !isEmptyLine && raw.length >= 8 && fluff.length === 0
    };
  }

  function collectBullets(resume) {
    var out = [];
    (resume.experience || []).forEach(function (e, ei) {
      (e.bullets || []).forEach(function (b, bi) {
        out.push({ scope: 'experience', ei: ei, bi: bi, org: e.org, role: e.role, a: analyzeBullet(b) });
      });
    });
    (resume.projects || []).forEach(function (p, pi) {
      (p.bullets || []).forEach(function (b, bi) {
        out.push({ scope: 'project', pi: pi, bi: bi, org: p.name, role: p.role, a: analyzeBullet(b) });
      });
    });
    return out;
  }

  function fullText(resume) {
    var parts = [];
    parts.push(resume.name, resume.title, resume.summary);
    (resume.skills || []).forEach(function (g) {
      parts.push(g.group);
      (g.items || []).forEach(function (x) { parts.push(x); });
    });
    (resume.experience || []).forEach(function (e) {
      parts.push(e.org, e.role, e.desc);
      (e.bullets || []).forEach(function (b) { parts.push(b); });
    });
    (resume.projects || []).forEach(function (p) {
      parts.push(p.name, p.role, p.desc);
      (p.bullets || []).forEach(function (b) { parts.push(b); });
    });
    (resume.education || []).forEach(function (ed) {
      parts.push(ed.school, ed.major, ed.degree);
    });
    return parts.filter(function (x) { return !isEmpty(x); }).join('\n');
  }

  /* ---------------- 维度评分 ---------------- */

  // 每个维度返回 {key, name, weight, score(0-100), detail}
  function scoreImpact(resume) {
    var bullets = collectBullets(resume).filter(function (x) { return !x.a.empty; });
    if (!bullets.length) {
      return dim('impact', '成果量化', 30, 0, '还没有任何要点，无法判断。至少写 3 条带数字的成果。');
    }
    var withMetric = bullets.filter(function (x) { return x.a.hasMetric; }).length;
    var ratio = withMetric / bullets.length;
    var score = clamp(Math.round(ratio * 118), 0, 100);
    var detail;
    if (ratio === 0) detail = bullets.length + ' 条要点里 0 条带数字。招聘方看不到你的产出，只看得到职责。';
    else if (ratio < 0.34) detail = bullets.length + ' 条要点里只有 ' + withMetric + ' 条带数字（' + Math.round(ratio * 100) + '%），建议每条经历至少 2 条带量化。';
    else if (ratio < 0.67) detail = Math.round(ratio * 100) + '% 的要点有量化，已达标线，继续补到 2/3 以上。';
    else detail = Math.round(ratio * 100) + '% 的要点有量化，这一项很扎实。';
    return dim('impact', '成果量化', 30, score, detail, { withMetric: withMetric, total: bullets.length, ratio: ratio });
  }

  function scoreVerb(resume) {
    var bullets = collectBullets(resume).filter(function (x) { return !x.a.empty; });
    if (!bullets.length) return dim('verb', '动词强度', 15, 0, '还没有要点可判断。');
    var weak = 0, strong = 0;
    bullets.forEach(function (x) {
      if (x.a.weakVerbs.length && !x.a.strongVerbs.length) weak++;
      if (x.a.strongVerbs.length) strong++;
    });
    var score = clamp(Math.round((strong / bullets.length) * 100 - (weak / bullets.length) * 40), 0, 100);
    var detail = '强动作词 ' + strong + ' 条 / 弱动词 ' + weak + ' 条（共 ' + bullets.length + ' 条）。' +
      (weak ? '「负责/参与/协助」这类开头会把成果写成岗位说明书。' : '动词用得干净。');
    return dim('verb', '动词强度', 15, score, detail, { weak: weak, strong: strong });
  }

  function scoreFluff(resume) {
    var text = fullText(resume);
    var hits = matchedOf(text, FLUFF);
    var uniq = [];
    hits.forEach(function (h) { if (uniq.indexOf(h) < 0) uniq.push(h); });
    // 空话越多分越低
    var score = clamp(100 - uniq.length * 22, 0, 100);
    var emptyish = isEmpty(resume.summary);
    if (emptyish) score = clamp(score - 25, 0, 100);
    var detail = uniq.length
      ? '发现 ' + uniq.length + ' 处空话：' + uniq.slice(0, 5).join('、') + '。这类词占版面但不传递信息。'
      : '没有空话堆砌。';
    if (emptyish) detail += ' 另外「个人简介」是空的，简历少了一个开场钩子。';
    return dim('fluff', '空话控制', 10, score, detail, { fluff: uniq, summaryEmpty: emptyish });
  }

  function scoreStructure(resume) {
    var have = [];
    function chk(ok, name) { have.push({ ok: ok, name: name }); }
    chk(!isEmpty(resume.name), '姓名');
    chk(!isEmpty(resume.title), '目标岗位');
    chk(!isEmpty(resume.summary), '个人简介');
    chk((resume.experience || []).length > 0, '工作经历');
    chk((resume.education || []).length > 0, '教育经历');
    chk((resume.skills || []).some(function (g) { return (g.items || []).length; }), '技能清单');
    chk((resume.projects || []).length > 0, '项目经历');
    var okCount = have.filter(function (x) { return x.ok; }).length;
    var score = clamp(Math.round((okCount / have.length) * 100), 0, 100);
    var miss = have.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
    return dim('structure', '结构完整', 18, score,
      miss.length ? '缺少：' + miss.join('、') + '。' : '七项结构齐全。',
      { missing: miss, checks: have });
  }

  function scoreContact(resume) {
    var c = resume.contact || {};
    var items = [
      { k: 'phone', v: c.phone, name: '手机号' },
      { k: 'email', v: c.email, name: '邮箱' },
      { k: 'city', v: c.city, name: '所在城市' }
    ];
    var ok = items.filter(function (x) { return !isEmpty(x.v); });
    var problems = [];
    if (!isEmpty(c.phone) && !/^[\d\s+()-]{7,}$/.test(String(c.phone))) problems.push('手机号格式可疑');
    if (!isEmpty(c.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c.email))) problems.push('邮箱格式可疑');
    var score = clamp(Math.round((ok.length / items.length) * 100) - problems.length * 20, 0, 100);
    var miss = items.filter(function (x) { return isEmpty(x.v); }).map(function (x) { return x.name; });
    var detail = miss.length ? '缺少 ' + miss.join('、') + '。' : '联系方式齐全。';
    if (problems.length) detail += ' ' + problems.join('；') + '。';
    return dim('contact', '联系可达', 5, score, detail, { problems: problems });
  }

  function scoreTimeline(resume) {
    var exps = (resume.experience || []).filter(function (e) { return !isEmpty(e.org); });
    if (!exps.length) return dim('timeline', '时间线健康', 10, 30, '没有工作经历可检查。');
    var problems = [], shortCount = 0, overlap = 0;
    var ranges = [];
    exps.forEach(function (e) {
      if (isEmpty(e.start)) { problems.push((e.org || '某段经历') + ' 没有开始时间'); return; }
      var months = monthsBetween(e.start, e.end);
      if (months !== null && months < 6) { shortCount++; problems.push((e.org || '') + ' 仅 ' + months + ' 个月（不足半年）'); }
      var a = parseMonth(e.start);
      if (a && a.idx !== undefined) ranges.push({ org: e.org, from: a.idx });
    });
    ranges.sort(function (x, y) { return x.from - y.from; });
    for (var i = 1; i < ranges.length; i++) {
      if (ranges[i].from < ranges[i - 1].from) overlap++;
    }
    var score = clamp(100 - shortCount * 20 - problems.length * 8, 0, 100);
    var detail = problems.length
      ? problems.slice(0, 3).join('；') + '。' + (problems.length > 3 ? ' 等 ' + problems.length + ' 处。' : '')
      : exps.length + ' 段经历时间完整、无短工期。';
    return dim('timeline', '时间线健康', 10, score, detail, { shortCount: shortCount, problems: problems });
  }

  function scoreFocus(resume) {
    // 目标岗位 vs 内容的关键词聚焦度
    var text = norm(fullText(resume) + ' ' + (resume.summary || ''));
    var title = norm(resume.title);
    if (isEmpty(resume.title)) {
      return dim('focus', '岗位聚焦', 12, 30, '还没写目标岗位，无法判断内容是否对得上。', { hint: true });
    }
    var roleKey = detectRole(resume.title + ' ' + (resume.summary || ''));
    var kws = ROLE_KEYWORDS[roleKey] || [];
    var hit = kws.filter(function (k) { return text.indexOf(norm(k)) >= 0; });
    var score = kws.length ? clamp(Math.round((hit.length / Math.min(kws.length, 12)) * 100), 0, 100) : 50;
    var detail = '检测到岗位方向「' + roleLabel(roleKey) + '」，命中 ' + hit.length + ' 个相关关键词' +
      (hit.length ? '：' + hit.slice(0, 8).join('、') : '') + '。';
    return dim('focus', '岗位聚焦', 12, score, detail, { roleKey: roleKey, hit: hit });
  }

  var ROLE_LABEL = {
    frontend: '前端', backend: '后端', data: '数据', product: '产品',
    design: '设计', ops: '运维/DevOps', marketing: '运营/市场', general: '通用'
  };
  function roleLabel(k) { return ROLE_LABEL[k] || '通用'; }

  function detectRole(text) {
    var t = norm(text);
    // 1) 先看中文岗位名 / 别名直接命中（最快也最准）
    var aliasBest = '', aliasN = 0;
    Object.keys(ROLE_ALIAS).forEach(function (k) {
      var n = ROLE_ALIAS[k].filter(function (w) { return t.indexOf(norm(w)) >= 0; }).length;
      if (n > aliasN) { aliasN = n; aliasBest = k; }
    });
    if (aliasBest) return aliasBest;
    // 2) 再用技能词库兜底
    var best = 'general', bestN = 0;
    Object.keys(ROLE_KEYWORDS).forEach(function (k) {
      if (k === 'general') return;
      var n = ROLE_KEYWORDS[k].filter(function (w) { return t.indexOf(norm(w)) >= 0; }).length;
      if (n > bestN) { bestN = n; best = k; }
    });
    return best;
  }

  function dim(key, name, weight, score, detail, extra) {
    var d = { key: key, name: name, weight: weight, score: clamp(Math.round(score), 0, 100), detail: detail };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) d[k] = extra[k];
    return d;
  }

  var DIMENSIONS = [
    scoreImpact, scoreVerb, scoreStructure, scoreTimeline,
    scoreFocus, scoreFluff, scoreContact
  ];

  function gradeOf(score) {
    if (score >= 90) return { g: 'A', note: '可以直接投了。' };
    if (score >= 80) return { g: 'B+', note: '高于平均，改掉下面几个问题会更强。' };
    if (score >= 70) return { g: 'B', note: '可用，但有明显短板，投大厂会被筛。' };
    if (score >= 55) return { g: 'C', note: '需要修改。当前更像职责说明书而不是成果清单。' };
    return { g: 'D', note: '问题较多，建议按下面清单逐条重写。' };
  }

  function audit(resume) {
    var dims = DIMENSIONS.map(function (fn) { return fn(resume); });
    var total = 0, wsum = 0;
    dims.forEach(function (d) { total += d.score * d.weight; wsum += d.weight; });
    var score = wsum ? Math.round(total / wsum) : 0;
    return {
      score: score,
      grade: gradeOf(score),
      dims: dims,
      issues: buildIssues(resume, dims)
    };
  }

  /* ---------------- 问题清单（可执行建议） ---------------- */

  function buildIssues(resume, dims) {
    var out = [];
    var dimMap = {};
    dims.forEach(function (d) { dimMap[d.key] = d; });

    // 1. 量化不足 → 指名道姓找出最该改的几条
    var bullets = collectBullets(resume).filter(function (x) { return !x.a.empty; });
    var noMetric = bullets.filter(function (x) { return !x.a.hasMetric; });
    if (noMetric.length) {
      var worst = noMetric.slice(0, 3).map(function (x) {
        return { org: x.org, text: x.a.text.slice(0, 46) };
      });
      out.push({
        sev: noMetric.length >= 3 ? 'high' : 'mid',
        title: noMetric.length + ' 条要点没有数字',
        fix: '把「做了什么」改成「做了什么 → 变成多少」。',
        samples: worst
      });
    }

    // 2. 弱动词
    var weakLines = bullets.filter(function (x) { return x.a.weakVerbs.length; });
    if (weakLines.length) {
      out.push({
        sev: weakLines.length >= 3 ? 'high' : 'mid',
        title: weakLines.length + ' 条以弱动词开头',
        fix: '「负责 X」→「主导 X」/「搭建 X」/「重构 X」。招聘方看的是动作的分量。',
        samples: weakLines.slice(0, 3).map(function (x) {
          return { org: x.org, text: x.a.text.slice(0, 46) };
        })
      });
    }

    // 3. 空话
    var fluffHits = (dimMap.fluff && dimMap.fluff.fluff) || [];
    if (fluffHits.length) {
      out.push({
        sev: 'mid',
        title: '空话词 ' + fluffHits.length + ' 处',
        fix: '删掉「' + fluffHits.slice(0, 6).join('」「') + '」。删完版面空出来的位置，用来放数字。'
      });
    }

    // 4. 结构缺项
    if (dimMap.structure && dimMap.structure.missing && dimMap.structure.missing.length) {
      out.push({
        sev: dimMap.structure.missing.length >= 3 ? 'high' : 'low',
        title: '缺少板块：' + dimMap.structure.missing.join('、'),
        fix: '这 ' + dimMap.structure.missing.length + ' 项在筛选阶段会被当作"信息不全"。'
      });
    }

    // 5. 时间线
    if (dimMap.timeline && dimMap.timeline.problems && dimMap.timeline.problems.length) {
      out.push({
        sev: dimMap.timeline.shortCount ? 'high' : 'mid',
        title: '时间线有 ' + dimMap.timeline.problems.length + ' 处问题',
        fix: '短工期（<6 个月）要么合并写法、要么在要点里说明产出（"3 个月交付 X，因为…"）。'
      });
    }

    // 6. 每条要点过长 / 过短
    var tooLong = bullets.filter(function (x) { return x.a.len > 120; });
    if (tooLong.length) {
      out.push({
        sev: 'low',
        title: tooLong.length + ' 条要点超过 120 字',
        fix: '一条要点控制在 1–2 行。超长的拆成两条，或把背景部分删掉。'
      });
    }

    // 7. 简介
    if (isEmpty(resume.summary)) {
      out.push({
        sev: 'mid',
        title: '个人简介为空',
        fix: '写 2–3 行：你是谁 + 最硬的 1 个成绩 + 现在要什么岗位。这是 HR 唯一必读的一段。'
      });
    } else if (String(resume.summary).length > 200) {
      out.push({
        sev: 'low',
        title: '个人简介 ' + String(resume.summary).length + ' 字太长',
        fix: '压到 120 字以内。简介是钩子，不是自传。'
      });
    }

    // 8. 技能清单
    var skillCount = (resume.skills || []).reduce(function (n, g) { return n + (g.items || []).length; }, 0);
    if (skillCount < 5) {
      out.push({
        sev: skillCount === 0 ? 'high' : 'mid',
        title: '技能只有 ' + skillCount + ' 项',
        fix: '关键词是机器筛选的第一道关。列出你真正会用的工具和领域词，8–20 项合适。'
      });
    }

    var rank = { high: 0, mid: 1, low: 2 };
    out.sort(function (a, b) { return rank[a.sev] - rank[b.sev]; });
    return out;
  }

  /* ---------------- JD 匹配 ---------------- */

  // 从 JD 文本里抽取有意义的关键词（英文单词 / 中文技术词 / 常见动词短语）
  function extractJdKeywords(jd, limit) {
    var text = String(jd || '');
    var bag = [];
    var seen = {};

    function push(w) {
      // 去重键：去掉 . / - 空格 等分隔符，并剥离尾部 js，
      // 避免 node 与 Node.js、vue 与 vuejs 被当成两个不同关键词重复计入
      var k = norm(w).replace(/[\s.\-_/+]+/g, '');
      if (/^[a-z]{3,}js$/.test(k)) k = k.slice(0, -2);
      if (!k || k.length < 2) return;
      if (seen[k]) return;
      seen[k] = 1;
      bag.push(w);
    }

    // 已知词库里出现的，优先
    Object.keys(ROLE_KEYWORDS).forEach(function (role) {
      ROLE_KEYWORDS[role].forEach(function (w) {
        if (norm(text).indexOf(norm(w)) >= 0) push(w);
      });
    });

    // 英文技术词：2 个字符以上，允许 . / + - #
    var en = text.match(/[A-Za-z][A-Za-z0-9+#.\-]{1,20}/g) || [];
    var stop = ['and', 'the', 'with', 'for', 'you', 'are', 'our', 'will', 'have',
      'this', 'that', 'from', 'your', 'able', 'good', 'team', 'work', 'year',
      'years', 'must', 'plus', 'etc', 'and/or', 'or', 'of', 'to', 'in', 'on'];
    en.forEach(function (w) {
      var lw = norm(w);
      if (stop.indexOf(lw) >= 0) return;
      if (lw.length < 2) return;
      push(w);
    });

    // 中文：2–6 字的连续汉字片段（粗粒度，够用）
    // 关键点：正则切出来的「岗位要求」「年以上」「开发经验」是噪声，
    // 必须按"包含即丢弃"过滤，只留像名词短语的片段。
    var ZH_NOISE = /要求|经验|优先|以上|以下|能力|良好|具备|熟悉|了解|掌握|能够|具有|相关|岗位|职责|负责|工作|任职|我们|希望|公司|团队|项目|以及|或者|如果|可以|优秀|扎实|至少|包括|不限|本科|学历|沟通|性格|独立|主动|按时|完成|参与|配合|孰悉|优先考虑|合作|协调|意识|精神/;
    var zh = text.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
    zh.forEach(function (w) {
      if (ZH_NOISE.test(w)) return;
      if (/^[的了和与及或等这那有在为对于关于]/.test(w)) return; // 虚词开头
      push(w);
    });

    // 反查：库里命中过的排前面（更可信）
    function inLib(w) {
      var k = norm(w);
      return Object.keys(ROLE_KEYWORDS).some(function (r) {
        return ROLE_KEYWORDS[r].some(function (x) { return norm(x) === k; });
      });
    }
    var libHit = bag.filter(inLib);
    var rest = bag.filter(function (w) { return libHit.indexOf(w) < 0; });

    // 库里没有的，只保留"看起来像技术/业务名词"的：全英文、含数字符号、或 2–4 字纯中文
    rest = rest.filter(function (w) {
      if (/[A-Za-z0-9]/.test(w)) return true;
      return w.length >= 2 && w.length <= 4;
    });

    return libHit.concat(rest).slice(0, limit || 40);
  }

  function matchJd(resume, jd) {
    var kws = extractJdKeywords(jd, 40);
    var text = norm(fullText(resume));
    var hit = [], miss = [];
    kws.forEach(function (k) {
      if (text.indexOf(norm(k)) >= 0) hit.push(k);
      else miss.push(k);
    });
    var rate = kws.length ? hit.length / kws.length : 0;
    return {
      keywords: kws,
      hit: hit,
      miss: miss,
      rate: rate,
      percent: Math.round(rate * 100),
      advice: jdAdvice(hit, miss)
    };
  }

  function jdAdvice(hit, miss) {
    if (!miss.length) return 'JD 里的关键词基本都命中了，这份简历对这一岗的机器筛选和人工筛选都友好。';
    var top = miss.slice(0, 10);
    var lines = [];
    lines.push('下面这些词 JD 里有、简历里没有，是最可能被筛掉的原因：');
    lines.push('　' + top.join('、'));
    lines.push('处理原则只有一条：你会但没写 → 补进去；你不会 → 别编，去补真实经历。');
    return lines.join('\n');
  }

  /* ---------------- 输出接口 ---------------- */

  return {
    VERSION: '1.0.0',
    WEAK_VERBS: WEAK_VERBS,
    STRONG_VERBS: STRONG_VERBS,
    FLUFF: FLUFF,
    ROLE_KEYWORDS: ROLE_KEYWORDS,
    // 工具
    analyzeBullet: analyzeBullet,
    collectBullets: collectBullets,
    fullText: fullText,
    monthsBetween: monthsBetween,
    parseMonth: parseMonth,
    detectRole: detectRole,
    roleLabel: roleLabel,
    // 主流程
    audit: audit,
    buildIssues: buildIssues,
    extractJdKeywords: extractJdKeywords,
    matchJd: matchJd
  };
});
