// PORTED by scripts/port-legacy.mjs from autopulse-connect-hub/public/assets/charts.js — edit the port script, not this file.
// Small SVG charts for the dashboard (no library): stacked bars and lines over days, horizontal bars, a day × hour
// heatmap and a funnel. Every chart has a hover tooltip, a legend when it has several series, and a "Table" view
// with the same numbers. Colours come from CSS (--s1…--s8 categorical, --q1…--q7 sequential), set for dark and
// light themes in styles.css; marks get classes, never inline colours (the page's security policy).
const NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  return el;
}
function htmlEl(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const fmtNum = (n) => Number(n || 0).toLocaleString();
const shortDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const longDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** A round top for the y axis and 3–4 gridlines. */
function niceMax(max) {
  if (max <= 4) return { top: Math.max(max, 1), step: 1 };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { top: Math.ceil(max / step) * step, step };
}

/** The frame every chart sits in: title, note, legend, chart / table toggle. */
function frame(host, { title, note = "", legend = [], table }) {
  const tip = htmlEl("div", { class: "ch-tip", role: "status", hidden: true });
  const plot = htmlEl("div", { class: "ch-plot" }, tip);
  const tableBox = htmlEl("div", { class: "ch-table table-wrap", hidden: true });
  const toggle = htmlEl("button", { type: "button", class: "btn btn-sm ch-toggle", "aria-pressed": "false", text: "Table" });
  toggle.addEventListener("click", () => {
    const show = tableBox.hidden;
    tableBox.hidden = !show;
    plot.hidden = show;
    toggle.textContent = show ? "Chart" : "Table";
    toggle.setAttribute("aria-pressed", String(show));
    if (show && !tableBox.firstChild) tableBox.append(table());
  });
  host.replaceChildren(...[
    htmlEl("div", { class: "ch-head" }, htmlEl("div", {}, htmlEl("h3", { text: title }), note ? htmlEl("p", { class: "muted ch-note", text: note }) : null), toggle),
    legend.length > 1 ? htmlEl("div", { class: "ch-legend" }, ...legend.map((l) => htmlEl("span", {}, htmlEl("i", { class: `ch-key s${l.slot}` }), l.label))) : null,
    plot, tableBox,
  ].filter(Boolean));
  return { plot, tip };
}

function showTip(tip, plot, x, y, lines) {
  tip.replaceChildren(...lines.map((l, i) => (i === 0 ? htmlEl("strong", { text: l }) : htmlEl("div", {}, l.slot ? htmlEl("i", { class: `ch-key s${l.slot}` }) : null, l.text ?? l))));
  tip.hidden = false;
  const w = tip.offsetWidth;
  const max = plot.clientWidth - w - 4;
  tip.style.left = `${Math.max(4, Math.min(x + 12, max))}px`;
  tip.style.top = `${Math.max(4, y - tip.offsetHeight - 8)}px`;
}

function simpleTable(headers, rows) {
  return htmlEl("table", { class: "table records-table ch-tbl" },
    htmlEl("thead", {}, htmlEl("tr", {}, ...headers.map((h) => htmlEl("th", { text: h })))),
    htmlEl("tbody", {}, ...rows.map((r) => htmlEl("tr", {}, ...r.map((c, i) => htmlEl("td", { class: i ? "num" : "", text: typeof c === "number" ? fmtNum(c) : c }))))));
}

/** Redraw when the card's width changes. */
function responsive(plot, draw) {
  let last = 0;
  const run = () => { const w = plot.clientWidth; if (w && w !== last) { last = w; draw(w); } };
  new ResizeObserver(run).observe(plot);
  run();
}

/**
 * Days on the x axis: stacked bars (`stack: true`) or lines. data = [{ day, key: n, … }], series = [{ key, label, slot }].
 */
export function timeChart(host, { title, note, data, series, stack = false, height = 210 }) {
  const hasData = data.some((d) => series.some((s) => d[s.key]));
  const legend = hasData ? series.map((s) => ({ label: s.label, slot: s.slot })) : []; // no legend on an empty chart
  const { plot, tip } = frame(host, {
    title, note, legend,
    table: () => simpleTable(["Day", ...series.map((s) => s.label)], [...data].reverse().map((d) => [longDay(d.day), ...series.map((s) => d[s.key] || 0)])),
  });
  const totals = data.map((d) => series.reduce((n, s) => n + (d[s.key] || 0), 0));
  if (!totals.some(Boolean)) { plot.append(htmlEl("p", { class: "muted ch-empty", text: "Nothing in this period yet." })); return; }
  responsive(plot, (width) => {
    plot.querySelector("svg")?.remove();
    const pad = { l: 34, r: 8, t: 8, b: 22 };
    const w = width - pad.l - pad.r;
    const h = height - pad.t - pad.b;
    const max = stack ? Math.max(...totals) : Math.max(...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
    const { top, step } = niceMax(max);
    const y = (v) => pad.t + h - (v / top) * h;
    const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "ch-svg", role: "img", "aria-label": title });
    svg.style.width = `${width}px`; // the app's icon rule sizes every svg to 20px
    svg.style.height = `${height}px`;
    for (let v = 0; v <= top; v += step) {
      svg.append(svgEl("line", { x1: pad.l, x2: width - pad.r, y1: y(v), y2: y(v), class: v ? "ch-gl" : "ch-base" }));
      const t = svgEl("text", { x: pad.l - 6, y: y(v) + 3, class: "ch-axis", "text-anchor": "end" });
      t.textContent = fmtNum(v);
      svg.append(t);
    }
    const n = data.length;
    const band = w / n;
    const xAt = (i) => pad.l + band * i + band / 2;
    const labelEvery = Math.ceil(n / Math.max(2, Math.floor(w / 70)));
    // Dates every few days, and the last day unless it would crowd the label before it.
    const marks = data.map((_, i) => i).filter((i) => i % labelEvery === 0);
    if (n - 1 - marks[marks.length - 1] >= labelEvery * 0.75) marks.push(n - 1);
    for (const i of marks) {
      const t = svgEl("text", { x: xAt(i), y: height - 6, class: "ch-axis", "text-anchor": "middle" });
      t.textContent = shortDay(data[i].day);
      svg.append(t);
    }
    if (stack) {
      const bw = Math.max(2, Math.min(28, band - Math.max(2, band * 0.28)));
      data.forEach((d, i) => {
        let base = 0;
        const segs = series.filter((s) => d[s.key] > 0);
        segs.forEach((s, j) => {
          const v = d[s.key];
          const y0 = y(base);
          const y1 = y(base + v);
          const hgt = Math.max(1, y0 - y1 - (j < segs.length - 1 ? 2 : 0)); // 2px surface gap between stacked fills
          const isTop = j === segs.length - 1;
          svg.append(isTop && hgt > 4
            ? svgEl("path", { d: roundTop(xAt(i) - bw / 2, y1, bw, hgt, Math.min(4, bw / 2)), class: `ch-bar s${s.slot}` })
            : svgEl("rect", { x: xAt(i) - bw / 2, y: y1, width: bw, height: hgt, class: `ch-bar s${s.slot}` }));
          base += v;
        });
      });
    } else {
      for (const s of series) {
        const pts = data.map((d, i) => `${xAt(i)},${y(d[s.key] || 0)}`).join(" ");
        svg.append(svgEl("polyline", { points: pts, class: `ch-line s${s.slot}` }));
      }
    }
    const cross = svgEl("line", { y1: pad.t, y2: pad.t + h, class: "ch-cross", visibility: "hidden" });
    svg.append(cross);
    const dots = series.map((s) => { const c = svgEl("circle", { r: 4, class: `ch-dot s${s.slot}`, visibility: "hidden" }); svg.append(c); return c; });
    const hit = svgEl("rect", { x: pad.l, y: pad.t, width: w, height: h, class: "ch-hit" });
    svg.append(hit);
    const hover = (e) => {
      const r = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - pad.l) / band)));
      const d = data[i];
      cross.setAttribute("x1", xAt(i)); cross.setAttribute("x2", xAt(i)); cross.setAttribute("visibility", "visible");
      if (!stack) series.forEach((s, k) => { dots[k].setAttribute("cx", xAt(i)); dots[k].setAttribute("cy", y(d[s.key] || 0)); dots[k].setAttribute("visibility", "visible"); });
      const lines = [longDay(d.day), ...[...series].reverse().map((s) => ({ slot: series.length > 1 ? s.slot : 0, text: `${s.label}: ${fmtNum(d[s.key] || 0)}` }))];
      if (stack && series.length > 1) lines.push(`Total: ${fmtNum(totals[i])}`);
      showTip(tip, plot, xAt(i), y(stack ? totals[i] : Math.max(...series.map((s) => d[s.key] || 0))), lines);
    };
    hit.addEventListener("mousemove", hover);
    hit.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach((dt) => dt.setAttribute("visibility", "hidden")); });
    plot.prepend(svg);
  });
}

function roundTop(x, y, w, h, r) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/** Horizontal bars, biggest first. items = [{ label, n, sub? }]; `ordinal` shades a funnel from one hue. */
export function barList(host, { title, note, items, unit = "", slot = 1, ordinal = false, valueLabel = "Count", onPick = null }) {
  const { plot, tip } = frame(host, { title, note, table: () => simpleTable(["", valueLabel], items.map((i) => [i.label, i.n])) });
  if (!items.length || !items.some((i) => i.n)) { plot.append(htmlEl("p", { class: "muted ch-empty", text: "Nothing in this period yet." })); return; }
  const max = Math.max(...items.map((i) => i.n), 1);
  const list = htmlEl("div", { class: "ch-bars" });
  items.forEach((item, k) => {
    const fill = htmlEl("i", { class: ordinal ? `ch-fill q${Math.min(7, 7 - Math.round((k / Math.max(1, items.length - 1)) * 4))}` : `ch-fill s${slot}` });
    fill.style.width = `${Math.max(item.n ? 2 : 0, (item.n / max) * 100)}%`;
    const row = htmlEl(onPick ? "button" : "div", { class: "ch-row", ...(onPick ? { type: "button", title: `Show ${item.label}` } : {}) },
      htmlEl("span", { class: "ch-label", text: item.label }),
      htmlEl("span", { class: "ch-track" }, fill),
      htmlEl("strong", { class: "ch-val", text: `${fmtNum(item.n)}${unit}` }));
    if (onPick) row.addEventListener("click", () => onPick(item));
    row.addEventListener("mousemove", (e) => {
      const r = plot.getBoundingClientRect();
      showTip(tip, plot, e.clientX - r.left, e.clientY - r.top, [item.label, `${valueLabel}: ${fmtNum(item.n)}${unit}`, ...(item.sub ? [item.sub] : [])]);
    });
    row.addEventListener("mouseleave", () => { tip.hidden = true; });
    list.append(row);
  });
  plot.append(list);
}

/** Day of week × hour of day, darker = more. matrix[0..6][0..23], Monday first. */
export function heatmap(host, { title, note, matrix }) {
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hourName = (h) => new Date(2026, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" });
  const { plot, tip } = frame(host, {
    title, note,
    table: () => simpleTable(["Day", ...Array.from({ length: 24 }, (_, h) => hourName(h))], matrix.map((row, d) => [DOW[d], ...row])),
  });
  const max = Math.max(...matrix.flat(), 0);
  if (!max) { plot.append(htmlEl("p", { class: "muted ch-empty", text: "Nothing in this period yet." })); return; }
  const grid = htmlEl("div", { class: "ch-heat" });
  grid.append(htmlEl("span"));
  for (let h = 0; h < 24; h += 1) grid.append(htmlEl("span", { class: "ch-hh", text: h % 3 === 0 ? hourName(h).replace(/\s?(AM|PM)/i, (m) => m.trim()[0].toLowerCase()) : "" }));
  matrix.forEach((row, d) => {
    grid.append(htmlEl("span", { class: "ch-hd", text: DOW[d] }));
    row.forEach((v, h) => {
      const level = v ? Math.max(1, Math.ceil((v / max) * 7)) : 0;
      const cell = htmlEl("span", { class: `ch-cell q${level}` });
      cell.addEventListener("mousemove", (e) => {
        const r = plot.getBoundingClientRect();
        showTip(tip, plot, e.clientX - r.left, e.clientY - r.top, [`${DOW[d]}, ${hourName(h)}–${hourName((h + 1) % 24)}`, `${fmtNum(v)} customer ${v === 1 ? "message" : "messages"}`]);
      });
      cell.addEventListener("mouseleave", () => { tip.hidden = true; });
      grid.append(cell);
    });
  });
  plot.append(grid, htmlEl("div", { class: "ch-scale" }, htmlEl("span", { text: "Fewer" }), ...[1, 2, 3, 4, 5, 6, 7].map((q) => htmlEl("i", { class: `ch-cell q${q}` })), htmlEl("span", { text: "More" })));
}

/** A big number with a short line under it (when a single figure says it best). */
export function statTile(host, { title, value, sub }) {
  host.replaceChildren(htmlEl("div", { class: "ch-head" }, htmlEl("h3", { text: title })), htmlEl("div", { class: "ch-stat" }, htmlEl("strong", { text: value }), htmlEl("span", { class: "muted", text: sub })));
}
