// Temporary end-to-end driver for Milestone 2 acceptance (D & F).
// Not part of the formal codebase.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MainAgent } from "../src/agent.js";
import { ArtifactKind, ArtifactStore } from "../src/artifacts.js";
import { loadProject, snapshotArtifacts } from "../src/project.js";

const ENV = { ...process.env, PROJECTFORGE_PROJECT_ROOT: "USE_FILLED_BELOW" };

async function main() {
  const work = await mkdtemp(join(tmpdir(), "pf-e2e-"));
  console.log("[e2e] workdir:", work);
  try {
    // ---- Phase 1: empty project startup (acceptance A) ----
    const p1 = await loadProject(work, { ...process.env, PROJECTFORGE_PROJECT_ROOT: work });
    const snap1 = await snapshotArtifacts(p1.store);
    console.log("[e2e] phase1 snapshot:", Object.fromEntries(Object.entries(snap1).map(([k, v]) => [k, v])));
    const files1 = await readdir(p1.artifactsDir);
    console.log("[e2e] phase1 artifacts dir files:", files1); // expect []

    // ---- Agent still starts/operates on empty project; runtime session independent ----
    const agent1 = new MainAgent();
    const r1 = await agent1.turn("Hello");
    console.log("[e2e] agent turn on empty project OK, session:", r1.sessionId.slice(0, 8), "| reply:", r1.text.slice(0, 60));

    // ---- Write an artifact via ArtifactStore (persist) ----
    const content = "# Working Summary\n\n(已知测试内容 k1)";
    await p1.store.writeArtifact(ArtifactKind.WorkingSummary, content);

    // ---- Phase 2: restart - new process context, same dir ----
    const p2 = await loadProject(work, { ...process.env, PROJECTFORGE_PROJECT_ROOT: work });
    const snap2 = await snapshotArtifacts(p2.store);
    const got = await p2.store.readArtifact(ArtifactKind.WorkingSummary);
    console.log("[e2e] phase2 working-summary present:", snap2[ArtifactKind.WorkingSummary]);
    console.log("[e2e] phase2 read == written:", got === content, "| len:", got.length);

    // ---- Session/Project separation: restart creates new runtime session (this is a different MainAgent instance) ----
    const agent2 = new MainAgent();
    const r2 = await agent2.turn("Hello");
    console.log("[e2e] agent2 new session:", r2.sessionId, "| same-as-agent1:", r2.sessionId === r1.sessionId);

    // Persisted artifact remains independent from runtime session.
    const gotAfter2 = await p2.store.readArtifact(ArtifactKind.WorkingSummary);
    console.log("[e2e] after 2nd agent, artifact unchanged:", gotAfter2 === content);

    // ---- Isolation (acceptance E) quick check ----
    await p2.store.writeArtifact(ArtifactKind.Candidate, "cand");
    const ws = await p2.store.readArtifact(ArtifactKind.WorkingSummary);
    console.log("[e2e] isolation: writing candidate didn't touch working-summary:", ws === content);
  } finally {
    await rm(work, { recursive: true, force: true });
    console.log("[e2e] done");
  }
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exitCode = 1;
});