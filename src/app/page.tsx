'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Genome, Environment, Phenotype } from "../lib/simulation/types";
import { createInitialGenome } from "../lib/simulation/genome";
import { createCycleEnvironment } from "../lib/simulation/environment";
import { runCycle } from "../lib/simulation/evolution";
import { computeBiomeFitness } from "../lib/simulation/biomeConstraints";
import { classifyCreature, derivePhenotype } from "../lib/simulation/phenotype";
import { assembleOrganism } from "../lib/rendering/assembler";
import { RenderNode } from "../lib/rendering/types";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import OrganismSDF from "./components/OrganismSDF";
import EnvironmentRenderer from "./components/EnvironmentRenderer";
import ScaleReference from "./components/ScaleReference";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const INITIAL_ENVIRONMENT: Environment = {
  temperature: 0,
  humidity: 0.5,
  wind: 0.2,
  sunlight: 0.5,
  season: 0.5,
  circadianPhase: 0.5,
  travelRate: 0,
  proximityDensity: 0,
  volatility: 0.2,
  biome: "temperate",
};

const CAMERA_POSITION: [number, number, number] = [0, 0, 50];

const getWorldBounds = (root: RenderNode) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const visit = (node: RenderNode, px: number, py: number) => {
    const x = px + node.position.x;
    const y = py + node.position.y;
    const radius = Math.max(node.scale.x, node.scale.y) * 0.5;
    minX = Math.min(minX, x - radius);
    maxX = Math.max(maxX, x + radius);
    minY = Math.min(minY, y - radius);
    maxY = Math.max(maxY, y + radius);
    node.children.forEach((child) => visit(child, x, y));
  };

  visit(root, 0, 0);
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  return { minX, maxX, minY, maxY };
};

const advanceOneCycle = (
  currentGenome: Genome,
  currentEnvironment: Environment,
  totalCycles: number,
  organismAge: number,
  lockBiome: boolean,
) => {
  const nextEnvironment = createCycleEnvironment(currentEnvironment, {
    biome: currentEnvironment.biome,
    lockBiome,
  });
  const result = runCycle(currentGenome, nextEnvironment, { disableDeath: true });

  const nextGenome = result.mutatedGenome ?? currentGenome;
  const nextOrganismAge = organismAge + 1;

  return {
    genome: nextGenome,
    environment: nextEnvironment,
    totalCycles: totalCycles + 1,
    organismAge: nextOrganismAge,
  };
};

const hashString = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const hashValue = (value: unknown) => {
  try {
    return hashString(JSON.stringify(value));
  } catch {
    return "????????";
  }
};

const getBiomeTag = (p: Phenotype, env: Environment) => {
  switch (env.biome) {
    case "ocean":
      return "Oceanic";
    case "desert":
      return p.armorPlates > 0.45 && p.wetSheen < 0.3 ? "Desert-Plated" : "Desert-Arid";
    case "forest":
      return p.ornamentation > 0.6 || p.limbLength > 0.65
        ? "Forest-Canopy"
        : "Forest-Grove";
    case "tundra":
      return p.roughness > 0.55 || p.limbThickness > 0.6
        ? "Tundra-Insulated"
        : "Tundra-Hardy";
    case "temperate":
    default:
      return "Temperate-Generalist";
  }
};

export default function Home() {
  const initialState = useMemo(() => {
    const g = createInitialGenome();
    const e = { ...INITIAL_ENVIRONMENT };
    const p = derivePhenotype(g, e);
    const nodes = assembleOrganism(p);
    return { genome: g, environment: e, phenotype: p, nodeTree: nodes };
  }, []);
  const [genome, setGenome] = useState<Genome>(initialState.genome);
  const [environment, setEnvironment] = useState<Environment>(initialState.environment);
  const [phenotype, setPhenotype] = useState<Phenotype>(initialState.phenotype);
  const [nodeTree, setNodeTree] = useState<RenderNode>(initialState.nodeTree);
  const [totalCycles, setTotalCycles] = useState(0);
  const [organismAge, setOrganismAge] = useState(0);
  const [autoRun, setAutoRun] = useState(false);
  const [lockBiome, setLockBiome] = useState(false);
  const [jumpStatus, setJumpStatus] = useState<string | null>(null);
  const genomeHash = useMemo(() => hashValue(genome), [genome]);
  const phenotypeHash = useMemo(() => hashValue(phenotype), [phenotype]);
  const bodyPlanLabel = useMemo(() => {
    const labels: Record<Phenotype["bodyPlan"], string> = {
      sessile_reef: "Sessile Reef",
      segmented_crawler: "Segmented Crawler",
      arthropod_walker: "Arthropod Walker",
      cephalopod_swimmer: "Cephalopod Swimmer",
      ovoid_generalist: "Ovoid Generalist",
    };
    return labels[phenotype.bodyPlan] ?? "Unknown Form";
  }, [phenotype.bodyPlan]);
  const movementLabel = useMemo(() => {
    const labels: Record<Phenotype["locomotion"], string> = {
      sessile: "Sessile",
      swim: "Swim",
      crawl: "Crawl",
      walk: "Walk",
      glide: "Glide",
      fly: "Fly",
      burrow: "Burrow",
    };
    return labels[phenotype.locomotion] ?? phenotype.locomotion;
  }, [phenotype.locomotion]);
  const limbLabel = useMemo(() => {
    const labels: Record<Phenotype["limbType"], string> = {
      fin: "Fin",
      leg: "Leg",
      wing: "Wing",
      tentacle: "Tentacle",
      cilia: "Cilia",
    };
    return labels[phenotype.limbType] ?? phenotype.limbType;
  }, [phenotype.limbType]);
  const stageInfo = useMemo(() => classifyCreature(phenotype), [phenotype]);
  const stageColor = useMemo(() => {
    switch (stageInfo.stageLabel) {
      case "Walker":
        return "text-amber-400";
      case "Flyer":
        return "text-sky-400";
      case "Swimmer":
        return "text-cyan-400";
      case "Sessile":
        return "text-emerald-400";
      case "Crawler":
        return "text-lime-400";
      default:
        return "text-purple-400";
    }
  }, [stageInfo.stageLabel]);
  const labeledCreature = `${bodyPlanLabel} · ${movementLabel} · ${limbLabel}`;
  const biomeFitness = useMemo(
    () => computeBiomeFitness(genome, environment),
    [genome, environment],
  );
  const DEBUG_BIOME = false;

  useEffect(() => {
    if (!DEBUG_BIOME) return;
    console.log("[BiomeDebug]", {
      biome: environment.biome,
      locomotion: phenotype.locomotion,
      limbType: phenotype.limbType,
      wetSheen: phenotype.wetSheen,
      armorPlates: phenotype.armorPlates,
      roughness: phenotype.roughness,
      limbLength: phenotype.limbLength,
      limbThickness: phenotype.limbThickness,
      ornamentation: phenotype.ornamentation,
      segmentCount: phenotype.segmentCount,
      limbPairs: phenotype.limbPairs,
      gates: biomeFitness.tags,
    });
  }, [DEBUG_BIOME, biomeFitness.tags, environment.biome, phenotype]);


  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const resetView = useCallback(() => {
    if (!controlsRef.current) return;
    controlsRef.current.object.position.set(...CAMERA_POSITION);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, []);
  const sizeMetrics = useMemo(() => {
    const bounds = getWorldBounds(nodeTree);
    const worldLength = bounds.maxX - bounds.minX;
    const worldHeight = bounds.maxY - bounds.minY;
    const worldRadius = Math.max(worldLength, worldHeight) * 0.5;
    return { worldLength, worldRadius };
  }, [nodeTree]);

  const updateVisuals = useCallback((g: Genome, e: Environment) => {
    const p = derivePhenotype(g, e);
    const nodes = assembleOrganism(p);
    setPhenotype(p);
    setNodeTree(nodes);
  }, []);

  useEffect(() => {
    updateVisuals(genome, environment);
  }, [genome, environment, updateVisuals]);

  useEffect(() => {
    setEnvironment(createCycleEnvironment());
  }, []);

  const handleCycle = useCallback(() => {
    const {
      genome: nextGenome,
      environment: nextEnvironment,
      totalCycles: nextTotalCycles,
      organismAge: nextOrganismAge,
    } = advanceOneCycle(genome, environment, totalCycles, organismAge, lockBiome);
    setGenome(nextGenome);
    setEnvironment(nextEnvironment);
    setTotalCycles(nextTotalCycles);
    setOrganismAge(nextOrganismAge);
  }, [environment, genome, lockBiome, organismAge, totalCycles]);

  const handleJump = useCallback(() => {
    let nextGenome = genome;
    let nextEnvironment = environment;
    let nextTotalCycles = totalCycles;
    let nextOrganismAge = organismAge;

    for (let i = 0; i < 20000; i += 1) {
      const result = advanceOneCycle(
        nextGenome,
        nextEnvironment,
        nextTotalCycles,
        nextOrganismAge,
        lockBiome,
      );
      nextGenome = result.genome;
      nextEnvironment = result.environment;
      nextTotalCycles = result.totalCycles;
      nextOrganismAge = result.organismAge;
    }

    setGenome(nextGenome);
    setEnvironment(nextEnvironment);
    setTotalCycles(nextTotalCycles);
    setOrganismAge(nextOrganismAge);
  }, [environment, genome, lockBiome, organismAge, totalCycles]);

  const handleJumpTo100k = useCallback(async () => {
    if (jumpStatus) return;
    const target = 100000;
    if (totalCycles >= target) {
      console.table({
        bodyPlan: phenotype.bodyPlan,
        locomotion: phenotype.locomotion,
        limbType: phenotype.limbType,
        limbPairs: phenotype.limbPairs,
        axialScale: phenotype.axialScale.join(", "),
        furAmount: phenotype.furAmount,
        wingArea: phenotype.wingArea,
        eyeCount: phenotype.eyeCount,
        eyeSize: phenotype.eyeSize,
      });
      return;
    }

    setJumpStatus(`Jumping ${totalCycles}/${target}`);
    let nextGenome = genome;
    let nextEnvironment = environment;
    let nextTotalCycles = totalCycles;
    let nextOrganismAge = organismAge;
    const batchSize = 5000;

    while (nextTotalCycles < target) {
      const end = Math.min(target, nextTotalCycles + batchSize);
      for (let i = nextTotalCycles; i < end; i += 1) {
        const result = advanceOneCycle(
          nextGenome,
          nextEnvironment,
          nextTotalCycles,
          nextOrganismAge,
          lockBiome,
        );
        nextGenome = result.genome;
        nextEnvironment = result.environment;
        nextTotalCycles = result.totalCycles;
        nextOrganismAge = result.organismAge;
      }
      setJumpStatus(`Jumping ${nextTotalCycles}/${target}`);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    setGenome(nextGenome);
    setEnvironment(nextEnvironment);
    setTotalCycles(nextTotalCycles);
    setOrganismAge(nextOrganismAge);
    setJumpStatus(null);

    const finalPhenotype = derivePhenotype(nextGenome, nextEnvironment);
    console.table({
      bodyPlan: finalPhenotype.bodyPlan,
      locomotion: finalPhenotype.locomotion,
      limbType: finalPhenotype.limbType,
      limbPairs: finalPhenotype.limbPairs,
      axialScale: finalPhenotype.axialScale.join(", "),
      furAmount: finalPhenotype.furAmount,
      wingArea: finalPhenotype.wingArea,
      eyeCount: finalPhenotype.eyeCount,
      eyeSize: finalPhenotype.eyeSize,
    });
  }, [
    environment,
    genome,
    jumpStatus,
    lockBiome,
    organismAge,
    phenotype,
    totalCycles,
  ]);

  const applyBiomeDebug = useCallback((biome: Environment["biome"]) => {
    setLockBiome(true);
    setEnvironment((prev) => ({ ...prev, biome }));
  }, []);

  useEffect(() => {
    if (autoRun) {
      timerRef.current = setInterval(handleCycle, 100); // 10 cycles/sec
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoRun, handleCycle]);

  return (
    <div className="min-h-screen bg-black text-white font-sans p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-500">
          Symbiote Cycle Visualizer
        </h1>
        <div className="flex gap-4 items-center">
          <div className="text-right">
            <div className="text-xs text-gray-500 uppercase tracking-widest">Cycle</div>
            <div className="text-2xl font-mono text-white">{totalCycles}</div>
            <div className="text-[10px] text-gray-500 font-mono">
              G:{genomeHash} P:{phenotypeHash}
            </div>
            <div className="text-[10px] text-gray-500 font-mono">
              Biome: {environment.biome}
              {biomeFitness.tags.length > 0 ? ` · ${biomeFitness.tags.join(", ")}` : ""}
            </div>
          </div>
          <button
            onClick={handleJump}
            className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800 border border-purple-500 text-purple-200 rounded-full font-bold text-xs"
          >
            JUMP 20k
          </button>
          <button
            onClick={handleJumpTo100k}
            className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800 border border-purple-500 text-purple-200 rounded-full font-bold text-xs"
          >
            Jump to 100000
          </button>
          <button
            onClick={() => setAutoRun(!autoRun)}
            className={`px-6 py-2 rounded-full font-bold transition ${autoRun ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}
          >
            {autoRun ? 'STOP' : 'RUN EVOLUTION'}
          </button>
          <button
            onClick={handleCycle}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-full font-bold transition"
          >
            Step +1
          </button>
          <button
            onClick={resetView}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-full font-bold transition"
          >
            Reset View
          </button>
        </div>
      </div>

      <div className="flex gap-8 h-[80vh]">
        {/* Visual Panel */}
        <div className="flex-1 bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden relative">
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <div className="text-xs text-gray-400">Environment</div>
            <div className="text-white">Biome: {environment.biome}</div>
            <div className="text-white">Temp: {environment.temperature.toFixed(2)}</div>
            <div className="text-white">Vol: {environment.volatility.toFixed(2)}</div>
            <div className="mt-2 text-xs text-gray-400">Scale</div>
            <div className="text-white">Genome size: {genome.bodySize.toFixed(2)}</div>
            <div className="text-white">
              Axial: {phenotype.axialScale[0].toFixed(2)} / {phenotype.axialScale[1].toFixed(2)} / {phenotype.axialScale[2].toFixed(2)}
            </div>
            <div className="text-white">
              World L: {sizeMetrics.worldLength.toFixed(2)} R: {sizeMetrics.worldRadius.toFixed(2)}
            </div>
            <div className="mt-2 text-xs text-gray-400">Phenotype</div>
            <div className="text-white">
              {phenotype.bodyPlan} • {phenotype.locomotion} • {phenotype.limbType}
            </div>
            <div className="text-white">Limb pairs: {phenotype.limbPairs}</div>
            <div className="text-white">Fur: {phenotype.furAmount.toFixed(2)}</div>
            <div className="text-white">Wing area: {phenotype.wingArea.toFixed(2)}</div>
            <div className="text-white">
              Eyes: {phenotype.eyeCount} @ {phenotype.eyeSize.toFixed(2)}
            </div>
          </div>

          <div className="w-full h-full">
            <Canvas camera={{ position: CAMERA_POSITION, fov: 45 }} shadows>
              <EnvironmentRenderer env={environment} />
              <ScaleReference />
              <OrganismSDF rootNode={nodeTree} phenotype={phenotype} genome={genome} />
              <OrbitControls ref={controlsRef} enableZoom={false} enablePan={false} />
            </Canvas>
          </div>

          <div className="absolute bottom-4 left-4 z-10 text-shadow-sm">
            <div className="text-xs text-gray-400 mb-1">Evolutionary Stage (Cycle {totalCycles})</div>
            <div className={`text-2xl font-bold capitalize ${stageColor}`}>
              {stageInfo.stageLabel}
            </div>
            <div className="text-sm text-gray-300 capitalize mt-1">
              {labeledCreature} • {getBiomeTag(phenotype, environment)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              limbs: {phenotype.limbPairs} eyes: {phenotype.eyeCount} segments: {phenotype.segmentCount}
            </div>
            {jumpStatus ? (
              <div className="text-xs text-gray-400 mt-1">{jumpStatus}</div>
            ) : null}
          </div>
        </div>

        {/* Genome Data Panel */}
        <div className="w-80 overflow-y-auto pr-2">
          <h2 className="text-xl font-bold mb-4 text-gray-300 sticky top-0 bg-black py-2">Genome Matrix</h2>

          <div className="mb-6">
            <div className="text-xs uppercase tracking-widest text-gray-600 mb-2 border-b border-gray-800 pb-1">
              Biome (debug)
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`px-3 py-1 rounded-full text-xs border ${
                  lockBiome && environment.biome === "marine_coral_reef"
                    ? "border-cyan-400 text-cyan-200"
                    : "border-gray-700 text-gray-400"
                }`}
                onClick={() => applyBiomeDebug("marine_coral_reef")}
              >
                marine_coral_reef
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-full text-xs border ${
                  lockBiome && environment.biome === "tundra"
                    ? "border-cyan-400 text-cyan-200"
                    : "border-gray-700 text-gray-400"
                }`}
                onClick={() => applyBiomeDebug("tundra")}
              >
                tundra
              </button>
              <button
                type="button"
                className={`px-3 py-1 rounded-full text-xs border ${
                  lockBiome && environment.biome === "temperate_rainforest"
                    ? "border-cyan-400 text-cyan-200"
                    : "border-gray-700 text-gray-400"
                }`}
                onClick={() => applyBiomeDebug("temperate_rainforest")}
              >
                temperate_rainforest
              </button>
            </div>
            <div className="text-[10px] text-gray-500 mt-2">
              lockBiome: {lockBiome ? "true" : "false"}
            </div>
          </div>

          <div className="space-y-6">
            <TraitSection title="Structural">
              <TraitRow label="Symmetry" value={genome.symmetry} />
              <TraitRow label="Segmentation" value={genome.segmentation} />
              <TraitRow label="Rigidity" value={genome.rigidity} />
              <TraitRow label="Locomotion" value={genome.locomotionMode} />
              <TraitRow label="Limb Count" value={genome.limbCount} />
              <TraitRow label="Size" value={genome.bodySize} />
            </TraitSection>

            <TraitSection title="Physiological">
              <TraitRow label="Metabolism" value={genome.metabolicRate} />
              <TraitRow label="Thermoreg" value={genome.thermoregulation} />
              <TraitRow label="Feeding" value={genome.feedingStrategy} />
            </TraitSection>

            <TraitSection title="Behavioral">
              <TraitRow label="Aggression" value={genome.aggression} />
              <TraitRow label="Sociality" value={genome.sociality} />
              <TraitRow label="Mutation Rate" value={genome.mutationRate} color="text-pink-500" />
            </TraitSection>
          </div>
        </div>
      </div>
    </div>
  );
}

function TraitSection({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest text-gray-600 mb-2 border-b border-gray-800 pb-1">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function TraitRow({ label, value, color = "text-gray-400" }: { label: string, value: number, color?: string }) {
  return (
    <div className="flex justify-between items-center text-sm group">
      <span className="text-gray-500 group-hover:text-gray-300 transition">{label}</span>
      <div className="flex items-center gap-2">
        <div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500" style={{ width: `${value * 100}%` }}></div>
        </div>
        <span className={`font-mono w-8 text-right ${color}`}>{value.toFixed(2)}</span>
      </div>
    </div>
  )
}
