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

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const updateVisuals = useCallback((g: Genome, e: Environment) => {
    const p = derivePhenotype(g, e);
    const nodes = assembleOrganism(p);
    setPhenotype(p);
    setNodeTree(nodes);
  }, []);

  const handleCycle = useCallback(() => {

    // 1. Advance Environment
    const nextEnv = createCycleEnvironment(environment);

    // 2. Run Evolutionary Cycle (Selection + Mutation)
    const result = runCycle(genome, nextEnv);

    // 3. Update State
    let nextGenome = genome;
    if (result.survived) {
      if (result.mutatedGenome) {
        nextGenome = result.mutatedGenome;
      }
      // If no mutation, genome stays same
    } else {
      // Extinction - Reset for now (or could show death screen)
      console.log("Organism died of: " + result.causeOfDeath);
      nextGenome = createInitialGenome(); // Respawn as single cell
      setCycleCount(0); // Reset age
    }

    setGenome(nextGenome);
    setEnvironment(nextEnv);
    setCycleCount((c) => c + 1);

    // 4. Update Visuals
    updateVisuals(nextGenome, nextEnv);
  }, [environment, genome, updateVisuals]);

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
          </div>
          <button
            onClick={() => {
              const elderGenome: Genome = {
                ...createInitialGenome(),
                bodySize: 0.95,
                segmentation: 0.9,
                limbCount: 0.9,
                limbLength: 0.8,
                locomotionMode: 0.8,
                symmetry: 0.8,
                rigidity: 0.8,
                mutationRate: 0.01
              };
              setGenome(elderGenome);
              setCycleCount(20000);
              updateVisuals(elderGenome, environment);
            }}
            className="px-4 py-2 bg-purple-900/50 hover:bg-purple-800 border border-purple-500 text-purple-200 rounded-full font-bold text-xs"
          >
            JUMP 20k
          </button>
          <button
            onClick={() => {
              // SIMULATE 20,000 CYCLES (Approximated by setting max complexity)
              const elderGenome: Genome = {
                ...createInitialGenome(),
                bodySize: 0.95, // Huge
                segmentation: 0.9, // Many segments
                limbCount: 0.9, // Many limbs
                limbLength: 0.8, // Long limbs
                locomotionMode: 0.8, // Complex locomotion
                symmetry: 0.8,
                rigidity: 0.8,
                mutationRate: 0.01 // Stablized
              };
              setGenome(elderGenome);
              setCycleCount(20000);
              // Force visuals update
              updateVisuals(elderGenome, environment);
            }}
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
              <OrganismSDF rootNode={nodeTree} phenotype={phenotype} />
              <OrbitControls enableZoom={true} />
            </Canvas>
          </div>

          <div className="absolute bottom-4 left-4 z-10 text-shadow-sm">
            <div className="text-xs text-gray-400 mb-1">Evolutionary Stage (Cycle {cycleCount})</div>
            <div className={`text-2xl font-bold capitalize ${cycleCount < 20 ? 'text-blue-400' : cycleCount < 60 ? 'text-green-400' : 'text-purple-400'}`}>
              {cycleCount < 20 ? 'Primordial Single Cell' : cycleCount < 60 ? 'Developing Organism' : 'Complex Lifeform'}
            </div>
            <div className="text-sm text-gray-300 capitalize mt-1">
              {phenotype.bodyPlan.replace('_', ' ')} • {phenotype.locomotion}
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
