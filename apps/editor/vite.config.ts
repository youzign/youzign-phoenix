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

export default defineConfig({
  plugins: [serveOrtAssets(), react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion()),
  },
  // Default dev/preview stay on 5191 (the long-lived local server);
  // Tauri dev/preview pass --port 1420 explicitly (see tauri.conf.json).
  server: { port: 5191 },
  preview: { port: 5191 },
});
