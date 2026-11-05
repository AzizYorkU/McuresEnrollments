dash.calc('totals', {
  inputs: ['status', 'cip2', 'gender', 'country', 'credential', 'studyyear'],
  title: 'Totals by institution, filter and year',
  description: 'Headcount per institution, level and year: for all students (domestic plus international), and for each field of study, gender, country of citizenship, credential and year of study (each from its own file, so they don’t combine), with international share (all students only), share of all Ontario students, and change from the previous year and from 2012-13.',
  fn: (status, cip2, gender, country, credential, studyyear) => {
    const by = new Map();
    const add = (field, slice, n, intl) => {
      const key = field + '|' + slice;
      const t = by.get(key) ?? { key, field, slice, headcount: 0, international: field === 'All fields' ? 0 : null };
      t.headcount += n;
      if (intl) t.international += n;
      by.set(key, t);
    };
    for (const r of status) add('All fields', r.slice, Number(r.headcount), r.category === 'International');
    for (const r of cip2) add(r.category, r.slice, Number(r.headcount), false);
    for (const [prefix, rows] of [['Gender: ', gender], ['Citizenship: ', country], ['Credential: ', credential], ['Year of study: ', studyyear]])
      for (const r of rows) add(prefix + r.category, r.slice, Number(r.headcount), false);
    const rows = [...by.values()];
    for (const t of rows) {
      const [institution, level, year] = t.slice.split('|');
      const y = Number(year.slice(0, 4));
      const prev = by.get(`${t.field}|${institution}|${level}|${y - 1}-${y}`);
      const base = by.get(`${t.field}|${institution}|${level}|2012-2013`);
      const all = by.get(`${t.field}|All institutions|${level}|${year}`);
      Object.assign(t, {
        institution,
        level,
        year,
        intl_share: t.international == null ? null : t.international / t.headcount,
        ontario_share: all ? t.headcount / all.headcount : null,
        change_prev: prev ? t.headcount / prev.headcount - 1 : null,
        change_base: base && year !== '2012-2013' ? t.headcount / base.headcount - 1 : null,
      });
    }
    return rows;
  },
});

dash.calc('group_totals', {
  inputs: ['totals', 'peer_groups'],
  title: 'Comparison groups combined',
  description: 'Each comparison group’s members added together, for all fields and each field of study: headcount, international share, and change from the previous year and from 2012-13.',
  fn: (totals, peer_groups) => {
    const groupsOf = new Map();
    for (const g of peer_groups) groupsOf.set(g.institution, [...(groupsOf.get(g.institution) ?? []), g.group]);
    const by = new Map();
    for (const t of totals) {
      for (const group of groupsOf.get(t.institution) ?? []) {
        const key = `${group}|${t.field}|${t.level}|${t.year}`;
        const s = by.get(key) ?? { key, group, field: t.field, level: t.level, year: t.year, headcount: 0, international: t.international == null ? null : 0, members: 0 };
        s.headcount += t.headcount;
        if (s.international != null) s.international += t.international;
        s.members += 1;
        by.set(key, s);
      }
    }
    const rows = [...by.values()];
    for (const s of rows) {
      const y = Number(s.year.slice(0, 4));
      const prev = by.get(`${s.group}|${s.field}|${s.level}|${y - 1}-${y}`);
      const base = by.get(`${s.group}|${s.field}|${s.level}|2012-2013`);
      s.intl_share = s.international == null ? null : s.international / s.headcount;
      s.change_prev = prev ? s.headcount / prev.headcount - 1 : null;
      s.change_base = base && s.year !== '2012-2013' ? s.headcount / base.headcount - 1 : null;
    }
    return rows;
  },
});

dash.calc('york_standing', {
  inputs: ['totals', 'peer_groups'],
  title: 'York’s rank in each comparison group',
  description: 'York’s place among itself and the group’s members on headcount, growth, international share and share of Ontario (1 = highest), for all fields and each field of study.',
  fn: (totals, peer_groups) => {
    const slices = new Map();
    for (const t of totals) {
      const k = `${t.field}|${t.level}|${t.year}`;
      if (!slices.has(k)) slices.set(k, []);
      slices.get(k).push(t);
    }
    const rows = [];
    for (const group of new Set(peer_groups.map((g) => g.group))) {
      const members = new Set(peer_groups.filter((g) => g.group === group).map((g) => g.institution));
      for (const [k, list] of slices) {
        const york = list.find((t) => t.institution === 'York');
        if (!york) continue;
        const pool = list.filter((t) => t.institution === 'York' || members.has(t.institution));
        const [field, level, year] = k.split('|');
        const r = { key: `${group}|${k}`, group, field, level, year };
        for (const f of ['headcount', 'change_prev', 'change_base', 'intl_share', 'ontario_share']) {
          const vals = pool.filter((t) => t[f] != null);
          r['rank_' + f] = york[f] == null ? null : 1 + vals.filter((t) => t[f] > york[f]).length;
          r['n_' + f] = york[f] == null ? null : vals.length;
        }
        rows.push(r);
      }
    }
    return rows;
  },
});

dash.calc('york_ontario', {
  inputs: ['totals'],
  title: 'York’s share of Ontario',
  description: 'York’s headcount as a share of all Ontario institutions combined, for all fields and each field of study, and its change since 2012-13 in percentage points.',
  fn: (totals) => {
    const york = totals.filter((t) => t.institution === 'York' && t.ontario_share != null);
    const share = new Map(york.map((t) => [`${t.field}|${t.level}|${t.year}`, t.ontario_share]));
    return york.map((t) => {
      const base = share.get(`${t.field}|${t.level}|2012-2013`);
      return { key: `${t.field}|${t.level}|${t.year}`, field: t.field, level: t.level, year: t.year, share: t.ontario_share,
        change_base: t.year === '2012-2013' || base == null ? null : (t.ontario_share - base) * 100 };
    });
  },
});

const FOCUS = 'York';
const FIRST = '2012-2013';
const fmtN = d3.format(',');
const fmtP = d3.format('.1%');
const fmtD = d3.format('+.1%');
const fmtPt = (v) => d3.format('+.1f')(v) + ' pts';
const fmtI = d3.format('.0f');
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const shortYear = (y) => y.slice(0, 5) + y.slice(7);
const enc = (s) => String(s).replace(/[%&=]/g, encodeURIComponent);
const P = () => dash.params();
const ALL_F = 'All fields';
const fieldOf = (p) => p.field || ALL_F;
const isCip2 = (f) => /^\d\d /.test(f);
const fieldName = (f) => f.replace(/^\d\d /, '');
const fieldCode = (p) => (isCip2(fieldOf(p)) ? fieldOf(p).split(' ')[0] : null);
// One-file filters. The files aren't cross-tabulated, so one filter (these or field of study) applies at a time;
// the active one is stored in the field param as prefix + category.
const SUBSETS = [
  { id: 'gender', prefix: 'Gender: ', all: 'All genders', word: '' },
  { id: 'citizen', prefix: 'Citizenship: ', all: 'All countries', word: 'citizens of' },
  { id: 'credential', prefix: 'Credential: ', all: 'All credentials', word: '' },
  { id: 'studyyear', prefix: 'Year of study: ', all: 'All years of study', word: '' },
];
const subsetOf = (f) => SUBSETS.find((s) => f.startsWith(s.prefix));
const titleCase = (v) => v.toLowerCase().replace(/(^|[\s(\-/,])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const catLabel = (s, v) => (s.id === 'citizen' ? titleCase(v) : v);
const instKey = (inst, p) => `${fieldOf(p)}|${inst}|${p.level}|${p.year}`;
const groupKey = (p) => `${p.group}|${fieldOf(p)}|${p.level}|${p.year}`;
const cmpKey = (p) => `${p.group}|${p.level}|${p.year}`;
const MUTED = 'var(--cds-chart-muted)';
const LOSS = 'var(--cds-chart-status-critical)';
const memo = (f) => {
  const m = new WeakMap();
  return (rows) => {
    if (!m.has(rows)) m.set(rows, f(rows));
    return m.get(rows);
  };
};
const byField = (field) => memo((rows) => new Map(rows.map((r) => [r[field], r])));
const byKeyRow = byField('key');
const bySel = memo((rows) => d3.group(rows, (r) => `${r.group}|${r.level}|${r.year}`));
const membersOf = (group) => {
  const g = dash.data('peer_groups');
  return g.status === 'ok' ? g.data.filter((r) => r.group === group).map((r) => r.institution) : [];
};
const FAILED = ['error', 'missing', 'declined'];

function failLine() {
  const f = document.createElement('span');
  f.className = 'ux-fail';
  f.textContent = 'Failed to load';
  return f;
}
// Shows loading or failure in el; true when every source is ready.
function gate(el, ids, box) {
  const st = ids.map((id) => dash.data(id).status);
  if (st.every((s) => s === 'ok')) {
    el.classList.remove('dash-skeleton');
    return true;
  }
  const failed = st.some((s) => FAILED.includes(s));
  el.classList.toggle('dash-skeleton', !failed);
  if (failed) el.replaceChildren(failLine());
  else if (box) el.replaceChildren();
  else el.replaceChildren('—');
  return false;
}
function gateRows(tb, ids, cols) {
  const st = ids.map((id) => dash.data(id).status);
  if (st.every((s) => s === 'ok')) return true;
  const cell = document.createElement('td');
  cell.colSpan = cols;
  if (st.some((s) => FAILED.includes(s))) cell.append(failLine());
  else {
    cell.className = 'dash-skeleton';
    cell.textContent = '—';
  }
  const tr = document.createElement('tr');
  tr.append(cell);
  tb.replaceChildren(tr);
  return false;
}
function cite(tag, text, source, field, where) {
  const e = document.createElement(tag);
  e.textContent = text;
  e.dataset.source = source;
  e.dataset.field = field;
  if (where) e.dataset.where = where;
  return e;
}
const tone = (v) => (v == null ? '' : v >= 0 ? 'ux-up' : 'ux-down');
const signed = (v) => ('ux-num ' + tone(v)).trim();
function td(text, cls) {
  const e = document.createElement('td');
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

// Table sorting, shared by every table on the page.
const sortBy = new Map();
// Compares rows on one field; a missing value always sorts last.
const cmpOn = (key, dir) => (a, b) => {
  const x = a[key], y = b[key];
  if (x == null) return y == null ? 0 : 1;
  if (y == null) return -1;
  return dir === 'asc' ? d3.ascending(x, y) : d3.descending(x, y);
};
function sortRows(list, table) {
  const s = sortBy.get(table.id) ?? { key: table.dataset.defaultSort || 'headcount', dir: 'desc' };
  list.sort(cmpOn(s.key, s.dir));
  table.querySelectorAll('th').forEach((th) => {
    const b = th.querySelector('.ux-sort');
    th.setAttribute('aria-sort', b && b.dataset.sort === s.key ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

// Charts: an svg sized to its box, a tooltip, and text measuring.
function svgIn(el, W, H) {
  const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'ux-svg');
  const tip = document.createElement('div');
  tip.className = 'ux-tip';
  tip.hidden = true;
  el.replaceChildren(svg.node(), tip);
  return { svg, tip };
}
function measure(svg, texts, cls = 'ux-tick') {
  const g = svg.append('g').attr('class', cls);
  const w = d3.max(texts, (t) => g.append('text').text(t).node().getComputedTextLength()) || 0;
  g.remove();
  return w;
}
// Shortens a label until it fits in max px.
function fit(svg, text, max, cls = 'ux-tick') {
  const g = svg.append('g').attr('class', cls);
  const t = g.append('text').text(text);
  let s = text;
  while (s.length > 3 && t.node().getComputedTextLength() > max) {
    s = s.slice(0, -1);
    t.text(s.trimEnd() + '…');
  }
  const out = t.text();
  g.remove();
  return out;
}
function showTip(el, tip, event, head, lines) {
  const h = document.createElement('div');
  h.className = 'ux-tip-h';
  h.textContent = head;
  tip.replaceChildren(h, ...lines.map((l) => {
    const r = document.createElement('div');
    r.className = 'ux-tip-r';
    if (l.color) {
      const sw = document.createElement('i');
      sw.className = 'ux-sw';
      sw.style.background = l.color;
      r.append(sw);
    }
    const n = document.createElement('span');
    n.className = 'ux-tip-n';
    n.textContent = l.name;
    const v = document.createElement('span');
    v.className = 'ux-tip-v';
    v.textContent = l.value;
    r.append(n, v);
    return r;
  }));
  tip.hidden = false;
  const box = el.getBoundingClientRect();
  const x = event.clientX - box.left, y = event.clientY - box.top;
  const w = tip.offsetWidth, th = tip.offsetHeight;
  let left = x + 14;
  if (left + w > box.width) left = x - w - 14;
  tip.style.left = Math.max(0, Math.min(left, box.width - w)) + 'px';
  tip.style.top = Math.max(0, y - th - 10) + 'px';
}
function yearAxis(svg, years, x, H, selected) {
  const lw = measure(svg, ['2012-13']) + 10;
  const step = Math.max(1, Math.ceil(lw / x.step()));
  const shown = years.filter((y, i) => (years.length - 1 - i) % step === 0);
  const off = x.bandwidth ? x.bandwidth() / 2 : 0;
  svg.append('g').attr('class', 'ux-tick').selectAll('text').data(shown).join('text')
    .attr('x', (y) => x(y) + off).attr('y', H - 6).attr('text-anchor', 'middle')
    .attr('class', (y) => (y === selected ? 'is-on' : null)).text(shortYear);
}
function yGrid(svg, y, ticks, tf, left, W) {
  svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'ux-grid-line')
    .attr('x1', left).attr('x2', W).attr('y1', y).attr('y2', y);
  svg.append('g').attr('class', 'ux-tick').selectAll('text').data(ticks).join('text')
    .attr('x', left - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(tf);
}
// Spreads end labels so they don't meet: items {y}, sorted, min gap px.
function spread(items, gap, lo, hi) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + gap);
  const over = items.length ? items[items.length - 1].y - hi : 0;
  if (over > 0) items.forEach((d) => { d.y -= over; });
  for (let i = items.length - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - gap);
  items.forEach((d) => { d.y = Math.max(lo, d.y); });
}

// Filters and controls.
document.addEventListener('click', (e) => {
  const sort = e.target.closest('.ux .ux-sort');
  if (sort) {
    const table = sort.closest('table');
    const cur = sortBy.get(table.id) ?? { key: table.dataset.defaultSort || 'headcount', dir: 'desc' };
    const key = sort.dataset.sort;
    const text = key === 'category' || key === 'institution';
    const dir = cur.key === key ? (cur.dir === 'asc' ? 'desc' : 'asc') : text ? 'asc' : 'desc';
    sortBy.set(table.id, { key, dir });
    dash.draw(table.dataset.rows);
    return;
  }
  const nav = e.target.closest('.ux .ux-navlink');
  if (nav) {
    dash.setParams({ page: nav.dataset.page });
    dash.setLink(nav.dataset.page);
    document.querySelector('.ux .ux-main')?.scrollIntoView({ block: 'start' });
    return;
  }
  const rview = e.target.closest('.ux .ux-rviewtab');
  if (rview) {
    dash.setParams({ rview: rview.dataset.rview });
    return;
  }
  const metric = e.target.closest('.ux .ux-metric');
  if (metric) {
    dash.setParams({ metric: metric.dataset.metric });
    return;
  }
  const tab = e.target.closest('.ux .ux-dimtab');
  if (tab) {
    dash.setParams({ dim: tab.dataset.dim });
    dash.setLink(pageOf(P()));
    return;
  }
  if (e.target.closest('.ux .ux-gclose')) { closeFields(); return; }
  if (e.target.closest('.ux .ux-reset')) { if (gpick.inst) closeFields(); dash.resetParams(); }
});
document.addEventListener('change', (e) => {
  if (e.target.matches('.ux .ux-level')) {
    // Year of study is undergraduate-only, so moving to Graduate clears it.
    const clear = e.target.value === 'Graduate' && fieldOf(P()).startsWith('Year of study: ');
    dash.setParams(clear ? { level: e.target.value, field: ALL_F } : { level: e.target.value });
  }
});
document.addEventListener('input', (e) => {
  if (e.target.matches('.ux .ux-search')) dash.draw('dim-rows');
});

const PAGES = ['overview', 'growth', 'share', 'ranking', 'institutions', 'mix', 'gains', 'table'];
const pageOf = (p) => (PAGES.includes(p.page) ? p.page : 'overview');

// Filters that change nothing on the open page are disabled, with the reason as a tooltip.
const BREAKDOWN_PAGES = ['mix', 'gains', 'table'];
function idleFilters(p) {
  const page = pageOf(p);
  const off = {};
  if (page === 'share') off['f-group'] = 'The share of Ontario chart compares York with all of Ontario, not with a comparison group.';
  if (BREAKDOWN_PAGES.includes(page)) {
    for (const id of ['f-credential', 'f-studyyear', 'f-citizen', 'f-gender']) off[id] = 'The breakdowns aren’t cross-tabulated with this filter, so it doesn’t change them.';
    off['f-field'] = 'The breakdowns aren’t cross-tabulated with this filter. To see a field’s programs, open it in the Field of study tab.';
  }
  if (p.level === 'Graduate' && !off['f-studyyear']) off['f-studyyear'] = 'Year of study is reported for undergraduates only.';
  return off;
}

dash.onData(() => {
  const p = P();
  const page = pageOf(p);
  const off = idleFilters(p);
  document.querySelectorAll('.ux .ux-filters select').forEach((s) => {
    s.disabled = s.id in off;
    s.closest('.ux-field').title = off[s.id] ?? '';
  });
  document.querySelectorAll('.ux .ux-navlink').forEach((b) => {
    if (b.dataset.page === page) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('.ux .ux-page').forEach((s) => { s.hidden = !s.dataset.page.split(' ').includes(page); });
  document.querySelectorAll('.ux [data-view]').forEach((v) => { v.hidden = v.dataset.view !== page; });
  document.querySelectorAll('.ux .ux-level').forEach((s) => { s.value = p.level; });
  document.querySelectorAll('.ux .ux-sw[data-i]').forEach((s) => { s.style.background = dash.colors[Number(s.dataset.i)]; });
  document.querySelectorAll('.ux .ux-sw[data-muted]').forEach((s) => { s.style.background = MUTED; });
  document.querySelectorAll('.ux .ux-dimtab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dim === p.dim)));
  document.querySelectorAll('.ux .ux-metric').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === p.metric)));
  // Ranking page tabs: the ranking bars or the 3D bars by year.
  const rv = p.rview === '3d' ? '3d' : 'bars';
  document.querySelectorAll('.ux .ux-rviewtab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rview === rv)));
  document.querySelectorAll('.ux [data-rview-panel]').forEach((c) => { c.hidden = c.dataset.rviewPanel !== rv; });
  document.querySelectorAll('.ux .ux-first-year').forEach((n) => { n.hidden = p.year !== FIRST; });
  const filtered = fieldOf(p) !== ALL_F;
  document.querySelectorAll('.ux .ux-no-intl').forEach((n) => { n.hidden = !filtered; });
  document.querySelectorAll('.ux .ux-field-off').forEach((n) => { n.hidden = !filtered; });
  if (p.dim === 'cip') { dash.setParams({ dim: 'cip2' }); return; } // Detailed programs now open inside Field of study
  const d = dash.data('cmp_' + p.dim);
  const empty = d.status === 'ok' && !(bySel(d.data).get(cmpKey(p)) ?? []).some((r) => r.york > 0);
  document.querySelectorAll('.ux .ux-dim').forEach((s) => {
    const on = s.dataset.dim === p.dim;
    s.hidden = !on;
    s.querySelectorAll('.ux-empty').forEach((n) => { n.hidden = !(on && empty); });
    s.querySelectorAll('.ux-dim-body').forEach((b) => { b.hidden = !on || empty; });
  });
});

// Words that follow the filters.
dash.draw('sel-level', (el) => { el.textContent = P().level.toLowerCase(); });
dash.draw('sel-year', (el) => { el.textContent = shortYear(P().year); });
dash.draw('sel-group', (el) => { el.textContent = P().group; });
dash.draw('sel-field', (el) => {
  const f = fieldOf(P());
  const s = subsetOf(f);
  if (f === ALL_F) el.textContent = 'all students';
  else if (!s) el.textContent = f.replace(/^\d+ /, '');
  else {
    const v = catLabel(s, f.slice(s.prefix.length));
    el.textContent = s.word ? `${s.word} ${s.id === 'citizen' ? v : v.toLowerCase()}` : v.toLowerCase();
  }
});
// Field list: fields with York students first, with York's headcount and York's growth in the field since 2012-13
// against the comparison group's combined growth, the same figures as the Growth list and chart
// (green when York grew faster, red when slower).
dash.draw('field-select', (sel) => {
  const t = dash.data('totals');
  const g = dash.data('group_totals');
  const p = P();
  sel.onchange = () => dash.setParams({ field: sel.value });
  if (t.status !== 'ok' || g.status !== 'ok') {
    const cur = fieldCode(p) ? fieldOf(p) : ALL_F;
    sel.replaceChildren(...[ALL_F, cur].filter((f, i, a) => a.indexOf(f) === i).map((f) => new Option(fieldName(f), f)));
    sel.value = cur;
    return;
  }
  const fields = [...new Set(t.data.filter((r) => isCip2(r.field)).map((r) => r.field))].sort((a, b) => d3.ascending(fieldName(a), fieldName(b)));
  const york = new Map(t.data.filter((r) => r.institution === FOCUS && r.level === p.level && r.year === p.year && isCip2(r.field))
    .map((r) => [r.field, r]));
  const peers = new Map(g.data.filter((r) => r.group === p.group && r.level === p.level && r.year === p.year && isCip2(r.field))
    .map((r) => [r.field, r.change_base]));
  const growth = (f) => {
    const y = york.get(f)?.change_base, pc = peers.get(f);
    return y == null || pc == null ? null : { y, pc };
  };
  const tone = (f) => {
    const r = growth(f);
    if (!r || r.y === r.pc) return '';
    return r.y > r.pc ? 'is-above' : 'is-below';
  };
  const count = (f) => york.get(f)?.headcount ?? 0;
  const at = fields.filter((f) => count(f) > 0);
  const not = fields.filter((f) => !(count(f) > 0));
  const option = (f, withCount) => {
    const r = growth(f);
    const chg = r ? `  ·  since 2012-13: York ${fmtD(r.y)} vs peers ${fmtD(r.pc)}` : '';
    const o = new Option(withCount ? `${fieldName(f)}  ·  York ${fmtN(count(f))}${chg}` : fieldName(f), f);
    o.className = withCount ? tone(f) : '';
    return o;
  };
  const group = (label, list, withCount) => {
    const og = document.createElement('optgroup');
    og.label = label;
    og.append(...list.map((f) => option(f, withCount)));
    return og;
  };
  const head = p.year === FIRST ? `Fields with York students (${at.length})` : `Fields with York students (${at.length}): growth since 2012-13, York vs ${p.group}`;
  // Fields without York students aren't listed, unless one is already picked.
  const picked = not.filter((f) => f === fieldOf(p));
  sel.replaceChildren(new Option(ALL_F), group(head, at, true), ...picked.map((f) => option(f, false)));
  sel.value = fieldCode(p) ? fieldOf(p) : ALL_F;
  sel.classList.remove('is-above', 'is-below');
  const cur = fieldCode(p) && count(fieldOf(p)) > 0 ? tone(fieldOf(p)) : '';
  if (cur) sel.classList.add(cur);
});
dash.draw('members', (el) => {
  if (!gate(el, ['peer_groups'])) return;
  el.textContent = membersOf(P().group).join(', ') || '—';
});

dash.draw('group-select', (sel) => {
  const g = dash.data('peer_groups');
  const p = P();
  const names = g.status === 'ok'
    ? [...new Set(g.data.slice().sort((a, b) => Number(a.order) - Number(b.order)).map((r) => r.group))]
    : [p.group];
  sel.replaceChildren(...names.map((n) => new Option(n)));
  sel.value = p.group;
  sel.onchange = () => dash.setParams({ group: sel.value });
});
// Gender, citizenship, credential and year of study lists: categories with York students first, largest first,
// with York's headcount in the selected level and year. Picking one clears the other filters.
const subsetIndex = memo((rows) => {
  const m = new Map(); // prefix|level|year -> Map(field -> York headcount)
  for (const r of rows) {
    const s = subsetOf(r.field);
    if (!s) continue;
    const k = `${s.prefix}|${r.level}|${r.year}`;
    if (!m.has(k)) m.set(k, new Map());
    const cats = m.get(k);
    cats.set(r.field, (cats.get(r.field) ?? 0) + (r.institution === FOCUS ? r.headcount : 0));
  }
  return m;
});
dash.draw('subset-select', (sel) => {
  const s = SUBSETS.find((x) => x.id === sel.dataset.subset);
  const t = dash.data('totals');
  const p = P();
  const cur = fieldOf(p).startsWith(s.prefix) ? fieldOf(p) : '';
  sel.onchange = () => dash.setParams({ field: sel.value || ALL_F });
  const label = (f) => catLabel(s, f.slice(s.prefix.length));
  if (t.status !== 'ok') {
    sel.replaceChildren(new Option(s.all, ''), ...(cur ? [new Option(label(cur), cur)] : []));
    sel.value = cur;
    return;
  }
  const cats = subsetIndex(t.data).get(`${s.prefix}|${p.level}|${p.year}`) ?? new Map();
  const list = [...cats.keys()];
  if (s.id === 'studyyear') list.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  else list.sort((a, b) => d3.descending(cats.get(a), cats.get(b)) || d3.ascending(a, b));
  const at = list.filter((f) => cats.get(f) > 0);
  const item = (f, withCount) => new Option(withCount ? `${label(f)}  ·  York ${fmtN(cats.get(f))}` : label(f), f);
  const group = (lbl, fs, withCount) => {
    const og = document.createElement('optgroup');
    og.label = lbl;
    og.append(...fs.map((f) => item(f, withCount)));
    return og;
  };
  const opts = [new Option(s.all, '')];
  if (!list.length) opts.push(group('Not reported for this study level', [], false));
  else opts.push(...at.map((f) => item(f, true))); // categories without York students aren't listed
  if (cur && !(cats.get(cur) > 0)) opts.push(new Option(label(cur), cur));
  sel.replaceChildren(...opts);
  sel.value = cur;
});

dash.draw('year-select', (sel) => {
  const t = dash.data('totals');
  const p = P();
  const years = t.status === 'ok' ? [...new Set(t.data.map((r) => r.year))].sort(d3.descending) : [p.year];
  sel.replaceChildren(...years.map((y) => new Option(shortYear(y), y)));
  sel.value = p.year;
  sel.onchange = () => dash.setParams({ year: sel.value });
});

// Headline figures. Each reads one row of one source.
const SOURCES = {
  totals: { index: byKeyRow, key: (p) => instKey(FOCUS, p), col: 'key' },
  group_totals: { index: byKeyRow, key: groupKey, col: 'key' },
  york_standing: { index: byKeyRow, key: groupKey, col: 'key' },
  york_ontario: { index: byKeyRow, key: (p) => `${fieldOf(p)}|${p.level}|${p.year}`, col: 'key' },
};
const rowOf = (id) => SOURCES[id].index(dash.data(id).data).get(SOURCES[id].key(P()));
const figure = (id, field, fmt, colored) => (el) => {
  if (!gate(el, [id])) return;
  const r = rowOf(id);
  if (!r || r[field] == null) {
    el.replaceChildren('—');
    return;
  }
  const s = cite('span', fmt(r[field]), id, field, SOURCES[id].col + '=' + enc(r[SOURCES[id].col]));
  if (colored) s.className = tone(r[field]);
  el.replaceChildren(s);
};
dash.draw('lede-york', figure('totals', 'headcount', fmtN));
dash.draw('lede-york-chg', figure('totals', 'change_base', fmtD));
dash.draw('lede-peer-chg', figure('group_totals', 'change_base', fmtD));
dash.draw('o-base', figure('york_ontario', 'change_base', fmtPt, true));
// "2 of 10": York's rank and how many were ranked.
const rank = (f) => (el) => {
  if (!gate(el, ['york_standing'])) return;
  const r = rowOf('york_standing');
  if (!r || r['rank_' + f] == null) {
    el.replaceChildren('—');
    return;
  }
  const where = 'key=' + enc(r.key);
  el.replaceChildren(cite('span', String(r['rank_' + f]), 'york_standing', 'rank_' + f, where), ' of ',
    cite('span', String(r['n_' + f]), 'york_standing', 'n_' + f, where));
};
['headcount', 'change_base', 'change_prev', 'intl_share', 'ontario_share'].forEach((f) => dash.draw('r-' + f, rank(f)));

// Overview: one ranked list per measure, York highlighted, peers combined at the foot.
const LISTS = {
  headcount: { fmt: fmtN },
  change_base: { fmt: fmtD, signed: true, comb: true },
  change_prev: { fmt: fmtD, signed: true, comb: true },
  intl_share: { fmt: fmtP, comb: true },
  ontario_share: { fmt: fmtP },
};
dash.draw('ov-list', (el) => {
  if (!gate(el, ['totals', 'group_totals', 'peer_groups'], true)) return;
  const p = P();
  const f = el.dataset.field;
  const spec = LISTS[f];
  const pool = new Set([FOCUS, ...membersOf(p.group)]);
  const rows = dash.data('totals').data
    .filter((r) => r.field === fieldOf(p) && r.level === p.level && r.year === p.year && pool.has(r.institution) && r[f] != null)
    .sort((a, b) => b[f] - a[f]);
  const item = (rank, name, value, cls) => {
    const li = document.createElement('li');
    li.className = 'ux-li' + (cls ? ' ' + cls : '');
    if (cls === 'is-york') li.style.setProperty('--york', dash.colors[0]);
    const n = document.createElement('span');
    n.className = 'ux-li-rank';
    n.textContent = rank;
    const nm = document.createElement('span');
    nm.className = 'ux-li-name';
    nm.textContent = name;
    if (spec.signed) value.classList.add(...tone(value.dataset.raw ? Number(value.dataset.raw) : 0).split(' ').filter(Boolean));
    value.classList.add('ux-li-v');
    li.append(n, nm, value);
    return li;
  };
  const items = rows.map((r, i) => {
    const v = cite('span', spec.fmt(r[f]), 'totals', f, 'key=' + enc(r.key));
    v.dataset.raw = r[f];
    return item(String(i + 1), r.institution, v, r.institution === FOCUS ? 'is-york' : '');
  });
  const comb = byKeyRow(dash.data('group_totals').data).get(groupKey(p));
  if (spec.comb && comb && comb[f] != null) {
    const v = cite('span', spec.fmt(comb[f]), 'group_totals', f, 'key=' + enc(comb.key));
    v.dataset.raw = comb[f];
    items.push(item('', 'Peers', v, 'is-comb'));
  }
  el.replaceChildren(...items);
});

// Overview: a small chart under each list, York (and peers combined) every year.
dash.draw('ov-spark', (el) => {
  if (!gate(el, ['totals', 'group_totals'], true)) return;
  const p = P();
  const f = el.dataset.field;
  const spec = LISTS[f];
  const york = { name: 'York', color: dash.colors[0],
    pts: dash.data('totals').data.filter((r) => r.field === fieldOf(p) && r.institution === FOCUS && r.level === p.level && r[f] != null) };
  const series = [york];
  if (spec.comb) {
    series.push({ name: 'Peers combined', color: dash.colors[1],
      pts: dash.data('group_totals').data.filter((r) => r.group === p.group && r.field === fieldOf(p) && r.level === p.level && r[f] != null) });
  }
  series.forEach((s) => s.pts.sort((a, b) => d3.ascending(a.year, b.year)));
  const years = [...new Set(series.flatMap((s) => s.pts.map((r) => r.year)))].sort(d3.ascending);
  const W = Math.max(120, el.clientWidth), H = 120;
  const { svg, tip } = svgIn(el, W, H);
  if (years.length < 2) return;
  const vals = series.flatMap((s) => s.pts.map((r) => r[f]));
  const lo = d3.min(vals), hi = d3.max(vals);
  const pad = (hi - lo) * 0.12 || Math.abs(hi) * 0.05 || 1;
  const y = d3.scaleLinear([spec.signed ? Math.min(0, lo - pad) : lo - pad, spec.signed ? Math.max(0, hi + pad) : hi + pad], [H - 18, 6]);
  const x = d3.scalePoint(years, [4, W - 4]);
  if (spec.signed) svg.append('line').attr('class', 'ux-rule').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).attr('stroke-dasharray', '3 3');
  svg.append('line').attr('class', 'ux-axis-line').attr('x1', 0).attr('x2', W).attr('y1', H - 18).attr('y2', H - 18);
  svg.append('g').attr('class', 'ux-tick').selectAll('text').data([years[0], years[years.length - 1]]).join('text')
    .attr('x', (yr, i) => (i ? W : 0)).attr('y', H - 4).attr('text-anchor', (yr, i) => (i ? 'end' : 'start')).text(shortYear);
  const line = d3.line().x((r) => x(r.year)).y((r) => y(r[f]));
  svg.append('g').selectAll('path').data(series.slice().reverse()).join('path').attr('d', (s) => line(s.pts))
    .style('fill', 'none').style('stroke', (s) => s.color).attr('stroke-width', (s) => (s === york ? 2 : 1.5))
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  const sel = york.pts.find((r) => r.year === p.year);
  if (sel) svg.append('circle').attr('r', 3).attr('cx', x(sel.year)).attr('cy', y(sel[f])).style('fill', york.color);
  const rule = svg.append('line').attr('class', 'ux-rule').attr('y1', 4).attr('y2', H - 18).attr('opacity', 0);
  svg.append('rect').attr('width', W).attr('height', H).style('fill', 'transparent')
    .on('mousemove', (e) => {
      const mx = d3.pointer(e, svg.node())[0];
      const yr = years[d3.leastIndex(years, (v) => Math.abs(x(v) - mx))];
      rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 1);
      showTip(el, tip, e, shortYear(yr), series.map((s) => {
        const r = s.pts.find((d) => d.year === yr);
        return { color: series.length > 1 ? s.color : null, name: s.name, value: r ? spec.fmt(r[f]) : '—' };
      }));
    })
    .on('mouseleave', () => { tip.hidden = true; rule.attr('opacity', 0); });
});

// Growth since 2012-13, indexed to 100: York, peers combined, and each peer.
// Clicking a line opens that institution's fields of study beside the chart (gpick, below).
dash.draw('growth', (el) => {
  if (!gate(el, ['totals', 'group_totals', 'peer_groups'], true)) return;
  const p = P();
  const tot = dash.data('totals').data.filter((r) => r.field === fieldOf(p) && r.level === p.level);
  const years = [...new Set(tot.map((r) => r.year))].sort(d3.ascending);
  const index = (rows) => {
    const base = rows.find((r) => r.year === FIRST);
    if (!base) return null;
    return rows.filter((r) => years.includes(r.year)).sort((a, b) => d3.ascending(a.year, b.year))
      .map((r) => ({ year: r.year, v: (r.headcount / base.headcount) * 100 }));
  };
  const byInst = d3.group(tot, (r) => r.institution);
  const peers = membersOf(p.group).map((m) => ({ name: m, pts: index(byInst.get(m) ?? []) })).filter((s) => s.pts && s.pts.length > 1);
  const york = { name: FOCUS, color: dash.colors[0], pts: index(byInst.get(FOCUS) ?? []) ?? [] };
  const comb = { name: 'Peers combined', color: dash.colors[1],
    pts: index(dash.data('group_totals').data.filter((r) => r.group === p.group && r.field === fieldOf(p) && r.level === p.level)) ?? [] };
  const W = Math.max(260, el.clientWidth);
  const H = gpick.inst ? gHeight(W) : Math.round(Math.min(520, Math.max(280, W * 0.45)));
  const { svg, tip } = svgIn(el, W, H);
  if (!york.pts.length || !years.length) return;
  const picked = gpick.kind === 'inst' ? peers.find((s) => s.name === gpick.inst) ?? null : null;
  const all = [york, comb, ...peers].flatMap((s) => s.pts.map((d) => d.v));
  const peerVals = peers.flatMap((s) => s.pts.map((d) => d.v)).sort(d3.ascending);
  // Clip only outliers: peers far above the rest (a small school growing from a low base).
  const q90 = d3.quantile(peerVals, 0.9) ?? 100, top = peerVals[peerVals.length - 1] ?? 100;
  const peerHi = top - 100 > 2.5 * Math.max(q90 - 100, 1) ? q90 : top;
  const hi = Math.max(d3.max([york, comb], (s) => d3.max(s.pts, (d) => d.v)) ?? 100, peerHi);
  const y = d3.scaleLinear([Math.min(100, d3.min(all)), hi * 1.03], [H - 26, 10]).nice();
  const ticks = y.ticks(5);
  const left = measure(svg, ticks.map(fmtI)) + 8;
  const last = (s) => s.pts[s.pts.length - 1];
  const ends = [york, comb].filter((s) => s.pts.length).map((s) => ({ s, text: `${s.name === FOCUS ? 'York' : 'Peers'} ${fmtI(last(s).v)}` }));
  if (picked) ends.push({ s: { ...picked, color: 'var(--color-fg)' }, text: `${picked.name} ${fmtI(last(picked).v)}` });
  const right = measure(svg, ends.map((e) => e.text), 'ux-lbl') + 12;
  const x = d3.scalePoint(years, [left + 6, W - right]);
  yGrid(svg, y, ticks, fmtI, left, W - right + 4);
  svg.append('line').attr('class', 'ux-rule').attr('x1', left).attr('x2', W - right + 4).attr('y1', y(100)).attr('y2', y(100)).attr('stroke-dasharray', '4 3');
  yearAxis(svg, years, x, H, p.year);
  const clip = 'clip-growth-' + Math.random().toString(36).slice(2, 8);
  svg.append('clipPath').attr('id', clip).append('rect').attr('x', 0).attr('y', 0).attr('width', W).attr('height', H - 24);
  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.v));
  const peerPaths = svg.append('g').attr('clip-path', `url(#${clip})`).selectAll('path').data(peers).join('path')
    .attr('d', (s) => line(s.pts)).style('fill', 'none').style('stroke', MUTED).attr('stroke-width', 1.25)
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  const peerStyle = (near) => peerPaths
    .style('stroke', (s) => (s === picked ? 'var(--color-fg)' : s === near ? 'var(--color-fg-muted)' : MUTED))
    .attr('stroke-width', (s) => (s === picked ? 2.5 : s === near ? 2 : 1.25));
  peerStyle(null);
  if (picked) peerPaths.filter((s) => s === picked).raise();
  const isPicked = (s) => (s === york ? gpick.kind === 'inst' && gpick.inst === FOCUS : gpick.kind === 'comb');
  svg.append('g').selectAll('path').data([comb, york].filter((s) => s.pts.length)).join('path')
    .attr('d', (s) => line(s.pts)).style('fill', 'none').style('stroke', (s) => s.color)
    .attr('stroke-width', (s) => (s === york ? 2.5 : 2) + (isPicked(s) ? 1.5 : 0))
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  const labels = ends.map((e) => ({ ...e, y: y(last(e.s).v) }));
  spread(labels, 14, 8, H - 30);
  svg.append('g').selectAll('text').data(labels).join('text').attr('class', 'ux-lbl ux-lbl-strong')
    .attr('x', W - right + 8).attr('y', (d) => d.y).attr('dy', '0.32em').style('fill', (d) => d.s.color).text((d) => d.text);
  const rule = svg.append('line').attr('class', 'ux-rule').attr('y1', 10).attr('y2', H - 26).attr('opacity', 0);
  const dots = svg.append('g');
  // The line nearest the pointer, within 14px.
  const nearest = (e, list) => {
    const [mx, my] = d3.pointer(e, svg.node());
    const yr = years[d3.leastIndex(years, (v) => Math.abs(x(v) - mx))];
    let near = null, best = 14;
    for (const s of list) {
      const d = s.pts.find((q) => q.year === yr);
      if (d && Math.abs(y(d.v) - my) < best) { near = s; best = Math.abs(y(d.v) - my); }
    }
    return near;
  };
  svg.append('rect').attr('x', left).attr('width', W - left).attr('y', 0).attr('height', H).style('fill', 'transparent')
    .on('click', (e) => {
      const s = nearest(e, [york, comb, ...peers]);
      if (s) openFields(s === comb ? { kind: 'comb', inst: p.group } : { kind: 'inst', inst: s.name });
    })
    .on('mousemove', (e) => {
      const [mx] = d3.pointer(e, svg.node());
      const yr = years[d3.leastIndex(years, (v) => Math.abs(x(v) - mx))];
      const at = (s) => s.pts.find((d) => d.year === yr);
      const near = nearest(e, peers);
      e.currentTarget.style.cursor = nearest(e, [york, comb, ...peers]) ? 'pointer' : '';
      peerStyle(near);
      rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 1);
      const shown = [york, comb].filter((s) => at(s));
      dots.selectAll('circle').data(shown).join('circle').attr('r', 3.5).attr('cx', x(yr)).attr('cy', (s) => y(at(s).v)).style('fill', (s) => s.color);
      const lines = shown.map((s) => ({ color: s.color, name: s.name, value: fmtI(at(s).v) }));
      if (near) lines.push({ color: 'var(--color-fg-muted)', name: near.name, value: fmtI(at(near).v) });
      showTip(el, tip, e, shortYear(yr) + ' · 2012-13 = 100', lines);
    })
    .on('mouseleave', () => {
      tip.hidden = true;
      rule.attr('opacity', 0);
      dots.selectAll('circle').remove();
      peerStyle(null);
    });
});

// Fields of study for the institution clicked on the Growth chart: lines indexed to 2012-13 = 100,
// fields that grew (green) above, fields that dropped (red) below, and a list of every field with its change.
// gpick.kind is 'inst' (one institution) or 'comb' (the comparison group combined); gpick.field is the highlighted field.
const gpick = { kind: null, inst: null, field: null };
const gHeight = (W) => Math.round(Math.min(600, Math.max(440, W * 0.75)));
const GDRAWS = ['growth', 'gf-title', 'gf-chart', 'gf-list'];
function syncGpick() {
  const open = !!gpick.inst;
  document.querySelectorAll('.ux .ux-gwrap').forEach((w) => w.classList.toggle('is-open', open));
  document.querySelectorAll('.ux .ux-gside, .ux .ux-gpick').forEach((n) => { n.hidden = !open; });
}
function openFields(pick) {
  const same = gpick.kind === pick.kind && gpick.inst === pick.inst;
  Object.assign(gpick, pick);
  if (!same) gpick.field = null;
  syncGpick();
  GDRAWS.forEach((n) => dash.draw(n));
}
function closeFields() {
  Object.assign(gpick, { kind: null, inst: null, field: null });
  syncGpick();
  GDRAWS.forEach((n) => dash.draw(n));
}
// Picking a field highlights it in both charts and in the list; picking it again clears it.
function pickField(f) {
  gpick.field = gField() === f ? '' : f;
  ['gf-chart', 'gf-list'].forEach((n) => dash.draw(n));
  const it = document.querySelector('.ux .ux-gli[aria-selected="true"]');
  if (it) it.scrollIntoView({ block: 'nearest' });
}
// The highlighted field: the one picked here ('' = none), else the Field of study filter's.
const gField = () => gpick.field ?? (isCip2(fieldOf(P())) ? fieldOf(P()) : null);
const gEnd = (years, p) => (p.year !== FIRST && years.includes(p.year) ? p.year : years[years.length - 1]);
function fieldSeries() {
  const p = P();
  if (!gpick.inst || dash.data('totals').status !== 'ok' || dash.data('group_totals').status !== 'ok') return null;
  const rows = gpick.kind === 'comb'
    ? dash.data('group_totals').data.filter((r) => r.group === p.group && r.level === p.level && isCip2(r.field))
    : dash.data('totals').data.filter((r) => r.institution === gpick.inst && r.level === p.level && isCip2(r.field));
  const years = [...new Set(rows.map((r) => r.year))].sort(d3.ascending);
  if (!years.length) return { years, end: null, list: [] };
  const end = gEnd(years, p);
  const list = [];
  for (const [field, rs] of d3.group(rows, (r) => r.field)) {
    const n = new Map(rs.map((r) => [r.year, r.headcount]));
    const at = (yr) => n.get(yr) ?? 0; // a year without a row: no students in the field that year
    const base = at(FIRST), last = at(end);
    if (!base && !last) continue;
    list.push({
      field, name: fieldName(field), base, last,
      rate: base ? last / base - 1 : null, // null: no students in 2012-13 (a new field)
      up: !base || last >= base,
      pts: base ? years.map((yr) => ({ year: yr, v: (at(yr) / base) * 100, n: at(yr) })) : [],
    });
  }
  return { years, end, list };
}
const rateText = (d) => (d.rate == null ? 'new' : fmtD(d.rate));
dash.draw('gf-title', (el) => {
  if (!gpick.inst) return;
  const p = P();
  const fs = fieldSeries();
  const b = document.createElement('b');
  b.textContent = gpick.kind === 'comb' ? `${p.group} combined` : gpick.inst;
  const span = fs && fs.end ? `, ${shortYear(FIRST)} to ${shortYear(fs.end)}` : '';
  el.replaceChildren('Fields of study at ', b, ` · ${p.level.toLowerCase()}${span}`);
});
dash.draw('gf-chart', (el) => {
  if (!gpick.inst || !gate(el, ['totals', 'group_totals'], true)) return;
  const up = el.dataset.dir === 'up';
  const main = el.closest('.ux-gwrap').querySelector('[data-draw="growth"]');
  const total = gHeight(Math.max(260, main.clientWidth));
  const W = Math.max(220, el.clientWidth), H = Math.max(180, Math.round((total - 8) / 2));
  const { svg, tip } = svgIn(el, W, H);
  const fs = fieldSeries();
  const color = up ? 'var(--color-ok)' : 'var(--color-bad)';
  const series = fs ? fs.list.filter((d) => d.up === up && d.pts.length > 1) : [];
  const count = fs ? fs.list.filter((d) => d.up === up).length : 0;
  svg.append('text').attr('class', 'ux-lbl ux-lbl-strong').attr('x', 0).attr('y', 12).style('fill', color)
    .text(`${up ? 'Grew' : 'Dropped'} · ${count} field${count === 1 ? '' : 's'}`);
  if (!series.length) {
    svg.append('text').attr('class', 'ux-tick').attr('x', 0).attr('y', 34).text(up ? 'No field grew.' : 'No field dropped.');
    return;
  }
  const years = fs.years;
  const vals = series.flatMap((s) => s.pts.map((d) => d.v)).sort(d3.ascending);
  // Clip only outliers: fields far above the rest (a small field growing from a few students).
  const sel = gField();
  const hit = series.find((s) => s.field === sel);
  const q90 = d3.quantile(vals, 0.9), top = vals[vals.length - 1];
  // The picked field always fits.
  const hi = Math.max(105, top - 100 > 2.5 * Math.max(q90 - 100, 1) ? q90 * 1.08 : top * 1.03, hit ? d3.max(hit.pts, (d) => d.v) * 1.03 : 0);
  const y = d3.scaleLinear([Math.min(100, vals[0]), hi], [H - 24, 22]).nice();
  const ticks = y.ticks(4);
  const left = measure(svg, ticks.map(fmtI)) + 8;
  const right = 10;
  const lblText = hit ? `${fit(svg, hit.name, Math.max(80, W - left - 120), 'ux-glbl')} ${rateText(hit)}` : '';
  const x = d3.scalePoint(years, [left + 4, W - right]);
  yGrid(svg, y, ticks, fmtI, left, W - right + 4);
  svg.append('line').attr('class', 'ux-rule').attr('x1', left).attr('x2', W - right + 4).attr('y1', y(100)).attr('y2', y(100)).attr('stroke-dasharray', '4 3');
  yearAxis(svg, years, x, H, fs.end);
  const clip = 'clip-gf-' + Math.random().toString(36).slice(2, 8);
  svg.append('clipPath').attr('id', clip).append('rect').attr('x', 0).attr('y', 16).attr('width', W).attr('height', H - 40);
  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.v));
  const paths = svg.append('g').attr('clip-path', `url(#${clip})`).selectAll('path').data(series).join('path')
    .attr('d', (s) => line(s.pts)).style('fill', 'none').style('stroke', color)
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  const style = (hov) => paths
    .attr('stroke-width', (s) => (s === hit ? 3 : s === hov ? 2.25 : 1.25))
    .style('opacity', (s) => (s === hit || s === hov ? 1 : hit ? 0.22 : 0.5));
  style(null);
  if (hit) {
    paths.filter((s) => s === hit).raise();
    const e = hit.pts.find((d) => d.year === fs.end) ?? hit.pts[hit.pts.length - 1];
    const ly = y(e.v);
    svg.append('circle').attr('r', 3.5).attr('cx', x(e.year)).attr('cy', ly).style('fill', color);
    // Name and change just above the end point (below it when that would leave the chart).
    svg.append('text').attr('class', 'ux-glbl').attr('x', x(e.year)).attr('y', ly < 40 ? ly + 16 : ly - 9)
      .attr('text-anchor', 'end').style('fill', color).text(lblText);
  }
  const nearest = (e) => {
    const [mx, my] = d3.pointer(e, svg.node());
    const yr = years[d3.leastIndex(years, (v) => Math.abs(x(v) - mx))];
    let near = null, best = 12;
    for (const s of series) {
      const d = s.pts.find((q) => q.year === yr);
      const dy = d ? Math.abs(y(d.v) - my) : Infinity;
      if (dy < best) { near = s; best = dy; }
    }
    return { yr, near };
  };
  svg.append('rect').attr('x', left).attr('width', W - left).attr('y', 0).attr('height', H).style('fill', 'transparent')
    .on('click', (e) => { const { near } = nearest(e); if (near) pickField(near.field); })
    .on('mousemove', (e) => {
      const { yr, near } = nearest(e);
      style(near);
      const s = near ?? hit;
      if (!s) { tip.hidden = true; return; }
      const d = s.pts.find((q) => q.year === yr);
      showTip(el, tip, e, `${s.name} · ${shortYear(yr)}`, [
        { name: 'Headcount', value: fmtN(d ? d.n : 0) },
        { name: 'Index (2012-13 = 100)', value: d ? fmtI(d.v) : '—' },
        { name: `Change to ${shortYear(fs.end)}`, value: rateText(s) },
      ]);
    })
    .on('mouseleave', () => { tip.hidden = true; style(null); });
});
dash.draw('gf-list', (el) => {
  if (!gpick.inst || !gate(el, ['totals', 'group_totals'], true)) return;
  const main = el.closest('.ux-gwrap').querySelector('[data-draw="growth"]');
  el.style.height = gHeight(Math.max(260, main.clientWidth)) + 'px';
  const fs = fieldSeries();
  const sel = gField();
  const item = (d) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ux-gli ' + (d.up ? 'is-up' : 'is-down');
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(d.field === sel));
    b.title = `${d.name}: ${fmtN(d.base)} in ${shortYear(FIRST)}, ${fmtN(d.last)} in ${shortYear(fs.end)}`;
    const n = document.createElement('span');
    n.className = 'ux-gli-n';
    n.textContent = d.name;
    const v = document.createElement('span');
    v.className = 'ux-gli-v';
    v.textContent = rateText(d);
    b.append(n, v);
    b.onclick = () => pickField(d.field);
    return b;
  };
  const head = (text, cls) => {
    const h = document.createElement('div');
    h.className = 'ux-glist-h ' + cls;
    h.textContent = text;
    return h;
  };
  const list = fs ? fs.list : [];
  // Biggest change first in each group; new fields top the gains.
  const ups = list.filter((d) => d.up).sort((a, b) => (b.rate ?? Infinity) - (a.rate ?? Infinity) || d3.descending(a.last, b.last));
  const downs = list.filter((d) => !d.up).sort((a, b) => a.rate - b.rate);
  el.replaceChildren(head(`Grew (${ups.length})`, 'is-up'), ...ups.map(item), head(`Dropped (${downs.length})`, 'is-down'), ...downs.map(item));
});

// York's share of all Ontario students over time.
dash.draw('share', (el) => {
  if (!gate(el, ['york_ontario'], true)) return;
  const p = P();
  const rows = dash.data('york_ontario').data.filter((r) => r.field === fieldOf(p) && r.level === p.level).sort((a, b) => d3.ascending(a.year, b.year));
  const W = Math.max(260, el.clientWidth), H = Math.round(Math.min(520, Math.max(280, W * 0.45)));
  const { svg, tip } = svgIn(el, W, H);
  if (!rows.length) return;
  const years = rows.map((r) => r.year);
  const y = d3.scaleLinear([0, d3.max(rows, (r) => r.share)], [H - 26, 10]).nice();
  const ticks = y.ticks(4);
  const tf = y.tickFormat(4, '%');
  const left = measure(svg, ticks.map(tf)) + 8;
  const end = fmtP(rows[rows.length - 1].share);
  const right = measure(svg, [end], 'ux-lbl') + 12;
  const x = d3.scalePoint(years, [left + 6, W - right]);
  yGrid(svg, y, ticks, tf, left, W - right + 4);
  yearAxis(svg, years, x, H, p.year);
  const grad = 'grad-share-' + Math.random().toString(36).slice(2, 8);
  const lg = svg.append('defs').append('linearGradient').attr('id', grad).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
  [[0, 0.26], [0.25, 0.16], [0.5, 0.08], [0.75, 0.03], [1, 0]].forEach(([o, a]) => {
    lg.append('stop').attr('offset', o).style('stop-color', dash.colors[0]).style('stop-opacity', a);
  });
  svg.append('path').attr('d', d3.area().x((r) => x(r.year)).y0(y(0)).y1((r) => y(r.share))(rows)).style('fill', `url(#${grad})`);
  svg.append('path').attr('d', d3.line().x((r) => x(r.year)).y((r) => y(r.share))(rows)).style('fill', 'none')
    .style('stroke', dash.colors[0]).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  svg.append('line').attr('class', 'ux-axis-line').attr('x1', left).attr('x2', W - right + 4).attr('y1', y(0)).attr('y2', y(0));
  const sel = rows.find((r) => r.year === p.year);
  if (sel) svg.append('circle').attr('r', 3.5).attr('cx', x(sel.year)).attr('cy', y(sel.share)).style('fill', dash.colors[0]);
  svg.append('text').attr('class', 'ux-lbl ux-lbl-strong').attr('x', W - right + 8).attr('y', y(rows[rows.length - 1].share))
    .attr('dy', '0.32em').style('fill', dash.colors[0]).text(end);
  const rule = svg.append('line').attr('class', 'ux-rule').attr('y1', 10).attr('y2', H - 26).attr('opacity', 0);
  svg.append('rect').attr('x', left).attr('width', W - left).attr('y', 0).attr('height', H).style('fill', 'transparent')
    .on('mousemove', (e) => {
      const mx = d3.pointer(e, svg.node())[0];
      const r = rows[d3.leastIndex(rows, (d) => Math.abs(x(d.year) - mx))];
      rule.attr('x1', x(r.year)).attr('x2', x(r.year)).attr('opacity', 1);
      showTip(el, tip, e, shortYear(r.year), [
        { name: 'York’s share', value: fmtP(r.share) },
        { name: 'Since 2012-13', value: r.change_base == null ? '—' : fmtPt(r.change_base) },
      ]);
    })
    .on('mouseleave', () => { tip.hidden = true; rule.attr('opacity', 0); });
});

// Ranking: York, peers combined and each peer on the chosen measure.
const METRICS = {
  change_base: { fmt: fmtD, signed: true },
  change_prev: { fmt: fmtD, signed: true },
  headcount: { fmt: fmtN, signed: false },
  intl_share: { fmt: fmtP, signed: false },
};
const METRIC_NAMES = { change_base: 'Growth since 2012-13', change_prev: 'Change from previous year', headcount: 'Headcount', intl_share: 'International share' };
dash.draw('sel-metric', (el) => { el.textContent = METRIC_NAMES[METRICS[P().metric] ? P().metric : 'change_base']; });
dash.draw('rank-bars', (el) => {
  if (!gate(el, ['totals', 'group_totals', 'peer_groups'], true)) return;
  const p = P();
  const m = METRICS[p.metric] ?? METRICS.change_base;
  const f = METRICS[p.metric] ? p.metric : 'change_base';
  const pool = new Set([FOCUS, ...membersOf(p.group)]);
  const rows = dash.data('totals').data
    .filter((r) => r.field === fieldOf(p) && r.level === p.level && r.year === p.year && pool.has(r.institution) && r[f] != null)
    .map((r) => ({ name: r.institution, v: r[f], kind: r.institution === FOCUS ? 'york' : 'peer' }));
  const comb = byKeyRow(dash.data('group_totals').data).get(groupKey(p));
  if (comb && comb[f] != null && f !== 'headcount') rows.push({ name: 'Peers combined', v: comb[f], kind: 'comb' });
  rows.sort((a, b) => b.v - a.v);
  const W = Math.max(260, el.clientWidth), rowH = 30, H = Math.max(rowH, rows.length * rowH) + 4;
  const { svg, tip } = svgIn(el, W, H);
  if (!rows.length) return;
  const vals = rows.map((r) => r.v).sort(d3.ascending);
  const q = d3.quantile(vals, 0.85);
  const keep = d3.max(rows.filter((r) => r.kind !== 'peer'), (r) => r.v) ?? 0;
  const max = vals[vals.length - 1];
  const cap = q > 0 && max > 2 * q ? Math.max(q * 1.4, keep) : max;
  const lo = Math.min(0, vals[0]);
  const labelW = Math.min(measure(svg, rows.map((r) => r.name), 'ux-lbl ux-lbl-strong') + 16, W * 0.38);
  const valW = measure(svg, rows.map((r) => m.fmt(r.v)), 'ux-lbl') + 8;
  const x = d3.scaleLinear([lo, Math.max(cap, 0)], [labelW + (lo < 0 ? valW : 0), W - valW]);
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r, i) => `translate(0,${i * rowH + 2})`);
  g.append('text').attr('class', (r) => (r.kind === 'peer' ? 'ux-lbl' : 'ux-lbl ux-lbl-strong')).attr('x', labelW - 10).attr('y', rowH / 2)
    .attr('dy', '0.32em').attr('text-anchor', 'end').text((r) => fit(svg, r.name, labelW - 12, 'ux-lbl ux-lbl-strong'));
  const fill = (r) => (r.kind === 'york' ? dash.colors[0] : r.kind === 'comb' ? dash.colors[1] : MUTED);
  g.append('rect').attr('y', 5).attr('height', rowH - 10).attr('rx', 2).style('fill', fill)
    .attr('x', (r) => x(Math.min(0, r.v))).attr('width', (r) => Math.max(1, Math.abs(x(Math.min(r.v, cap)) - x(0))));
  g.append('text').attr('class', 'ux-lbl').attr('y', rowH / 2).attr('dy', '0.32em')
    .attr('x', (r) => (r.v < 0 ? x(r.v) - 4 : x(Math.min(r.v, cap)) + 4)).attr('text-anchor', (r) => (r.v < 0 ? 'end' : 'start'))
    .text((r) => m.fmt(r.v) + (r.v > cap ? ' ›' : ''));
  svg.append('line').attr('class', 'ux-axis-line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H);
  g.append('rect').attr('x', 0).attr('width', W).attr('height', rowH).style('fill', 'transparent')
    .on('mousemove', (e, r) => {
      const place = rows.filter((d) => d.kind !== 'comb').findIndex((d) => d.name === r.name) + 1;
      showTip(el, tip, e, r.name, [
        { name: 'Value', value: m.fmt(r.v) },
        ...(r.kind === 'comb' ? [] : [{ name: 'Rank', value: `${place} of ${rows.filter((d) => d.kind !== 'comb').length}` }]),
      ]);
    })
    .on('mouseleave', () => { tip.hidden = true; });
});

// York and its peers in a table for the selected year and level.
dash.draw('inst-rows', (tb) => {
  const table = tb.closest('table');
  if (!gateRows(tb, ['totals', 'peer_groups'], 5)) return;
  const p = P();
  const pool = new Set([FOCUS, ...membersOf(p.group)]);
  const list = dash.data('totals').data.filter((r) => r.field === fieldOf(p) && r.level === p.level && r.year === p.year && pool.has(r.institution));
  sortRows(list, table);
  const max = d3.max(list, (r) => r.headcount) || 1;
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.key;
    if (r.institution === FOCUS) tr.className = 'is-picked';
    const hc = document.createElement('td');
    hc.className = 'ux-num';
    const cell = document.createElement('div');
    cell.className = 'ux-cell';
    const num = document.createElement('span');
    num.textContent = fmtN(r.headcount);
    const bar = document.createElement('span');
    bar.className = 'ux-cellbar';
    bar.style.width = (r.headcount / max) * 100 + '%';
    bar.style.background = r.institution === FOCUS ? dash.colors[0] : MUTED;
    cell.append(num, bar);
    hc.append(cell);
    tr.append(
      td(r.institution),
      hc,
      td(r.change_prev == null ? '—' : fmtD(r.change_prev), signed(r.change_prev) + ' ux-hide-narrow'),
      td(r.change_base == null ? '—' : fmtD(r.change_base), signed(r.change_base)),
      td(r.intl_share == null ? '—' : fmtP(r.intl_share), 'ux-num'),
    );
    return tr;
  }));
});

// Breakdown rows for the selected group, level and year, largest first.
const TOP = 12;
const selRows = (id) => {
  const rows = (bySel(dash.data(id).data).get(cmpKey(P())) ?? []).filter((r) => r.york > 0); // only what York has students in
  if (id === 'cmp_cip2') return rows.map((r) => ({ ...r, code: r.category.slice(0, 2), category: fieldName(r.category), size: r.york + r.peers })); // names without the CIP code
  return rows;
};
// Program titles without the CIP code; a title shared by more than one code in the list keeps its code in brackets.
const programTitle = (c) => c.replace(/^\d\d(\.\d+)? /, '');
function programLabels(rows) {
  const n = d3.rollup(rows, (v) => v.length, (r) => programTitle(r.category));
  return rows.map((r) => {
    const t = programTitle(r.category);
    return { ...r, category: n.get(t) > 1 ? `${t} (${r.category.split(' ')[0]})` : t };
  });
}
const topRows = (id) => selRows(id).sort((a, b) => b.york + b.peers - (a.york + a.peers)).slice(0, TOP);

// Field of study opens into its programs. One count (a number or all), the open fields and each chart's sort
// are shared by the Mix, Gains and Table views; the table sorts by its headers.
const TREE = 'cmp_cip2';
const tree = { top: '12', open: new Set(), sort: { mix: { key: 'size', dir: 'desc' }, gains: { key: 'field_change', dir: 'desc' } } };
const srcIds = (el) => el.dataset.source.split(' ');
const bySize = (a, b) => b.size - a.size;
const largest = (list, limit) => (limit && tree.top !== 'all' ? [...list].sort(bySize).slice(0, Number(tree.top)) : list);
// A field's programs, with shares of all students like the field's own (cmp_cip's shares are within the field).
function programsOf(f) {
  const rows = (bySel(dash.data('cmp_cip').data).get(cmpKey(P())) ?? []).filter((r) => r.york > 0 && r.category.startsWith(f.code + '.'));
  return programLabels(rows).map((r) => {
    const ys = r.york_share == null || f.york_share == null ? null : r.york_share * f.york_share;
    const ps = r.peer_share == null || f.peer_share == null ? null : r.peer_share * f.peer_share;
    return { ...r, child: true, parent: f.code, size: r.york + r.peers, york_share: ys, peer_share: ps, gap: ys == null || ps == null ? null : (ys - ps) * 100 };
  });
}
// Fields in the given order, each open one followed by its programs in the same order.
// limit: the largest fields (and programs) up to the count. only: rows to keep at both levels.
// keep (a search): a field stays when it or one of its programs matches; matching programs open it.
// kids: programs to keep (the table leaves out programs with no York students).
function treeRows(cmp, { limit = false, keep = null, only = null, kids: kidOnly = null } = {}) {
  let fields = selRows(TREE);
  if (only) fields = fields.filter(only);
  const kidsOf = (f) => programsOf(f).filter((r) => (!only || only(r)) && (!kidOnly || kidOnly(r)));
  const sel = [];
  for (const f of fields) {
    if (!keep || keep(f)) { sel.push({ f, kids: null }); continue; }
    const kids = kidsOf(f).filter(keep);
    if (kids.length) sel.push({ f, kids });
  }
  const shown = new Set(largest(sel.map((x) => x.f), limit));
  const out = [];
  for (const x of sel.filter((x) => shown.has(x.f)).sort((a, b) => cmp(a.f, b.f))) {
    const open = tree.open.has(x.f.code) || Boolean(x.kids);
    out.push({ ...x.f, open });
    if (open) out.push(...largest(x.kids ?? kidsOf(x.f), limit).sort(cmp));
  }
  return out;
}
const chartCmp = (chart) => cmpOn(tree.sort[chart].key, tree.sort[chart].dir);
// The button that opens or closes a field.
function expBtn(r) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ux-exp';
  b.dataset.code = r.code;
  b.setAttribute('aria-expanded', String(r.open));
  b.setAttribute('aria-label', (r.open ? 'Close ' : 'Open ') + r.category);
  b.textContent = r.open ? '▾' : '▸';
  return b;
}
const redrawTree = () => ['mix-bars', 'field-bars', 'dim-rows'].forEach((n) => dash.draw(n));
const toggleField = (code) => {
  if (tree.open.has(code)) tree.open.delete(code); else tree.open.add(code);
  redrawTree();
};
// Brings the count boxes and sort controls in line with the tree state.
function syncTreeCtl() {
  document.querySelectorAll('.ux .ux-top').forEach((i) => { if (document.activeElement !== i) i.value = tree.top; i.dataset.last = i.value; });
  document.querySelectorAll('.ux .ux-sortby').forEach((s) => { s.value = tree.sort[s.dataset.chart].key; });
  document.querySelectorAll('.ux .ux-sortdir').forEach((b) => {
    const s = tree.sort[b.dataset.chart];
    const text = s.key === 'category';
    b.textContent = s.dir === 'desc' ? (text ? '↓ Z to A' : '↓ High to low') : (text ? '↑ A to Z' : '↑ Low to high');
  });
}
document.addEventListener('click', (e) => {
  const exp = e.target.closest('.ux .ux-exp');
  if (exp) { toggleField(exp.dataset.code); return; }
  const dir = e.target.closest('.ux .ux-sortdir');
  if (dir) {
    const s = tree.sort[dir.dataset.chart];
    s.dir = s.dir === 'desc' ? 'asc' : 'desc';
    syncTreeCtl();
    redrawTree();
  }
});
document.addEventListener('change', (e) => {
  if (!e.target.matches('.ux .ux-sortby')) return;
  const s = tree.sort[e.target.dataset.chart];
  s.key = e.target.value;
  s.dir = s.key === 'category' ? 'asc' : 'desc';
  syncTreeCtl();
  redrawTree();
});
// The count box takes digits or the word "all", nothing else, and applies as you type.
document.addEventListener('input', (e) => {
  const i = e.target;
  if (!i.matches('.ux .ux-top')) return;
  const v = i.value.trim().toLowerCase();
  if (!(/^\d*$/.test(v) || 'all'.startsWith(v))) { i.value = i.dataset.last ?? tree.top; return; }
  i.dataset.last = i.value;
  if (v === 'all' || /^0*[1-9]\d*$/.test(v)) {
    tree.top = v === 'all' ? 'all' : String(Number(v));
    document.querySelectorAll('.ux .ux-top').forEach((o) => { if (o !== i) o.value = tree.top; });
    redrawTree();
  }
});
document.addEventListener('focusout', (e) => { if (e.target.matches('.ux .ux-top')) syncTreeCtl(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.ux .ux-top')) { syncTreeCtl(); e.target.select(); } });

// York's mix against the group's: paired bars of share.
dash.draw('mix-bars', (el) => {
  const ids = srcIds(el), id = ids[0];
  if (!gate(el, ids, true)) return;
  const isTree = id === TREE;
  if (isTree) syncTreeCtl();
  const rows = isTree ? treeRows(chartCmp('mix'), { limit: true }) : topRows(id);
  const max = d3.max(rows, (r) => Math.max(r.york_share ?? 0, r.peer_share ?? 0)) || 1;
  el.replaceChildren(...rows.map((r) => {
    const row = document.createElement('div');
    row.className = 'ux-bar-row' + (r.child ? ' ux-child' : '');
    const head = document.createElement('div');
    head.className = 'ux-bar-head';
    const label = document.createElement('span');
    label.className = 'ux-bar-label';
    label.textContent = r.category;
    label.title = r.category;
    const val = document.createElement('span');
    val.className = 'ux-bar-val';
    val.textContent = `${fmtP(r.york_share ?? 0)} vs ${fmtP(r.peer_share ?? 0)}`;
    if (isTree && !r.child) head.append(expBtn(r));
    head.append(label, val);
    const yb = document.createElement('div');
    yb.className = 'ux-bar';
    yb.style.width = ((r.york_share ?? 0) / max) * 100 + '%';
    yb.style.background = dash.colors[0];
    const pb = document.createElement('div');
    pb.className = 'ux-bar ux-bar-thin';
    pb.style.width = ((r.peer_share ?? 0) / max) * 100 + '%';
    pb.style.background = dash.colors[1];
    row.append(head, yb, pb);
    return row;
  }));
});

// York's share of each category (York ÷ York + peers), change since 2012-13 in points.
dash.draw('field-bars', (el) => {
  const ids = srcIds(el), id = ids[0];
  if (!gate(el, ids, true)) return;
  const isTree = id === TREE;
  if (isTree) syncTreeCtl();
  const rows = isTree ? treeRows(chartCmp('gains'), { limit: true, only: (r) => r.field_change != null })
    : topRows(id).filter((r) => r.field_change != null).sort((a, b) => b.field_change - a.field_change);
  const W = Math.max(260, el.clientWidth), rowH = 30, H = Math.max(rowH, rows.length * rowH) + 4;
  const { svg, tip } = svgIn(el, W, H);
  if (!rows.length) return;
  const ext = d3.max(rows, (r) => Math.abs(r.field_change)) || 1;
  const IND = isTree ? 34 : 0; // room for the open/close mark and the programs' indent
  const labelW = Math.min(measure(svg, rows.map((r) => r.category), 'ux-lbl') + 16 + IND, W * 0.45);
  const valW = measure(svg, rows.map((r) => fmtPt(r.field_change)), 'ux-lbl') + 8;
  const x = d3.scaleLinear([-ext, ext], [labelW + valW, W - valW]);
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r, i) => `translate(0,${i * rowH + 2})`);
  if (isTree) {
    const lx = (r) => (r.child ? IND : 18);
    g.append('text').attr('class', (r) => (r.child ? 'ux-lbl ux-lbl-child' : 'ux-lbl')).attr('x', lx).attr('y', rowH / 2).attr('dy', '0.32em')
      .text((r) => fit(svg, r.category, labelW - lx(r) - 10, 'ux-lbl'));
    g.filter((r) => !r.child).append('text').attr('class', 'ux-lbl').attr('x', 2).attr('y', rowH / 2).attr('dy', '0.32em').text((r) => (r.open ? '▾' : '▸'));
  } else {
    g.append('text').attr('class', 'ux-lbl').attr('x', labelW - 10).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
      .text((r) => fit(svg, r.category, labelW - 12, 'ux-lbl'));
  }
  g.append('rect').attr('y', 5).attr('height', rowH - 10).attr('rx', 2)
    .style('fill', (r) => (r.field_change >= 0 ? dash.colors[0] : LOSS))
    .attr('x', (r) => x(Math.min(0, r.field_change))).attr('width', (r) => Math.max(1, Math.abs(x(r.field_change) - x(0))));
  g.append('text').attr('class', 'ux-lbl').attr('y', rowH / 2).attr('dy', '0.32em')
    .attr('x', (r) => (r.field_change < 0 ? x(r.field_change) - 4 : x(r.field_change) + 4))
    .attr('text-anchor', (r) => (r.field_change < 0 ? 'end' : 'start')).text((r) => fmtPt(r.field_change));
  svg.append('line').attr('class', 'ux-axis-line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H);
  const hit = g.append('rect').attr('x', 0).attr('width', W).attr('height', rowH).style('fill', 'transparent');
  if (isTree) hit.filter((r) => !r.child).style('cursor', 'pointer').on('click', (e, r) => toggleField(r.code));
  hit
    .on('mousemove', (e, r) => showTip(el, tip, e, r.category, [
      ...(isTree && !r.child ? [{ name: r.open ? 'Click to close the field' : 'Click to see its programs', value: '' }] : []),
      { name: 'York’s share now', value: fmtP(r.field_share) },
      { name: 'Change since 2012-13', value: fmtPt(r.field_change) },
      { color: dash.colors[0], name: 'York', value: fmtN(r.york) },
      { color: dash.colors[1], name: 'Peers combined', value: fmtN(r.peers) },
    ]))
    .on('mouseleave', () => { tip.hidden = true; });
});

// Every category, searchable and sortable.
dash.draw('dim-rows', (tb) => {
  const table = tb.closest('table');
  const ids = srcIds(table), id = ids[0];
  if (!gateRows(tb, ids, 9)) return;
  const search = table.closest('.ux-dim')?.querySelector('.ux-search');
  const q = (search?.value ?? '').trim().toLowerCase();
  const match = (r) => r.category.toLowerCase().includes(q);
  let list;
  if (id === TREE) {
    // Both levels sort by the chosen header; a search opens the fields whose programs match.
    sortRows([], table);
    const s = sortBy.get(table.id) ?? { key: table.dataset.defaultSort || 'headcount', dir: 'desc' };
    list = treeRows(cmpOn(s.key, s.dir), { keep: q ? match : null });
  } else {
    list = selRows(id);
    if (q) list = list.filter(match);
    sortRows(list, table);
  }
  const pct = (v) => (v == null ? '—' : fmtP(v));
  const chg = (v) => (v == null ? '—' : fmtD(v));
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.key;
    const name = td(r.category);
    if (id === TREE) {
      if (r.child) tr.className = 'ux-child';
      else name.prepend(expBtn(r));
    }
    tr.append(
      name,
      td(fmtN(r.york), 'ux-num'),
      td(pct(r.york_share), 'ux-num'),
      td(pct(r.peer_share), 'ux-num'),
      td(r.gap == null ? '—' : fmtPt(r.gap), 'ux-num ux-hide-narrow'),
      td(pct(r.field_share), 'ux-num'),
      td(r.field_change == null ? '—' : fmtPt(r.field_change), signed(r.field_change)),
      td(chg(r.york_change), signed(r.york_change) + ' ux-hide-narrow'),
      td(chg(r.peer_change), signed(r.peer_change) + ' ux-hide-narrow'),
    );
    return tr;
  }));
});

// A link names a page (#growth) or a breakdown (#by-age).
const link = location.hash.slice(1);
if (PAGES.includes(link)) dash.setParams({ page: link });
else if (link === 'by-cip') dash.setParams({ page: 'mix', dim: 'cip2' });
else if (link.startsWith('by-') && document.querySelector(`.ux-dim[data-dim="${link.slice(3)}"]`)) dash.setParams({ page: 'mix', dim: link.slice(3) });

// Ranking page: headcount for York and the group's members, each year, as 3D bars you can rotate.
// Drawn on a canvas with an orthographic projection (no perspective, so equal heights look equal).
// Drag or use the arrow keys to rotate; hover a bar for its figures.
const VIEW3D = { yaw: -0.62, pitch: 0.5 };
const DEFAULT3D = { ...VIEW3D };
let from3d = FIRST;
// A CSS colour (including var(...)) as [r, g, b], read back from a 1px canvas so any colour syntax works.
function rgbOf(el, css) {
  const s = document.createElement('span');
  s.style.color = css;
  el.append(s);
  const c = getComputedStyle(s).color;
  s.remove();
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const x = cv.getContext('2d');
  x.fillStyle = c;
  x.fillRect(0, 0, 1, 1);
  return [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}
const shade = ([r, g, b], k, a = 1) => `rgba(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)},${a})`;

function build3d(el) {
  const head = document.createElement('div');
  head.className = 'ux-3d-head';
  const lab = document.createElement('label');
  lab.className = 'ux-3d-from';
  lab.textContent = 'From ';
  const from = document.createElement('select');
  from.onchange = () => { from3d = from.value; draw3d(el); };
  lab.append(from);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'ux-btn';
  reset.textContent = 'Reset view';
  reset.onclick = () => { Object.assign(VIEW3D, DEFAULT3D); el._3d.paint(); };
  head.append(lab, reset);
  const wrap = document.createElement('div');
  wrap.className = 'ux-3d-wrap';
  const canvas = document.createElement('canvas');
  canvas.className = 'ux-3d';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  const tip = document.createElement('div');
  tip.className = 'ux-tip';
  tip.hidden = true;
  wrap.append(canvas, tip);
  el.replaceChildren(head, wrap);
  const st = { canvas, tip, from, faces: [], hover: null, paint: () => {} };
  el._3d = st;

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    tip.hidden = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      VIEW3D.yaw += (e.clientX - drag.x) * 0.008;
      VIEW3D.pitch = Math.max(0.05, Math.min(1.5, VIEW3D.pitch + (e.clientY - drag.y) * 0.008));
      drag = { x: e.clientX, y: e.clientY };
      st.paint();
      return;
    }
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const hit = [...st.faces].reverse().find((f) => inside(px, py, f.pts));
    const bar = hit?.bar ?? null;
    if (bar !== st.hover) {
      st.hover = bar;
      st.paint();
    }
    if (!bar) {
      tip.hidden = true;
      return;
    }
    const c = st.colorOf?.get(bar.name);
    const mf = st.metric;
    showTip(wrap, tip, e, `${bar.name} · ${shortYear(bar.year)}`, [
      { name: METRIC_NAMES[mf], value: METRICS[mf].fmt(bar.v), color: c ? `rgb(${c.join(',')})` : undefined },
      { name: 'Rank that year', value: `${bar.rank} of ${bar.of}` },
      ...(mf !== 'headcount' ? [{ name: 'Headcount', value: fmtN(bar.n) }] : []),
      ...(mf === 'headcount' && bar.first && bar.first.year !== bar.year
        ? [{ name: `Change since ${shortYear(bar.first.year)}`, value: fmtD(bar.v / bar.first.v - 1) }] : []),
    ]);
  });
  const end = () => { drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    tip.hidden = true;
    if (st.hover) {
      st.hover = null;
      st.paint();
    }
  });
  canvas.addEventListener('keydown', (e) => {
    const k = { ArrowLeft: [-0.12, 0], ArrowRight: [0.12, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] }[e.key];
    if (!k) return;
    e.preventDefault();
    VIEW3D.yaw += k[0];
    VIEW3D.pitch = Math.max(0.05, Math.min(1.5, VIEW3D.pitch + k[1]));
    st.paint();
  });
  return st;
}
function inside(x, y, pts) {
  let r = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
  }
  return r;
}

function draw3d(el) {
  if (!gate(el, ['totals', 'peer_groups'], true)) return;
  const st = el._3d && el.contains(el._3d.canvas) ? el._3d : build3d(el);
  const p = P();
  const f = METRICS[p.metric] ? p.metric : 'change_base';
  const all = dash.data('totals').data.filter((r) => r.field === fieldOf(p) && r.level === p.level);
  const allYears = [...new Set(all.map((r) => r.year))].sort(d3.ascending).filter((y) => y <= p.year);
  st.from.replaceChildren(...allYears.map((y) => new Option(shortYear(y), y)));
  if (!allYears.includes(from3d)) from3d = allYears[0] ?? FIRST;
  st.from.value = from3d;
  const years = allYears.filter((y) => y >= from3d);
  const pool = new Set([FOCUS, ...membersOf(p.group)]);
  const rows = all.filter((r) => pool.has(r.institution) && years.includes(r.year) && r[f] != null);
  const last = new Map(rows.filter((r) => r.year === p.year).map((r) => [r.institution, r[f]]));
  // Smallest at the front, largest at the back, so tall bars don't hide the others in the starting view.
  const insts = [...new Set(rows.map((r) => r.institution))].sort((a, b) => d3.ascending(last.get(a) ?? 0, last.get(b) ?? 0) || d3.ascending(a, b));
  const bars = [];
  for (const y of years) {
    const yr = rows.filter((r) => r.year === y).sort((a, b) => b[f] - a[f]);
    yr.forEach((r, k) => bars.push({ name: r.institution, year: y, v: r[f], n: r.headcount, i: insts.indexOf(r.institution), j: years.indexOf(y), rank: k + 1, of: yr.length }));
  }
  const firstOf = new Map();
  for (const b of bars) if (!firstOf.has(b.name) || b.year < firstOf.get(b.name).year) firstOf.set(b.name, b);
  for (const b of bars) b.first = firstOf.get(b.name);
  st.canvas.setAttribute('aria-label', `3D bar chart of ${METRIC_NAMES[f].toLowerCase()} for ${insts.join(', ')}, ${shortYear(years[0] ?? p.year)} to ${shortYear(p.year)}. Drag or use the arrow keys to rotate.`);
  st.metric = f;
  // The height scale runs from the lowest value (or 0) to the highest (or 0); bars rise or fall from the 0 level.
  let lo = Math.min(0, d3.min(bars, (b) => b.v) ?? 0), hi = Math.max(0, d3.max(bars, (b) => b.v) ?? 0);
  if (hi === lo) hi = lo + 1;
  const tickFmt = f === 'headcount' ? (t) => compact.format(t) : d3.format(hi - lo < 0.1 ? '.1%' : '.0%');
  const nI = Math.max(1, insts.length), nY = Math.max(1, years.length);
  const Hh = Math.max(nI, nY) * 0.55;

  st.paint = () => {
    const W = Math.max(280, st.canvas.parentElement.clientWidth), H = Math.round(Math.min(560, Math.max(340, W * 0.55)));
    const dpr = window.devicePixelRatio || 1;
    st.canvas.width = W * dpr;
    st.canvas.height = H * dpr;
    st.canvas.style.height = H + 'px';
    const ctx = st.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!bars.length) {
      ctx.font = `13px ${getComputedStyle(el).fontFamily}`;
      ctx.fillStyle = shade(rgbOf(el, 'var(--color-fg-muted)'), 1);
      ctx.textAlign = 'center';
      ctx.fillText(f === 'intl_share' ? 'International share is only available for all students.' : 'No figures for this measure and selection.', W / 2, H / 2);
      st.faces = [];
      return;
    }
    const cy = Math.cos(VIEW3D.yaw), sy = Math.sin(VIEW3D.yaw), cp = Math.cos(VIEW3D.pitch), sp = Math.sin(VIEW3D.pitch);
    const rot = (x, y, z) => {
      const x1 = x * cy - z * sy, z1 = x * sy + z * cy;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    };
    const world = (x, y, z) => rot(x - nI / 2, y - Hh / 2, z - nY / 2);
    // Fit the whole box into the canvas, leaving room for labels.
    const corners = [];
    for (const x of [0, nI]) for (const y of [0, Hh]) for (const z of [0, nY]) corners.push(world(x, y, z));
    const [x0, x1] = d3.extent(corners, (c) => c[0]), [y0, y1] = d3.extent(corners, (c) => c[1]);
    const pad = 56;
    const k = Math.min((W - 2 * pad) / (x1 - x0), (H - 2 * pad + 20) / (y1 - y0));
    const ox = W / 2 - ((x0 + x1) / 2) * k, oy = H / 2 + ((y0 + y1) / 2) * k;
    const proj = (x, y, z) => {
      const [a, b, d] = world(x, y, z);
      return [ox + a * k, oy - b * k, d];
    };
    const fg = rgbOf(el, 'var(--color-fg)'), muted = rgbOf(el, 'var(--color-fg-muted)');
    const york = rgbOf(el, dash.colors[0]);
    // One colour per university: York keeps its orange; the others get evenly spaced hues that skip the oranges,
    // a little lighter in dark mode.
    const dark = fg[0] + fg[1] + fg[2] > 380;
    // Colours follow the names (alphabetical), so a university keeps its colour when the measure or order changes.
    const others = insts.filter((n) => n !== FOCUS).sort(d3.ascending);
    const colorOf = new Map([[FOCUS, york], ...others.map((n, i) => {
      const c = d3.hcl(95 + (i * 255) / Math.max(1, others.length - (others.length > 1 ? 1 : 0)), 52, dark ? 70 : 58).rgb();
      return [n, [c.r, c.g, c.b]];
    })]);
    st.colorOf = colorOf;
    const font = getComputedStyle(el).fontFamily;
    const poly = (pts, fill, stroke) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    // Which sides face the viewer: labels go on the near edges, the height scale on the far walls.
    const nearZ = proj(nI / 2, 0, 0)[2] > proj(nI / 2, 0, nY)[2] ? 0 : nY;
    const nearX = proj(0, 0, nY / 2)[2] > proj(nI, 0, nY / 2)[2] ? 0 : nI;
    const farZ = nY - nearZ, farX = nI - nearX;
    const ticks = d3.ticks(lo, hi, 5);
    const hOf = (v) => ((v - lo) / (hi - lo)) * Hh;
    const base = hOf(0);
    // Back walls with grid lines, then the 0 level (the floor when nothing is negative).
    ctx.lineWidth = 1;
    poly([proj(0, 0, farZ), proj(nI, 0, farZ), proj(nI, Hh, farZ), proj(0, Hh, farZ)], shade(fg, 1, 0.02), shade(fg, 1, 0.12));
    poly([proj(farX, 0, 0), proj(farX, 0, nY), proj(farX, Hh, nY), proj(farX, Hh, 0)], shade(fg, 1, 0.02), shade(fg, 1, 0.12));
    if (lo < 0) poly([proj(0, 0, 0), proj(nI, 0, 0), proj(nI, 0, nY), proj(0, 0, nY)], null, shade(fg, 1, 0.1));
    poly([proj(0, base, 0), proj(nI, base, 0), proj(nI, base, nY), proj(0, base, nY)], shade(fg, 1, lo < 0 ? 0.06 : 0.035), shade(fg, 1, lo < 0 ? 0.35 : 0.18));
    ctx.strokeStyle = shade(fg, 1, 0.1);
    for (const t of ticks) {
      const h = hOf(t);
      ctx.beginPath();
      [[0, h, farZ], [nI, h, farZ]].map((q) => proj(...q)).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      [[farX, h, 0], [farX, h, nY]].map((q) => proj(...q)).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    ctx.font = `11px ${font}`;
    ctx.fillStyle = shade(muted, 1);
    ctx.textBaseline = 'middle';
    // Height labels up the far corner on the near-x side of the back wall.
    for (const t of ticks) {
      const [x, y] = proj(nearX, hOf(t), farZ);
      ctx.textAlign = nearX === 0 ? 'right' : 'left';
      ctx.fillText(tickFmt(t), x + (nearX === 0 ? -6 : 6), y);
    }
    // Institution labels along the near z edge, year labels along the near x edge.
    const out = (fromPt, toPt) => (toPt[0] >= fromPt[0] ? 'left' : 'right');
    insts.forEach((name, i) => {
      const a = proj(i + 0.5, 0, nearZ), b = proj(i + 0.5, 0, nearZ + (nearZ === 0 ? -0.9 : 0.9));
      ctx.textAlign = Math.abs(b[0] - a[0]) < 4 ? 'center' : out(a, b);
      ctx.fillStyle = shade(colorOf.get(name), dark ? 1 : 0.85);
      ctx.font = `${name === FOCUS ? '600 ' : ''}12px ${font}`;
      ctx.fillText(name, b[0], b[1]);
    });
    ctx.font = `11px ${font}`;
    ctx.fillStyle = shade(muted, 1);
    years.forEach((y, j) => {
      const a = proj(nearX, 0, j + 0.5), b = proj(nearX + (nearX === 0 ? -0.7 : 0.7), 0, j + 0.5);
      ctx.textAlign = Math.abs(b[0] - a[0]) < 4 ? 'center' : out(a, b);
      if (nY <= 8 || j % 2 === (nY - 1) % 2) ctx.fillText(shortYear(y), b[0], b[1]);
    });
    // The hovered bar's height as a line across both back walls, so other bars can be read against it.
    if (st.hover) {
      const h = hOf(st.hover.v), c = colorOf.get(st.hover.name);
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = shade(c, 1, 0.9);
      ctx.beginPath();
      [[0, h, farZ], [nI, h, farZ]].map((q) => proj(...q)).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      [[farX, h, 0], [farX, h, nY]].map((q) => proj(...q)).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
    }
    // Bars, far to near; each visible face is kept for hover hit-testing.
    const g = 0.19, faces = [];
    const order = bars.map((b) => ({ b, d: proj(b.i + 0.5, (hOf(b.v) + base) / 2, b.j + 0.5)[2] })).sort((a, c) => a.d - c.d);
    const normals = { px: rot(1, 0, 0)[2], nx: rot(-1, 0, 0)[2], pz: rot(0, 0, 1)[2], nz: rot(0, 0, -1)[2], top: rot(0, 1, 0)[2] };
    for (const { b } of order) {
      // A bar spans from the 0 level to its value, up for positive values and down for negative ones.
      const y0 = Math.min(base, hOf(b.v)), h = Math.max(base, hOf(b.v), y0 + 0.001);
      const xa = b.i + g, xb = b.i + 1 - g, za = b.j + g, zb = b.j + 1 - g;
      const c = colorOf.get(b.name);
      const hi = st.hover === b;
      const P3 = (x, y, z) => proj(x, y, z);
      const sides = [
        ['px', [P3(xb, y0, za), P3(xb, y0, zb), P3(xb, h, zb), P3(xb, h, za)], 0.78],
        ['nx', [P3(xa, y0, za), P3(xa, y0, zb), P3(xa, h, zb), P3(xa, h, za)], 0.78],
        ['pz', [P3(xa, y0, zb), P3(xb, y0, zb), P3(xb, h, zb), P3(xa, h, zb)], 0.64],
        ['nz', [P3(xa, y0, za), P3(xb, y0, za), P3(xb, h, za), P3(xa, h, za)], 0.64],
        ['top', [P3(xa, h, za), P3(xb, h, za), P3(xb, h, zb), P3(xa, h, zb)], 1],
      ];
      for (const [n, pts, kk] of sides) {
        if (normals[n] <= 0) continue;
        poly(pts, shade(c, hi ? Math.min(1.15, kk + 0.15) : kk), hi ? shade(fg, 1, 0.9) : shade(c, kk * 0.8, 0.9));
        faces.push({ bar: b, pts });
      }
    }
    st.faces = faces;
  };
  st.paint();
}
dash.draw('bars3d', draw3d);

// Filter dropdowns: the page's own list replaces the browser's, so moving through it with the arrow keys applies
// each choice straight away (the browser's list only reports a choice when it closes). The <select> stays the
// source of truth: the list is drawn from its options, and choosing sets its value and fires its change event.
(() => {
  const FILTER = '.ux .ux-filters select';
  let dd = null; // the open list: { sel, box, start, obs }
  let typed = '', typedAt = 0;

  function row(o, inGroup) {
    const d = document.createElement('div');
    d.className = 'ux-dd-o' + (inGroup ? ' ux-dd-in' : '') + (o.className ? ' ' + o.className : '');
    d.setAttribute('role', 'option');
    d.dataset.value = o.value;
    d.textContent = o.text;
    return d;
  }
  function render() {
    const { sel, box } = dd;
    const out = [];
    for (const c of sel.children) {
      if (c.tagName === 'OPTGROUP') {
        const h = document.createElement('div');
        h.className = 'ux-dd-g';
        h.textContent = c.label;
        out.push(h, ...[...c.children].map((o) => row(o, true)));
      } else out.push(row(c, false));
    }
    box.replaceChildren(...out);
    mark();
  }
  function mark() {
    for (const d of dd.box.querySelectorAll('.ux-dd-o')) {
      const on = d.dataset.value === dd.sel.value;
      d.classList.toggle('is-hi', on);
      d.setAttribute('aria-selected', String(on));
      if (on) d.scrollIntoView({ block: 'nearest' });
    }
  }
  function place() {
    const { sel, box } = dd;
    const r = sel.getBoundingClientRect();
    const below = innerHeight - r.bottom - 8, above = r.top - 8;
    const up = below < 180 && above > below;
    box.style.minWidth = r.width + 'px';
    box.style.maxHeight = Math.min(352, up ? above : below) + 'px';
    box.style.top = up ? '' : r.bottom + 2 + 'px';
    box.style.bottom = up ? innerHeight - r.top + 2 + 'px' : '';
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - 8 - box.offsetWidth)) + 'px';
  }
  function open(sel) {
    if (sel.disabled) return;
    close();
    const box = document.createElement('div');
    box.className = 'ux-dd';
    box.setAttribute('role', 'listbox');
    (sel.closest('.ux') ?? document.body).append(box);
    // The page redraws the options after each choice; redraw the list with them.
    const obs = new MutationObserver(() => dd && render());
    obs.observe(sel, { childList: true, subtree: true, characterData: true });
    dd = { sel, box, start: sel.value, obs };
    sel.setAttribute('aria-expanded', 'true');
    render();
    place();
    mark();
  }
  function close() {
    if (!dd) return;
    dd.obs.disconnect();
    dd.box.remove();
    dd.sel.setAttribute('aria-expanded', 'false');
    dd = null;
  }
  function choose(value) {
    const sel = dd.sel;
    if (sel.value === value) return;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    mark();
  }
  function step(n) {
    const opts = [...dd.sel.options].filter((o) => !o.disabled);
    const i = opts.findIndex((o) => o.value === dd.sel.value);
    const next = opts[Math.max(0, Math.min(opts.length - 1, (i < 0 ? 0 : i) + n))];
    if (next) choose(next.value);
  }
  function seek(ch) {
    const now = Date.now();
    typed = now - typedAt < 700 ? typed + ch : ch;
    typedAt = now;
    const opts = [...dd.sel.options].filter((o) => !o.disabled);
    const i = opts.findIndex((o) => o.value === dd.sel.value);
    const order = typed.length > 1 ? [...opts.slice(i), ...opts.slice(0, i)] : [...opts.slice(i + 1), ...opts.slice(0, i + 1)];
    const hit = order.find((o) => o.text.toLowerCase().startsWith(typed));
    if (hit) choose(hit.value);
  }

  document.addEventListener('mousedown', (e) => {
    const sel = e.target.closest?.(FILTER);
    if (sel) {
      e.preventDefault(); // keeps the browser's own list shut
      if (sel.disabled) return;
      sel.focus();
      if (dd?.sel === sel) close();
      else open(sel);
      return;
    }
    if (dd && e.target.closest?.('.ux-dd')) {
      e.preventDefault(); // keep focus on the select
      const o = e.target.closest('.ux-dd-o');
      if (o) {
        choose(o.dataset.value);
        close();
      }
      return;
    }
    close();
  }, true);

  document.addEventListener('keydown', (e) => {
    const sel = e.target.closest?.(FILTER);
    if (!sel) return;
    if (!dd || dd.sel !== sel) {
      // Closed: the arrow keys already change the select one step at a time; these keys open the list.
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
        e.preventDefault();
        open(sel);
      }
      return;
    }
    const keys = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10, Home: -1e6, End: 1e6 };
    if (e.key in keys && !e.altKey) step(keys[e.key]);
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && e.key === 'ArrowUp')) close();
    else if (e.key === 'Escape') {
      choose(dd.start);
      close();
    } else if (e.key === 'Tab') {
      close();
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) seek(e.key.toLowerCase());
    else return;
    e.preventDefault();
  }, true);

  document.addEventListener('focusout', (e) => { if (dd && e.target === dd.sel) close(); });
  addEventListener('resize', () => dd && place());
  addEventListener('scroll', (e) => { if (dd && !dd.box.contains(e.target)) place(); }, true);
})();
