"use client";

import { useState } from "react";
import SplitPane from "./components/layout/SplitPane";
import VSplitPane from "./components/layout/VSplitPane";
import { usePersistentLayout } from "./components/layout/usePersistentLayout";
import ModelGraph from "./components/ModelGraph";
import SimulationControls from "./components/SimulationControls";
import SymbiotePanel from "./components/SymbiotePanel";
import TracesPanel from "./components/TracesPanel";

const tabs = ["controls", "symbiote", "graph", "traces"] as const;
type TabId = (typeof tabs)[number];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export default function Home() {
  const [tab, setTab] = useState<TabId>("controls");
  const [splitRatio, setSplitRatio] = usePersistentLayout(
    "layout.splitRatio",
    0.6,
    {
      parse: (raw) => {
        const value = Number(raw);
        return Number.isFinite(value) ? clamp(value, 0.2, 0.8) : 0.6;
      },
      serialize: (value) => value.toString(),
    },
  );
  const [rightSplitRatio, setRightSplitRatio] = usePersistentLayout(
    "layout.rightSplitRatio",
    0.7,
    {
      parse: (raw) => {
        const value = Number(raw);
        return Number.isFinite(value) ? clamp(value, 0.3, 0.8) : 0.7;
      },
      serialize: (value) => value.toString(),
    },
  );
  const [tracesCollapsed, setTracesCollapsed] = usePersistentLayout(
    "layout.tracesCollapsed",
    false,
    {
      parse: (raw) => raw === "true",
      serialize: (value) => (value ? "true" : "false"),
    },
  );

  return (
    <main className="h-screen w-screen overflow-hidden bg-zinc-100 text-zinc-900">
      <div className="hidden h-full w-full md:block">
        <SplitPane
          ratio={splitRatio}
          onRatioChange={setSplitRatio}
          minLeft={420}
          minRight={340}
        >
          <section className="flex h-full flex-col gap-4 p-4">
            <div className="min-h-[420px] flex-1 overflow-hidden">
              <SymbiotePanel />
            </div>
            <div className="min-h-[360px] overflow-hidden">
              <SimulationControls />
            </div>
          </section>
          <aside className="flex h-full flex-col border-l border-zinc-200 p-4">
            <VSplitPane
              ratio={rightSplitRatio}
              onRatioChange={setRightSplitRatio}
              minTop={220}
              minBottom={140}
              collapsed={tracesCollapsed}
              collapsedSize={44}
            >
              <div className="h-full overflow-hidden">
                <ModelGraph />
              </div>
              <div className="h-full overflow-hidden">
                <TracesPanel
                  collapsed={tracesCollapsed}
                  onToggleCollapsed={() =>
                    setTracesCollapsed((prev) => !prev)
                  }
                />
              </div>
            </VSplitPane>
          </aside>
        </SplitPane>
      </div>

      <div className="flex h-full w-full flex-col md:hidden">
        <div className="sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-zinc-200 bg-white/90 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          <span>Symbiosis Panels</span>
          <div className="flex gap-2 text-[10px] normal-case">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-full border px-3 py-1 ${
                  tab === item
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {tab === "controls" ? <SimulationControls /> : null}
          {tab === "symbiote" ? <SymbiotePanel /> : null}
          {tab === "graph" ? <ModelGraph /> : null}
          {tab === "traces" ? (
            <TracesPanel
              collapsed={tracesCollapsed}
              onToggleCollapsed={() =>
                setTracesCollapsed((prev) => !prev)
              }
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
