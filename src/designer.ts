import { iconNames, loadIcon } from "./icons";

export type ElType = "text" | "icon" | "rect" | "ellipse" | "line" | "qr" | "barcode" | "image";
type Align = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom";
type Family = "sans" | "serif" | "mono" | "condensed";

export interface El {
  id: string;
  type: ElType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate?: number;
  // text
  text?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: Align;
  valign?: VAlign;
  family?: Family;
  fit?: boolean;
  invert?: boolean;
  // icon
  icon?: string;
  stroke?: number;
  // shapes
  fill?: boolean;
  border?: number;
  radius?: number;
  // qr / barcode
  value?: string;
  format?: string;
  showText?: boolean;
  // image
  src?: string;
}

export interface Doc {
  name: string;
  els: El[];
}

const FAMILIES: Record<Family, string> = {
  sans: "Arial,Helvetica,sans-serif",
  serif: "Georgia,'Times New Roman',serif",
  mono: "'Courier New',Courier,monospace",
  condensed: "'Arial Narrow','Helvetica Neue Condensed',Arial,sans-serif",
};

const uid = () => Math.random().toString(36).slice(2, 9);
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Serialise a design to the shared HTML template format. */
export function docToHtml(doc: Doc, widthMm: number, heightMm: number): string {
  const meta = JSON.stringify({ name: doc.name, size: { width: widthMm, height: heightMm } });
  const out = [`<script type="application/nimprint+json">${meta}</script>`];
  for (const e of doc.els) {
    const pos =
      `position:absolute;left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px;` +
      (e.rotate ? `transform:rotate(${e.rotate}deg);` : "");
    switch (e.type) {
      case "text": {
        const jc = { left: "flex-start", center: "center", right: "flex-end" }[e.align ?? "left"];
        const ai = { top: "flex-start", middle: "center", bottom: "flex-end" }[e.valign ?? "middle"];
        const style =
          pos +
          `display:flex;justify-content:${jc};align-items:${ai};text-align:${e.align ?? "left"};` +
          `font:${e.italic ? "italic " : ""}${e.bold ? 700 : 400} ${e.fontSize ?? 24}px/1.1 ${FAMILIES[e.family ?? "sans"]};` +
          (e.invert ? "background:#000;color:#fff;" : "") +
          "overflow:hidden;word-break:break-word;";
        const body = esc(e.text ?? "").replace(/\n/g, "<br>");
        out.push(`<div${e.fit ? " data-fit" : ""} style="${style}">${body}</div>`);
        break;
      }
      case "icon":
        out.push(
          `<div style="${pos}display:flex;align-items:center;justify-content:center">` +
            `<icon name="${esc(e.icon ?? "star")}" size="${Math.min(e.w, e.h)}" stroke="${e.stroke ?? 2}"></icon></div>`,
        );
        break;
      case "rect":
      case "ellipse":
        out.push(
          `<div style="${pos}box-sizing:border-box;border:${e.border ?? 3}px solid #000;` +
            `border-radius:${e.type === "ellipse" ? "50%" : (e.radius ?? 0) + "px"};` +
            `${e.fill ? "background:#000;" : ""}"></div>`,
        );
        break;
      case "line":
        out.push(`<div style="${pos}background:#000"></div>`);
        break;
      case "qr":
        out.push(
          `<div style="${pos}display:flex;align-items:center;justify-content:center">` +
            `<qr value="${esc(e.value ?? "")}" size="${Math.min(e.w, e.h)}"></qr></div>`,
        );
        break;
      case "barcode": {
        const fs = 16;
        const bh = Math.max(10, e.h - (e.showText === false ? 0 : fs + 6));
        out.push(
          `<div style="${pos}display:flex;align-items:center;justify-content:center">` +
            `<barcode value="${esc(e.value ?? "")}" format="${e.format ?? "CODE128"}" height="${bh}" module="2" fontsize="${fs}" text="${e.showText === false ? "false" : "true"}"></barcode></div>`,
        );
        break;
      }
      case "image":
        out.push(`<img alt="" src="${e.src ?? ""}" style="${pos}object-fit:contain">`);
        break;
    }
  }
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface DesignerOpts {
  panel: HTMLElement; // left: toolbox, layers, properties
  overlay: HTMLElement; // positioned over the preview canvas
  getSize: () => { w: number; h: number };
  getZoom: () => number;
  onChange: () => void;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "value") (el as unknown as HTMLInputElement).value = String(v);
    else if (k === "checked") (el as unknown as HTMLInputElement).checked = !!v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const k of kids) if (k != null) el.append(k);
  return el;
}

export class Designer {
  doc: Doc = { name: "My label", els: [] };
  selected: string | null = null;
  active = false;
  private opts: DesignerOpts;
  private layersEl = h("div", { class: "layers" });
  private propsEl = h("div", { class: "props" });

  constructor(opts: DesignerOpts) {
    this.opts = opts;
    const tools: [ElType, string, string][] = [
      ["text", "Aa", "Text"],
      ["icon", "★", "Icon"],
      ["qr", "▦", "QR"],
      ["barcode", "|||", "Barcode"],
      ["rect", "▭", "Rectangle"],
      ["ellipse", "◯", "Ellipse"],
      ["line", "—", "Line"],
      ["image", "🖼", "Image"],
    ];
    const toolbox = h(
      "div",
      { class: "toolbox" },
      ...tools.map(([t, glyph, label]) =>
        h("button", { class: "tool", title: `Add ${label}`, onClick: () => this.add(t) }, h("span", { class: "glyph" }, glyph), label),
      ),
    );
    opts.panel.append(
      h("h3", {}, "Add"),
      toolbox,
      h("h3", {}, "Layers"),
      this.layersEl,
      h("h3", {}, "Properties"),
      this.propsEl,
    );
    window.addEventListener("keydown", (e) => this.onKey(e));
    this.refreshPanel();
    this.refreshOverlay();
  }

  // ---- model --------------------------------------------------------------

  get current(): El | undefined {
    return this.doc.els.find((e) => e.id === this.selected);
  }

  load(doc: Doc) {
    this.doc = doc;
    this.selected = null;
    this.refreshAll();
    this.opts.onChange();
  }

  add(type: ElType) {
    const { w: W, h: H } = this.opts.getSize();
    const defs: Record<ElType, Partial<El>> = {
      text: { w: 200, h: 50, text: "Text {{field}}", fontSize: 32, bold: true, align: "left", valign: "middle", family: "sans" },
      icon: { w: 64, h: 64, icon: "star", stroke: 2 },
      qr: { w: 100, h: 100, value: "https://example.com" },
      barcode: { w: 220, h: 80, value: "123456789", format: "CODE128", showText: true },
      rect: { w: 120, h: 70, border: 4, radius: 0, fill: false },
      ellipse: { w: 90, h: 90, border: 4, fill: false },
      line: { w: 160, h: 4 },
      image: { w: 100, h: 100 },
    };
    const d = defs[type];
    const el: El = {
      id: uid(),
      type,
      x: Math.round((W - (d.w ?? 100)) / 2),
      y: Math.round((H - (d.h ?? 50)) / 2),
      w: d.w ?? 100,
      h: d.h ?? 50,
      ...d,
    };
    if (type === "image") {
      const input = h("input", { type: "file", accept: "image/*" });
      input.addEventListener("change", () => {
        const f = input.files?.[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          const img = new Image();
          img.onload = () => {
            const k = Math.min(1, (W * 0.6) / img.width, (H * 0.8) / img.height);
            el.w = Math.round(img.width * k);
            el.h = Math.round(img.height * k);
            el.x = Math.round((W - el.w) / 2);
            el.y = Math.round((H - el.h) / 2);
            el.src = String(r.result);
            this.doc.els.push(el);
            this.selected = el.id;
            this.refreshAll();
            this.opts.onChange();
          };
          img.src = String(r.result);
        };
        r.readAsDataURL(f);
      });
      input.click();
      return;
    }
    this.doc.els.push(el);
    this.selected = el.id;
    this.refreshAll();
    this.opts.onChange();
  }

  private remove(id: string) {
    this.doc.els = this.doc.els.filter((e) => e.id !== id);
    if (this.selected === id) this.selected = null;
    this.refreshAll();
    this.opts.onChange();
  }

  private duplicate(id: string) {
    const src = this.doc.els.find((e) => e.id === id);
    if (!src) return;
    const copy = { ...src, id: uid(), x: src.x + 10, y: src.y + 10 };
    this.doc.els.push(copy);
    this.selected = copy.id;
    this.refreshAll();
    this.opts.onChange();
  }

  private reorder(id: string, dir: 1 | -1) {
    const i = this.doc.els.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.doc.els.length) return;
    [this.doc.els[i], this.doc.els[j]] = [this.doc.els[j], this.doc.els[i]];
    this.refreshAll();
    this.opts.onChange();
  }

  select(id: string | null) {
    this.selected = id;
    this.refreshAll();
  }

  private align(how: "l" | "c" | "r" | "t" | "m" | "b") {
    const e = this.current;
    if (!e) return;
    const { w: W, h: H } = this.opts.getSize();
    if (how === "l") e.x = 0;
    if (how === "c") e.x = Math.round((W - e.w) / 2);
    if (how === "r") e.x = W - e.w;
    if (how === "t") e.y = 0;
    if (how === "m") e.y = Math.round((H - e.h) / 2);
    if (how === "b") e.y = H - e.h;
    this.refreshOverlay();
    this.syncGeometryInputs();
    this.opts.onChange();
  }

  private onKey(ev: KeyboardEvent) {
    if (!this.active) return;
    const t = ev.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const e = this.current;
    if (!e) return;
    const step = ev.shiftKey ? 8 : 1;
    if (ev.key === "ArrowLeft") e.x -= step;
    else if (ev.key === "ArrowRight") e.x += step;
    else if (ev.key === "ArrowUp") e.y -= step;
    else if (ev.key === "ArrowDown") e.y += step;
    else if (ev.key === "Delete" || ev.key === "Backspace") return this.remove(e.id), ev.preventDefault();
    else if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "d") return this.duplicate(e.id), ev.preventDefault();
    else return;
    ev.preventDefault();
    this.refreshOverlay();
    this.syncGeometryInputs();
    this.opts.onChange();
  }

  // ---- overlay (drag / resize) -------------------------------------------

  refreshOverlay() {
    const z = this.opts.getZoom();
    const ov = this.opts.overlay;
    ov.replaceChildren();
    for (const e of this.doc.els) {
      const box = h("div", {
        class: "box" + (e.id === this.selected ? " sel" : ""),
        "data-id": e.id,
      });
      this.placeBox(box, e, z);
      box.addEventListener("pointerdown", (ev) => this.startDrag(ev, e, "move"));
      if (e.id === this.selected) {
        for (const hd of HANDLES) {
          const hn = h("div", { class: `handle ${hd}` });
          hn.addEventListener("pointerdown", (ev) => {
            ev.stopPropagation();
            this.startDrag(ev, e, hd);
          });
          box.append(hn);
        }
      }
      ov.append(box);
    }
  }

  private placeBox(box: HTMLElement, e: El, z: number) {
    box.style.cssText = `left:${e.x * z}px;top:${e.y * z}px;width:${e.w * z}px;height:${e.h * z}px;` +
      (e.rotate ? `transform:rotate(${e.rotate}deg);` : "");
  }

  private startDrag(ev: PointerEvent, e: El, mode: "move" | Handle) {
    ev.preventDefault();
    ev.stopPropagation();
    const origin = ev.currentTarget as HTMLElement;
    if (this.selected !== e.id) {
      this.selected = e.id;
      this.refreshPanel();
      this.refreshOverlay();
    }
    const z = this.opts.getZoom();
    const start = { px: ev.clientX, py: ev.clientY, x: e.x, y: e.y, w: e.w, h: e.h };
    const box = this.opts.overlay.querySelector<HTMLElement>(`.box[data-id="${e.id}"]`)!;
    // the overlay is rebuilt on first selection, so capture on the live node
    const target = origin.isConnected ? origin : box;
    target.setPointerCapture(ev.pointerId);
    const move = (m: PointerEvent) => {
      const dx = Math.round((m.clientX - start.px) / z);
      const dy = Math.round((m.clientY - start.py) / z);
      if (mode === "move") {
        e.x = start.x + dx;
        e.y = start.y + dy;
      } else {
        let { x, y, w, h: hh } = start;
        if (mode.includes("e")) w = Math.max(4, start.w + dx);
        if (mode.includes("s")) hh = Math.max(2, start.h + dy);
        if (mode.includes("w")) { w = Math.max(4, start.w - dx); x = start.x + start.w - w; }
        if (mode.includes("n")) { hh = Math.max(2, start.h - dy); y = start.y + start.h - hh; }
        Object.assign(e, { x, y, w, h: hh });
      }
      this.placeBox(box, e, z);
      this.syncGeometryInputs();
      this.opts.onChange();
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  // ---- side panel ---------------------------------------------------------

  refreshAll() {
    this.refreshPanel();
    this.refreshOverlay();
  }

  private labelOf(e: El): string {
    switch (e.type) {
      case "text": return `Text: ${(e.text ?? "").split("\n")[0].slice(0, 22)}`;
      case "icon": return `Icon: ${e.icon}`;
      case "qr": return `QR: ${(e.value ?? "").slice(0, 20)}`;
      case "barcode": return `Barcode: ${(e.value ?? "").slice(0, 16)}`;
      default: return e.type[0].toUpperCase() + e.type.slice(1);
    }
  }

  private geometryInputs: Record<string, HTMLInputElement> = {};

  private syncGeometryInputs() {
    const e = this.current;
    if (!e) return;
    for (const k of ["x", "y", "w", "h"] as const) {
      const inp = this.geometryInputs[k];
      if (inp && document.activeElement !== inp) inp.value = String(e[k]);
    }
  }

  refreshPanel() {
    // layers (top of list = front)
    this.layersEl.replaceChildren(
      ...(this.doc.els.length === 0 ? [h("p", { class: "muted" }, "Nothing yet — add an element above.")] : []),
      ...[...this.doc.els].reverse().map((e) =>
        h(
          "div",
          { class: "layer" + (e.id === this.selected ? " sel" : ""), onClick: () => this.select(e.id) },
          h("span", { class: "grow" }, this.labelOf(e)),
        ),
      ),
    );

    const e = this.current;
    this.geometryInputs = {};
    if (!e) {
      this.propsEl.replaceChildren(h("p", { class: "muted" }, "Select an element to edit it. Use {{name}} in text, QR or barcode values to make fill-in fields."));
      return;
    }

    const set = <K extends keyof El>(k: K, v: El[K], rebuild = false) => {
      e[k] = v;
      if (rebuild) this.refreshAll();
      else this.refreshOverlay();
      this.opts.onChange();
    };
    const num = (label: string, k: "x" | "y" | "w" | "h" | "fontSize" | "border" | "radius" | "stroke" | "rotate", min = -9999, max = 9999, step = 1) => {
      const inp = h("input", { type: "number", min, max, step, value: e[k] ?? 0 });
      inp.addEventListener("input", () => {
        const v = parseFloat(inp.value);
        if (!Number.isNaN(v)) set(k, v as never);
      });
      if (k === "x" || k === "y" || k === "w" || k === "h") this.geometryInputs[k] = inp;
      return h("label", { class: "field" }, h("span", {}, label), inp);
    };
    const text = (label: string, k: "value" | "text", multiline = false) => {
      const inp = multiline ? h("textarea", { rows: 3 }) : h("input", { type: "text" });
      (inp as HTMLInputElement).value = (e[k] as string) ?? "";
      inp.addEventListener("input", () => {
        set(k, (inp as HTMLInputElement).value as never);
        this.layersEl.querySelector(".layer.sel .grow")!.textContent = this.labelOf(e);
      });
      return h("label", { class: "field wide" }, h("span", {}, label), inp);
    };
    const select = <K extends "align" | "valign" | "family" | "format">(label: string, k: K, opts: [string, string][]) => {
      const sel = h("select", {}, ...opts.map(([v, l]) => h("option", { value: v }, l)));
      sel.value = (e[k] as string) ?? opts[0][0];
      sel.addEventListener("change", () => set(k, sel.value as never));
      return h("label", { class: "field" }, h("span", {}, label), sel);
    };
    const check = (label: string, k: "bold" | "italic" | "fit" | "invert" | "fill" | "showText", def = false) => {
      const inp = h("input", { type: "checkbox", checked: e[k] ?? def });
      inp.addEventListener("change", () => set(k, inp.checked as never));
      return h("label", { class: "check" }, inp, label);
    };

    const rows: HTMLElement[] = [h("div", { class: "grid4" }, num("X", "x"), num("Y", "y"), num("W", "w", 1), num("H", "h", 1))];

    if (e.type === "text") {
      rows.push(
        text("Text", "text", true),
        h("div", { class: "grid2" }, num("Size", "fontSize", 6, 400), select("Font", "family", [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"], ["condensed", "Condensed"]])),
        h("div", { class: "grid2" }, select("Align", "align", [["left", "Left"], ["center", "Center"], ["right", "Right"]]), select("Vertical", "valign", [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]])),
        h("div", { class: "checks" }, check("Bold", "bold"), check("Italic", "italic"), check("Auto-fit", "fit"), check("Inverted", "invert")),
      );
    } else if (e.type === "icon") {
      rows.push(num("Stroke", "stroke", 0.5, 4, 0.5), this.iconPicker(e));
    } else if (e.type === "qr") {
      rows.push(text("Content", "value"));
    } else if (e.type === "barcode") {
      rows.push(
        text("Value", "value"),
        select("Format", "format", [["CODE128", "Code 128"], ["CODE39", "Code 39"], ["EAN13", "EAN-13"], ["EAN8", "EAN-8"], ["UPC", "UPC-A"], ["ITF14", "ITF-14"]]),
        h("div", { class: "checks" }, check("Show text", "showText", true)),
      );
    } else if (e.type === "rect" || e.type === "ellipse") {
      rows.push(h("div", { class: "grid2" }, num("Border", "border", 0, 60), e.type === "rect" ? num("Radius", "radius", 0, 200) : h("span")), h("div", { class: "checks" }, check("Filled", "fill")));
    }

    rows.push(
      num("Rotate °", "rotate", -360, 360),
      h(
        "div",
        { class: "btnrow" },
        ...(["l", "c", "r", "t", "m", "b"] as const).map((a, i) =>
          h("button", { class: "mini", title: `Align ${["left", "center", "right", "top", "middle", "bottom"][i]}`, onClick: () => this.align(a) }, ["⇤", "↔", "⇥", "⤒", "↕", "⤓"][i]),
        ),
      ),
      h(
        "div",
        { class: "btnrow" },
        h("button", { class: "mini", onClick: () => this.reorder(e.id, 1) }, "Forward"),
        h("button", { class: "mini", onClick: () => this.reorder(e.id, -1) }, "Back"),
        h("button", { class: "mini", onClick: () => this.duplicate(e.id) }, "Duplicate"),
        h("button", { class: "mini danger", onClick: () => this.remove(e.id) }, "Delete"),
      ),
    );
    this.propsEl.replaceChildren(...rows);
  }

  private iconPicker(e: El): HTMLElement {
    const grid = h("div", { class: "icongrid" });
    const search = h("input", { type: "search", placeholder: `Search ${iconNames.length} icons…`, value: "" });
    const fill = async () => {
      const q = search.value.trim().toLowerCase();
      const names = (q ? iconNames.filter((n) => n.includes(q)) : iconNames).slice(0, 80);
      grid.replaceChildren();
      for (const n of names) {
        const b = h("button", { class: "iconbtn" + (e.icon === n ? " sel" : ""), title: n });
        grid.append(b);
        loadIcon(n).then((svg) => {
          b.innerHTML = svg;
          b.addEventListener("click", () => {
            e.icon = n;
            this.refreshAll();
            this.opts.onChange();
          });
        });
      }
    };
    let t: number | undefined;
    search.addEventListener("input", () => {
      clearTimeout(t);
      t = window.setTimeout(fill, 120);
    });
    void fill();
    return h("div", { class: "iconpicker" }, h("label", { class: "field wide" }, h("span", {}, `Icon: ${e.icon}`), search), grid);
  }
}
