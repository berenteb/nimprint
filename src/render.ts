import qrcode from "qrcode-generator";
import JsBarcode from "jsbarcode";
import { loadIcon } from "./icons";

export interface RenderOptions {
  width: number;
  height: number;
  threshold: number; // 0..255, pixels darker than this become black
  dither: boolean;
  invert: boolean;
}

const SVGNS = "http://www.w3.org/2000/svg";

const ROOT_STYLE = (w: number, h: number) =>
  `position:relative;box-sizing:border-box;width:${w}px;height:${h}px;overflow:hidden;` +
  `background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.2;`;

function svgFromString(markup: string): SVGElement | null {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGElement | null;
}

/** Copy generic attributes (style, class, data-*, id) from a custom tag onto its SVG replacement. */
function carryAttrs(from: Element, to: Element, skip: string[]) {
  for (const a of Array.from(from.attributes)) {
    if (skip.includes(a.name)) continue;
    if (a.name === "style") to.setAttribute("style", (to.getAttribute("style") ?? "") + ";" + a.value);
    else to.setAttribute(a.name, a.value);
  }
}

async function resolveCustomTags(root: ParentNode) {
  for (const el of Array.from(root.querySelectorAll("qr"))) {
    const value = el.getAttribute("value") ?? "";
    const size = parseFloat(el.getAttribute("size") ?? "100");
    const ecc = (el.getAttribute("ecc") ?? "M").toUpperCase() as "L" | "M" | "Q" | "H";
    const margin = parseInt(el.getAttribute("margin") ?? "0", 10);
    let svg: SVGElement;
    try {
      const qr = qrcode(0, ecc);
      qr.addData(value || " ");
      qr.make();
      const n = qr.getModuleCount();
      let d = "";
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
          if (qr.isDark(y, x)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
      const total = n + margin * 2;
      svg = svgFromString(
        `<svg xmlns="${SVGNS}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" ` +
          `style="display:block;width:${size}px;height:${size}px"><path d="${d}" fill="#000"/></svg>`,
      )!;
    } catch {
      svg = svgFromString(`<svg xmlns="${SVGNS}" width="${size}" height="${size}"/>`)!;
    }
    carryAttrs(el, svg, ["value", "size", "ecc", "margin"]);
    el.replaceWith(svg);
  }

  for (const el of Array.from(root.querySelectorAll("barcode"))) {
    const value = el.getAttribute("value") ?? "";
    const svg = document.createElementNS(SVGNS, "svg") as SVGSVGElement;
    try {
      JsBarcode(svg, value || " ", {
        format: el.getAttribute("format") ?? "CODE128",
        height: parseFloat(el.getAttribute("height") ?? "60"),
        width: parseFloat(el.getAttribute("module") ?? "2"),
        displayValue: el.getAttribute("text") !== "false",
        fontSize: parseFloat(el.getAttribute("fontsize") ?? "16"),
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      svg.setAttribute("width", "10");
      svg.setAttribute("height", "10");
    }
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("style", "display:block");
    carryAttrs(el, svg, ["value", "format", "height", "module", "text", "fontsize"]);
    el.replaceWith(svg);
  }

  for (const el of Array.from(root.querySelectorAll("icon"))) {
    const name = el.getAttribute("name") ?? "";
    const size = parseFloat(el.getAttribute("size") ?? "48");
    const stroke = el.getAttribute("stroke") ?? "2";
    const markup = await loadIcon(name);
    const svg = markup
      ? svgFromString(markup)!
      : svgFromString(`<svg xmlns="${SVGNS}" viewBox="0 0 24 24"/>`)!;
    svg.removeAttribute("class");
    svg.setAttribute("stroke-width", stroke);
    svg.setAttribute("stroke", "#000");
    svg.setAttribute("style", `display:block;width:${size}px;height:${size}px`);
    carryAttrs(el, svg, ["name", "size", "stroke"]);
    el.replaceWith(svg);
  }
}

function fitText(root: ParentNode) {
  root.querySelectorAll<HTMLElement>("[data-fit]").forEach((el) => {
    const max = parseFloat(el.getAttribute("data-fit-max") ?? "") || parseFloat(getComputedStyle(el).fontSize);
    const min = parseFloat(el.getAttribute("data-fit-min") ?? "") || 6;
    const fits = () => el.scrollWidth <= el.clientWidth + 0.5 && el.scrollHeight <= el.clientHeight + 0.5;
    let lo = min, hi = max;
    el.style.fontSize = `${hi}px`;
    if (fits()) return;
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      if (fits()) lo = mid; else hi = mid;
    }
    el.style.fontSize = `${lo}px`;
  });
}

/** Turns filled template HTML into a self-contained XHTML string (custom tags resolved, text fitted). */
async function prepare(html: string, w: number, h: number): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  await resolveCustomTags(doc);

  const host = document.createElement("div");
  host.style.cssText = `all:initial;position:fixed;left:-100000px;top:0;width:${w}px;height:${h}px;`;
  const shadow = host.attachShadow({ mode: "open" });
  const root = document.createElement("div");
  root.setAttribute("style", ROOT_STYLE(w, h));
  // head <style> blocks + body content
  root.innerHTML = Array.from(doc.head.querySelectorAll("style")).map((s) => s.outerHTML).join("") + doc.body.innerHTML;
  root.querySelectorAll("script").forEach((s) => s.remove());
  shadow.appendChild(root);
  document.body.appendChild(host);
  try {
    fitText(root);
    return new XMLSerializer().serializeToString(root);
  } finally {
    host.remove();
  }
}

async function rasterize(xhtml: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const svg =
    `<svg xmlns="${SVGNS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

/** In-place conversion to pure black/white. */
export function binarize(c: HTMLCanvasElement, threshold: number, dither: boolean, invert: boolean) {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = c;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3] / 255;
    // composite on white
    const r = d[i * 4] * a + 255 * (1 - a);
    const g = d[i * 4 + 1] * a + 255 * (1 - a);
    const b = d[i * 4 + 2] * a + 255 * (1 - a);
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = lum[i];
      const black = old < threshold;
      if (dither) {
        const err = old - (black ? 0 : 255);
        if (x + 1 < w) lum[i + 1] += (err * 7) / 16;
        if (y + 1 < h) {
          if (x > 0) lum[i + w - 1] += (err * 3) / 16;
          lum[i + w] += (err * 5) / 16;
          if (x + 1 < w) lum[i + w + 1] += err / 16;
        }
      }
      const v = black !== invert ? 0 : 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Render already-filled template HTML to a 1-bit canvas of the given size (px == dots). */
export async function renderLabel(html: string, o: RenderOptions): Promise<HTMLCanvasElement> {
  const xhtml = await prepare(html, o.width, o.height);
  const canvas = await rasterize(xhtml, o.width, o.height);
  binarize(canvas, o.threshold, o.dither, o.invert);
  return canvas;
}

