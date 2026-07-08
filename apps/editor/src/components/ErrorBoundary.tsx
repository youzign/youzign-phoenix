import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import { appendDebugLog } from "../native.js";
import { DEBUG_LOG_HELP, fatalDebugRecord, fatalErrorDetails } from "../fatalScreen.js";

type Props = {
  children: ReactNode;
};

type State = {
  error: unknown | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    appendDebugLog({
      ...fatalDebugRecord("render.fatal", error),
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const error = fatalErrorDetails(this.state.error);
    return (
      <main style={styles.shell}>
        <section style={styles.panel}>
          <h1 style={styles.heading}>Youzign couldn't start</h1>
          <pre style={styles.error}>{`${error.name}: ${error.message}`}</pre>
          <p style={styles.copy}>{DEBUG_LOG_HELP}</p>
        </section>
      </main>
    );
  }
}

const styles = {
  shell: {
    minHeight: "100vh",
    margin: 0,
    boxSizing: "border-box",
    background: "#101014",
    color: "#f7f7fb",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  panel: {
    maxWidth: 680,
    width: "100%",
  },
  heading: {
    fontSize: 28,
    lineHeight: 1.2,
    margin: "0 0 16px",
  },
  error: {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#1d1d24",
    border: "1px solid #34343d",
    borderRadius: 8,
    padding: 16,
    margin: "0 0 16px",
    color: "#ffffff",
    font: "14px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  copy: {
    fontSize: 15,
    lineHeight: 1.6,
    margin: 0,
    color: "#c9c9d4",
  },
} satisfies Record<string, CSSProperties>;
