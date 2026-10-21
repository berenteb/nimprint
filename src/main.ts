import "./style.css";
import { SAMPLES } from "./samples";
import {
  defaultValues,
  discoverParams,
  fillTemplate,
  parseCsv,
  readMeta,
  type ParamDef,
} from "./template";
import { renderLabel } from "./render";
import { Designer, docToHtml, type Doc } from "./designer";
import { PrinterConnection, LABEL_TYPES, supports, B1_HEAD_PIXELS } from "./printer";
import { AGENT_PROMPT } from "./agentPrompt";

// ---------------------------------------------------------------- persistence
const KEY = "nimprint.v1";
interface Saved {
  mode: "template" | "designer";
  source: string;
  doc: Doc;
  values: Record<string, string>;
  templates: Record<string, string>;
  wMm: number;
  hMm: number;
  threshold: number;
  dither: boolean;
  invert: boolean;
  density: number;
  labelType: number;
  copies: number;
  zoom: number;
  csv: string;
}
const defaults: Saved = {
  mode: "template",
  source: SAMPLES[0].html,
  doc: { name: "My label", els: [] },
  values: {},
  templates: {},
  wMm: 50,
  hMm: 30,
  threshold: 140,
  dither: false,
  invert: false,
  density: 3,
  labelType: LABEL_TYPES[0].value,
  copies: 1,
  zoom: 0,
  csv: "",
};
function load(): Saved {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...defaults };
  }
}
const S = load();
let saveTimer: number | undefined;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      S.doc = designer.doc;
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch { /* storage unavailable or full (large images) */ }
  }, 300);
}

// ---------------------------------------------------------------------- DOM
const app = document.getElementById("app")!;
app.innerHTML = `
<div class="app">
  <header>
    <span class="logo">Nimprint</span>
    <button id="btnBt">Connect Bluetooth</button>
    <button id="btnUsb">Connect USB</button>
    <button id="btnDisc" hidden>Disconnect</button>
    <span class="pill" id="status"><span class="dot"></span><span id="statusText">Not connected</span></span>
    <span class="spacer"></span>
    <span class="muted" id="support"></span>
  </header>
  <main>
    <section class="col left">
      <div class="tabs"><button id="tabT">Templates</button><button id="tabD">Designer</button></div>
      <div id="paneT">
        <h3>Template library</h3>
        <div class="row"><select id="lib" class="grow"></select><button class="mini" id="libSave">Save…</button><button class="mini danger" id="libDel">Delete</button></div>
        <h3>HTML</h3>
        <textarea id="src" class="code" spellcheck="false" placeholder="Paste a label template here"></textarea>
        <div class="btnrow">
          <button class="mini" id="openFile">Open .html…</button>
          <button class="mini" id="copyPrompt" title="Instructions to paste to a local LLM agent so it generates compatible templates">Copy agent prompt</button>
          <button class="mini" id="copyHtml">Copy HTML</button>
        </div>
        <input type="file" id="fileIn" accept=".html,.htm,text/html" hidden />
      </div>
      <div id="paneD" hidden>
        <div id="designerPanel"></div>
        <div class="btnrow"><button class="mini" id="toTemplate">Use as template →</button><button class="mini danger" id="clearDesign">Clear</button></div>
      </div>
    </section>

    <section class="col center">
      <div class="stagewrap">
        <div class="stage" id="stage"><div class="paper" id="paper"><canvas id="prev"></canvas><div class="overlay" id="ov"></div></div></div>
        <div class="statusbar"><span id="dims"></span><label>Zoom <input type="range" id="zoom" min="0.5" max="4" step="0.5" /></label><button class="mini" id="png">Save PNG</button></div>
        <div class="err" id="err"></div>
      </div>
    </section>

    <section class="col right">
      <h3>Label</h3>
      <div class="grid2">
        <label class="field"><span>Width (mm)</span><input type="number" id="wmm" min="10" max="60" step="1" /></label>
        <label class="field"><span>Height (mm)</span><input type="number" id="hmm" min="8" max="200" step="1" /></label>
      </div>
      <div class="btnrow" id="presets"></div>
      <div class="row"><label class="check"><input type="checkbox" id="dither" />Dither</label><label class="check"><input type="checkbox" id="invert" />Invert</label></div>
      <label class="field"><span>Black threshold: <b id="thVal"></b></span><input type="range" id="th" min="20" max="235" /></label>

      <h3>Fields</h3>
      <div id="fields"></div>
      <label class="check"><input type="checkbox" id="batch" />Batch from CSV</label>
      <div id="batchBox" hidden>
        <p class="muted">Header row = field names. One label per row. Paste from a spreadsheet.</p>
        <textarea id="csv" rows="5" class="code" style="min-height:90px" spellcheck="false"></textarea>
        <p class="muted" id="batchInfo"></p>
      </div>

      <h3>Print</h3>
      <div class="grid2">
        <label class="field"><span>Copies</span><input type="number" id="copies" min="1" max="99" /></label>
        <label class="field"><span>Density</span><input type="number" id="density" min="1" max="5" /></label>
      </div>
      <label class="field"><span>Label stock</span><select id="ltype"></select></label>
      <button class="primary" id="print" style="width:100%;margin-top:8px" disabled>Print</button>
      <div class="progress"><div id="bar"></div></div>
      <div class="muted" id="printMsg"></div>
      <div class="log" id="log"></div>
    </section>
  </main>
</div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const src = $<HTMLTextAreaElement>("src");
const prev = $<HTMLCanvasElement>("prev");

// -------------------------------------------------------------------- printer
const printer = new PrinterConnection();
function log(msg: string) {
  const el = $("log");
  el.textContent += `${new Date().toLocaleTimeString()}  ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}
printer.onLog = log;
printer.onProgress = (msg, f) => {
  $("printMsg").textContent = msg;
  if (f != null) $("bar").style.width = `${Math.round(f * 100)}%`;
};
function renderStatus() {
  const s = printer.status;
  $("status").classList.toggle("on", s.connected);
  const bits = [s.connected ? `${s.name ?? "Printer"}${s.model ? ` · ${s.model}` : ""}` : "Not connected"];
  if (s.connected && s.battery != null) bits.push(`🔋 ${s.battery}%`);
  if (s.connected && s.lidClosed === false) bits.push("lid open");
  if (s.connected && s.paperInserted === false) bits.push("no labels");
  $("statusText").textContent = bits.join(" · ");
  $("btnDisc").hidden = !s.connected;
  ($("btnBt") as HTMLButtonElement).hidden = s.connected;
  ($("btnUsb") as HTMLButtonElement).hidden = s.connected;
  ($("print") as HTMLButtonElement).disabled = !s.connected || busy;
}
printer.onStatus = renderStatus;

async function connect(kind: "bluetooth" | "serial") {
  try {
    await printer.connect(kind);
    const r = printer.densityRange;
    ($("density") as HTMLInputElement).max = String(r.max);
    refreshSize();
    schedule();
  } catch (e) {
    log(`Connect failed: ${(e as Error).message ?? e}`);
  }
  renderStatus();
}
$("btnBt").addEventListener("click", () => connect("bluetooth"));
$("btnUsb").addEventListener("click", () => connect("serial"));
$("btnDisc").addEventListener("click", () => printer.disconnect());
$("support").textContent =
  !supports.bluetooth && !supports.serial
    ? "This browser has no Web Bluetooth / Web Serial — use Chrome or Edge."
    : !window.isSecureContext
      ? "Needs HTTPS or localhost for device access."
      : "";
if (!supports.bluetooth) ($("btnBt") as HTMLButtonElement).disabled = true;
if (!supports.serial) ($("btnUsb") as HTMLButtonElement).disabled = true;

// ------------------------------------------------------------------ size/zoom
const PRESETS: [number, number][] = [[50, 30], [40, 30], [50, 25], [40, 20], [30, 20], [30, 15], [25, 15], [50, 80]];
function dots() {
  const head = printer.headPixels || B1_HEAD_PIXELS;
  return {
    w: Math.min(head, Math.max(8, Math.round(S.wMm * 8))),
    h: Math.min(1600, Math.max(8, Math.round(S.hMm * 8))),
    head,
  };
}
function refreshSize() {
  const d = dots();
  ($("wmm") as HTMLInputElement).value = String(S.wMm);
  ($("hmm") as HTMLInputElement).value = String(S.hMm);
  $("dims").textContent = `${d.w} × ${d.h} dots` + (S.wMm * 8 > d.head ? ` (width capped to head: ${d.head})` : "");
}
$("presets").append(
  ...PRESETS.map(([w, h]) => {
    const b = document.createElement("button");
    b.className = "mini";
    b.textContent = `${w}×${h}`;
    b.onclick = () => {
      S.wMm = w; S.hMm = h;
      refreshSize(); applyZoom(); schedule();
    };
    return b;
  }),
);
for (const id of ["wmm", "hmm"] as const) {
  $(id).addEventListener("input", () => {
    const v = parseFloat(($(id) as HTMLInputElement).value);
    if (!(v > 0)) return;
    if (id === "wmm") S.wMm = v; else S.hMm = v;
    refreshSize(); applyZoom(); schedule();
  });
}
function applyZoom() {
  const d = dots();
  prev.style.width = `${d.w * S.zoom}px`;
  prev.style.height = `${d.h * S.zoom}px`;
  designer.refreshOverlay();
}
if (!S.zoom) {
  const avail = Math.max(200, ($("stage").parentElement?.clientWidth ?? 600) - 90);
  S.zoom = Math.min(4, Math.max(0.5, Math.floor((avail / dots().w) * 2) / 2));
}
($("zoom") as HTMLInputElement).value = String(S.zoom);
$("zoom").addEventListener("input", () => {
  S.zoom = parseFloat(($("zoom") as HTMLInputElement).value);
  applyZoom(); persist();
});

// -------------------------------------------------------------------- designer
const designer = new Designer({
  panel: $("designerPanel"),
  overlay: $("ov"),
  getSize: () => { const d = dots(); return { w: d.w, h: d.h }; },
  getZoom: () => S.zoom,
  onChange: () => schedule(),
});
designer.doc = S.doc;
designer.refreshAll();

// ----------------------------------------------------------------------- state
let params: ParamDef[] = [];
const sourceHtml = () =>
  S.mode === "template" ? S.source : docToHtml(designer.doc, S.wMm, S.hMm);

function setMode(m: "template" | "designer") {
  S.mode = m;
  $("tabT").classList.toggle("on", m === "template");
  $("tabD").classList.toggle("on", m === "designer");
  $("paneT").hidden = m !== "template";
  $("paneD").hidden = m !== "designer";
  $("ov").classList.toggle("live", m === "designer");
  designer.active = m === "designer";
  if (m === "template") $("ov").replaceChildren(); else designer.refreshOverlay();
  schedule();
}
$("tabT").onclick = () => setMode("template");
$("tabD").onclick = () => setMode("designer");

function applySource(html: string, adoptSize = true) {
  S.source = html;
  src.value = html;
  const meta = readMeta(html);
  if (adoptSize && meta.size) {
    S.wMm = meta.size.width;
    S.hMm = meta.size.height;
    refreshSize();
    applyZoom();
  }
}
src.value = S.source;
src.addEventListener("input", () => {
  S.source = src.value;
  schedule();
});

// library
function renderLibrary(selected?: string) {
  const lib = $<HTMLSelectElement>("lib");
  lib.replaceChildren(
    new Option("— current (unsaved) —", ""),
    ...SAMPLES.map((s) => new Option(`Sample: ${s.name}`, `s:${s.id}`)),
    ...Object.keys(S.templates).map((n) => new Option(n, `u:${n}`)),
  );
  lib.value = selected ?? "";
}
renderLibrary();
$("lib").addEventListener("change", () => {
  const v = ($("lib") as HTMLSelectElement).value;
  if (!v) return;
  const html = v.startsWith("s:") ? SAMPLES.find((s) => s.id === v.slice(2))!.html : S.templates[v.slice(2)];
  S.values = {};
  applySource(html);
  schedule();
});
$("libSave").addEventListener("click", () => {
  const name = prompt("Save template as:", readMeta(S.source).name ?? "My template");
  if (!name) return;
  S.templates[name] = S.source;
  renderLibrary(`u:${name}`);
  persist();
});
$("libDel").addEventListener("click", () => {
  const v = ($("lib") as HTMLSelectElement).value;
  if (!v.startsWith("u:")) return;
  if (!confirm(`Delete "${v.slice(2)}"?`)) return;
  delete S.templates[v.slice(2)];
  renderLibrary();
  persist();
});
$("openFile").addEventListener("click", () => $("fileIn").click());
$("fileIn").addEventListener("change", async () => {
  const f = ($("fileIn") as HTMLInputElement).files?.[0];
  if (f) { applySource(await f.text()); schedule(); }
  ($("fileIn") as HTMLInputElement).value = "";
});
const copy = async (text: string, what: string) => {
  try { await navigator.clipboard.writeText(text); log(`${what} copied`); }
  catch { log(`Could not copy ${what} (clipboard blocked)`); }
};
$("copyPrompt").addEventListener("click", () => copy(AGENT_PROMPT, "Agent prompt"));
$("copyHtml").addEventListener("click", () => copy(S.source, "HTML"));
$("toTemplate").addEventListener("click", () => {
  const html = docToHtml(designer.doc, S.wMm, S.hMm);
  applySource(html, false);
  renderLibrary();
  setMode("template");
});
$("clearDesign").addEventListener("click", () => {
  if (designer.doc.els.length && !confirm("Remove all elements?")) return;
  designer.load({ name: "My label", els: [] });
});

// ---------------------------------------------------------------------- fields
function buildFields() {
  const host = $("fields");
  host.replaceChildren();
  if (!params.length) {
    host.innerHTML = `<p class="muted">No <code>{{fields}}</code> in this label.</p>`;
    return;
  }
  for (const p of params) {
    const label = document.createElement("label");
    label.className = p.type === "checkbox" ? "check" : "field wide";
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const cur = S.values[p.key] ?? p.default;
    if (p.type === "textarea") {
      input = document.createElement("textarea");
      input.rows = 3;
      input.value = cur;
    } else if (p.type === "select") {
      input = document.createElement("select");
      for (const o of p.options ?? []) input.append(new Option(o, o));
      input.value = cur;
    } else {
      input = document.createElement("input");
      input.type = p.type === "number" ? "number" : p.type === "checkbox" ? "checkbox" : "text";
      if (p.type === "checkbox") input.checked = !["", "0", "false"].includes(cur.toLowerCase());
      else input.value = cur;
    }
    input.addEventListener("input", () => {
      S.values[p.key] = p.type === "checkbox" ? ((input as HTMLInputElement).checked ? "1" : "0") : input.value;
      schedule(false);
    });
    if (p.type === "checkbox") label.append(input, ` ${p.label}`);
    else {
      const span = document.createElement("span");
      span.textContent = p.label;
      label.append(span, input);
    }
    host.append(label);
  }
}

// batch
const batchEl = $<HTMLInputElement>("batch");
let batchRows: Record<string, string>[] = [];
batchEl.addEventListener("change", () => { $("batchBox").hidden = !batchEl.checked; updateBatch(); });
$("csv").addEventListener("input", () => { S.csv = ($("csv") as HTMLTextAreaElement).value; updateBatch(); persist(); });
($("csv") as HTMLTextAreaElement).value = S.csv;
function updateBatch() {
  batchRows = batchEl.checked ? parseCsv(S.csv) : [];
  const keys = new Set(params.map((p) => p.key));
  const cols = batchRows[0] ? Object.keys(batchRows[0]) : [];
  const unknown = cols.filter((c) => !keys.has(c));
  $("batchInfo").textContent = batchEl.checked
    ? `${batchRows.length} labels` + (unknown.length ? ` · unknown columns ignored: ${unknown.join(", ")}` : "") +
      (cols.length ? "" : " · paste CSV with a header row")
    : "";
}
function pageValues(i?: number): Record<string, string> {
  const base = { ...defaultValues(params), ...S.values };
  return i == null ? base : { ...base, ...batchRows[i] };
}

// --------------------------------------------------------------------- preview
let token = 0;
let lastFieldsSig = "";
let timer: number | undefined;
function schedule(rebuildFields = true) {
  clearTimeout(timer);
  timer = window.setTimeout(() => void refresh(rebuildFields), 50);
  persist();
}
function renderOpts() {
  const d = dots();
  return { width: d.w, height: d.h, threshold: S.threshold, dither: S.dither, invert: S.invert };
}
async function refresh(rebuildFields: boolean) {
  const my = ++token;
  const html = sourceHtml();
  params = discoverParams(html);
  const sig = JSON.stringify(params);
  if (rebuildFields && sig !== lastFieldsSig) { lastFieldsSig = sig; buildFields(); updateBatch(); }
  const filled = fillTemplate(html, pageValues(batchRows.length ? 0 : undefined), params);
  try {
    const c = await renderLabel(filled, renderOpts());
    if (my !== token) return;
    prev.width = c.width;
    prev.height = c.height;
    prev.getContext("2d")!.drawImage(c, 0, 0);
    $("err").textContent = "";
    applyZoom();
  } catch (e) {
    if (my === token) $("err").textContent = `Render failed: ${(e as Error).message ?? e}`;
  }
}

// ---------------------------------------------------------------- misc inputs
function bind(id: string, key: keyof Saved, type: "number" | "bool") {
  const el = $<HTMLInputElement>(id);
  if (type === "bool") el.checked = !!S[key];
  else el.value = String(S[key]);
  el.addEventListener("input", () => {
    (S[key] as unknown) = type === "bool" ? el.checked : parseFloat(el.value);
    if (id === "th") $("thVal").textContent = el.value;
    schedule(false);
  });
}
bind("th", "threshold", "number");
bind("dither", "dither", "bool");
bind("invert", "invert", "bool");
bind("copies", "copies", "number");
bind("density", "density", "number");
$("thVal").textContent = String(S.threshold);
const lt = $<HTMLSelectElement>("ltype");
for (const t of LABEL_TYPES) lt.append(new Option(t.label, String(t.value)));
lt.value = String(S.labelType);
lt.addEventListener("change", () => { S.labelType = parseInt(lt.value, 10); persist(); });

$("png").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = prev.toDataURL("image/png");
  a.download = "label.png";
  a.click();
});

// ----------------------------------------------------------------------- print
let busy = false;
$("print").addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  renderStatus();
  $("bar").style.width = "0";
  $("printMsg").textContent = "Rendering…";
  try {
    const html = sourceHtml();
    const ps = discoverParams(html);
    const rows = batchRows.length ? batchRows.map((_, i) => i) : [undefined];
    const pages = [];
    for (const i of rows) {
      const filled = fillTemplate(html, pageValues(i), ps);
      pages.push({ canvas: await renderLabel(filled, renderOpts()), copies: Math.max(1, S.copies | 0) });
    }
    log(`Printing ${pages.length} label(s) × ${S.copies}`);
    await printer.print(pages, { density: S.density, labelType: S.labelType });
    $("bar").style.width = "100%";
    $("printMsg").textContent = "Done";
    log("Print finished");
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    $("printMsg").textContent = `Print failed: ${msg}`;
    log(`Print failed: ${msg}`);
  } finally {
    busy = false;
    renderStatus();
  }
});

// ------------------------------------------------------------------------ boot
setMode(S.mode);
refreshSize();
applyZoom();
renderStatus();
void refresh(true);
