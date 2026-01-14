
import { v4 as uuidv4 } from 'uuid';
import { Environment, Genome, BiomeType } from './types';
import { createInitialGenome, mutateGenome } from './genome';
import { createCycleEnvironment } from './environment';
import { runCycle } from './evolution';

type Organism = {
    id: string;
    genome: Genome;
    age: number;
    energy: number;
    isAlive: boolean;
    lineage: string[];
    fitness: number;
};

export class SymbioteSimulation {
    public population: Organism[] = [];
    public environment: Environment;
    public cycle: number = 0;
    public history: { cycle: number, populationCount: number, bestFitness: number }[] = [];

    constructor(_biome: BiomeType, initialPopulationSize: number = 10) {
        this.environment = createCycleEnvironment();

        // Genesis
        for (let i = 0; i < initialPopulationSize; i++) {
            this.population.push({
                id: uuidv4(),
                genome: createInitialGenome(),
                age: 0,
                energy: 1.0,
                isAlive: true,
                lineage: [],
                fitness: 1.0
            });
        }
    }

    public runCycle() {
        this.cycle++;

        // 1. Update Environment
        this.environment = createCycleEnvironment(this.environment);
        // Stress increases if population is too high (carrying capacity)
        const populationStress = Math.max(0, (this.population.length - 100) / 100);

        const nextGeneration: Organism[] = [];

        // 2. Process each organism
        for (const org of this.population) {
            org.age++;

            const result = runCycle(org.genome, this.environment);
            org.fitness = clamp(0.5 + result.energyDelta - result.stressDelta, 0, 1);
            if (!result.survived) {
                org.isAlive = false;
                continue;
            }
            if (result.mutatedGenome) {
                org.genome = result.mutatedGenome;
            }

            // Survival Check
            // Base death chance drastically reduced. 
            // Main death cause should be starvation (low fitness) or old age.
            const lifespan = Math.round(80 + org.genome.bodySize * 120);
            const ageFactor = (org.age > lifespan) ? 0.1 : 0.0;
            const fitnessPenalty = (1.0 - org.fitness) * 0.05; // 5% chance to die if 0 fitness
            const baseDeath = 0.001;

            const deathChance = baseDeath + ageFactor + fitnessPenalty;

            if (Math.random() < deathChance) {
                org.isAlive = false; // Dead
                continue;
            }

            // Reproduction Check
            // Needs high fitness and maturity
            const reproChance = org.fitness * 0.05 + 0.01; // Base 1% + fitness bonus
            if (org.age > 20 && Math.random() < reproChance && this.population.length < 1000) {
                // Asexual Reproduction / Budding for now
                const childGenome = mutateGenome(org.genome, populationStress + this.environment.volatility);
                nextGeneration.push({
                    id: uuidv4(),
                    genome: childGenome,
                    age: 0,
                    energy: 1.0,
                    isAlive: true,
                    lineage: [...org.lineage, org.id],
                    fitness: 0 // Will be calc'd next turn
                });
            }
        }

        // 3. Cleanup & Merge
        this.population = this.population.filter(o => o.isAlive);
        this.population.push(...nextGeneration);

        // 4. Extinction Prevention (The "Life Finds a Way" clause)
        if (this.population.length === 0) {
            this.population.push({
                id: uuidv4(),
                genome: mutateGenome(createInitialGenome(), 0.5),
                age: 0,
                energy: 1.0,
                isAlive: true,
                lineage: ['reseed'],
                fitness: 1.0
            });
        }

        // Logging

        if (this.cycle % 100 === 0) {
            const bestFit = Math.max(...this.population.map(p => p.fitness));
            this.history.push({
                cycle: this.cycle,
                populationCount: this.population.length,
                bestFitness: bestFit
            });
        }
    }

    public getSummary() {
        // Group by traits to see diversity
        const speciesGroups: Record<string, number> = {};

        for (const p of this.population) {
            // Simple hash of key traits
            const key = `${p.genome.limbCount}-${p.genome.locomotionMode}-${p.genome.respirationType}`;
            speciesGroups[key] = (speciesGroups[key] || 0) + 1;
        }

        return {
            cycle: this.cycle,
            count: this.population.length,
            speciesDiversity: Object.keys(speciesGroups).length,
            dominantSpecies: Object.entries(speciesGroups).sort((a, b) => b[1] - a[1]).slice(0, 3)
        };
    }
}

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
