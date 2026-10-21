// Lucide icons, lazy-loaded one chunk per icon.
const loaders = import.meta.glob("/node_modules/lucide-static/icons/*.svg", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const byName = new Map<string, () => Promise<string>>();
for (const [path, load] of Object.entries(loaders)) {
  byName.set(path.split("/").pop()!.replace(/\.svg$/, ""), load);
}

export const iconNames = [...byName.keys()].sort();

const cache = new Map<string, string>();

/** Returns the raw <svg> markup for a Lucide icon, or "" if unknown. */
export async function loadIcon(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const load = byName.get(name);
  const svg = load ? await load() : "";
  cache.set(name, svg);
  return svg;
}
