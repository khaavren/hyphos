
import { SymbioteSimulation } from '../lib/simulation/simulation';
import { BiomeType } from '../lib/simulation/types';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const cyclesArg = args.find(a => a.startsWith('--cycles='));
const biomeArg = args.find(a => a.startsWith('--biome='));

const cycles = cyclesArg ? parseInt(cyclesArg.split('=')[1]) : 5000;
const biome = (biomeArg ? biomeArg.split('=')[1] : 'ocean') as BiomeType;

console.log(`Starting Simulation: ${cycles} cycles in [${biome}]...`);

const sim = new SymbioteSimulation(biome, 20); // Start with 20 cells

const startTime = Date.now();
const logDir = path.join(process.cwd(), 'simulation_logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

for (let i = 0; i < cycles; i++) {
    sim.runCycle();
    if (i % 1000 === 0) {
        process.stdout.write(`\rCycle: ${i} | Pop: ${sim.population.length} | Creating snapshots...`);
    }
}
process.stdout.write('\n');

const duration = (Date.now() - startTime) / 1000;
console.log(`Simulation Complete in ${duration.toFixed(2)}s`);

const finalSummary = sim.getSummary();
console.log('Final Summary:', JSON.stringify(finalSummary, null, 2));

// Dump full population for analysis
const report = {
    config: { cycles, biome },
    summary: finalSummary,
    history: sim.history,
    populationSample: sim.population.slice(0, 10).map(p => ({
        id: p.id,
        fitness: p.fitness,
        genome: {
            limbCount: p.genome.limbCount,
            locomotion: p.genome.locomotionMode,
            respiration: p.genome.respirationType,
            rigidity: p.genome.rigidity
        }
    }))
};

const outFile = path.join(logDir, `sim_${biome}_${cycles}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(`Report saved to ${outFile}`);
try {
    const domSpecies = finalSummary.dominantSpecies;
    if (domSpecies.length > 0) {
        console.log(`\nDominant Species Traits: ${domSpecies[0][0]} (Count: ${domSpecies[0][1]})`);
    }
} catch {
    // Ignore summary failures.
}
