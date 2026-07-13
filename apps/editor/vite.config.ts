import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function appVersion() {
  try {
    const conf = JSON.parse(
      readFileSync(resolve(__dirname, "src-tauri", "tauri.conf.json"), "utf8")
    );
    return String(conf.version || "0.0.0");
  } catch {
    return "0.0.0";
  }
}

// onnxruntime-web loads its WASM glue (.mjs) via dynamic import() at runtime.
// Files in public/ can't be dynamically imported through Vite's dev server
// (it appends ?import and 500s), so in DEV we serve public/ort/* raw with a
// JS mime type. In production the built public copy is served statically and
// no ?import query is added, so this shim is dev-only.
function serveOrtAssets(): Plugin {
  return {
    name: "serve-ort-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || "").split("?")[0];
        if (!url.startsWith("/ort/")) return next();
        try {
          const file = resolve(__dirname, "public", url.replace(/^\//, ""));
          const body = await readFile(file);
          res.setHeader(
            "Content-Type",
            url.endsWith(".wasm") ? "application/wasm" : "text/javascript"
          );
          res.end(body);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig(({ command }) => {
  // Tauri injects TAURI_ENV_* vars for both `tauri dev` and `tauri build`
  // (see beforeDevCommand/beforeBuildCommand in src-tauri/tauri.conf.json,
  // which both shell out to this same `pnpm --filter @youzign/editor
  // build|dev` script). The desktop app loads dist/ from the filesystem via
  // the tauri:// asset protocol at the root, so it must always use base "/".
  //
  // The web deployment (https://youzign.com/editor/ via Vercel rewrite, and
  // https://yz-editor-k4x7.vercel.app/editor/ where files live under an
  // editor/ prefix) needs base "/editor/" so built asset URLs resolve under
  // that sub-path. That's what a plain (non-Tauri) `vite build` — i.e.
  // `pnpm build` for web snapshots — produces.
  //
  // Local `vite`/`vite dev` (command === "serve") always stays at root "/"
  // regardless of Tauri, matching today's dev-server behavior at
  // http://localhost:5191/ (Tauri dev loads http://localhost:1420/index.html
  // directly, so base "/" there too).
  const isTauri = Boolean(process.env.TAURI_ENV_PLATFORM);
  const base = command === "serve" || isTauri ? "/" : "/editor/";

  return {
    base,
    plugins: [serveOrtAssets(), react()],
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion()),
    },
    // Default dev/preview stay on 5191 (the long-lived local server);
    // Tauri dev/preview pass --port 1420 explicitly (see tauri.conf.json).
    server: { port: 5191 },
    preview: { port: 5191 },
  };
});
