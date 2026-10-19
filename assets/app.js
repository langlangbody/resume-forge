/* ============================================================
   ResumeForge — 简历工坊
   app.js：状态 + 渲染 + 交互。依赖 engine.js（window.RF_ENGINE）。
   无框架、无构建、无网络请求。数据只存 localStorage。
   ============================================================ */
(function () {
  'use strict';

  var E = window.RF_ENGINE;
  var STORE_KEY = 'resumeforge.draft.v1';

  /* ---------------- 默认数据 ---------------- */

  function blankResume() {
    return {
      name: '',
      title: '',
      summary: '',
      contact: { phone: '', email: '', city: '', link: '' },
      skills: [
        { group: '语言 / 框架', items: [] },
        { group: '工具 / 平台', items: [] }
      ],
      experience: [],
      projects: [],
      education: [],
      meta: { theme: 'classic', fontScale: 1 }
    };
  }

  function sampleResume() {
    return {
      name: '示例·张明',
      title: '前端工程师',
      summary: '5 年前端开发，主导过 3 个中后台系统的从 0 到 1。最近一年把主站首屏从 3.2s 压到 900ms，转化率提升 12%。关注工程化与性能，现在找前端负责人方向的岗位。',
      contact: {
        phone: '138-0000-0000',
        email: 'zhangming@example.com',
        city: '杭州',
        link: 'github.com/example'
      },
      skills: [
        { group: '语言 / 框架', items: ['JavaScript', 'TypeScript', 'Vue 3', 'React', 'Node.js'] },
        { group: '工具 / 平台', items: ['Vite', 'Webpack', 'Docker', 'Git', 'Figma'] }
      ],
      experience: [
        {
          org: '某电商科技公司',
          role: '高级前端工程师',
          start: '2022-03',
          end: '',
          city: '杭州',
          desc: '',
          bullets: [
            '主导主站性能治理，首屏加载从 3.2s 降到 900ms（降幅 72%），落地页转化率提升 12%',
            '搭建公司内部组件库，覆盖 67 个组件，被 5 条业务线复用，新页面开发时间缩短 40%',
            '重构订单模块的表单校验，线上表单报错从每月 1200 次降到 90 次'
          ]
        },
        {
          org: '某在线教育公司',
          role: '前端工程师',
          start: '2019-07',
          end: '2022-02',
          city: '北京',
          desc: '',
          bullets: [
            '负责直播课堂前端开发，支撑单场 8000 人同时在线，卡顿投诉下降 60%',
            '参与搭建移动端 H5 活动页模板，运营自助产出 200+ 页面，减少前端排期 70%'
          ]
        }
      ],
      projects: [
        {
          name: 'Mussel 组件库（开源）',
          role: '作者 / 维护者',
          start: '2021-05',
          end: '',
          desc: 'Vue 3 组件库，525 次提交，覆盖表单、表格、弹层等 22 类组件。',
          bullets: [
            '设计基于 CSS 变量的主题体系，暗色模式只覆盖变量，零样式重写',
            '解决 Sass 编译期注入导致的重复产物，构建体积减少 60KB'
          ]
        }
      ],
      education: [
        { school: '某某大学', major: '计算机科学与技术', degree: '本科', start: '2015-09', end: '2019-06' }
      ],
      meta: { theme: 'classic', fontScale: 1 }
    };
  }

  /* ---------------- 状态 ---------------- */

  var state = load() || sampleResume();
  var ui = {
    open: { basic: 1, summary: 1, contact: 1, skills: 1, exp: 1, proj: 0, edu: 0 },
    jd: '',
    jdResult: null,
    audit: null
  };

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 私密模式等，忽略 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return null;
      var base = blankResume();
      for (var k in base) if (!(k in d)) d[k] = base[k];
      d.meta = d.meta || { theme: 'classic', fontScale: 1 };
      return d;
    } catch (e) { return null; }
  }

  /* ---------------- 工具 ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.setAttribute('data-on', '1');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.setAttribute('data-on', '0'); }, 1900);
  }

  // 在某个数组项的某个字段上做"输入即更新"，保持光标
  function bindInput(node, get, set, onAfter) {
    node.value = get();
    node.addEventListener('input', function () {
      set(node.value);
      save();
      renderPreview();
      renderAuditDebounced();
      if (onAfter) onAfter();
    });
  }

  var auditTimer = null;
  function renderAuditDebounced() {
    clearTimeout(auditTimer);
    auditTimer = setTimeout(function () {/* 预览已即时更新；审计在高频输入时延后 */}, 0);
  }

  /* ---------------- 左栏：表单 ---------------- */

  function acc(key, name, count) {
    var open = ui.open[key] ? '1' : '0';
    return el('div', { class: 'rf-acc', 'data-open': open }, [
      el('div', {
        class: 'rf-acc__head',
        onclick: function () {
          ui.open[key] = ui.open[key] ? 0 : 1;
          renderForm();
        }
      }, [
        el('span', { class: 'rf-acc__caret', text: '▶' }),
        el('span', { class: 'rf-acc__name', text: name }),
        count !== undefined ? el('span', { class: 'rf-acc__count', text: String(count) }) : null
      ])
    ]);
  }

  function field(label, node, hint) {
    return el('div', { class: 'rf-field' }, [
      el('label', { class: 'rf-field__label', text: label }),
      node,
      hint ? el('div', { class: 'rf-hint', text: hint }) : null
    ]);
  }

  function input(get, set, ph, tag) {
    var n = el(tag || 'input', { class: tag === 'textarea' ? 'rf-textarea' : 'rf-input', placeholder: ph || '' });
    if (tag === 'textarea') n.rows = 3;
    bindInput(n, get, set);
    return n;
  }

  function renderForm() {
    var box = $('#form-body');
    box.textContent = '';
    var frag = document.createDocumentFragment();

    /* --- 基本信息 --- */
    var a1 = acc('basic', '基本信息', state.name ? 1 : 0);
    frag.appendChild(a1);
    a1.appendChild(el('div', { class: 'rf-acc__body' }, [
      field('姓名', input(function () { return state.name; }, function (v) { state.name = v; }, '张三')),
      field('目标岗位', input(function () { return state.title; }, function (v) { state.title = v; }, '前端工程师 / 产品经理')),
      el('div', { class: 'rf-row' }, [
        field('手机', input(function () { return state.contact.phone; }, function (v) { state.contact.phone = v; }, '138-0000-0000')),
        field('邮箱', input(function () { return state.contact.email; }, function (v) { state.contact.email = v; }, 'me@example.com'))
      ]),
      el('div', { class: 'rf-row' }, [
        field('城市', input(function () { return state.contact.city; }, function (v) { state.contact.city = v; }, '杭州')),
        field('主页 / GitHub', input(function () { return state.contact.link; }, function (v) { state.contact.link = v; }, 'github.com/you'))
      ])
    ]));

    /* --- 个人简介 --- */
    var a2 = acc('summary', '个人简介', state.summary ? state.summary.length : 0);
    frag.appendChild(a2);
    a2.appendChild(el('div', { class: 'rf-acc__body' }, [
      field('2–3 行，写清「你是谁 + 最硬的成绩 + 要什么岗」',
        input(function () { return state.summary; }, function (v) { state.summary = v; },
          '例：5 年后端开发，主导订单系统拆分，QPS 从 800 提到 6000。现在找架构方向岗位。', 'textarea')),
      el('div', { class: 'rf-hint', text: '建议 120 字以内。HR 平均看这一段的概率最高，别写成自我评价。' })
    ]));

    /* --- 技能 --- */
    var skillCount = state.skills.reduce(function (n, g) { return n + (g.items || []).length; }, 0);
    var a3 = acc('skills', '技能清单', skillCount);
    frag.appendChild(a3);
    var skillBody = el('div', { class: 'rf-acc__body' });
    state.skills.forEach(function (g, gi) {
      skillBody.appendChild(el('div', { class: 'rf-field' }, [
        el('div', { class: 'rf-row' }, [
          input(function () { return g.group; }, function (v) { g.group = v; }, '分组名（如：语言 / 框架）'),
          el('button', {
            class: 'rf-btn rf-btn--danger rf-btn--xs', text: '删除',
            style: 'flex:0 0 auto',
            onclick: function () { state.skills.splice(gi, 1); save(); renderForm(); renderPreview(); }
          })
        ]),
        input(function () { return (g.items || []).join(', '); },
          function (v) {
            g.items = v.split(/[,，、;；]/).map(function (s) { return s.trim(); }).filter(Boolean);
          }, '用逗号分隔：Vue 3, TypeScript, Webpack')
      ]));
    });
    skillBody.appendChild(el('button', {
      class: 'rf-btn rf-btn--xs', text: '+ 添加分组',
      onclick: function () { state.skills.push({ group: '', items: [] }); save(); renderForm(); }
    }));
    skillBody.appendChild(el('div', { class: 'rf-hint', text: '关键词是机器筛选第一关。写你真正会用的，8–20 项。' }));
    a3.appendChild(skillBody);

    /* --- 工作经历 --- */
    var a4 = acc('exp', '工作经历', state.experience.length);
    frag.appendChild(a4);
    a4.appendChild(expBody());

    /* --- 项目经历 --- */
    var a5 = acc('proj', '项目经历', state.projects.length);
    frag.appendChild(a5);
    a5.appendChild(projBody());

    /* --- 教育 --- */
    var a6 = acc('edu', '教育经历', state.education.length);
    frag.appendChild(a6);
    a6.appendChild(eduBody());

    box.appendChild(frag);
  }

  // 通用：可增删的「带要点」条目列表
  function listBody(opts) {
    var body = el('div', { class: 'rf-acc__body' });
    var arr = opts.arr();
    arr.forEach(function (item, i) {
      var card = el('div', { class: 'rf-item' });
      card.appendChild(el('div', { class: 'rf-item__bar' }, [
        el('span', { class: 'rf-item__idx', text: '#' + (i + 1) }),
        el('span', { class: 'rf-item__spacer' }),
        el('button', {
          class: 'rf-btn rf-btn--ghost rf-btn--xs',
          text: i === 0 ? '↓' : '↑',
          title: '上移',
          disabled: i === 0 ? 'disabled' : null,
          onclick: function () { swap(arr, i, i - 1); }
        }),
        el('button', {
          class: 'rf-btn rf-btn--danger rf-btn--xs', text: '删除',
          onclick: function () { arr.splice(i, 1); save(); renderForm(); renderPreview(); renderAudit(); }
        })
      ]));

      opts.fields.forEach(function (f) {
        if (f.half) {
          // 半宽字段成对出现，由调用方自行成组，这里只处理单独半宽
          card.appendChild(field(f.label, input(f.get(item), f.set(item), f.ph)));
        } else {
          card.appendChild(field(f.label, input(f.get(item), f.set(item), f.ph)));
        }
      });

      card.appendChild(bulletEditor(item, opts.bulletLabel || '要点'));
      body.appendChild(card);
    });

    body.appendChild(el('button', {
      class: 'rf-btn rf-btn--primary rf-btn--xs',
      text: '+ 添加' + opts.name,
      onclick: function () {
        arr.push(opts.blank());
        save(); renderForm(); renderPreview(); renderAudit();
      }
    }));
    body.appendChild(el('div', { class: 'rf-hint', text: opts.hint || '' }));
    return body;
  }

  // 一条条要点：多行文本，一行一条
  function bulletEditor(item, label) {
    item.bullets = item.bullets || [];
    var wrap = el('div', { class: 'rf-field' });
    wrap.appendChild(el('label', { class: 'rf-field__label', text: label + '（每行一条，用结果说话）' }));
    var ta = el('textarea', {
      class: 'rf-textarea',
      rows: Math.max(3, item.bullets.length + 1),
      placeholder: '主导 X，指标从 A 到 B（提升 N%）\n搭建 Y，被 N 个业务线复用'
    });
    ta.value = item.bullets.join('\n');
    ta.addEventListener('input', function () {
      item.bullets = ta.value.split('\n').map(function (s) { return s.replace(/^[-•·\s]+/, ''); })
        .filter(function (s) { return s.trim() !== ''; });
      save(); renderPreview(); renderAuditThrottled();
    });
    ta.addEventListener('blur', function () { renderForm(); renderAudit(); });
    wrap.appendChild(ta);
    return wrap;
  }

  function swap(arr, i, j) {
    if (j < 0 || j >= arr.length) return;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    save(); renderForm(); renderPreview();
  }

  function expBody() {
    return listBody({
      name: '经历',
      arr: function () { return state.experience; },
      blank: function () {
        return { org: '', role: '', start: '', end: '', city: '', desc: '', bullets: [] };
      },
      hint: '日期写 2022-03 这种格式，留空表示至今。不足半年的经历审计会标出来。',
      fields: [
        { label: '公司', ph: '某科技公司', get: function (x) { return function () { return x.org; }; }, set: function (x) { return function (v) { x.org = v; }; } },
        { label: '职位', ph: '高级前端工程师', get: function (x) { return function () { return x.role; }; }, set: function (x) { return function (v) { x.role = v; }; } },
        { label: '起止时间（起 / 止，止留空=至今）', ph: '2022-03  ~  2024-06', get: function (x) { return function () { return x.start; }; }, set: function (x) { return function (v) { x.start = v; }; } },
        { label: '结束时间', ph: '留空 = 至今', get: function (x) { return function () { return x.end; }; }, set: function (x) { return function (v) { x.end = v; }; } },
        { label: '城市', ph: '杭州', get: function (x) { return function () { return x.city; }; }, set: function (x) { return function (v) { x.city = v; }; } }
      ]
    });
  }

  function projBody() {
    return listBody({
      name: '项目',
      arr: function () { return state.projects; },
      blank: function () { return { name: '', role: '', start: '', end: '', desc: '', bullets: [] }; },
      hint: '项目经历用来放「公司项目不方便细说」或「个人项目 / 开源」。这一栏最能体现技术深度。',
      fields: [
        { label: '项目名', ph: '订单中台 / 个人开源项目', get: function (x) { return function () { return x.name; }; }, set: function (x) { return function (v) { x.name = v; }; } },
        { label: '担任角色', ph: '负责人 / 核心开发', get: function (x) { return function () { return x.role; }; }, set: function (x) { return function (v) { x.role = v; }; } },
        { label: '项目时间', ph: '2023-04 ~ 2024-01', get: function (x) { return function () { return x.start; }; }, set: function (x) { return function (v) { x.start = v; }; } },
        { label: '结束时间', ph: '留空 = 至今', get: function (x) { return function () { return x.end; }; }, set: function (x) { return function (v) { x.end = v; }; } },
        { label: '一句话说明', ph: '做了什么、服务谁、什么规模', get: function (x) { return function () { return x.desc; }; }, set: function (x) { return function (v) { x.desc = v; }; } }
      ]
    });
  }

  function eduBody() {
    var body = el('div', { class: 'rf-acc__body' });
    state.education.forEach(function (ed, i) {
      var card = el('div', { class: 'rf-item' });
      card.appendChild(el('div', { class: 'rf-item__bar' }, [
        el('span', { class: 'rf-item__idx', text: '#' + (i + 1) }),
        el('span', { class: 'rf-item__spacer' }),
        el('button', {
          class: 'rf-btn rf-btn--danger rf-btn--xs', text: '删除',
          onclick: function () { state.education.splice(i, 1); save(); renderForm(); renderPreview(); }
        })
      ]));
      [
        ['学校', 'school', '某某大学'],
        ['专业', 'major', '计算机科学与技术'],
        ['学历', 'degree', '本科 / 硕士'],
        ['起止时间', 'start', '2015-09 ~ 2019-06'],
        ['结束时间', 'end', '留空 = 至今']
      ].forEach(function (f) {
        card.appendChild(field(f[0], input(
          function () { return ed[f[1]]; },
          function (v) { ed[f[1]] = v; },
          f[2]
        )));
      });
      body.appendChild(card);
    });
    body.appendChild(el('button', {
      class: 'rf-btn rf-btn--primary rf-btn--xs', text: '+ 添加学历',
      onclick: function () {
        state.education.push({ school: '', major: '', degree: '', start: '', end: '' });
        save(); renderForm(); renderPreview();
      }
    }));
    return body;
  }

  var auditThrottleTimer = null;
  function renderAuditThrottled() {
    clearTimeout(auditThrottleTimer);
    auditThrottleTimer = setTimeout(renderAudit, 400);
  }

  /* ---------------- 中栏：预览 ---------------- */

  function fmtRange(start, end) {
    var a = (start || '').trim();
    var b = (end || '').trim();
    if (!a && !b) return '';
    if (!a) return b;
    return a + ' – ' + (b || '至今');
  }

  function renderPreview() {
    var page = $('#page');
    page.setAttribute('data-theme', state.meta.theme || 'classic');
    var scale = state.meta.fontScale || 1;
    page.style.zoom = scale === 1 ? '' : String(scale);

    var h = [];
    h.push('<h1>' + (esc(state.name) || '你的姓名') + '</h1>');
    if (state.title) h.push('<p class="r-pagetitle">' + esc(state.title) + '</p>');

    var c = state.contact || {};
    var contactBits = [c.phone, c.email, c.city, c.link].filter(function (x) { return x && String(x).trim(); });
    if (contactBits.length) {
      h.push('<div class="r-contact">' + contactBits.map(function (x) {
        return '<span>' + esc(x) + '</span>';
      }).join('') + '</div>');
    }

    if (state.summary && state.summary.trim()) {
      h.push('<h2>个人简介</h2>');
      h.push('<p class="r-summary">' + esc(state.summary).replace(/\n/g, '<br>') + '</p>');
    }

    if ((state.experience || []).length) {
      h.push('<h2>工作经历</h2>');
      state.experience.forEach(function (e) {
        if (!e.org && !e.role) return;
        h.push('<div class="rf-entry">');
        h.push('<div class="rf-entry__top">');
        h.push('<span class="rf-entry__org">' + esc(e.org) + '</span>');
        if (e.role) h.push('<span class="rf-entry__role">' + esc(e.role) + '</span>');
        var range = fmtRange(e.start, e.end);
        var metaBits = [e.city, range].filter(Boolean);
        if (metaBits.length) h.push('<span class="rf-entry__meta">' + esc(metaBits.join('　')) + '</span>');
        h.push('</div>');
        if (e.desc) h.push('<div class="rf-entry__sub">' + esc(e.desc) + '</div>');
        var bl = (e.bullets || []).filter(function (b) { return b && b.trim(); });
        if (bl.length) h.push('<ul>' + bl.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>');
        h.push('</div>');
      });
    }

    if ((state.projects || []).length) {
      h.push('<h2>项目经历</h2>');
      state.projects.forEach(function (p) {
        if (!p.name && !p.role) return;
        h.push('<div class="rf-entry">');
        h.push('<div class="rf-entry__top">');
        h.push('<span class="rf-entry__org">' + esc(p.name) + '</span>');
        if (p.role) h.push('<span class="rf-entry__role">' + esc(p.role) + '</span>');
        var r2 = fmtRange(p.start, p.end);
        if (r2) h.push('<span class="rf-entry__meta">' + esc(r2) + '</span>');
        h.push('</div>');
        if (p.desc) h.push('<div class="rf-entry__sub">' + esc(p.desc) + '</div>');
        var bl2 = (p.bullets || []).filter(function (b) { return b && b.trim(); });
        if (bl2.length) h.push('<ul>' + bl2.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>');
        h.push('</div>');
      });
    }

    var skillGroups = (state.skills || []).filter(function (g) {
      return (g.items || []).length && (g.group || '').trim();
    });
    if (skillGroups.length) {
      h.push('<h2>技能</h2>');
      skillGroups.forEach(function (g) {
        h.push('<div class="rf-skillrow"><b>' + esc(g.group) + '：</b>' +
          g.items.map(esc).join('、') + '</div>');
      });
    }

    if ((state.education || []).length) {
      h.push('<h2>教育经历</h2>');
      state.education.forEach(function (ed) {
        if (!ed.school) return;
        h.push('<div class="rf-entry">');
        h.push('<div class="rf-entry__top">');
        h.push('<span class="rf-entry__org">' + esc(ed.school) + '</span>');
        h.push('<span class="rf-entry__role">' + esc([ed.major, ed.degree].filter(Boolean).join(' · ')) + '</span>');
        var r3 = fmtRange(ed.start, ed.end);
        if (r3) h.push('<span class="rf-entry__meta">' + esc(r3) + '</span>');
        h.push('</div></div>');
      });
    }

    page.innerHTML = h.join('');
  }

  /* ---------------- 右栏：审计 ---------------- */

  var LV = function (s) { return s >= 75 ? 'good' : s >= 45 ? 'warn' : 'bad'; };
  var RING_C = function (s) { return s >= 75 ? 'var(--rf-good)' : s >= 45 ? 'var(--rf-warn)' : 'var(--rf-bad)'; };

  function renderAudit() {
    var res = E.audit(state);
    ui.audit = res;
    var box = $('#audit-body');
    box.textContent = '';
    var frag = document.createDocumentFragment();

    /* 总分 */
    var ring = el('div', { class: 'rf-score__ring' });
    ring.style.setProperty('--v', String(res.score));
    ring.style.setProperty('--ring-c', RING_C(res.score));
    ring.appendChild(el('b', { text: String(res.score) }));
    frag.appendChild(el('div', { class: 'rf-score' }, [
      ring,
      el('div', { class: 'rf-score__meta' }, [
        el('div', { class: 'rf-score__grade', text: '评级 ' + res.grade.g }),
        el('div', { class: 'rf-score__note', text: res.grade.note })
      ])
    ]));

    /* 维度 */
    frag.appendChild(el('div', { class: 'rf-sec-title', text: '评分明细' }));
    res.dims.forEach(function (d) {
      var bar = el('div', { class: 'rf-bar' });
      var inner = el('i');
      inner.setAttribute('data-lv', LV(d.score));
      inner.style.width = d.score + '%';
      bar.appendChild(inner);
      frag.appendChild(el('div', { class: 'rf-dim' }, [
        el('div', { class: 'rf-dim__top' }, [
          el('span', { class: 'rf-dim__name', text: d.name + '（权重 ' + d.weight + '%）' }),
          el('span', { class: 'rf-dim__val', text: d.score + ' 分' })
        ]),
        bar,
        el('div', { class: 'rf-hint', text: d.detail })
      ]));
    });

    /* 问题清单 */
    frag.appendChild(el('div', { class: 'rf-sec-title', text: '要改的地方（按优先级）' }));
    if (!res.issues.length) {
      frag.appendChild(el('div', { class: 'rf-empty', text: '没有发现明显问题。建议拿 JD 做一次关键词匹配（左侧底部）。' }));
    } else {
      res.issues.forEach(function (it) {
        var kids = [
          el('div', { class: 'rf-issue__t', text: it.title }),
          el('div', { class: 'rf-issue__f', text: it.fix })
        ];
        if (it.samples && it.samples.length) {
          it.samples.forEach(function (s) {
            kids.push(el('div', { class: 'rf-issue__f' }, [
              el('code', { text: (s.org ? s.org + '：' : '') + s.text + '…' })
            ]));
          });
        }
        var node = el('div', { class: 'rf-issue' }, kids);
        node.setAttribute('data-sev', it.sev);
        frag.appendChild(node);
      });
    }

    /* JD 匹配 */
    frag.appendChild(el('div', { class: 'rf-sec-title', text: 'JD 匹配' }));
    var jdTa = el('textarea', {
      class: 'rf-textarea', rows: 5,
      placeholder: '把目标岗位的 JD 粘进来，这里会告诉你简历里缺哪些关键词'
    });
    jdTa.value = ui.jd;
    jdTa.addEventListener('input', function () { ui.jd = jdTa.value; });
    frag.appendChild(jdTa);
    frag.appendChild(el('div', { class: 'rf-row', style: 'margin-top:8px' }, [
      el('button', {
        class: 'rf-btn rf-btn--primary rf-btn--xs', text: '分析 JD',
        onclick: function () { runJd(); }
      }),
      el('button', {
        class: 'rf-btn rf-btn--xs', text: '清空',
        onclick: function () { ui.jd = ''; ui.jdResult = null; renderAudit(); }
      })
    ]));

    if (ui.jdResult) {
      var r = ui.jdResult;
      frag.appendChild(el('div', { class: 'rf-dim__top', style: 'margin-top:10px' }, [
        el('span', { class: 'rf-dim__name', text: '关键词命中率' }),
        el('span', { class: 'rf-dim__val', text: r.percent + '%（' + r.hit.length + '/' + r.keywords.length + '）' })
      ]));
      var bar2 = el('div', { class: 'rf-bar' });
      var i2 = el('i');
      i2.setAttribute('data-lv', LV(r.percent));
      i2.style.width = r.percent + '%';
      bar2.appendChild(i2);
      frag.appendChild(bar2);
      frag.appendChild(el('div', { class: 'rf-hint', text: r.advice }));

      var kwWrap = el('div', { class: 'rf-kw', style: 'margin-top:8px' });
      r.keywords.slice(0, 30).forEach(function (k) {
        var s = el('span', { text: k });
        s.setAttribute('data-hit', r.hit.indexOf(k) >= 0 ? '1' : '0');
        kwWrap.appendChild(s);
      });
      frag.appendChild(kwWrap);
      frag.appendChild(el('div', { class: 'rf-hint', text: '绿=简历里有，红=JD 有但简历没提。' }));
    }

    box.appendChild(frag);
  }

  function runJd() {
    var jd = (ui.jd || '').trim();
    if (!jd) { toast('先把 JD 粘进来'); return; }
    ui.jdResult = E.matchJd(state, jd);
    renderAudit();
    toast('命中率 ' + ui.jdResult.percent + '%');
  }

  /* ---------------- 顶栏动作 ---------------- */

  function doPrint() {
    renderPreview();
    setTimeout(function () { window.print(); }, 60);
  }

  function doExportJson() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.name || 'resume') + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
    toast('已导出 JSON 存档');
  }

  function doImportJson(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(String(rd.result));
        if (!d || typeof d !== 'object') throw new Error('格式不对');
        state = d;
        var base = blankResume();
        for (var k in base) if (!(k in state)) state[k] = base[k];
        state.meta = state.meta || { theme: 'classic', fontScale: 1 };
        save(); renderAll(); toast('已导入');
      } catch (e) { toast('导入失败：不是有效的存档'); }
    };
    rd.readAsText(f);
    input.value = '';
  }

  function doClear() {
    if (!window.confirm('清空当前简历（含所有经历）→ 恢复成空白模板？')) return;
    state = blankResume();
    save(); renderAll();
    toast('已清空');
  }

  function doSample() {
    state = sampleResume();
    save(); renderAll();
    toast('已载入示例');
  }

  function doTheme(v) {
    state.meta.theme = v;
    save(); renderPreview(); renderForm();
  }

  function renderTemplates() {
    var wrap = $('#tpl-row');
    wrap.textContent = '';
    [
      ['classic', '经典'],
      ['modern', '现代'],
      ['compact', '紧凑'],
      ['serif', '衬线']
    ].forEach(function (t) {
      var b = el('button', {
        class: 'rf-btn rf-btn--xs' + (state.meta.theme === t[0] ? ' rf-btn--primary' : ''),
        text: t[1],
        onclick: function () { doTheme(t[0]); }
      });
      wrap.appendChild(b);
    });
  }

  /* ---------------- 装配 ---------------- */

  function renderAll() {
    renderForm();
    renderPreview();
    renderAudit();
    renderTemplates();
  }

  function boot() {
    $('#btn-print').addEventListener('click', doPrint);
    $('#btn-json').addEventListener('click', doExportJson);
    $('#btn-sample').addEventListener('click', doSample);
    $('#btn-clear').addEventListener('click', doClear);
    $('#file-json').addEventListener('change', function () { doImportJson(this); });
    $('#btn-json-load').addEventListener('click', function () { $('#file-json').click(); });

    var fs = $('#font-scale');
    fs.value = String((state.meta && state.meta.fontScale) || 1);
    fs.addEventListener('input', function () {
      state.meta.fontScale = parseFloat(fs.value);
      $('#fs-val').textContent = Math.round(state.meta.fontScale * 100) + '%';
      save(); renderPreview();
    });
    $('#fs-val').textContent = Math.round(((state.meta && state.meta.fontScale) || 1) * 100) + '%';

    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // 暴露给验证脚本
  window.RF_APP = {
    state: function () { return state; },
    audit: renderAudit,
    preview: renderPreview,
    form: renderForm,
    setTheme: doTheme,
    sample: doSample,
    matchJd: function (jd) { ui.jd = jd; runJd(); return ui.jdResult; }
  };
})();
