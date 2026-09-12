// M5-B acceptance worker (2026-09-11). Child: real MainAgent + injected M5/M4 capabilities.
// Runs in a fixture dir (cwd), covering MR1-MR12 acceptance via transcripts + disk evidence.
//
// Modes:
//   case  — runs real MainAgent.turn() for prompts given as argv[2..] (multi-turn supported:
//           each argv[i] is one user turn; session is resumed in-process).
//   probe — no model. Direct store-level probes for deterministic MR11/recovery checks:
//           M5_PROBE=commit  → store.commit() with M5_FAULT=M5_FAULT env (drives fault injection)
//           M5_PROBE=recover → store.readCurrentBaseline() = recovery-before-read + disk state
//
// Env:
//   M5_FAULT = step4|step5|step6  — MR11 test-only fault injection (failAfter N).
// Usage: node <tsx-cli> gate/m5-worker.mjs <abs-agent-ts> <prompt1> [<prompt2> ...]
//   or with M5_PROBE=commit/recover node <tsx-cli> gate/m5-worker.mjs
import process from "node:process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createResearchMcpServer } from "../src/research.ts";
import { createReviewCaller } from "../src/review.ts";
import { ArtifactWriteCapability } from "../src/artifact-capabilities.ts";
import { ArtifactStore } from "../src/artifacts.ts";
import { BaselineCommitStore } from "../src/commit-store.ts";
import { pathToFileURL } from "node:url";

const AGENT_PATH = process.argv[2];
const PROMPTS = process.argv.slice(3).filter((s) => s.length > 0);
const CWD = process.cwd();
const PROBE = process.env.M5_PROBE ?? "";
const FAULT = process.env.M5_FAULT ?? "";
const ARTIFACTS = `${CWD}/artifacts`;

// probe commit 写入的新定义原文 —— 必须与 gate/m5-driver.mjs 的 V2NEW 逐字节一致。
const PROBE_NEW = "# Baseline v2\n- 方向：课题周报自动化 v2\n- 目标用户：本课题组\n";

// Human-provided research materials (closure-injected; NOT a tool parameter) — M4 同款。
const MATERIALS = [
  {
    id: "材料-无障碍标准",
    type: "文档",
    content: "无障碍标准 WCAG 2.2：推荐用于 web 内容，包含可感知、可操作、可理解、健壮性四项原则。",
    verifiability: "用户提供的官方文档摘录",
  },
];

async function diskState() {
  const files = {};
  for (const f of ["working-summary.md", "candidate.md", "current-baseline.md"]) {
    try {
      files[f] = await readFile(join(ARTIFACTS, f), "utf8");
    } catch {
      files[f] = null;
    }
  }
  return files;
}

async function main() {
  // ---- probe: commit（MR11 直接注入，无模型） ----
  if (PROBE === "commit") {
    const commitStore = new BaselineCommitStore({
      artifactsDir: ARTIFACTS,
      fault: FAULT ? { failAfter: Number(FAULT.replace("step", "")) } : undefined,
    });
    let outcome;
    try {
      // 内容必须与 m5-driver.mjs 的 V2NEW 逐字节一致（3 行），否则 step5/step6 probe 的
      // `current === V2NEW` 断言会假失败。
      const r = await commitStore.commit(PROBE_NEW, { reason: "MR11 fault-injection probe" });
      outcome = { ok: true, ...r };
    } catch (e) {
      outcome = { ok: false, error: String(e).slice(0, 300) };
    }
    process.stdout.write(JSON.stringify({ ok: true, probe: "commit", fault: FAULT, outcome, files: await diskState() }));
    process.exit(0);
    return;
  }

  // ---- probe: recover（recovery-before-read，无模型，确定性） ----
  if (PROBE === "recover") {
    const commitStore = new BaselineCommitStore({ artifactsDir: ARTIFACTS });
    const { content, recovered } = await commitStore.readCurrentBaseline();
    const history = await commitStore.listHistory();
    process.stdout.write(
      JSON.stringify({ ok: true, probe: "recover", content, recovered, history, files: await diskState() }),
    );
    process.exit(0);
    return;
  }

  // ---- case mode: real MainAgent ----
  const store = new ArtifactStore({ artifactsDir: ARTIFACTS });
  const writeCap = new ArtifactWriteCapability(store);
  const reviewCaller = createReviewCaller();
  const researchServer = createResearchMcpServer({ materials: MATERIALS });
  const commitStore = new BaselineCommitStore({
    artifactsDir: ARTIFACTS,
    fault: FAULT ? { failAfter: Number(FAULT.replace("step", "")) } : undefined,
  });

  const mod = await import(pathToFileURL(AGENT_PATH).href);
  const agent = new mod.MainAgent({
    mcpServers: researchServer.config,
    allowedTools: [researchServer.toolName],
    reviewCaller,
    artifactWrite: writeCap,
    commitStore,
  });

  const turns = [];
  let ok = true;
  for (const prompt of PROMPTS) {
    try {
      const r = await agent.turn(prompt);
      turns.push({ prompt, text: r.text });
    } catch (e) {
      ok = false;
      turns.push({ prompt, error: String(e).slice(0, 800) });
      break;
    }
  }
  process.stdout.write(JSON.stringify({ ok, turns, files: await diskState() }));
  process.exit(0);
}

main();