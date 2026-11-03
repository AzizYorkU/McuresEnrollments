dash.calc('totals', {
  inputs: ['status'],
  title: 'Totals by institution and year',
  description: 'Domestic plus international headcount per slice, its international share, and change from the previous year and from 2012-13.',
  fn: (status) => {
    const by = new Map();
    for (const r of status) {
      const n = Number(r.headcount);
      const t = by.get(r.slice) ?? { slice: r.slice, headcount: 0, international: 0 };
      t.headcount += n;
      if (r.category === 'International') t.international += n;
      by.set(r.slice, t);
    }
    const rows = [...by.values()];
    for (const t of rows) {
      const [institution, level, year] = t.slice.split('|');
      const y = Number(year.slice(0, 4));
      const prev = by.get(`${institution}|${level}|${y - 1}-${y}`);
      const base = by.get(`${institution}|${level}|2012-2013`);
      Object.assign(t, {
        institution,
        level,
        year,
        intl_share: t.international / t.headcount,
        change_prev: prev ? t.headcount / prev.headcount - 1 : null,
        change_base: base && year !== '2012-2013' ? t.headcount / base.headcount - 1 : null,
      });
    }
    return rows;
  },
});

const FIRST = '2012-2013';
const ALL_I = 'All institutions';
const fmtN = d3.format(',');
const fmtP = d3.format('.1%');
const fmtD = d3.format('+.1%');
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const shortYear = (y) => y.slice(0, 5) + y.slice(7);
const enc = (s) => String(s).replace(/[%&=]/g, encodeURIComponent);
const P = () => dash.params();
const sliceOf = (p) => `${p.inst}|${p.level}|${p.year}`;
const memo = (f) => {
  const m = new WeakMap();
  return (rows) => {
    if (!m.has(rows)) m.set(rows, f(rows));
    return m.get(rows);
  };
};
const bySlice = memo((rows) => d3.group(rows, (r) => r.slice));
const byKey = memo((rows) => new Map(rows.map((r) => [r.slice + '\n' + r.category, r])));
const totalBySlice = memo((rows) => new Map(rows.map((r) => [r.slice, r])));
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
  const td = document.createElement('td');
  td.colSpan = cols;
  if (st.some((s) => FAILED.includes(s))) td.append(failLine());
  else {
    td.className = 'dash-skeleton';
    td.textContent = '—';
  }
  const tr = document.createElement('tr');
  tr.append(td);
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
const signed = (v) => (v == null ? 'ux-num' : v >= 0 ? 'ux-num ux-up' : 'ux-num ux-down');
function td(text, cls) {
  const e = document.createElement('td');
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

// Table sorting, shared by every table on the page.
const sortBy = new Map();
const DEFAULT_SORT = { key: 'headcount', dir: 'desc' };
function sortRows(list, table) {
  const s = sortBy.get(table.id) ?? DEFAULT_SORT;
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
function measure(svg, texts) {
  const g = svg.append('g').attr('class', 'ux-tick');
  const w = d3.max(texts, (t) => g.append('text').text(t).node().getComputedTextLength()) || 0;
  g.remove();
  return w;
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

// Filters and controls.
document.addEventListener('click', (e) => {
  const sort = e.target.closest('.ux .ux-sort');
  if (sort) {
    const table = sort.closest('table');
    const cur = sortBy.get(table.id) ?? DEFAULT_SORT;
    const key = sort.dataset.sort;
    const text = key === 'category' || key === 'institution';
    const dir = cur.key === key ? (cur.dir === 'asc' ? 'desc' : 'asc') : text ? 'asc' : 'desc';
    sortBy.set(table.id, { key, dir });
    dash.draw(table.dataset.rows);
    return;
  }
  const pick = e.target.closest('.ux-inst-table .ux-link');
  if (pick) {
    dash.setParams({ inst: pick.closest('tr').dataset.inst });
    return;
  }
  const tab = e.target.closest('.ux .ux-tab');
  if (tab) {
    dash.setParams({ dim: tab.dataset.dim });
    dash.setLink('by-' + tab.dataset.dim);
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

dash.onData(() => {
  const p = P();
  document.querySelectorAll('.ux .ux-level').forEach((s) => { s.value = p.level; });
  document.querySelectorAll('.ux .ux-sw[data-i]').forEach((s) => { s.style.background = dash.colors[Number(s.dataset.i)]; });
  document.querySelectorAll('.ux .ux-tab').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dim === p.dim)));
  const allInst = p.inst === ALL_I;
  const blocked = p.dim === 'program' && allInst;
  const d = blocked ? null : dash.data(p.dim);
  const empty = !!d && d.status === 'ok' && !bySlice(d.data).has(sliceOf(p));
  document.querySelectorAll('.ux .ux-dim').forEach((s) => {
    const on = s.dataset.dim === p.dim;
    s.hidden = !on;
    s.querySelectorAll('.ux-need-inst').forEach((n) => { n.hidden = !(on && blocked); });
    s.querySelectorAll('.ux-empty').forEach((n) => { n.hidden = !(on && empty); });
    s.querySelectorAll('.ux-dim-body').forEach((b) => { b.hidden = !on || blocked || empty; });
  });
});

// Words in the summary line.
dash.draw('sel-inst', (el) => { el.textContent = P().inst; });
dash.draw('sel-level', (el) => { el.textContent = P().level; });
dash.draw('sel-year', (el) => { el.textContent = shortYear(P().year); });

dash.draw('inst-select', (sel) => {
  const t = dash.data('totals');
  const p = P();
  const names = t.status === 'ok'
    ? [...new Set(t.data.map((r) => r.institution))].filter((n) => n !== ALL_I).sort(d3.ascending)
    : [p.inst].filter((n) => n !== ALL_I);
  sel.replaceChildren(new Option(ALL_I), ...names.map((n) => new Option(n)));
  sel.value = p.inst;
  sel.onchange = () => dash.setParams({ inst: sel.value });
});
dash.draw('year-select', (sel) => {
  const t = dash.data('totals');
  const p = P();
  const years = t.status === 'ok' ? [...new Set(t.data.map((r) => r.year))].sort(d3.descending) : [p.year];
  sel.replaceChildren(...years.map((y) => new Option(shortYear(y), y)));
  sel.value = p.year;
  sel.onchange = () => dash.setParams({ year: sel.value });
});

// Headline figures, from the totals for the selected slice.
const figure = (field, fmt, colored) => (el) => {
  if (!gate(el, ['totals'])) return;
  const r = totalBySlice(dash.data('totals').data).get(sliceOf(P()));
  if (!r || r[field] == null) {
    el.replaceChildren('—');
    return;
  }
  const s = cite('span', fmt(r[field]), 'totals', field, 'slice=' + enc(r.slice));
  if (colored) s.className = r[field] >= 0 ? 'ux-up' : 'ux-down';
  el.replaceChildren(s);
};
dash.draw('tile-headcount', figure('headcount', fmtN));
dash.draw('tile-prev', figure('change_prev', fmtD, true));
dash.draw('tile-base', figure('change_base', fmtD, true));
dash.draw('tile-intl', figure('intl_share', fmtP));
dash.draw('lede-total', figure('headcount', fmtN));
dash.draw('lede-change', figure('change_base', fmtD));

// Enrolment by year: stacked domestic and international bars.
dash.draw('trend', (el) => {
  if (!gate(el, ['totals'], true)) return;
  const p = P();
  const rows = dash.data('totals').data
    .filter((r) => r.institution === p.inst && r.level === p.level)
    .sort((a, b) => d3.ascending(a.year, b.year));
  const W = Math.max(260, el.clientWidth), H = 240;
  const { svg, tip } = svgIn(el, W, H);
  if (!rows.length) return;
  const y = d3.scaleLinear([0, d3.max(rows, (r) => r.headcount)], [H - 26, 10]).nice();
  const ticks = y.ticks(4);
  const tf = (v) => compact.format(v);
  const left = measure(svg, ticks.map(tf)) + 8;
  const years = rows.map((r) => r.year);
  const x = d3.scaleBand(years, [left, W - 2]).paddingInner(0.25).paddingOuter(0.1);
  svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'ux-grid-line')
    .attr('x1', left).attr('x2', W - 2).attr('y1', y).attr('y2', y);
  svg.append('g').attr('class', 'ux-tick').selectAll('text').data(ticks).join('text')
    .attr('x', left - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(tf);
  yearAxis(svg, years, x, H, p.year);
  const col = svg.append('g').selectAll('g').data(rows).join('g').attr('opacity', (r) => (r.year === p.year ? 1 : 0.45));
  col.append('rect').attr('x', (r) => x(r.year)).attr('width', x.bandwidth()).attr('rx', 2)
    .attr('y', (r) => y(r.headcount - r.international)).attr('height', (r) => y(0) - y(r.headcount - r.international))
    .style('fill', dash.colors[0]);
  col.append('rect').attr('x', (r) => x(r.year)).attr('width', x.bandwidth()).attr('rx', 2)
    .attr('y', (r) => y(r.headcount)).attr('height', (r) => Math.max(0, y(r.headcount - r.international) - y(r.headcount) - 1))
    .style('fill', dash.colors[1]);
  svg.append('line').attr('class', 'ux-axis-line').attr('x1', left).attr('x2', W - 2).attr('y1', y(0)).attr('y2', y(0));
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.year) - (x.step() - x.bandwidth()) / 2).attr('width', x.step())
    .attr('y', 0).attr('height', H).style('fill', 'transparent').style('cursor', 'pointer')
    .on('mousemove', (e, r) => showTip(el, tip, e, shortYear(r.year), [
      { color: dash.colors[0], name: 'Domestic', value: fmtN(r.headcount - r.international) },
      { color: dash.colors[1], name: 'International', value: fmtN(r.international) },
      { name: 'Total', value: fmtN(r.headcount) },
    ]))
    .on('mouseleave', () => { tip.hidden = true; })
    .on('click', (e, r) => dash.setParams({ year: r.year }));
});

// Institution ranking for the selected year and level.
dash.draw('inst-rows', (tb) => {
  const table = tb.closest('table');
  if (!gateRows(tb, ['totals'], 5)) return;
  const p = P();
  const list = dash.data('totals').data.filter((r) => r.level === p.level && r.year === p.year && r.institution !== ALL_I);
  sortRows(list, table);
  const max = d3.max(list, (r) => r.headcount) || 1;
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = r.slice;
    tr.dataset.inst = r.institution;
    if (r.institution === p.inst) tr.className = 'is-picked';
    const name = document.createElement('td');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ux-link';
    b.textContent = r.institution;
    name.append(b);
    const hc = document.createElement('td');
    hc.className = 'ux-num';
    const cell = document.createElement('div');
    cell.className = 'ux-cell';
    const num = document.createElement('span');
    num.textContent = fmtN(r.headcount);
    const bar = document.createElement('span');
    bar.className = 'ux-cellbar';
    bar.style.width = (r.headcount / max) * 100 + '%';
    bar.style.background = dash.colors[0];
    cell.append(num, bar);
    hc.append(cell);
    tr.append(
      name,
      hc,
      td(r.change_prev == null ? '—' : fmtD(r.change_prev), signed(r.change_prev) + ' ux-hide-narrow'),
      td(r.change_base == null ? '—' : fmtD(r.change_base), signed(r.change_base)),
      td(fmtP(r.intl_share), 'ux-num'),
    );
    return tr;
  }));
});

// Breakdown: largest groups as bars over a thin 2012-13 bar.
dash.draw('bars', (el) => {
  const [id, sid] = el.dataset.source.split(' ');
  if (!gate(el, [id, sid], true)) return;
  const p = P();
  const g = bySlice(dash.data(id).data);
  const share = byKey(dash.data(sid).data);
  const rows = (g.get(sliceOf(p)) ?? []).map((r) => ({ ...r, n: Number(r.headcount) }))
    .sort((a, b) => b.n - a.n).slice(0, 15);
  const base = new Map(p.year === FIRST ? [] : (g.get(sliceOf({ ...p, year: FIRST })) ?? []).map((r) => [r.category, Number(r.headcount)]));
  const max = d3.max(rows, (r) => Math.max(r.n, base.get(r.category) ?? 0)) || 1;
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
    const s = share.get(r.slice + '\n' + r.category);
    val.textContent = fmtN(r.n) + (s ? ' · ' + fmtP(s.share) : '');
    head.append(label, val);
    const bar = document.createElement('div');
    bar.className = 'ux-bar';
    bar.style.width = (r.n / max) * 100 + '%';
    bar.style.background = dash.colors[0];
    row.append(head, bar);
    const b = base.get(r.category);
    if (b) {
      const bb = document.createElement('div');
      bb.className = 'ux-bar-base';
      bb.style.width = (b / max) * 100 + '%';
      row.append(bb);
    }
    return row;
  }));
});

// Breakdown: share over time for the six largest groups.
dash.draw('mix', (el) => {
  const [id, sid] = el.dataset.source.split(' ');
  if (!gate(el, [id, sid], true)) return;
  const p = P();
  const pre = `${p.inst}|${p.level}|`;
  const g = bySlice(dash.data(id).data);
  const share = byKey(dash.data(sid).data);
  const years = [...g.keys()].filter((k) => k.startsWith(pre)).map((k) => k.slice(pre.length)).sort(d3.ascending);
  const top = (g.get(sliceOf(p)) ?? []).slice().sort((a, b) => Number(b.headcount) - Number(a.headcount)).slice(0, 6);
  const series = top.map((r, i) => ({
    name: r.category,
    color: dash.colors[i],
    pts: years.map((yr) => ({ year: yr, v: share.get(pre + yr + '\n' + r.category)?.share ?? 0 })),
  }));
  const W = Math.max(260, el.clientWidth), H = 220;
  const { svg, tip } = svgIn(el, W, H);
  const legend = document.createElement('div');
  legend.className = 'ux-legend';
  el.append(legend);
  if (!series.length || !years.length) return;
  const y = d3.scaleLinear([0, d3.max(series, (s) => d3.max(s.pts, (d) => d.v)) || 0.01], [H - 26, 10]).nice();
  const ticks = y.ticks(4);
  const tf = y.tickFormat(4, '%');
  const left = measure(svg, ticks.map(tf)) + 8;
  const x = d3.scalePoint(years, [left + 8, W - 8]);
  svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'ux-grid-line')
    .attr('x1', left).attr('x2', W - 2).attr('y1', y).attr('y2', y);
  svg.append('g').attr('class', 'ux-tick').selectAll('text').data(ticks).join('text')
    .attr('x', left - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(tf);
  yearAxis(svg, years, x, H, p.year);
  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.v));
  svg.append('g').selectAll('path').data(series).join('path')
    .attr('d', (s) => line(s.pts)).style('fill', 'none').style('stroke', (s) => s.color)
    .attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  if (x(p.year) != null) {
    svg.append('g').selectAll('circle').data(series).join('circle')
      .attr('cx', x(p.year)).attr('cy', (s) => y(s.pts.find((d) => d.year === p.year)?.v ?? 0)).attr('r', 3.5)
      .style('fill', (s) => s.color);
  }
  const rule = svg.append('line').attr('class', 'ux-rule').attr('y1', 10).attr('y2', H - 26).attr('opacity', 0);
  svg.append('rect').attr('x', left).attr('width', W - left).attr('y', 0).attr('height', H).style('fill', 'transparent')
    .on('mousemove', (e) => {
      const mx = d3.pointer(e, svg.node())[0];
      const i = d3.leastIndex(years, (yr) => Math.abs(x(yr) - mx));
      const yr = years[i];
      rule.attr('x1', x(yr)).attr('x2', x(yr)).attr('opacity', 1);
      showTip(el, tip, e, shortYear(yr), series.map((s) => ({ color: s.color, name: s.name, value: fmtP(s.pts[i].v) })));
    })
    .on('mouseleave', () => { tip.hidden = true; rule.attr('opacity', 0); });
  legend.replaceChildren(...series.map((s) => {
    const k = document.createElement('span');
    k.className = 'ux-key';
    k.title = s.name;
    const sw = document.createElement('i');
    sw.className = 'ux-sw';
    sw.style.background = s.color;
    const t = document.createElement('span');
    t.textContent = s.name;
    k.append(sw, t);
    return k;
  }));
});

// Breakdown: every group, searchable and sortable.
dash.draw('dim-rows', (tb) => {
  const table = tb.closest('table');
  const id = table.dataset.source;
  const sid = 'share_' + id;
  if (!gateRows(tb, [id, sid], 4)) return;
  const p = P();
  const share = byKey(dash.data(sid).data);
  const search = table.closest('.ux-dim')?.querySelector('.ux-search');
  const q = (search?.value ?? '').trim().toLowerCase();
  let list = (bySlice(dash.data(id).data).get(sliceOf(p)) ?? []).map((r) => {
    const s = share.get(r.slice + '\n' + r.category);
    return { slice: r.slice, category: r.category, headcount: Number(r.headcount), share: s?.share ?? null, change_base: s?.change_base ?? null };
  });
  if (q) list = list.filter((r) => r.category.toLowerCase().includes(q));
  sortRows(list, table);
  tb.replaceChildren(...list.map((r) => {
    const tr = document.createElement('tr');
    tr.dataset.key = encodeURIComponent(r.slice) + ',' + encodeURIComponent(r.category);
    tr.append(
      td(r.category),
      td(fmtN(r.headcount), 'ux-num'),
      td(r.share == null ? '—' : fmtP(r.share), 'ux-num'),
      td(r.change_base == null ? '—' : fmtD(r.change_base), signed(r.change_base)),
    );
    return tr;
  }));
});

const link = location.hash.slice(1);
if (link.startsWith('by-') && document.querySelector(`.ux-dim[data-dim="${link.slice(3)}"]`)) dash.setParams({ dim: link.slice(3) });
const named = document.getElementById(link);
if (named) named.scrollIntoView();
