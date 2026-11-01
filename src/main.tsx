import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Moon,
  Sun,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  FlaskConical,
  RotateCcw,
} from "lucide-react";
import { RichResponse } from "./ui/RichResponse";
import { demos, type DemoName } from "./demo/fixtures";
import "./demo/lab.css";
import { PrimitiveDemo } from "./demo/PrimitiveDemo";
import { DiagnosticDemo } from "./demo/DiagnosticDemo";
type LabDemo = DemoName | "primitives" | "diagnostic";
const labels: Record<LabDemo, string> = {
  dashboard: "Dashboard and metrics",
  apps: "App shortlist",
  technical: "Technical breakdown",
  films: "Film picks",
  listing: "Product listing",
  calculator: "Local calculations",
  configurator: "Reactive form",
  pool: "Architecture layers",
  primitives: "Tooltips and gallery",
  diagnostic: "Contract error",
};
function App() {
  const initial = new URLSearchParams(location.search);
  const [demo, setDemo] = useState<LabDemo>(
    (initial.get("demo") as LabDemo) in labels
      ? (initial.get("demo") as LabDemo)
      : "films",
  );
  const [theme, setTheme] = useState(initial.get("theme") ?? "light");
  const [sidebar, setSidebar] = useState(true);
  const [revision, setRevision] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  return (
    <div className="lab" data-theme={theme}>
      <aside className={`lab-sidebar ${sidebar ? "" : "is-hidden"}`}>
        <a className="lab-brand" href="/">
          Rich UI <span>LAB</span>
        </a>
        <p className="lab-section-label">SCENARIOS</p>
        <nav>
          {(Object.keys(labels) as LabDemo[]).map((k) => (
            <button
              key={k}
              aria-current={demo === k ? "page" : undefined}
              onClick={() => {
                setDemo(k);
                history.replaceState(null, "", `?demo=${k}&theme=${theme}`);
              }}
            >
              <MessageSquare size={15} />
              {labels[k]}
            </button>
          ))}
        </nav>
        <div className="lab-sidebar-bottom">
          <FlaskConical size={16} />
          <span>
            Isolated laboratory
            <br />
            <small>The main Harness is untouched</small>
          </span>
        </div>
      </aside>
      <div className="lab-workspace">
        <header className="lab-header">
          <button
            aria-label="Toggle menu"
            onClick={() => setSidebar(!sidebar)}
          >
            {sidebar ? (
              <PanelLeftClose size={19} />
            ) : (
              <PanelLeftOpen size={19} />
            )}
          </button>
          <span>
            Rich responses{" "}
            <span className="lab-version">0.2 · development</span>
          </span>
          <div className="lab-header-actions">
            <button
              aria-label="Reset demo"
              onClick={() => setRevision((x) => x + 1)}
            >
              <RotateCcw size={16} />
            </button>
            <button
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <a
              href="https://github.com/kyoukisu/dsh-rich-ui"
              target="_blank"
              rel="noopener noreferrer"
            >
              Repository <ArrowUpRight size={14} />
            </a>
          </div>
        </header>
        <main>
          <div className="lab-context">
            <span className="lab-dot" />
            Real renderer · local interactivity
          </div>
          <div className="lab-user">
            {demo === "films"
              ? "Pick a science fiction film for tonight. I want posters and details right here."
              : demo === "technical"
                ? "Why does the program still hang after the context is cancelled?"
                : demo === "calculator"
                  ? "Show how the capital grows with different amount, rate and term."
                  : demo === "listing"
                    ? "Compare electric kettles: prices, capacity and features."
                    : demo === "dashboard"
                      ? "Build a launch dashboard: metrics, a chart, a work plan and a request flow."
                      : demo === "diagnostic"
                        ? "Why did the block fail to render and what do I do now?"
                        : demo === "pool"
                          ? "Explain what *sql.DB really is and how the pool works."
                          : "Build a small configurator with a live preview."}
          </div>
          <article className="lab-answer">
            {demo === "primitives" ? (
              <PrimitiveDemo key={revision} />
            ) : demo === "diagnostic" ? (
              <DiagnosticDemo />
            ) : (
              <RichResponse
                key={`${demo}-${revision}`}
                spec={demos[demo]}
                onAction={(action, payload) =>
                  setEvents((e) => [...e, JSON.stringify({ action, payload })])
                }
              />
            )}
          </article>
          {events.length > 0 && (
            <details className="lab-events">
              <summary>Integration events</summary>
              <pre>{events.join("\n")}</pre>
            </details>
          )}
          <footer className="lab-footer">
            This is the plugin's live lab, not a screenshot or a generated
            image.
            <br />
            Data is illustrative. Code changes hot-reload through Vite HMR.
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
