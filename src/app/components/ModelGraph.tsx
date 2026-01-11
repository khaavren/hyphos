"use client";

import "reactflow/dist/style.css";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  MiniMap,
  type Node,
  type ReactFlowInstance,
  Position,
  getBezierPath,
  type EdgeProps,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from "reactflow";
import {
  GRAPH_LAYOUT_KEY,
  applySavedLayout,
  defaultEdges,
  defaultNodes,
  type GraphNodeKind,
  type GraphNodeData,
  type GroupNodeData,
} from "../lib/graph/graphSchema";
import { SENSOR_LABELS } from "../lib/graph/sensorMeta";
import type { ModelSettings } from "../lib/graph/valueBridge";
import {
  clearSensorOverrides,
  setAccessibility,
  setBiome,
  setSensorValue,
  subscribeToSnapshots,
  useBackendInfo,
  useModelSettings,
  type Accessibility,
  type BackendInfo,
  type Biome,
  type Sensors,
  type SimulationSnapshot,
} from "../lib/graph/valueBridge";
import styles from "./ModelGraph.module.css";

type GraphNodePayload = GraphNodeData & {
  snapshot?: SimulationSnapshot | null;
};

type GroupNodePayload = GroupNodeData;
type NodeData = GraphNodePayload | GroupNodePayload;
type GraphNode = Node<NodeData>;

const formatValue = (value: number, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : "--";

const biomeOptions: Biome[] = [
  "temperate",
  "boreal",
  "arid",
  "tropical",
  "oceanic",
];

const PORT_ROW_HEIGHT = 26;
const PORT_START_Y = 36;

const getPortDisplayValue = (
  portId: string,
  settings: ModelSettings,
  snapshot: SimulationSnapshot | null | undefined,
  backendInfo: BackendInfo,
) => {
  if (portId in settings.sensors) {
    const key = portId as keyof Sensors;
    const base = snapshot?.sensorsRaw[key] ?? settings.sensors[key];
    return formatValue(base);
  }
  if (portId.endsWith("_sm")) {
    const key = portId.replace("_sm", "") as keyof Sensors;
    return formatValue(snapshot?.sensorsSmoothed[key] ?? 0);
  }
  if (snapshot?.channelsABST && portId in snapshot.channelsABST) {
    return formatValue(
      snapshot.channelsABST[portId as keyof typeof snapshot.channelsABST] ?? 0,
    );
  }
  if (portId === "state") {
    return snapshot?.stateMachine.state ?? "--";
  }
  if (portId === "top3") {
    const top3 =
      snapshot?.plantWeightsClampedTop3
        .filter((entry) => entry.active)
        .map((entry) => entry.name)
        .slice(0, 3) ?? [];
    return top3.length ? top3.join(", ") : "--";
  }
  if (portId in (snapshot?.uniforms ?? {})) {
    return formatValue(
      snapshot?.uniforms[portId as keyof typeof snapshot.uniforms] ?? 0,
    );
  }
  if (portId in (snapshot?.plantWeightsRaw ?? {})) {
    return formatValue(
      snapshot?.plantWeightsRaw[portId as keyof typeof snapshot.plantWeightsRaw] ??
        0,
    );
  }
  if (portId === "biome") {
    return settings.biome;
  }
  if (portId === "access") {
    return `${settings.accessibility.reducedMotion ? "RM" : "--"} ${
      settings.accessibility.colorAgnostic ? "CA" : "--"
    } ${settings.accessibility.photosensitivitySafe ? "PS" : "--"}`;
  }
  if (portId === "backend") {
    return backendInfo.backend;
  }
  return null;
};

const GraphNode = ({ data, selected }: NodeProps<GraphNodePayload>) => {
  const settings = useModelSettings();
  const backendInfo = useBackendInfo();
  const { snapshot } = data;
  const maxRows = Math.max(data.inputs.length, data.outputs.length);
  const previewType = data.preview?.type ?? "none";
  const className = `${styles.graphNode} ${
    selected ? styles.graphNodeSelected : ""
  } ${settings.accessibility.colorAgnostic ? styles.graphNodeAgnostic : ""}`;

  return (
    <div
      className={className}
      data-accent={
        settings.accessibility.colorAgnostic ? "none" : data.accent
      }
    >
      <div className={styles.graphHeader}>
        <div className={styles.graphTitle}>{data.title}</div>
        {previewType !== "none" ? (
          <div className={styles.previewBox} data-type={previewType} />
        ) : null}
      </div>
      <div className={styles.ports}>
        {Array.from({ length: maxRows }).map((_, index) => {
          const input = data.inputs[index];
          const output = data.outputs[index];
          return (
            <div className={styles.portRow} key={`row-${index}`}>
              <div className={styles.portLeft}>
                {input ? (
                  <>
                    <span className={styles.socket} />
                    <span className={styles.portLabel}>{input.label}</span>
                    <span className={styles.portValue}>
                      {getPortDisplayValue(
                        input.id,
                        settings,
                        snapshot,
                        backendInfo,
                      ) ?? "--"}
                    </span>
                  </>
                ) : null}
              </div>
              <div className={styles.portRight}>
                {output ? (
                  <>
                    <span className={styles.portValue}>
                      {getPortDisplayValue(
                        output.id,
                        settings,
                        snapshot,
                        backendInfo,
                      ) ?? "--"}
                    </span>
                    <span className={styles.portLabel}>{output.label}</span>
                    <span className={styles.socket} />
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.body}>
        {renderNodeBody(data.kind, settings, snapshot, backendInfo)}
      </div>
      {data.inputs.map((port, index) => (
        <Handle
          key={`input-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          className={styles.handle}
          style={{
            top: PORT_START_Y + index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2,
            left: 10,
          }}
        />
      ))}
      {data.outputs.map((port, index) => (
        <Handle
          key={`output-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          className={styles.handle}
          style={{
            top: PORT_START_Y + index * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2,
            right: 10,
          }}
        />
      ))}
    </div>
  );
};

const GroupNode = ({ data }: NodeProps<GroupNodePayload>) => (
  <div className={styles.groupNode}>
    <div className={styles.groupHeader}>{data.groupTitle}</div>
  </div>
);

const CableEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <g>
      <path
        id={`${id}-shadow`}
        d={edgePath}
        stroke="rgba(0,0,0,0.2)"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
      />
      <path
        id={id}
        d={edgePath}
        stroke="#2f6cff"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        markerEnd={markerEnd}
      />
    </g>
  );
};

const renderNodeBody = (
  kind: GraphNodeKind,
  settings: ModelSettings,
  snapshot: SimulationSnapshot | null | undefined,
  backendInfo: BackendInfo,
) => {
  switch (kind) {
    case "sensors":
      return (
        <details className={styles.nodeDetails}>
          <summary>Sensor Overrides</summary>
          <div className={styles.nodeControls}>
            <button type="button" onClick={clearSensorOverrides}>
              Clear overrides
            </button>
            {["light", "tempStress", "humidity", "networkDensity"].map((key) => (
              <label key={key} className={styles.nodeControls}>
                <span>
                  {SENSOR_LABELS[key as keyof Sensors]}
                  {settings.sensorOverrideMask[key as keyof Sensors] ? " *" : ""}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={
                    settings.sensorOverrideMask[key as keyof Sensors]
                      ? settings.sensors[key as keyof Sensors]
                      : snapshot?.sensorsRaw[key as keyof Sensors] ??
                        settings.sensors[key as keyof Sensors]
                  }
                  onChange={(event) =>
                    setSensorValue(
                      key as keyof Sensors,
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            ))}
            <div className={styles.bodyMuted}>
              * overridden values stick until cleared.
            </div>
          </div>
        </details>
      );
    case "biome":
      return (
        <div className={styles.nodeControls}>
          <label>
            <span>Current biome</span>
            <select
              value={settings.biome}
              onChange={(event) => setBiome(event.target.value as Biome)}
            >
              {biomeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.bodyMuted}>
            Texture + lighting shifts respond to biome presets.
          </div>
        </div>
      );
    case "accessibility":
      return (
        <div className={styles.nodeControls}>
          {(
            [
              ["reducedMotion", "Reduced Motion"],
              ["colorAgnostic", "Color-Agnostic"],
              ["photosensitivitySafe", "Photosafe"],
            ] as [keyof Accessibility, string][]
          ).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={settings.accessibility[key]}
                onChange={(event) =>
                  setAccessibility({
                    [key]: event.target.checked,
                  } as Partial<Accessibility>)
                }
              />
            </label>
          ))}
        </div>
      );
    case "ema": {
      return (
        <div className={styles.nodeControls}>
          <span>Attack: {formatValue(snapshot?.ema?.attackHalfLife ?? 0)}s</span>
          <span>
            Release: {formatValue(snapshot?.ema?.releaseHalfLife ?? 0)}s
          </span>
        </div>
      );
    }
    case "channels": {
      return (
        <div className={styles.bodyMuted}>
          Channels feed the state machine + clamp weighting.
        </div>
      );
    }
    case "state": {
      const state = snapshot?.stateMachine;
      return state ? (
        <div className={styles.nodeControls}>
          <span>State: {state.state}</span>
          <span>Time: {formatValue(state.timeInState, 1)}s</span>
          <span>Stress: {formatValue(state.stress ?? 0)}</span>
        </div>
      ) : (
        <div className={styles.bodyMuted}>Waiting for state...</div>
      );
    }
    case "clamp": {
      const top3 = snapshot?.plantWeightsClampedTop3 ?? [];
      return (
        <div className={styles.nodeControls}>
          {top3.length ? (
            top3
              .filter((entry) => entry.active)
              .map((entry) => (
                <span key={entry.name}>
                  {entry.name}: {formatValue(entry.weight)}
                </span>
              ))
          ) : (
            <div className={styles.bodyMuted}>No active layers yet.</div>
          )}
        </div>
      );
    }
    case "uniforms": {
      return (
        <div className={styles.nodeControls}>
          <span>Vitality: {formatValue(snapshot?.uniforms.u_vitality ?? 0)}</span>
          <span>
            Stiffness: {formatValue(snapshot?.uniforms.u_stiffness ?? 0)}
          </span>
          <span>
            Temp shift: {formatValue(snapshot?.uniforms.u_tempShift ?? 0)}
          </span>
        </div>
      );
    }
    case "plants": {
      const weights = snapshot?.plantWeightsRaw;
      return weights ? (
        <div className={styles.nodeControls}>
          <span>Veins: {formatValue(weights.veins)}</span>
          <span>Moss: {formatValue(weights.moss)}</span>
          <span>Roots: {formatValue(weights.roots)}</span>
        </div>
      ) : (
        <div className={styles.bodyMuted}>Waiting for plants...</div>
      );
    }
    case "backend": {
      return backendInfo ? (
        <div className={styles.nodeControls}>
          <span>Backend: {backendInfo.backend}</span>
          {backendInfo.warning ? (
            <span>{backendInfo.warning}</span>
          ) : (
            <span className={styles.bodyMuted}>No warnings.</span>
          )}
        </div>
      ) : (
        <div className={styles.bodyMuted}>Awaiting backend...</div>
      );
    }
  }
};

export default function ModelGraph() {
  const [nodes, setNodes, onNodesChange] =
    useNodesState<NodeData>(defaultNodes as GraphNode[]);
  const [edges, , onEdgesChange] = useEdgesState(defaultEdges);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot | null>(null);
  const lastLayoutRef = useRef<string>("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const userInteractedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = window.localStorage.getItem(GRAPH_LAYOUT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          id: string;
          position: { x: number; y: number };
        }[];
        setNodes((current) => applySavedLayout(current, parsed));
        lastLayoutRef.current = saved;
      } catch {
        window.localStorage.removeItem(GRAPH_LAYOUT_KEY);
      }
    }
  }, [setNodes]);

  useEffect(() => {
    const unsubscribe = subscribeToSnapshots((snap) => {
      setSnapshot(snap);
      setNodes((current) =>
        current.map((node) => {
          if ("kind" in node.data) {
            return {
              ...node,
              data: {
                ...node.data,
                snapshot: snap,
              },
            };
          }
          return node;
        }),
      );
    }, 12);
    return unsubscribe;
  }, [setNodes]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const layout = nodes.map((node) => ({
      id: node.id,
      position: node.position,
    }));
    const serialized = JSON.stringify(layout);
    if (serialized !== lastLayoutRef.current) {
      window.localStorage.setItem(GRAPH_LAYOUT_KEY, serialized);
      lastLayoutRef.current = serialized;
    }
  }, [nodes]);

  const resetLayout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(GRAPH_LAYOUT_KEY);
      lastLayoutRef.current = "";
    }
    setNodes(defaultNodes.map((node) => ({ ...node })) as GraphNode[]);
  };

  const nodeTypes = useMemo(
    () => ({
      graphNode: GraphNode,
      groupNode: GroupNode,
    }),
    [],
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (!reactFlowRef.current || userInteractedRef.current) {
        return;
      }
      reactFlowRef.current.fitView({ padding: 0.15, duration: 0 });
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`relative h-full w-full ${styles.graphWrapper}`}
    >
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-xs shadow-lg">
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Symbiosis Graph
        </span>
        <button
          type="button"
          className="rounded-full border border-zinc-200 px-2 py-1 text-[11px]"
          onClick={resetLayout}
        >
          Reset Layout
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={{ cable: CableEdge }}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => {
          reactFlowRef.current = instance;
          instance.fitView({ padding: 0.15, duration: 0 });
        }}
        onMoveStart={() => {
          userInteractedRef.current = true;
        }}
        onNodeDragStart={() => {
          userInteractedRef.current = true;
        }}
        defaultEdgeOptions={{ type: "cable" }}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: "#2f6cff", strokeWidth: 5 }}
        snapToGrid
        snapGrid={[12, 12]}
        fitView
        panOnScroll
      >
        <Background gap={20} size={1} color="#c7c7c7" />
        <MiniMap zoomable pannable />
        <Controls />
      </ReactFlow>
      {!snapshot ? (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-white/90 px-3 py-2 text-xs text-zinc-500 shadow">
          Waiting for live simulation snapshot...
        </div>
      ) : null}
    </div>
  );
}
