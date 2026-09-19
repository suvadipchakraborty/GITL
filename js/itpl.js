/* =========================================================
   ITPL shared library — used by the home page (app.js) and every
   city page (city.js). One place for the API URL, congestion bands,
   caching, league-table maths, form guide and chart drawing.
   The Apps Script API contract is unchanged (Code.gs untouched).
   ========================================================= */
const ITPL = (() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbyBE59FeMJE7JQyHMhD0113_G-r24XbkULodLX7DCaiup9yYP4CfKhaTpr_KdBj2MUe/exec";
  const BASE = window.ITPL_BASE || "";           // "" on home, "../../" on city pages
  const FALLBACK_URL = BASE + "data/sample-cities.json";
  const BUCKETS = ["6-8 AM","8-10 AM","10-12 PM","12-4 PM","4-6 PM","6-8 PM","8-10 PM","10-12 AM"]; // must match Code.gs
  const SHORT = ["6–8a","8–10a","10a–12","12–4p","4–6p","6–8p","8–10p","10p–12"];         // compact chart axis labels
  const WIN   = ["6–8 AM","8–10 AM","10 AM–12 PM","12–4 PM","4–6 PM","6–8 PM","8–10 PM","10 PM–12 AM"]; // full, unambiguous window names
  const RANGE = ["6–8","8–10","10–12","12–4","4–6","6–8","8–10","10–12"];
  const AMPM  = ["AM","AM","AM","PM","PM","PM","PM","PM"];
  const PARTS = [{ e:"🌅", n:"Morning", r:"6–10 AM" }, { e:"☀️", n:"Midday", r:"10 AM–4 PM" }, { e:"🌆", n:"Evening", r:"4–8 PM" }, { e:"🌙", n:"Night", r:"8 PM–12" }];
  const COL = { free:"#00ff85", moderate:"#ffd23f", heavy:"#ff6b6b", severe:"#ff2e63" };
  const ABBR = { "new-delhi":"NDL", mumbai:"MUM", bengaluru:"BLR", chennai:"CHE", kolkata:"KOL", hyderabad:"HYD", pune:"PUN", ahmedabad:"AMD", jaipur:"JAI", lucknow:"LKO" };
  const DERBIES = [
    { a:"bengaluru", b:"hyderabad", name:"The Tech Derby" },
    { a:"mumbai",    b:"new-delhi", name:"The Capital Clash" },
    { a:"mumbai",    b:"pune",      name:"The Maharashtra Derby" },
    { a:"chennai",   b:"bengaluru", name:"The Southern Derby" },
    { a:"kolkata",   b:"chennai",   name:"The Bay Derby" },
    { a:"jaipur",    b:"lucknow",   name:"The Heartland Derby" }
  ];
  const HM = [.55,.5,.45,.42,.45,.55,.75,1.05,1.35,1.45,1.25,1.1,1.05,1.1,1.05,1.1,1.2,1.4,1.5,1.45,1.2,.95,.75,.6];
  const WD = { 0:.82, 1:1, 2:1, 3:1, 4:1, 5:1.02, 6:.9 };
  const BR = [[6,7],[8,9],[10,11],[12,15],[16,17],[18,19],[20,21],[22,23]];

  const level = v => v < 2.5 ? { key:"free", label:"Free flow" } : v < 4 ? { key:"moderate", label:"Moderate" } : v < 6 ? { key:"heavy", label:"Heavy" } : { key:"severe", label:"Severe" };
  const r2 = n => Math.round(n * 100) / 100;
  const ord = n => { const s = ["th","st","nd","rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  const abbr = c => ABBR[c.id] || c.name.slice(0, 3).toUpperCase();
  const dayName = t => new Date(t).toLocaleDateString("en-IN", { weekday:"short" });
  const hourName = t => new Date(t).toLocaleTimeString("en-IN", { hour:"numeric", hour12:true }).replace(" ", "").toLowerCase();
  function noise(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return () => { h = (h * 1103515245 + 12345) & 0x7fffffff; return (h % 1000) / 1000; }; }

  /* ---- cache + fetch (localStorage, always try/catch) ---- */
  const store = {
    get(k, ttl) { try { const o = JSON.parse(localStorage.getItem("itpl:" + k)); if (o && Date.now() - o.t < ttl) return o.v; } catch (e) {} return null; },
    set(k, v) { try { localStorage.setItem("itpl:" + k, JSON.stringify({ t: Date.now(), v })); } catch (e) {} }
  };
  async function api(qs, ttl) {
    if (!API_URL) return null;
    const k = qs || "snapshot", c = ttl && store.get(k, ttl);
    if (c) return c;
    try {
      const r = await fetch(API_URL + (qs ? "?" + qs : ""), { cache: "no-store" });
      if (!r.ok) throw new Error("bad response");
      const j = await r.json(); store.set(k, j); return j;
    } catch (e) { console.warn("API call failed:", qs || "snapshot", e); return null; }
  }
  async function pool(items, n, fn) { const q = items.slice(); await Promise.all(Array.from({ length:n }, async () => { while (q.length) await fn(q.shift()); })); }

  /* ---- data ---- */
  async function snapshot() {
    const j = await api("", 5 * 60 * 1000);
    if (j && j.cities && j.cities.length) return j;
    const d = await (await fetch(FALLBACK_URL)).json(); d._demo = true; return d;
  }
  async function weekly(raw) {
    const j = await api("weekly_ranking=1", 30 * 60 * 1000), m = {};
    if (j && j.cities && j.cities.length) { j.cities.forEach(c => { if (c.avg_index != null) m[c.id] = c.avg_index; }); return { m, live:true }; }
    raw.cities.forEach(c => { if (c.index != null) m[c.id] = r2(c.index * (.94 + noise(c.id + "-weekly")() * .12)); });
    return { m, live:false };
  }
  async function heat(raw) {
    const j = await api("heatmap=1", 30 * 60 * 1000), m = {};
    if (j && j.cities && j.cities.length) { j.cities.forEach(c => { m[c.id] = c.values; }); return { m, live:true }; }
    raw.cities.forEach(c => {
      if (c.index == null) return;
      const rnd = noise(c.id + "-heatmap"), base = c.index / HM[new Date().getHours()];
      m[c.id] = BR.map(([a, b]) => { let s = 0, n = 0; for (let h = a; h <= b; h++) { s += HM[h]; n++; } return r2(base * (s / n) * (.94 + rnd() * .12)); });
    });
    return { m, live:false };
  }
  async function hist(city, range) {
    const j = await api(`history=${encodeURIComponent(city.id)}&range=${range}`, range === "24h" ? 15 * 60 * 1000 : 30 * 60 * 1000);
    if (j && j.points && j.points.length > 1) return { pts:j.points, live:true };
    const rnd = noise(city.id + "-" + range), now = new Date(), pts = [];
    if (range === "24h") {
      const base = city.index / HM[now.getHours()];
      for (let i = 23; i >= 0; i--) { const t = new Date(now - i * 36e5); pts.push({ t:t.toISOString(), index:r2(base * HM[t.getHours()] * (.92 + rnd() * .16)) }); }
    } else {
      const base = city.index / HM[23];
      for (let i = 6; i >= 0; i--) { const d = new Date(now - i * 864e5); d.setHours(23, 0, 0, 0); pts.push({ t:d.toISOString(), index:r2(base * WD[d.getDay()] * (.9 + rnd() * .2) * HM[23]) }); }
    }
    return { pts, live:false };
  }

  /* Month view: tries range=30d; if the backend only keeps ~8 days (Code.gs default) it uses the 7-day daily points and reports how many days it really has. */
  async function month(raw) {
    const m = {}; let days = 0, live = true;
    await pool(raw.cities.filter(c => c.index != null), 4, async c => {
      const j = await api(`history=${encodeURIComponent(c.id)}&range=30d`, 30 * 60 * 1000);
      const span = a => { const t = (a || []).map(p => new Date(p.t).getTime()).filter(x => !isNaN(x)); return t.length ? (Math.max(...t) - Math.min(...t)) / 864e5 : 0; };
      let pts = j && j.points && span(j.points) >= 8 ? j.points : null;   // ignore backends that don't really return >8 days
      if (!pts) { const h = await hist(c, "7d"); pts = h.pts; if (!h.live) live = false; }
      m[c.id] = r2(pts.reduce((s, p) => s + p.index, 0) / pts.length);
      const t = pts.map(p => new Date(p.t).getTime()).filter(x => !isNaN(x));
      days = Math.max(days, t.length ? Math.round((Math.max(...t) - Math.min(...t)) / 864e5) + 1 : pts.length);
    });
    return { m, days, live };
  }

  /* ---- league maths ---- */
  function table(raw, wk, mode, mo) {                   // MOST congested first: gridlock wins the league
    const src = mode === "season" ? (wk && wk.m) : mode === "month" ? mo : null;
    const rows = raw.cities.filter(c => c.index != null).map(c => ({ c, v: src && src[c.id] != null ? src[c.id] : c.index }));
    rows.sort((a, b) => b.v - a.v); rows.forEach((r, i) => { r.pos = i + 1; }); return rows;
  }
  const zones = n => ({ up: Math.max(1, Math.round(n * .2)), down: Math.max(1, Math.round(n * .3)) });
  const zoneOf = (pos, n) => { const z = zones(n); return pos <= z.up ? "up" : pos > n - z.down ? "down" : "mid"; };
  const ZONE_LABEL = { up:"Champions zone", down:"Relegation zone", mid:"Mid-table" };

  /* Form guide: each day vs the day before. W = busier (index rose >3%: gridlock gains), L = calmer (fell >3%), D = within ±3%. */
  function form(pts) {
    const v = pts.slice().sort((a, b) => new Date(a.t) - new Date(b.t)).map(p => p.index), out = [];
    for (let i = 1; i < v.length; i++) { const d = (v[i] - v[i - 1]) / v[i - 1]; out.push(d > .03 ? "W" : d < -.03 ? "L" : "D"); }
    return out.slice(-5);
  }
  const formPts = f => f.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0);
  const TIP = { W:"Win: busier than the day before (gridlock gains)", D:"Draw: within 3% of the day before", L:"Loss: calmer than the day before" };
  const badges = f => f && f.length ? `<span class="form">${f.map(r => `<i class="fb fb-${r}" title="${TIP[r]}">${r}</i>`).join("")}</span>` : `<span class="form form-wait">···</span>`;
  const crest = c => `<span class="crest" style="--c:${COL[level(c.index).key]}">${abbr(c)}</span>`;

  /* ---- charts (inline SVG, fixed viewBox so they scale to any phone width) ---- */
  function chart(series, xl) {
    const W = 300, H = 130, L = 26, R = 8, T = 12, B = 18, all = series.flatMap(s => s.vals), mn = Math.min(...all), mx = Math.max(...all), rg = (mx - mn) || 1, n = xl.length;
    const y = v => T + (1 - (v - mn) / rg) * (H - T - B), x = i => L + (n > 1 ? i / (n - 1) : 0) * (W - L - R);
    const grid = [.25, .5, .75].map(f => `<line class="gl" x1="${L}" x2="${W - R}" y1="${T + f * (H - T - B)}" y2="${T + f * (H - T - B)}"/>`).join("");
    const body = series.map(s => {
      const p = s.vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
      return (series.length === 1 ? `<polygon points="${L},${H - B} ${p} ${x(n - 1)},${H - B}" fill="${s.color}" opacity=".16"/>` : "") +
        `<polyline points="${p}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
        s.vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4" fill="#2b0030" stroke="${s.color}" stroke-width="1.5"><title>${xl[i]}: ${v.toFixed(2)} min/km</title></circle>`).join("");
    }).join("");
    const idx = n > 8 ? [0, Math.floor((n - 1) / 2), n - 1] : xl.map((_, i) => i);
    const lab = idx.map(i => `<text class="al" x="${x(i)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${xl[i]}</text>`).join("");
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Traffic index chart">${grid}<text class="al" x="${L - 3}" y="${y(mx) + 3}" text-anchor="end">${mx.toFixed(1)}</text><text class="al" x="${L - 3}" y="${y(mn) + 3}" text-anchor="end">${mn.toFixed(1)}</text>${body}${lab}</svg>`;
  }

  return { API_URL, BASE, BUCKETS, SHORT, WIN, RANGE, AMPM, PARTS, month, COL, DERBIES, level, r2, ord, abbr, dayName, hourName, snapshot, weekly, heat, hist, pool, table, zones, zoneOf, ZONE_LABEL, form, formPts, badges, crest, chart };
})();
