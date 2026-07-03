export type AppRoute =
  | { view: "dashboard"; tab: "designs" | "help" | "backup" }
  | { view: "editor"; id: string };

export function parseHashRoute(hash: string): AppRoute {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = raw || "/";
  if (path === "/" || path === "") return { view: "dashboard", tab: "designs" };
  if (path === "/help") return { view: "dashboard", tab: "help" };
  if (path === "/backup") return { view: "dashboard", tab: "backup" };
  const match = path.match(/^\/d\/([^/?#]+)$/);
  if (match) return { view: "editor", id: decodeURIComponent(match[1]) };
  return { view: "dashboard", tab: "designs" };
}

export function dashboardHash(): string {
  return "#/";
}

export function helpHash(): string {
  return "#/help";
}

export function backupHash(): string {
  return "#/backup";
}

export function editorHash(id: string): string {
  return `#/d/${encodeURIComponent(id)}`;
}
