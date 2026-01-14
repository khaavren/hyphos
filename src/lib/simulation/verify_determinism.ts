import { createInitialGenome, mutateGenome } from "./genome";
import { derivePhenotype } from "./phenotype";
import { createCycleEnvironment } from "./environment";

function verify() {
    console.log("Starting Symbiote Verification...");

    // Test 1: Determinism
    console.log("[Test 1] Checking Determinism...");
    const g1 = createInitialGenome();
    const env = createCycleEnvironment();

    const p1 = derivePhenotype(g1, env);
    const p2 = derivePhenotype(g1, env);

    if (JSON.stringify(p1) === JSON.stringify(p2)) {
        console.log("PASS: Phenotype is deterministic for same Genome + Env.");
    } else {
        console.error("FAIL: Phenotype derivation is unstable!");
        console.log("P1:", JSON.stringify(p1).substring(0, 100));
        console.log("P2:", JSON.stringify(p2).substring(0, 100));
    }

    // Test 2: Mutation Divergence
    console.log("\n[Test 2] Checking Mutation Divergence...");
    const gMutated = mutateGenome(g1, 0.5);
    const pMutated = derivePhenotype(gMutated, env);

    if (JSON.stringify(p1) !== JSON.stringify(pMutated)) {
        console.log("PASS: Mutation produced a different phenotype.");
    } else {
        console.warn("WARNING: Mutation did not change phenotype (chance, or bug?). Trying again...");
        // Retry once
        const gMutated2 = mutateGenome(g1, 1.0);
        const pMutated2 = derivePhenotype(gMutated2, env);
        if (JSON.stringify(p1) !== JSON.stringify(pMutated2)) {
            console.log("PASS: Mutation produced a different phenotype (on retry).");
        } else {
            console.error("FAIL: Mutation seems strictly cosmetic or broken.");
        }
    }

    // Test 3: Basins of Attraction
    console.log("\n[Test 3] Checking Body Plan Basins...");
    // Force a specific genome for 'sessile_reef'
    const gSessile = { ...g1, locomotionMode: 0.1 };
    const pSessile = derivePhenotype(gSessile, env);
    if (pSessile.bodyPlan === 'sessile_reef') {
        console.log("PASS: Low locomotion mapped to 'sessile_reef'.");
    } else {
        console.error(`FAIL: Expected 'sessile_reef', got '${pSessile.bodyPlan}'`);
    }

    // Force Arthropod
    const gArthro = { ...g1, locomotionMode: 0.6, segmentation: 0.8, rigidity: 0.8 };
    const pArthro = derivePhenotype(gArthro, env);
    if (pArthro.bodyPlan === 'arthropod_walker') {
        console.log("PASS: High segmentation/rigidity mapped to 'arthropod_walker'.");
    } else {
        console.error(`FAIL: Expected 'arthropod_walker', got '${pArthro.bodyPlan}'`);
    }

    console.log("\nVerification Complete.");
}

verify();
