// Resolves a root-relative public/ asset path (e.g. "/brand/logo.png") against
// the app's configured base path (import.meta.env.BASE_URL), so assets keep
// working whether the app is served at domain root ("/", Tauri/dev) or under
// a sub-path such as "/editor/" (the youzign.com web deployment).
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const trimmedBase = base.endsWith("/") ? base : `${base}/`;
  const trimmedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${trimmedBase}${trimmedPath}`;
}
