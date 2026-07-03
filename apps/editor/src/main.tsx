import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { setupNativeDiagnostics } from "./diagnostics.js";
import "./index.css";

setupNativeDiagnostics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
