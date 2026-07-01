import { useMemo, useState } from "react";
import { parse } from "@youzign/designstring";
import { DesignCanvas } from "@youzign/renderer";
import inputXml from "./fixtures/mountains-input.xml?raw";
import outputXml from "./fixtures/mountains-output.xml?raw";
import clipartLocalXml from "./fixtures/clipart-local.xml?raw";

const FIXTURES: Record<string, string> = {
  "mountains-input.xml": inputXml,
  "mountains-output.xml": outputXml,
  "clipart-local.xml": clipartLocalXml,
};

export function App() {
  const [fixture, setFixture] = useState("mountains-input.xml");
  const [zoom, setZoom] = useState(0.6);
  const [showXml, setShowXml] = useState(false);

  const xml = FIXTURES[fixture];
  const design = useMemo(() => parse(xml), [xml]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-neutral-800 bg-neutral-900 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide text-neutral-200">
          Youzign Next · designstring viewer
        </h1>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          Fixture
          <select
            className="rounded bg-neutral-800 px-2 py-1 text-neutral-100"
            value={fixture}
            onChange={(e) => setFixture(e.target.value)}
          >
            {Object.keys(FIXTURES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          Zoom {zoom.toFixed(2)}
          <input
            type="range"
            min={0.1}
            max={1.5}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={showXml}
            onChange={(e) => setShowXml(e.target.checked)}
          />
          Show XML source
        </label>
        <span className="ml-auto text-xs text-neutral-500">
          {design.canvasWidth}×{design.canvasHeight} · {design.templateType}
        </span>
      </header>

      <main className="flex min-h-0 flex-1">
        <div className="flex-1 overflow-auto p-8">
          <div className="inline-block shadow-2xl ring-1 ring-neutral-700">
            <DesignCanvas design={design} zoom={zoom} />
          </div>
        </div>
        {showXml && (
          <pre className="w-[42%] overflow-auto border-l border-neutral-800 bg-neutral-950 p-4 text-[11px] leading-relaxed text-neutral-300">
            {xml}
          </pre>
        )}
      </main>
    </div>
  );
}
