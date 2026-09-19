/* =========================================================
   Indian Traffic Premier League (ITPL) — home page
   League table · form guide · derby centre · mobile heatmap.
   API URL + shared logic live in js/itpl.js.
   ========================================================= */
const S = { raw:null, wk:null, ht:null, mo:null, forms:{}, hist:{}, hist30:{}, mode:"live", derbyReady:false, pdReq:0 };
const $ = id => document.getElementById(id);
const cityById = id => S.raw.cities.find(c => c.id === id);

async function load() {
  S.raw = await ITPL.snapshot();
  try { renderTicker(); renderTable(); } catch (e) { console.error(e); }
  const [wk, ht] = await Promise.all([ITPL.weekly(S.raw), ITPL.heat(S.raw)]);
  S.wk = wk; S.ht = ht;
  $("tableNote").textContent = wk.live ? "Live from sheet" : "Demo pattern — connect backend";
  $("heatmapNote").textContent = ht.live ? "Live from sheet" : "Demo pattern";
  try { renderTable(); renderHeat(); initDerby(); } catch (e) { console.error(e); }
  await ITPL.pool(S.raw.cities, 4, async c => {          // one 7-day history per city → form guide
    const h = await ITPL.hist(c, "7d"); S.hist[c.id] = h; S.forms[c.id] = ITPL.form(h.pts);
  });
  try { renderTable(); renderDerby(); } catch (e) { console.error(e); }
}

function renderTicker() {
  const d = new Date(S.raw.generated_at), n = S.raw.national_average_index;
  $("lastUpdated").textContent = isNaN(d) ? "—" : d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
  $("nationalIndex").textContent = (n != null ? n.toFixed(2) : "—") + " min/km";
}

/* ---------- League table ---------- */
const MODES = {
  live:   { col:"Now",    note:"Ranked by this hour's minutes per km. The most gridlocked city tops the table." },
  season: { col:"7-day",  note:"Ranked by the average of the last 7 days: the bigger picture behind this hour." },
  month:  { col:"30-day", note:"Hall of Fame: ranked by the average of the last 30 days. The long-run gridlock dynasty." }
};
function renderTable() {
  if (!S.raw) return;
  const rows = ITPL.table(S.raw, S.wk, S.mode, S.mo && S.mo.m), n = rows.length;
  const livePos = {}, seasonPos = {};
  ITPL.table(S.raw, S.wk, "live").forEach(r => { livePos[r.c.id] = r.pos; });
  ITPL.table(S.raw, S.wk, "season").forEach(r => { seasonPos[r.c.id] = r.pos; });
  $("ltBody").innerHTML = rows.map(r => {
    const c = r.c, z = ITPL.zoneOf(r.pos, n);
    let mv = `<span class="lt-mv eq">–</span>`;
    if (S.wk && S.mode === "live") {                     // live position vs 7-day "season" position
      const d = seasonPos[c.id] - livePos[c.id];
      if (d > 0) mv = `<span class="lt-mv up" title="Up ${d} vs 7-day table">▲</span>`;
      else if (d < 0) mv = `<span class="lt-mv dn" title="Down ${-d} vs 7-day table">▼</span>`;
    }
    return `<a class="lt-row z-${z}" href="city/${c.id}/index.html" title="Open ${c.name} club report · ${ITPL.ZONE_LABEL[z]}">
      <span class="lt-pos">${r.pos === 1 ? "🏆" : r.pos}</span>${mv}${ITPL.crest(c)}
      <span class="lt-name"><b>${c.name}</b><small>${c.state}</small></span>
      <span class="lt-val" style="color:${ITPL.COL[ITPL.level(r.v).key]}">${r.v.toFixed(2)}</span>
      ${ITPL.badges(S.forms[c.id])}</a>`;
  }).join("");
  $("ltCol").textContent = MODES[S.mode].col;
  let note = MODES[S.mode].note;
  if (S.mode === "month") {
    if (!S.mo) note = "Loading the 30-day table…";
    else if (S.mo.days < 25) note += ` The sheet only holds ${S.mo.days} days of readings so far, so this is a ${S.mo.days}-day average until history grows.`;
  }
  $("modeNote").textContent = note;
}

/* ---------- Derby centre ---------- */
function statsFor(c) {
  const h = S.ht && S.ht.m[c.id], f = S.forms[c.id];
  const ok = h && h.every(v => v != null);
  return {
    now: c.index, wk: S.wk && S.wk.m[c.id],
    am: ok ? h[1] : null, pm: ok ? h[5] : null, worst: ok ? Math.max(...h) : null,
    kmh: Math.max(...c.legs.map(l => l.distance_km / (l.duration_min / 60))),
    pts: f && f.length ? ITPL.formPts(f) : null
  };
}
// [label, stat, higherWins, formatter]: in this league the MORE congested city wins
const DERBY_ROWS = [
  ["Right now (min/km)", "now", true, v => v.toFixed(2)], ["7-day average", "wk", true, v => v.toFixed(2)],
  ["Morning rush · 8–10 AM", "am", true, v => v.toFixed(2)], ["Evening rush · 6–8 PM", "pm", true, v => v.toFixed(2)],
  ["Worst window", "worst", true, v => v.toFixed(2)], ["Fastest corridor (km/h) · slower wins", "kmh", false, v => v.toFixed(0)],
  ["Form points (last 5)", "pts", true, v => v]
];

function initDerby() {
  if (S.derbyReady) return; S.derbyReady = true;
  const cs = S.raw.cities.filter(c => c.index != null);
  ["dA", "dB"].forEach(id => { $(id).innerHTML = cs.map(c => `<option value="${c.id}">${c.name}</option>`).join(""); $(id).addEventListener("change", () => renderDerby()); });
  const ids = cs.map(c => c.id), ds = ITPL.DERBIES.filter(d => ids.includes(d.a) && ids.includes(d.b));
  $("derbyChips").innerHTML = ds.map((d, i) => `<button class="chip" data-i="${i}">${cityById(d.a).name} v ${cityById(d.b).name}</button>`).join("");
  $("derbyChips").querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => { const d = ds[b.dataset.i]; $("dA").value = d.a; $("dB").value = d.b; renderDerby(d.name); }));
  const q = (new URLSearchParams(location.search).get("derby") || "").split(",");
  const d0 = (q.length === 2 && ids.includes(q[0]) && ids.includes(q[1])) ? { a:q[0], b:q[1] } : (ds[0] || { a:ids[0], b:ids[1] });
  $("dA").value = d0.a; $("dB").value = d0.b;
  renderDerby(ds.find(d => d.a === d0.a && d.b === d0.b)?.name);
  if (q.length === 2) setTimeout(() => $("derby").scrollIntoView({ behavior:"smooth" }), 300);
}

function renderDerby(title) {
  if (!S.derbyReady) return;
  let A = cityById($("dA").value), B = cityById($("dB").value);
  if (!A || !B) return;
  if (A.id === B.id) { $("derbyOut").innerHTML = `<div class="chart-loading">Pick two different cities for a derby.</div>`; return; }
  if (title === undefined) { const d = ITPL.DERBIES.find(x => (x.a === A.id && x.b === B.id) || (x.a === B.id && x.b === A.id)); title = d && d.name; }
  const sa = statsFor(A), sb = statsFor(B);
  let wa = 0, wb = 0;
  const rows = DERBY_ROWS.filter(r => sa[r[1]] != null && sb[r[1]] != null).map(([label, k, high, f]) => {
    const a = sa[k], b = sb[k], aw = a !== b && (high ? a > b : a < b), bw = a !== b && !aw;
    if (aw) wa++; if (bw) wb++;
    const tot = (a + b) || 1;
    return `<div class="st"><b class="${aw ? "w" : ""}">${f(a)}</b><span>${label}</span><b class="${bw ? "w" : ""}">${f(b)}</b>
      <div class="bar"><i class="${aw ? "w" : ""}" style="width:${(a / tot * 100).toFixed(1)}%"></i><i class="r ${bw ? "w" : ""}" style="width:${(b / tot * 100).toFixed(1)}%"></i></div></div>`;
  }).join("");
  const verdict = wa === wb ? "Honours even: both cities are equally hopeless." : `${wa > wb ? A.name : B.name} take the derby. More gridlock, more glory.`;
  const tw = wa > wb ? "a" : wb > wa ? "b" : "";

  // Head-to-head: each of the last 7 daily readings, lower index wins the day
  let h2h = "";
  const ha = S.hist[A.id], hb = S.hist[B.id];
  if (ha && hb) {
    const pa = ha.pts.slice(-7), pb = hb.pts.slice(-7), n = Math.min(pa.length, pb.length); let da = 0, db = 0;
    const pips = Array.from({ length:n }, (_, i) => {
      const x = pa[pa.length - n + i], y = pb[pb.length - n + i], aw = x.index > y.index, eq = x.index === y.index;
      if (!eq) aw ? da++ : db++;
      return `<span class="pip ${eq ? "" : aw ? "pa" : "pb"}" title="${ITPL.dayName(x.t)}: ${A.name} ${x.index.toFixed(2)} v ${y.index.toFixed(2)} ${B.name}">${ITPL.dayName(x.t).slice(0, 2)}</span>`;
    }).join("");
    h2h = `<div class="h2h"><div class="h2h-t">Head-to-head · last ${n} days <em>${ITPL.abbr(A)} ${da}–${db} ${ITPL.abbr(B)}</em></div><div class="pips">${pips}</div><div class="h2h-k">The busier day wins. Cyan = ${A.name}, pink = ${B.name}.</div></div>`;
  }

  // Daily-rhythm overlay (8 windows)
  let chart = "";
  const hA = S.ht && S.ht.m[A.id], hB = S.ht && S.ht.m[B.id];
  if (hA && hB && hA.every(v => v != null) && hB.every(v => v != null)) {
    chart = `<div class="h2h-t" style="margin-top:14px">Daily rhythm · min/km by time window</div><div class="chart-wrap">${ITPL.chart([{ vals:hA, color:"#04f5ff" }, { vals:hB, color:"#ff4d9d" }], ITPL.SHORT)}</div><div class="h2h-k">Windows left to right: ${ITPL.WIN.join(" · ")}.</div>`;
  }

  $("derbyOut").innerHTML = `
    ${title ? `<div class="derby-name">${title}</div>` : ""}
    <div class="score">
      <a href="city/${A.id}/index.html" class="side">${ITPL.crest(A)}<b>${A.name}${tw === "a" ? " 🏆" : ""}</b><i class="go">Club report ›</i></a>
      <div class="ft"><span>${wa}</span><i>–</i><span>${wb}</span><small>Full time</small></div>
      <a href="city/${B.id}/index.html" class="side">${ITPL.crest(B)}<b>${B.name}${tw === "b" ? " 🏆" : ""}</b><i class="go">Club report ›</i></a>
    </div>
    <div class="verdict">${verdict}</div>
    ${rows}${h2h}${chart}
    <div class="pd-wrap" id="derbyPast"><div class="chart-loading">Loading past derbies…</div></div>`;
  loadPastDerbies(A, B);
}

/* Past derbies: week -1/-2/-3 results between the same two cities, pulled from
   each city's 30-day history. Only stats-free scorelines are shown here — the
   full stat breakdown above is for the current fixture only. Weeks with no
   shared data yet (30-day history is still building) are simply left out. */
async function getHist30(c) {
  if (!S.hist30[c.id]) S.hist30[c.id] = ITPL.hist30(c);
  return S.hist30[c.id];
}
async function loadPastDerbies(A, B) {
  const token = ++S.pdReq;
  if (!$("derbyPast")) return;
  const [ha, hb] = await Promise.all([getHist30(A), getHist30(B)]);
  if (token !== S.pdReq) return;                      // a newer derby selection superseded this fetch
  const el = $("derbyPast"); if (!el) return;
  const weeks = [1, 2, 3]
    .map(w => { const r = ITPL.h2hWindow(ha.pts, hb.pts, w * 7, w * 7 + 6); return r && { ...r, w }; })
    .filter(Boolean);
  if (!weeks.length) {
    el.innerHTML = `<div class="pd-t">Past derbies</div><div class="chart-loading">History for week -1 to -3 builds in as the sheet accumulates more than 7 days of readings.</div>`;
    return;
  }
  el.innerHTML = `<div class="pd-t">Past derbies</div>` + weeks.map(r => {
    const aw = r.wa > r.wb, bw = r.wb > r.wa;
    const verdict = r.wa === r.wb ? "Honours even that week." : `${aw ? A.name : B.name} took that derby.`;
    return `<div class="pd-week">
      <div class="derby-name">Week -${r.w} · ${ITPL.dateName(r.from)}–${ITPL.dateName(r.to)}</div>
      <div class="score">
        <div class="side">${ITPL.crest(A)}<b>${A.name}${aw ? " 🏆" : ""}</b></div>
        <div class="ft"><span>${r.wa}</span><i>–</i><span>${r.wb}</span><small>Full time</small></div>
        <div class="side">${ITPL.crest(B)}<b>${B.name}${bw ? " 🏆" : ""}</b></div>
      </div>
      <div class="verdict">${verdict}</div>
    </div>`;
  }).join("");
}

/* ---------- Heatmap: stacked rows, never scrolls sideways ---------- */
function renderHeat() {
  const el = $("heatmapView"), m = S.ht.m;
  const cities = ITPL.table(S.raw, null, "live").map(r => r.c).filter(c => m[c.id]);
  if (!cities.length) { el.innerHTML = `<div class="chart-loading">No data yet.</div>`; return; }
  const legend = `<div class="hm-legend"><div class="hm-parts">${ITPL.PARTS.map(p => `<span><em>${p.e}</em>${p.n}<small>${p.r}</small></span>`).join("")}</div>
    <div class="hm-cells hm-ranges">${ITPL.RANGE.map((r, i) => `<i>${r}<small>${ITPL.AMPM[i]}</small></i>`).join("")}</div></div>`;
  el.innerHTML = legend +
    cities.map(c => {
      const v = m[c.id], nums = v.filter(x => x != null), mx = nums.length ? Math.max(...nums) : null;
      const cells = v.map((x, i) => x == null ? `<i class="hc hc-none">–</i>` :
        `<i class="hc hc-${ITPL.level(x).key}${x === mx ? " hc-peak" : ""}" title="${c.name}, ${ITPL.WIN[i]}: ${x.toFixed(2)} min/km">${x.toFixed(1)}</i>`).join("");
      return `<a class="hm-row" href="city/${c.id}/index.html"><div class="hm-name"><b>${c.name}</b>${mx != null ? `<small>worst ${ITPL.WIN[v.indexOf(mx)]}</small>` : ""}</div><div class="hm-cells">${cells}</div></a>`;
    }).join("") + legend;
}

/* ---------- Nav, deep links, feedback ---------- */
function switchView(name) {
  document.querySelectorAll(".bottom-nav button").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  const el = $("view-" + name); if (el) el.classList.add("active");
}
function wire() {
  document.querySelectorAll(".bottom-nav button").forEach(b => b.addEventListener("click", () => { switchView(b.dataset.view); window.scrollTo({ top:0, behavior:"smooth" }); }));
  document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", async () => {
    S.mode = t.dataset.mode; document.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x === t)); renderTable();
    if (S.mode === "month" && !S.mo && S.raw) { S.mo = await ITPL.month(S.raw); renderTable(); }   // 30-day data is fetched only when asked for
  }));
  $("sendFeedback").addEventListener("click", () => {
    const s = $("fbSubject").value || "Feedback: Indian Traffic Premier League (ITPL)", b = $("fbMessage").value || "";
    window.location.href = `mailto:suvadipchakraborty@gmail.com?subject=${encodeURIComponent(s)}&body=${encodeURIComponent(b)}`;
  });
  const hash = (location.hash || "").replace("#", "");
  if (hash === "methodology" || hash === "contact") switchView(hash);
  const open = new URLSearchParams(location.search).get("open");   // legacy deep link → city page
  if (open) location.replace(`city/${encodeURIComponent(open)}/index.html`);
}

document.addEventListener("DOMContentLoaded", () => {
  try { wire(); } catch (e) { console.error("wire failed:", e); }
  load();
  setInterval(load, 60 * 60 * 1000);
});
