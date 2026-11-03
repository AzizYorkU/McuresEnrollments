dash.calc('totals', {
  inputs: ['status', 'cip2'],
  title: 'Totals by institution, field and year',
  description: 'Headcount per institution, level and year, for all fields (domestic plus international) and for each field of study, with international share (all fields only), share of all Ontario students, and change from the previous year and from 2012-13.',
  fn: (status, cip2) => {
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
function sortRows(list, table) {
  const s = sortBy.get(table.id) ?? { key: table.dataset.defaultSort || 'headcount', dir: 'desc' };
  list.sort((a, b) => {
    const x = a[s.key], y = b[s.key];
    if (x == null) return y == null ? 0 : 1;
    if (y == null) return -1;
    return s.dir === 'asc' ? d3.ascending(x, y) : d3.descending(x, y);
  });
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
  if (e.target.closest('.ux .ux-reset')) dash.resetParams();
});
document.addEventListener('change', (e) => {
  if (e.target.matches('.ux .ux-level')) dash.setParams({ level: e.target.value });
});
document.addEventListener('input', (e) => {
  if (e.target.matches('.ux .ux-search')) dash.draw('dim-rows');
});

const PAGES = ['overview', 'growth', 'share', 'ranking', 'institutions', 'mix', 'gains', 'table'];
const pageOf = (p) => (PAGES.includes(p.page) ? p.page : 'overview');

dash.onData(() => {
  const p = P();
  const page = pageOf(p);
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
  document.querySelectorAll('.ux .ux-first-year').forEach((n) => { n.hidden = p.year !== FIRST; });
  const oneField = fieldOf(p) !== ALL_F;
  document.querySelectorAll('.ux .ux-no-intl').forEach((n) => { n.hidden = !oneField; });
  document.querySelectorAll('.ux .ux-field-off').forEach((n) => { n.hidden = !oneField; });
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
  el.textContent = f === ALL_F ? 'all fields' : f.replace(/^\d+ /, '');
});
dash.draw('field-select', (sel) => {
  const g = dash.data('cip2');
  const p = P();
  const names = g.status === 'ok' ? [...new Set(g.data.map((r) => r.category))].sort(d3.ascending) : [fieldOf(p)].filter((f) => f !== ALL_F);
  sel.replaceChildren(new Option(ALL_F), ...names.map((n) => new Option(n, n)));
  sel.value = fieldOf(p);
  sel.onchange = () => dash.setParams({ field: sel.value });
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
  const W = Math.max(260, el.clientWidth), H = Math.round(Math.min(520, Math.max(280, W * 0.45)));
  const { svg, tip } = svgIn(el, W, H);
  if (!york.pts.length || !years.length) return;
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
  svg.append('g').selectAll('path').data([comb, york].filter((s) => s.pts.length)).join('path')
    .attr('d', (s) => line(s.pts)).style('fill', 'none').style('stroke', (s) => s.color).attr('stroke-width', (s) => (s === york ? 2.5 : 2))
    .attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  const labels = ends.map((e) => ({ ...e, y: y(last(e.s).v) }));
  spread(labels, 14, 8, H - 30);
  svg.append('g').selectAll('text').data(labels).join('text').attr('class', 'ux-lbl ux-lbl-strong')
    .attr('x', W - right + 8).attr('y', (d) => d.y).attr('dy', '0.32em').style('fill', (d) => d.s.color).text((d) => d.text);
  const rule = svg.append('line').attr('class', 'ux-rule').attr('y1', 10).attr('y2', H - 26).attr('opacity', 0);
  const dots = svg.append('g');
  svg.append('rect').attr('x', left).attr('width', W - left).attr('y', 0).attr('height', H).style('fill', 'transparent')
    .on('mousemove', (e) => {
      const [mx, my] = d3.pointer(e, svg.node());
      const yr = years[d3.leastIndex(years, (v) => Math.abs(x(v) - mx))];
      const at = (s) => s.pts.find((d) => d.year === yr);
      let near = null;
      for (const s of peers) {
        const d = at(s);
        if (d && Math.abs(y(d.v) - my) < 14 && (!near || Math.abs(y(d.v) - my) < Math.abs(y(at(near).v) - my))) near = s;
      }
      peerPaths.style('stroke', (s) => (s === near ? 'var(--color-fg-muted)' : MUTED)).attr('stroke-width', (s) => (s === near ? 2 : 1.25));
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
      peerPaths.style('stroke', MUTED).attr('stroke-width', 1.25);
    });
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
const selRows = (id) => (bySel(dash.data(id).data).get(cmpKey(P())) ?? []).filter((r) => r.york + r.peers > 0);
const topRows = (id) => selRows(id).sort((a, b) => b.york + b.peers - (a.york + a.peers)).slice(0, TOP);

// York's mix against the group's: paired bars of share.
dash.draw('mix-bars', (el) => {
  const id = el.dataset.source;
  if (!gate(el, [id], true)) return;
  const rows = topRows(id);
  const max = d3.max(rows, (r) => Math.max(r.york_share ?? 0, r.peer_share ?? 0)) || 1;
  el.replaceChildren(...rows.map((r) => {
    const row = document.createElement('div');
    row.className = 'ux-bar-row';
    const head = document.createElement('div');
    head.className = 'ux-bar-head';
    const label = document.createElement('span');
    label.className = 'ux-bar-label';
    label.textContent = r.category;
    label.title = r.category;
    const val = document.createElement('span');
    val.className = 'ux-bar-val';
    val.textContent = `${fmtP(r.york_share ?? 0)} vs ${fmtP(r.peer_share ?? 0)}`;
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
  const id = el.dataset.source;
  if (!gate(el, [id], true)) return;
  const rows = topRows(id).filter((r) => r.field_change != null).sort((a, b) => b.field_change - a.field_change);
  const W = Math.max(260, el.clientWidth), rowH = 30, H = Math.max(rowH, rows.length * rowH) + 4;
  const { svg, tip } = svgIn(el, W, H);
  if (!rows.length) return;
  const ext = d3.max(rows, (r) => Math.abs(r.field_change)) || 1;
  const labelW = Math.min(measure(svg, rows.map((r) => r.category), 'ux-lbl') + 16, W * 0.45);
  const valW = measure(svg, rows.map((r) => fmtPt(r.field_change)), 'ux-lbl') + 8;
  const x = d3.scaleLinear([-ext, ext], [labelW + valW, W - valW]);
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r, i) => `translate(0,${i * rowH + 2})`);
  g.append('text').attr('class', 'ux-lbl').attr('x', labelW - 10).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end')
    .text((r) => fit(svg, r.category, labelW - 12, 'ux-lbl'));
  g.append('rect').attr('y', 5).attr('height', rowH - 10).attr('rx', 2)
    .style('fill', (r) => (r.field_change >= 0 ? dash.colors[0] : LOSS))
    .attr('x', (r) => x(Math.min(0, r.field_change))).attr('width', (r) => Math.max(1, Math.abs(x(r.field_change) - x(0))));
  g.append('text').attr('class', 'ux-lbl').attr('y', rowH / 2).attr('dy', '0.32em')
    .attr('x', (r) => (r.field_change < 0 ? x(r.field_change) - 4 : x(r.field_change) + 4))
    .attr('text-anchor', (r) => (r.field_change < 0 ? 'end' : 'start')).text((r) => fmtPt(r.field_change));
  svg.append('line').attr('class', 'ux-axis-line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H);
  g.append('rect').attr('x', 0).attr('width', W).attr('height', rowH).style('fill', 'transparent')
    .on('mousemove', (e, r) => showTip(el, tip, e, r.category, [
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
  const id = table.dataset.source;
  if (!gateRows(tb, [id], 9)) return;
  const search = table.closest('.ux-dim')?.querySelector('.ux-search');
  const q = (search?.value ?? '').trim().toLowerCase();
  let list = selRows(id);
  if (q) list = list.filter((r) => r.category.toLowerCase().includes(q));
  sortRows(list, table);
  const pct = (v) => (v == null ? '—' : fmtP(v));
  const chg = (v) => (v == null ? '—' : fmtD(v));
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.key;
    tr.append(
      td(r.category),
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
else if (link.startsWith('by-') && document.querySelector(`.ux-dim[data-dim="${link.slice(3)}"]`)) dash.setParams({ page: 'mix', dim: link.slice(3) });
