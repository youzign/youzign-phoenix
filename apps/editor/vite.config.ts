import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  server: { port: 5191, strictPort: true },
  preview: { port: 5191, strictPort: true },
});
