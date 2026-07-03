export type AppRoute =
  | { view: "dashboard" }
  | { view: "editor"; id: string };

export function parseHashRoute(hash: string): AppRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw || "/";
  if (path === "/" || path === "") return { view: "dashboard" };
  const match = path.match(/^\/d\/([^/?#]+)$/);
  if (match) return { view: "editor", id: decodeURIComponent(match[1]) };
  return { view: "dashboard" };
}

export function dashboardHash(): string {
  return "#/";
}

export function editorHash(id: string): string {
  return `#/d/${encodeURIComponent(id)}`;
}
