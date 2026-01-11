import type { Edge, Node } from "reactflow";

export const GRAPH_LAYOUT_KEY = "symbiosis-graph-layout";

export type GraphNodeKind =
  | "sensors"
  | "biome"
  | "accessibility"
  | "ema"
  | "channels"
  | "state"
  | "clamp"
  | "uniforms"
  | "plants"
  | "backend";

export type PortDefinition = {
  id: string;
  label: string;
};

export type NodeAccent = "none" | "orange" | "red" | "black";

export type NodePreview = {
  type: "none" | "image" | "canvas";
  label?: string;
};

export type GraphNodeData = {
  title: string;
  kind: GraphNodeKind;
  accent: NodeAccent;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  preview?: NodePreview;
};

export type GroupNodeData = {
  groupTitle: string;
};

export const defaultNodes: Node<GraphNodeData | GroupNodeData>[] = [
  {
    id: "group-inputs",
    type: "groupNode",
    position: { x: 20, y: 20 },
    data: {
      groupTitle: "Sub-material #1",
    },
    style: {
      width: 320,
      height: 520,
    },
  },
  {
    id: "group-processing",
    type: "groupNode",
    position: { x: 380, y: 20 },
    data: {
      groupTitle: "Sub-material #2",
    },
    style: {
      width: 480,
      height: 520,
    },
  },
  {
    id: "group-outputs",
    type: "groupNode",
    position: { x: 900, y: 20 },
    data: {
      groupTitle: "Sub-material #3",
    },
    style: {
      width: 420,
      height: 520,
    },
  },
  {
    id: "sensors",
    type: "graphNode",
    position: { x: 20, y: 60 },
    parentNode: "group-inputs",
    extent: "parent",
    data: {
      title: "Sensor Proxy",
      kind: "sensors",
      accent: "orange",
      inputs: [],
      outputs: [
        { id: "light", label: "Light" },
        { id: "tempStress", label: "Temp Stress" },
        { id: "humidity", label: "Humidity" },
        { id: "wind", label: "Wind" },
        { id: "networkDensity", label: "Network" },
        { id: "mobility", label: "Mobility" },
      ],
    },
  },
  {
    id: "biome",
    type: "graphNode",
    position: { x: 20, y: 280 },
    parentNode: "group-inputs",
    extent: "parent",
    data: {
      title: "Biome",
      kind: "biome",
      accent: "none",
      inputs: [],
      outputs: [{ id: "biome", label: "Biome" }],
      preview: { type: "canvas" },
    },
  },
  {
    id: "accessibility",
    type: "graphNode",
    position: { x: 20, y: 400 },
    parentNode: "group-inputs",
    extent: "parent",
    data: {
      title: "Accessibility",
      kind: "accessibility",
      accent: "none",
      inputs: [],
      outputs: [{ id: "access", label: "Access" }],
    },
  },
  {
    id: "ema",
    type: "graphNode",
    position: { x: 20, y: 60 },
    parentNode: "group-processing",
    extent: "parent",
    data: {
      title: "EMA Smoothing",
      kind: "ema",
      accent: "black",
      inputs: [
        { id: "light", label: "Light" },
        { id: "tempStress", label: "Temp Stress" },
        { id: "humidity", label: "Humidity" },
        { id: "networkDensity", label: "Network" },
      ],
      outputs: [
        { id: "light_sm", label: "Light Sm" },
        { id: "tempStress_sm", label: "Temp Sm" },
        { id: "humidity_sm", label: "Humidity Sm" },
        { id: "networkDensity_sm", label: "Network Sm" },
      ],
    },
  },
  {
    id: "channels",
    type: "graphNode",
    position: { x: 20, y: 240 },
    parentNode: "group-processing",
    extent: "parent",
    data: {
      title: "Channels A/B/S/T",
      kind: "channels",
      accent: "none",
      inputs: [
        { id: "light_sm", label: "Light Sm" },
        { id: "humidity_sm", label: "Humidity Sm" },
        { id: "tempStress_sm", label: "Temp Sm" },
        { id: "networkDensity_sm", label: "Network Sm" },
      ],
      outputs: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
        { id: "S", label: "S" },
        { id: "T", label: "T" },
      ],
    },
  },
  {
    id: "state",
    type: "graphNode",
    position: { x: 250, y: 60 },
    parentNode: "group-processing",
    extent: "parent",
    data: {
      title: "State Machine",
      kind: "state",
      accent: "red",
      inputs: [
        { id: "S", label: "S" },
        { id: "T", label: "T" },
      ],
      outputs: [{ id: "state", label: "State" }],
    },
  },
  {
    id: "clamp",
    type: "graphNode",
    position: { x: 250, y: 240 },
    parentNode: "group-processing",
    extent: "parent",
    data: {
      title: "Top-3 Clamp",
      kind: "clamp",
      accent: "none",
      inputs: [
        { id: "A", label: "A" },
        { id: "B", label: "B" },
        { id: "S", label: "S" },
        { id: "T", label: "T" },
      ],
      outputs: [{ id: "top3", label: "Top-3" }],
    },
  },
  {
    id: "uniforms",
    type: "graphNode",
    position: { x: 20, y: 60 },
    parentNode: "group-outputs",
    extent: "parent",
    data: {
      title: "Shader Uniforms",
      kind: "uniforms",
      accent: "black",
      inputs: [
        { id: "biome", label: "Biome" },
        { id: "access", label: "Access" },
        { id: "state", label: "State" },
        { id: "top3", label: "Top-3" },
        { id: "A", label: "A" },
        { id: "B", label: "B" },
        { id: "S", label: "S" },
        { id: "T", label: "T" },
      ],
      outputs: [
        { id: "u_vitality", label: "Vitality" },
        { id: "u_stiffness", label: "Stiffness" },
        { id: "u_tempShift", label: "Temp Shift" },
      ],
      preview: { type: "image" },
    },
  },
  {
    id: "plants",
    type: "graphNode",
    position: { x: 20, y: 240 },
    parentNode: "group-outputs",
    extent: "parent",
    data: {
      title: "Plant Layers",
      kind: "plants",
      accent: "none",
      inputs: [{ id: "top3", label: "Top-3" }],
      outputs: [
        { id: "veins", label: "Veins" },
        { id: "moss", label: "Moss" },
        { id: "roots", label: "Roots" },
      ],
    },
  },
  {
    id: "backend",
    type: "graphNode",
    position: { x: 20, y: 400 },
    parentNode: "group-outputs",
    extent: "parent",
    data: {
      title: "Renderer Backend",
      kind: "backend",
      accent: "none",
      inputs: [{ id: "u_vitality", label: "Vitality" }],
      outputs: [],
    },
  },
];

export const defaultEdges: Edge[] = [
  {
    id: "e-sensors-ema-light",
    source: "sensors",
    target: "ema",
    sourceHandle: "light",
    targetHandle: "light",
    type: "cable",
  },
  {
    id: "e-sensors-ema-temp",
    source: "sensors",
    target: "ema",
    sourceHandle: "tempStress",
    targetHandle: "tempStress",
    type: "cable",
  },
  {
    id: "e-sensors-ema-humidity",
    source: "sensors",
    target: "ema",
    sourceHandle: "humidity",
    targetHandle: "humidity",
    type: "cable",
  },
  {
    id: "e-sensors-ema-network",
    source: "sensors",
    target: "ema",
    sourceHandle: "networkDensity",
    targetHandle: "networkDensity",
    type: "cable",
  },
  {
    id: "e-ema-channels-light",
    source: "ema",
    target: "channels",
    sourceHandle: "light_sm",
    targetHandle: "light_sm",
    type: "cable",
  },
  {
    id: "e-ema-channels-temp",
    source: "ema",
    target: "channels",
    sourceHandle: "tempStress_sm",
    targetHandle: "tempStress_sm",
    type: "cable",
  },
  {
    id: "e-ema-channels-humidity",
    source: "ema",
    target: "channels",
    sourceHandle: "humidity_sm",
    targetHandle: "humidity_sm",
    type: "cable",
  },
  {
    id: "e-ema-channels-network",
    source: "ema",
    target: "channels",
    sourceHandle: "networkDensity_sm",
    targetHandle: "networkDensity_sm",
    type: "cable",
  },
  {
    id: "e-biome-uniforms",
    source: "biome",
    target: "uniforms",
    sourceHandle: "biome",
    targetHandle: "biome",
    type: "cable",
  },
  {
    id: "e-access-uniforms",
    source: "accessibility",
    target: "uniforms",
    sourceHandle: "access",
    targetHandle: "access",
    type: "cable",
  },
  {
    id: "e-channels-state-s",
    source: "channels",
    target: "state",
    sourceHandle: "S",
    targetHandle: "S",
    type: "cable",
  },
  {
    id: "e-channels-state-t",
    source: "channels",
    target: "state",
    sourceHandle: "T",
    targetHandle: "T",
    type: "cable",
  },
  {
    id: "e-channels-clamp-a",
    source: "channels",
    target: "clamp",
    sourceHandle: "A",
    targetHandle: "A",
    type: "cable",
  },
  {
    id: "e-channels-clamp-b",
    source: "channels",
    target: "clamp",
    sourceHandle: "B",
    targetHandle: "B",
    type: "cable",
  },
  {
    id: "e-channels-clamp-s",
    source: "channels",
    target: "clamp",
    sourceHandle: "S",
    targetHandle: "S",
    type: "cable",
  },
  {
    id: "e-channels-clamp-t",
    source: "channels",
    target: "clamp",
    sourceHandle: "T",
    targetHandle: "T",
    type: "cable",
  },
  {
    id: "e-state-uniforms",
    source: "state",
    target: "uniforms",
    sourceHandle: "state",
    targetHandle: "state",
    type: "cable",
  },
  {
    id: "e-clamp-uniforms",
    source: "clamp",
    target: "uniforms",
    sourceHandle: "top3",
    targetHandle: "top3",
    type: "cable",
  },
  {
    id: "e-clamp-plants",
    source: "clamp",
    target: "plants",
    sourceHandle: "top3",
    targetHandle: "top3",
    type: "cable",
  },
  {
    id: "e-channels-uniforms-a",
    source: "channels",
    target: "uniforms",
    sourceHandle: "A",
    targetHandle: "A",
    type: "cable",
  },
  {
    id: "e-channels-uniforms-b",
    source: "channels",
    target: "uniforms",
    sourceHandle: "B",
    targetHandle: "B",
    type: "cable",
  },
  {
    id: "e-channels-uniforms-s",
    source: "channels",
    target: "uniforms",
    sourceHandle: "S",
    targetHandle: "S",
    type: "cable",
  },
  {
    id: "e-channels-uniforms-t",
    source: "channels",
    target: "uniforms",
    sourceHandle: "T",
    targetHandle: "T",
    type: "cable",
  },
  {
    id: "e-uniforms-backend",
    source: "uniforms",
    target: "backend",
    sourceHandle: "u_vitality",
    targetHandle: "u_vitality",
    type: "cable",
  },
];

export const applySavedLayout = (
  nodes: Node<GraphNodeData | GroupNodeData>[],
  saved: { id: string; position: { x: number; y: number } }[],
) => {
  const lookup = new Map(saved.map((entry) => [entry.id, entry.position]));
  return nodes.map((node) => {
    const position = lookup.get(node.id);
    if (!position) {
      return node;
    }
    return {
      ...node,
      position,
    };
  });
};
