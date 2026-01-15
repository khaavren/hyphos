'use client';

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Genome, Environment, Phenotype } from "../lib/simulation/types";
import { createInitialGenome } from "../lib/simulation/genome";
import { createCycleEnvironment } from "../lib/simulation/environment";
import { runCycle } from "../lib/simulation/evolution";
import { derivePhenotype } from "../lib/simulation/phenotype";
import { assembleOrganism } from "../lib/rendering/assembler";
import { RenderNode } from "../lib/rendering/types";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import OrganismSDF from "./components/OrganismSDF";
import EnvironmentRenderer from "./components/EnvironmentRenderer";

const advanceOneCycle = (
  currentGenome: Genome,
  currentEnvironment: Environment,
  currentCycle: number,
) => {
  const nextEnvironment = createCycleEnvironment(currentEnvironment);
  const result = runCycle(currentGenome, nextEnvironment);

  let nextGenome = currentGenome;
  if (result.survived) {
    if (result.mutatedGenome) {
      nextGenome = result.mutatedGenome;
    }
  } else {
    console.log("Organism died of: " + result.causeOfDeath);
    nextGenome = createInitialGenome();
  }

  return {
    genome: nextGenome,
    environment: nextEnvironment,
    cycleCount: currentCycle + 1,
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

export default function Home() {
  const initialState = useMemo(() => {
    const g = createInitialGenome();
    const e = createCycleEnvironment();
    const p = derivePhenotype(g, e);
    const nodes = assembleOrganism(p);
    return { genome: g, environment: e, phenotype: p, nodeTree: nodes };
  }, []);
  const [genome, setGenome] = useState<Genome>(initialState.genome);
  const [environment, setEnvironment] = useState<Environment>(initialState.environment);
  const [phenotype, setPhenotype] = useState<Phenotype>(initialState.phenotype);
  const [nodeTree, setNodeTree] = useState<RenderNode>(initialState.nodeTree);
  const [cycleCount, setCycleCount] = useState(0);
  const [autoRun, setAutoRun] = useState(false);
  const genomeHash = useMemo(() => hashValue(genome), [genome]);
  const phenotypeHash = useMemo(() => hashValue(phenotype), [phenotype]);
  const rendersLegs = genome.limbCount > 0.6 && genome.locomotionMode > 0.6;
  const creatureLabel = rendersLegs ? 'Arthropod Walker' : 'Protoform Swimmer';

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const updateVisuals = useCallback((g: Genome, e: Environment) => {
    const p = derivePhenotype(g, e);
    const nodes = assembleOrganism(p);
    setPhenotype(p);
    setNodeTree(nodes);
  }, []);

  useEffect(() => {
    updateVisuals(genome, environment);
  }, [genome, environment, cycleCount, updateVisuals]);

  const handleCycle = useCallback(() => {
    const { genome: nextGenome, environment: nextEnvironment, cycleCount: nextCycle } =
      advanceOneCycle(genome, environment, cycleCount);
    setGenome(nextGenome);
    setEnvironment(nextEnvironment);
    setCycleCount(nextCycle);
  }, [cycleCount, environment, genome]);

  const handleJump = useCallback(() => {
    let nextGenome = genome;
    let nextEnvironment = environment;
    let nextCycle = cycleCount;

    for (let i = 0; i < 20000; i += 1) {
      const result = advanceOneCycle(nextGenome, nextEnvironment, nextCycle);
      nextGenome = result.genome;
      nextEnvironment = result.environment;
      nextCycle = result.cycleCount;
    }

    setGenome(nextGenome);
    setEnvironment(nextEnvironment);
    setCycleCount(nextCycle);
  }, [cycleCount, environment, genome]);

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
            <div className="text-2xl font-mono text-white">{cycleCount}</div>
            <div className="text-[10px] text-gray-500 font-mono">
              G:{genomeHash} P:{phenotypeHash}
            </div>
          </div>
          <button
            onClick={handleJump}
            className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800 border border-purple-500 text-purple-200 rounded-full font-bold text-xs"
          >
            JUMP 20k
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
        </div>
      </div>

      <div className="flex gap-8 h-[80vh]">
        {/* Visual Panel */}
        <div className="flex-1 bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden relative">
          <div className="absolute top-4 left-4 z-10 pointer-events-none">
            <div className="text-xs text-gray-400">Environment</div>
            <div className="text-white">Temp: {environment.temperature.toFixed(2)}</div>
            <div className="text-white">Vol: {environment.volatility.toFixed(2)}</div>
          </div>

          <div className="w-full h-full">
            <Canvas camera={{ position: [0, 0, 50], fov: 45 }} shadows>
              <EnvironmentRenderer env={environment} />
              <OrganismSDF rootNode={nodeTree} phenotype={phenotype} genome={genome} />
              <OrbitControls enableZoom={true} />
            </Canvas>
          </div>

          <div className="absolute bottom-4 left-4 z-10 text-shadow-sm">
            <div className="text-xs text-gray-400 mb-1">Evolutionary Stage (Cycle {cycleCount})</div>
            <div className={`text-2xl font-bold capitalize ${cycleCount < 20 ? 'text-blue-400' : cycleCount < 60 ? 'text-green-400' : 'text-purple-400'}`}>
              {cycleCount < 20 ? 'Primordial Single Cell' : cycleCount < 60 ? 'Developing Organism' : 'Complex Lifeform'}
            </div>
            <div className="text-sm text-gray-300 capitalize mt-1">
              {creatureLabel} • {phenotype.locomotion}
            </div>
          </div>
        </div>

        {/* Genome Data Panel */}
        <div className="w-80 overflow-y-auto pr-2">
          <h2 className="text-xl font-bold mb-4 text-gray-300 sticky top-0 bg-black py-2">Genome Matrix</h2>

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
