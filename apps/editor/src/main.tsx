import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { setupNativeDiagnostics } from "./diagnostics.js";
import { fatalDebugRecord, renderFatalScreen } from "./fatalScreen.js";
import { appendDebugLog } from "./native.js";
import "./index.css";

setupNativeDiagnostics();

try {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root mount element");

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
} catch (err) {
  appendDebugLog(fatalDebugRecord("mount.fatal", err));
  renderFatalScreen(document.body, err);
}
