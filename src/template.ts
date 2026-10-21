// Template format
//
// A template is plain HTML (fragment or full document) for a monochrome label.
// 1 CSS px == 1 printer dot (203 dpi, 8 dots per mm). Optional pieces:
//   {{name}} / {{name|default}}  parameter placeholders (HTML-escaped on insert)
//   data-if="name"                element is dropped when the parameter is empty
//   data-fit                      shrink font-size until the text fits its box
//   <qr> <barcode> <icon>         custom tags, resolved to inline SVG
//   <script type="application/nimprint+json">{ name, size, params }</script>

export type ParamType = "text" | "textarea" | "number" | "select" | "checkbox";

export interface ParamDef {
  key: string;
  label: string;
  type: ParamType;
  default: string;
  options?: string[];
}

export interface TemplateMeta {
  name?: string;
  /** label size in mm */
  size?: { width: number; height: number };
  params?: Record<string, Partial<Omit<ParamDef, "key">>>;
}

export const META_TYPE = "application/nimprint+json";
const PLACEHOLDER = /\{\{\s*([\w.-]+)\s*(?:\|([^}]*))?\}\}/g;

export function readMeta(html: string): TemplateMeta {
  const m = html.match(
    /<script[^>]*type=["']application\/nimprint\+json["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return {};
  try {
    return JSON.parse(m[1]) as TemplateMeta;
  } catch {
    return {};
  }
}

export function stripMeta(html: string): string {
  return html.replace(
    /<script[^>]*type=["']application\/nimprint\+json["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

/** Find parameters in document order, merged with metadata. */
export function discoverParams(html: string): ParamDef[] {
  const meta = readMeta(html);
  const found = new Map<string, ParamDef>();
  const add = (key: string, inline?: string) => {
    const m = meta.params?.[key] ?? {};
    const prev = found.get(key);
    found.set(key, {
      key,
      label: m.label ?? prev?.label ?? key,
      type: m.type ?? prev?.type ?? "text",
      default: m.default ?? prev?.default ?? inline?.trim() ?? "",
      options: m.options ?? prev?.options,
    });
  };
  const body = stripMeta(html);
  for (const match of body.matchAll(PLACEHOLDER)) add(match[1], match[2]);
  for (const match of body.matchAll(/data-if=["']([\w.-]+)["']/g)) add(match[1]);
  // declared-but-unused params still get a field
  for (const key of Object.keys(meta.params ?? {})) if (!found.has(key)) add(key);
  return [...found.values()];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fillTemplate(
  html: string,
  values: Record<string, string>,
  params: ParamDef[],
): string {
  const types = new Map(params.map((p) => [p.key, p.type]));
  let out = stripMeta(html).replace(PLACEHOLDER, (_all, key: string, inline?: string) => {
    const v = values[key] ?? inline?.trim() ?? "";
    const safe = esc(v);
    return types.get(key) === "textarea" ? safe.replace(/\r?\n/g, "<br>") : safe;
  });
  // data-if: drop elements whose parameter is empty / "0" / "false"
  const falsy = (k: string) => {
    const v = (values[k] ?? "").trim().toLowerCase();
    return v === "" || v === "0" || v === "false";
  };
  if (/data-if=/.test(out)) {
    const doc = new DOMParser().parseFromString(out, "text/html");
    doc.querySelectorAll("[data-if]").forEach((el) => {
      if (falsy(el.getAttribute("data-if")!)) el.remove();
    });
    out = doc.head.innerHTML + doc.body.innerHTML;
  }
  return out;
}

export function defaultValues(params: ParamDef[]): Record<string, string> {
  return Object.fromEntries(params.map((p) => [p.key, p.default]));
}

/** Minimal RFC-4180-ish CSV/TSV parser. First row = header. */
export function parseCsv(text: string): Record<string, string>[] {
  const delim = text.split("\n")[0]?.includes("\t") ? "\t" : text.split("\n")[0]?.includes(";") && !text.split("\n")[0].includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
