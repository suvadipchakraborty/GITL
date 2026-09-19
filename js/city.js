/* =========================================================
   ITPL city pages (city/<slug>/index.html)
   Live position + form, 24h/7d trends, daily rhythm, tactics
   board, commute calculator, match report and next fixtures.
   Shared logic + API URL live in js/itpl.js.
   ========================================================= */
const $ = id => document.getElementById(id);
const COL = ITPL.COL;

(async function () {
  const slug = window.CITY_SLUG;
  let raw;
  try { raw = await ITPL.snapshot(); } catch (e) { $("cLive").innerHTML = `<div class="chart-loading">Couldn't load live data — try the full dashboard.</div>`; return; }
  const city = raw.cities.find(c => c.id === slug);
  if (!city || city.index == null) { $("cLive").innerHTML = `<div class="chart-loading">This city isn't reporting live data right now — check back soon.</div>`; return; }

  const lvl = ITPL.level(city.index), n = raw.cities.filter(c => c.index != null).length;
  const live = ITPL.table(raw, null, "live"), me = live.find(r => r.c.id === slug), zone = ITPL.zoneOf(me.pos, n);
  const d = new Date(raw.generated_at), time = isNaN(d) ? "" : d.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });

  $("cLive").innerHTML = `
    <div class="cl-top">
      <div><div class="cl-big" style="color:${COL[lvl.key]}">${city.index.toFixed(2)}<small>min/km</small></div>
        <span class="level-tag" style="background:${COL[lvl.key]}22;color:${COL[lvl.key]}">${lvl.label}</span></div>
      <div class="posbox z-${zone}"><b>${ITPL.ord(me.pos)}</b><small>of ${n}</small><em>${ITPL.ZONE_LABEL[zone]}</em></div>
    </div>
    <div class="cl-meta">Form <span id="cForm">${ITPL.badges(null)}</span> <span id="cMove"></span></div>
    <div class="ranking-sub" style="margin:10px 0 0">${time ? "Last updated " + time : "Recently updated"} · refreshes hourly</div>`;

  renderTactics(city);
  renderCommute(city, live, null, null);

  // Trends: 24h + 7d
  const [h24, h7] = await Promise.all([ITPL.hist(city, "24h"), ITPL.hist(city, "7d")]);
  const note = h => h.live ? "Live from sheet" : "Demo pattern";
  $("t24Note").textContent = note(h24); $("t7Note").textContent = note(h7);
  $("chart24").innerHTML = ITPL.chart([{ vals:h24.pts.map(p => p.index), color:"#00ff85" }], h24.pts.map(p => ITPL.hourName(p.t)));
  $("chart7").innerHTML = ITPL.chart([{ vals:h7.pts.map(p => p.index), color:"#04f5ff" }], h7.pts.map(p => ITPL.dayName(p.t)));

  // Last 30 days (non-blocking; sits on a fixed 30-day axis and fills in as history grows)
  ITPL.hist30(city).then(h30 => {
    $("t30Note").textContent = !h30.live ? "Demo pattern" : h30.days >= 27 ? "Live from sheet" : `Live · ${h30.days} of 30 days so far`;
    $("chart30").innerHTML = ITPL.chart([{ vals:h30.pts.map(p => p.index), color:"#ff4d9d" }], h30.pts.map(p => ITPL.dateName(p.t)), 30);
  }).catch(() => { $("chart30").innerHTML = `<div class="chart-loading">30-day trend unavailable right now.</div>`; });

  const f = ITPL.form(h7.pts);
  $("cForm").innerHTML = ITPL.badges(f) + `<span class="cl-pts">${ITPL.formPts(f)} pts</span>`;

  // 7-day stats
  const v = h7.pts.map(p => p.index), avg = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - avg) ** 2, 0) / v.length), cv = sd / avg;
  const best = h7.pts[v.indexOf(Math.min(...v))], worst = h7.pts[v.indexOf(Math.max(...v))];
  const steady = cv < .05 ? "Steady" : cv < .1 ? "Some swings" : "Volatile";
  $("cStats").innerHTML = [
    ["7-day average", avg.toFixed(2), "min/km"], ["Calmest day", ITPL.dayName(best.t), Math.min(...v).toFixed(2)],
    ["Busiest day", ITPL.dayName(worst.t), Math.max(...v).toFixed(2)], ["Consistency", steady, "±" + (cv * 100).toFixed(0) + "%"]
  ].map(s => `<div class="stat"><small>${s[0]}</small><b>${s[1]}</b><em>${s[2]}</em></div>`).join("");

  // Season table position + heatmap-derived rhythm
  const [wk, ht] = await Promise.all([ITPL.weekly(raw), ITPL.heat(raw)]);
  const season = ITPL.table(raw, wk, "season").find(r => r.c.id === slug);
  const mv = season.pos - me.pos;
  $("cMove").innerHTML = wk ? (mv > 0 ? `<span class="lt-mv up">▲ ${mv} vs 7-day table</span>` : mv < 0 ? `<span class="lt-mv dn">▼ ${-mv} vs 7-day table</span>` : `<span class="lt-mv eq">– same as 7-day table (${ITPL.ord(season.pos)})</span>`) : "";

  const hv = ht.m[slug], hOk = hv && hv.every(x => x != null);
  let peak = null, calm = null;
  if (hOk) {
    const mx = Math.max(...hv), mn = Math.min(...hv); peak = ITPL.WIN[hv.indexOf(mx)]; calm = ITPL.WIN[hv.indexOf(mn)];
    $("hmNote").textContent = ht.live ? "Live from sheet" : "Demo pattern";
    $("cRhythm").innerHTML = `<div class="rbars">${hv.map((x, i) => `<div class="rb"><b>${x.toFixed(1)}</b><div class="rb-t"><i style="height:${Math.max(6, x / mx * 100)}%;background:${COL[ITPL.level(x).key]}"></i></div><small>${ITPL.RANGE[i]}<br>${ITPL.AMPM[i]}</small></div>`).join("")}</div>
      <div class="rhythm-tips"><span>🟢 Calmest window <b>${calm}</b></span><span>🔴 Peak gridlock <b>${peak}</b></span></div>`;
  } else $("cRhythm").innerHTML = `<div class="chart-loading">Rhythm needs a few more hourly readings.</div>`;
  renderCommute(city, live, hOk ? hv : null, wk.m[slug]);

  // Match report
  const above = live[me.pos - 2], below = live[me.pos];   // table is sorted most-gridlocked first
  const zTxt = zone === "up" ? " — in the champions zone" : zone === "down" ? " — in the relegation zone (suspiciously smooth for India)" : "";
  const say = [me.pos === 1 ? `${city.name} are the reigning gridlock champions at ${city.index.toFixed(2)} min/km.` : `${city.name} sit ${ITPL.ord(me.pos)} of ${n} at ${city.index.toFixed(2)} min/km${zTxt}.`];
  if (above) say.push(`${above.c.name} lead by ${(above.v - city.index).toFixed(2)} min/km.`);
  if (below) say.push(`${below.c.name} trail by ${(city.index - below.v).toFixed(2)}.`);
  say.push(`Form: ${f.join("") || "n/a"} (${ITPL.formPts(f)} pts from the last ${f.length}).`);
  if (peak) say.push(`Peak gridlock hits at ${peak}; the calmest spell is ${calm}.`);
  $("cReport").textContent = say.join(" ");

  // Next fixtures
  const rivals = [];
  if (above) rivals.push({ c:above.c, tag:"Next up the table" });
  if (below) rivals.push({ c:below.c, tag:"Chasing you" });
  const dd = ITPL.DERBIES.find(x => x.a === slug || x.b === slug);
  if (dd) { const rid = dd.a === slug ? dd.b : dd.a, rc = raw.cities.find(c => c.id === rid); if (rc && !rivals.some(r => r.c.id === rid)) rivals.push({ c:rc, tag:dd.name }); else if (rc) rivals.find(r => r.c.id === rid).tag = dd.name; }
  $("cRivals").innerHTML = rivals.map(r => `<a class="fixture" href="../../index.html?derby=${slug},${r.c.id}#derby"><small>${r.tag}</small><span>${city.name} <em>v</em> ${r.c.name}</span><b>Play derby →</b></a>`).join("");
})();

/* ---------- Tactics board: four corridors across a pitch ---------- */
function renderTactics(city) {
  const P = { N:[150,16], S:[150,194], E:[284,105], W:[16,105], NE:[246,34], SW:[54,176], NW:[54,34], SE:[246,176] }, C = [150, 105];
  const lines = city.legs.map(l => {
    const [a, b] = l.pair.split("-"), pa = P[a], pb = P[b]; if (!pa || !pb) return "";
    const col = COL[ITPL.level(l.duration_min / l.distance_km).key], kmh = Math.round(l.distance_km / (l.duration_min / 60));
    return `<line x1="${pa[0]}" y1="${pa[1]}" x2="${pb[0]}" y2="${pb[1]}" stroke="${col}" stroke-width="3" stroke-linecap="round" opacity=".92"/>
      <text class="pt-kmh" x="${pa[0] + (C[0] - pa[0]) * .3}" y="${pa[1] + (C[1] - pa[1]) * .3 - 3}" text-anchor="middle">${kmh}</text>`;
  }).join("");
  const dots = Object.entries(P).map(([k, p]) => `<g><title>${k}: ${city.borders[k] || ""}</title><circle cx="${p[0]}" cy="${p[1]}" r="11" fill="#2b0030" stroke="#fff" stroke-width="1.5"/><text class="pt-lbl" x="${p[0]}" y="${p[1] + 3}" text-anchor="middle">${k}</text></g>`).join("");
  $("cPitch").innerHTML = `<svg class="pitch" viewBox="0 0 300 210" role="img" aria-label="Corridor tactics board">
    <rect x="2" y="2" width="296" height="206" rx="10" class="turf"/><rect x="2" y="2" width="296" height="206" rx="10" fill="none" stroke="#fff" stroke-opacity=".5"/>
    <line x1="150" y1="2" x2="150" y2="208" stroke="#fff" stroke-opacity=".25"/><circle cx="150" cy="105" r="28" fill="none" stroke="#fff" stroke-opacity=".3"/>
    ${lines}<circle cx="150" cy="105" r="4" fill="#fff"/>${dots}</svg>
    <div class="pitch-key">Line colour = congestion on that corridor · number = avg km/h</div>`;
  const spd = city.legs.map(l => l.duration_min / l.distance_km), hard = spd.indexOf(Math.max(...spd)), easy = spd.indexOf(Math.min(...spd));
  $("cLegs").innerHTML = city.legs.map((l, i) => {
    const mk = (l.duration_min / l.distance_km);
    return `<div class="leg-row"><div><div class="leg-pair">${l.pair}${i === hard ? ` <span class="tag-r">top scorer</span>` : i === easy ? ` <span class="tag-g">benchwarmer</span>` : ""}</div><div class="leg-route">${l.from} → ${l.to}</div></div>
      <div class="leg-nums" style="color:${COL[ITPL.level(mk).key]}">${mk.toFixed(2)} min/km<div class="kmh">${l.distance_km.toFixed(1)} km · ${l.duration_min} min · ≈${Math.round(l.distance_km / (l.duration_min / 60))} km/h</div></div></div>`;
  }).join("");
}

/* ---------- Commute calculator ---------- */
let calcBound = false, calcArgs = [];
function renderCommute(city, live, hv, wkAvg) {
  calcArgs = [city, live, hv, wkAvg];
  const km = +($("calcKm").value || 12), idx = wkAvg != null ? wkAvg : city.index, calmest = live[live.length - 1];
  const one = v => Math.round(v * km);
  const yrH = idx * km * 2 * 250 / 60, extra = Math.max(0, (idx - calmest.v) * km * 2 * 250 / 60);
  $("calcKmVal").textContent = km + " km";
  $("calcOut").innerHTML = `
    <div class="calc-grid">
      <div><small>Right now</small><b>${one(city.index)} min</b></div>
      <div><small>${hv ? "Calmest window" : "Typical"}</small><b>${one(hv ? Math.min(...hv) : idx)} min</b></div>
      <div><small>${hv ? "Peak window" : "Right now ×"}</small><b>${one(hv ? Math.max(...hv) : city.index)} min</b></div>
    </div>
    <p class="calc-line">Each way. A daily round trip (250 working days) costs you <b>${Math.round(yrH)} hours a year</b> in ${city.name} traffic — about <b>${(yrH / 24).toFixed(1)} full days</b> of your life.</p>
    ${extra >= 1 && calmest.c.id !== city.id ? `<p class="calc-line">The same commute in ${calmest.c.name} (the league's smoothest) would give you <b>${Math.round(extra)} hours</b> back — that's ${(extra / 8).toFixed(0)} working days.</p>` : ""}`;
  if (!calcBound) { calcBound = true; $("calcKm").addEventListener("input", () => renderCommute(...calcArgs)); }
}
