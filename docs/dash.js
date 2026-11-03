// A small stand-in for the Claude dashboard runtime, so the same page code runs as a static site.
// It covers what page.js uses: dash.data, calc, draw, onData, params, setParams, resetParams, setLink, colors.
(function () {
  const SOURCES = window.DASH_SOURCES; // dataset id -> CSV path
  const DEFAULTS = Object.freeze({ ...window.DASH_PARAMS });
  const store = new Map(); // id -> {status, data, columns}
  const calcs = new Map(); // id -> {inputs, fn}
  const draws = new Map(); // name -> fn
  const watchers = [];
  let params = { ...DEFAULTS };

  // Filters live in the URL query, so a view can be shared by link.
  const q = new URLSearchParams(location.search);
  for (const k of Object.keys(DEFAULTS)) if (q.has(k)) params[k] = q.get(k);
  const writeQuery = () => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== DEFAULTS[k]) u.set(k, v);
    const s = u.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
  };

  const empty = (status) => ({ status, data: [], columns: [], message: '', refreshing: false, meta: [] });
  function load(id) {
    if (store.has(id)) return store.get(id);
    if (calcs.has(id)) {
      const c = calcs.get(id);
      const inputs = c.inputs.map(load);
      const failed = inputs.find((d) => d.status !== 'ok' && d.status !== 'loading');
      if (failed) return empty(failed.status);
      if (inputs.some((d) => d.status !== 'ok')) return empty('loading');
      try {
        const data = c.fn(...inputs.map((d) => d.data));
        const res = { ...empty('ok'), data, columns: data.length ? Object.keys(data[0]) : [] };
        store.set(id, res);
        return res;
      } catch (e) {
        console.error('calc ' + id, e);
        const res = { ...empty('error'), message: String(e) };
        store.set(id, res);
        return res;
      }
    }
    if (!SOURCES[id]) return empty('missing');
    const res = empty('loading');
    store.set(id, res);
    d3.csv(SOURCES[id]).then((rows) => {
      store.set(id, { ...empty('ok'), data: rows, columns: rows.columns });
      schedule();
    }, (e) => {
      console.error('load ' + id, e);
      store.set(id, { ...empty('error'), message: String(e) });
      schedule();
    });
    return res;
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }
  function runDraw(name) {
    const fn = draws.get(name);
    if (!fn) return;
    document.querySelectorAll(`[data-draw="${CSS.escape(name)}"]`).forEach((el) => {
      if (el.closest('[hidden]')) return;
      try { fn(el); } catch (e) { console.error('draw ' + name, e); }
    });
  }
  function render() {
    for (const fn of watchers) {
      try { fn(); } catch (e) { console.error('onData', e); }
    }
    for (const name of draws.keys()) runDraw(name);
  }

  window.dash = {
    data: load,
    calc: (id, def) => { calcs.set(id, def); },
    draw: (name, fn) => {
      if (typeof fn === 'function') { draws.set(name, fn); schedule(); } else runDraw(name);
    },
    onData: (fn) => { watchers.push(fn); fn(); },
    params: () => ({ ...params }),
    setParams: (p) => { params = { ...params, ...p }; writeQuery(); schedule(); },
    resetParams: () => { params = { ...DEFAULTS }; writeQuery(); schedule(); },
    setLink: (name) => { history.replaceState(null, '', location.pathname + location.search + '#' + name); },
    refresh: () => {},
    colors: Array.from({ length: 8 }, (_, i) => `var(--series-${i})`),
  };

  // Redraw when the width changes.
  let lastW = 0;
  new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width);
    if (w !== lastW) { lastW = w; schedule(); }
  }).observe(document.documentElement);
})();
