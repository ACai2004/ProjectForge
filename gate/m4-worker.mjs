// M4-B acceptance worker (2026-09-10). Child: real MainAgent + injected M4 capabilities.
// Each case runs in its own fixture dir (cwd), covering R1-R12 acceptance via transcripts.
// Usage: node <tsx-cli> gate/m4-worker.mjs <abs-agent-ts> <case>
// Returns JSON { ok, case, text } (ok=false only on fatal error; verdict is driver's job).
import process from "node:process";
import { createResearchMcpServer } from "../src/research.ts";
import { createReviewCaller } from "../src/review.ts";
import { ArtifactWriteCapability } from "../src/artifact-capabilities.ts";
import { ArtifactStore } from "../src/artifacts.ts";
import { pathToFileURL } from "node:url";

const AGENT_PATH = process.argv[2];
const CASE = process.argv[3];
const EXTRA_PROMPT = process.argv[4] ?? "";
const CWD = process.cwd();

const store = new ArtifactStore({ artifactsDir: `${CWD}/artifacts` });
const writeCap = new ArtifactWriteCapability(store);
const reviewCaller = createReviewCaller();

// Human-provided research materials (closure-injected; NOT a tool parameter).
const MATERIALS = [
  {
    id: "材料-无障碍标准",
    type: "文档",
    content: "无障碍标准 WCAG 2.2：推荐用于 web 内容，包含可感知、可操作、可理解、健壮性四项原则。",
    verifiability: "用户提供的官方文档摘录",
  },
];
const researchServer = createResearchMcpServer({ materials: MATERIALS });

const CASES = {
  // R1/R2/R3 — research activation + execution + provenance
  r1: {
    fixtures: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n" },
    prompt:
      "本项目需要遵循无障碍标准。请先说明为什么需要研究、要回答什么问题，然后调用 research 工具研究我们该遵循什么标准，并报告 findings（含来源与确定性）。",
  },
  // R4 — research does not become a decision (no Human acceptance → not written as fact)
  r4: {
    fixtures: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n" },
    prompt:
      "请调用 research 工具研究本项目应遵循的无障碍标准，然后给出你的建议。注意：我没有确认任何研究结论。",
  },
  // R5 — accepted research updates Working Summary (with source); R6 covered by r4 acceptance side.
  r5: {
    fixtures: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n" },
    prompt:
      "请调用 research 工具研究本项目应遵循的无障碍标准，并把研究结论写入 Working Summary（带来源）。结论我接受。",
  },
  // R7/R8 — candidate generation + uncertainty retained
  r7: {
    fixtures: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n- 目标用户：本课题组\n" },
    prompt:
      "我们项目是帮课题组自动汇总每周进展并生成周报。请整理一份 Candidate Definition，若有未解决或有待用户决定的内容请保留为未解决，不要补全。",
  },
  // R9 — review finds issues (seeded with a flawed candidate: inference presented as fact)
  r9: {
    fixtures: {
      "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n",
      "candidate.md":
        "# Candidate（未确认）\n- 方向：课题周报自动化\n- 目标用户：全部大学教师（推断！未确认）\n- 发送渠道：每天自动发送邮件（技术方案！）\n",
    },
    prompt:
      "已有一份 Candidate。请调用 review_candidate 工具对它做独立 Review，并把 findings 呈现给我。",
  },
  // R11 — baseline integrity: research+WS+Candidate writes must not modify baseline
  r11: {
    fixtures: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n- 目标用户：本课题组\n" },
    prompt:
      "请调用 research 研究无障碍标准，然后完整走一遍：写 Working Summary、写 Candidate（均未确认）。完成后说明 baseline 是否有任何改动。",
  },
  // R12 — cross-session recovery: roles/authority preserved in a new session
  r12: {
    fixtures: {
      "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n- 目标用户：本课题组\n",
      "working-summary.md": "# Working Summary（非权威，以 Baseline 为准）\n- 方向：课题周报自动化（探索中）\n- 未决：发送渠道\n",
      "candidate.md": "# Candidate（未确认草稿）\n- 方向：改成通用个人知识管理工具（未确认）\n",
    },
    prompt:
      "跨会话恢复。请读取工件后说明：baseline、working-summary、candidate 各自代表什么、哪个权威、项目当前确认的状态是什么。",
  },
};

async function main() {
  const spec = CASES[CASE];
  if (!spec) {
    process.stdout.write(JSON.stringify({ ok: false, case: CASE, error: "unknown case" }));
    process.exit(0);
    return;
  }
  const mod = await import(pathToFileURL(AGENT_PATH).href);
  const agent = new mod.MainAgent({
    mcpServers: researchServer.config,
    allowedTools: [researchServer.toolName],
    reviewCaller,
    artifactWrite: writeCap,
  });
  try {
    const r = await agent.turn(EXTRA_PROMPT ? `${spec.prompt}\n\n${EXTRA_PROMPT}` : spec.prompt);
    process.stdout.write(JSON.stringify({ ok: true, case: CASE, text: r.text }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, case: CASE, error: String(e).slice(0, 800) }));
  }
  process.exit(0);
}
main();