// Temporary Milestone 3-C integration eval harness (NOT part of formal codebase).
//
// Groups:
//   activation  — 无 /requirement-layer 前缀，验证 routing 指令是否让模型调用 Skill 工具
//   history     — 项目历史完整性：无工件 / 有 Baseline / Baseline+Candidate
//   confirmation— 显式确认语义：6 种表述，验证是否错误触发 Baseline 变更
//   behavior    — M3-B 的 8 个行为场景回归（仍用 /requirement-layer 显式加载 skill 行为）
//
// 分类：每个 scenario 结束后打印 evidence 信号（是否调 Skill 工具 / 是否读写工件 / 回复），
// 由分析者依据 transcript 判定 pass / fail / blocked / provider limitation。
//
// Run:  npx tsx gate/m3b-eval.mjs            # 全部
//       SCENARIO=act-1 npx tsx gate/m3b-eval.mjs
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_SYSTEM_PROMPT, MainAgent } from "../src/agent.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const OUT = join("gate", "transcripts");
await mkdir(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// 场景定义。
// setup.artifacts: { <filename>: content } -> 写入一个临时项目根的 artifacts/ 下，
//   并在第一轮用户输入前注入 “（项目根目录：<dir>）”，让 Agent 能定位工件。
// ---------------------------------------------------------------------------
const BASELINE_A = {
  "current-baseline.md":
    "## Baseline v1（已确认）\n\n- 方向：帮 3-5 人课题组自动汇总每周进展并生成周报。\n- 目标用户：本课题组。\n",
};

const SCENARIOS = {
  // ---------------- activation ----------------
  "act-1": {
    group: "activation",
    name: "Project exploration (no /requirement-layer) via real MainAgent dispatch",
    useMainAgent: true,
    turns: ["我想做一个给科研人员用的 AI 工具。这个想法还比较模糊，具体做什么还没想清楚。"],
  },
  "act-2": {
    group: "activation",
    name: "Ordinary conversation (no skill expected) via real MainAgent",
    useMainAgent: true,
    turns: ["今天天气怎么样？另外帮我解释一下什么是递归函数。"],
  },
  "act-3": {
    group: "activation",
    name: "Technical task (no skill expected) via real MainAgent",
    useMainAgent: true,
    turns: ["帮我调试这段代码：const x = 1; x = 2; 为什么 JavaScript 会报错？"],
  },

  // ---------------- history integrity ----------------
  "hist-1": {
    group: "history",
    name: "Fresh session, no artifacts: ask prior confirmations",
    turns: [
      "/requirement-layer 帮我看看：这个项目之前确认过目标用户是谁吗？我之前好像确认过一些内容。",
    ],
  },
  "hist-2": {
    group: "history",
    name: "Persisted Baseline is authoritative",
    setup: { artifacts: BASELINE_A },
    turns: ["/requirement-layer 继续这个项目。当前项目的定义是什么？"],
  },
  "hist-3": {
    group: "history",
    name: "Candidate (unconfirmed) must not override Baseline",
    setup: {
      artifacts: {
        "current-baseline.md":
          "## Baseline v1（已确认）\n\n- 方向：帮课题组自动汇总每周进展并生成周报。\n",
        "candidate.md": "## Candidate（未确认草稿）\n\n- 方向：做一个通用的个人知识管理工具。\n",
      },
    },
    turns: ["/requirement-layer 我们是不是已经决定改成做个人知识管理工具了？"],
  },

  // ---------------- confirmation integrity ----------------
  "conf-1": {
    group: "confirmation",
    name: 'Ambiguous: "Can we add this?"',
    setup: { artifacts: BASELINE_A },
    turns: [
      "/requirement-layer 继续这个项目（项目根已注入）。请先读当前 Baseline。",
      "我们可以把多人协作编辑加进去吗？",
    ],
  },
  "conf-2": {
    group: "confirmation",
    name: 'Ambiguous: "Can we do this?"',
    setup: { artifacts: BASELINE_A },
    turns: [
      "/requirement-layer 继续这个项目（项目根已注入）。请先读当前 Baseline。",
      "我们能不能这样做：支持多人协作编辑？",
    ],
  },
  "conf-3": {
    group: "confirmation",
    name: 'Ambiguous: "Sounds good."',
    setup: { artifacts: BASELINE_A },
    turns: [
      "/requirement-layer 继续这个项目（项目根已注入）。请先读当前 Baseline。",
      "听起来不错，支持多人协作编辑的话。",
    ],
  },
  "conf-4": {
    group: "confirmation",
    name: 'Ambiguous: "Okay."',
    setup: { artifacts: BASELINE_A },
    turns: [
      "/requirement-layer 继续这个项目（项目根已注入）。请先读当前 Baseline。",
      "好的，多人协作编辑。",
    ],
  },
  "conf-5": {
    group: "confirmation",
    name: 'Explicit: "Yes, I confirm this change."',
    setup: { artifacts: BASELINE_A },
    turns: [
      "/requirement-layer 继续这个项目（项目根已注入）。请先读当前 Baseline。",
      "是的，我确认把多人协作编辑作为项目定义的确认变更。",
    ],
  },
  "conf-6": {
    group: "confirmation",
    name: 'Explicit: "Let’s make this the new baseline."',
    setup: { artifacts: BASELINE_A },
    turns: [
      "/requirement-layer 继续这个项目（项目根已注入）。请先读当前 Baseline。",
      "让“多人协作编辑”成为这个项目新 Baseline 的一部分吧。",
    ],
  },

  // ---------------- behavior regression (M3-B suite, still dispatched) ----------------
  "b1-vague": {
    group: "behavior",
    name: "Case A vague idea",
    turns: [
      "/requirement-layer 我有一个模糊的想法，不太确定。想做一个帮人减少整理项目知识负担的东西，具体做成什么样还没想清楚。",
      "科研人员总觉得记录和整理项目知识很麻烦，想有个东西帮他们。但我还不确定要不要做成独立产品。",
    ],
  },
  "b4-technical": {
    group: "behavior",
    name: "Case I technical temptation",
    turns: [
      "/requirement-layer 我想做一个帮科研人员减少整理项目知识负担的工具。",
      "我听说现在都流行用 RAG 和向量数据库，是不是直接这么搭就行？",
    ],
  },
  "b5-candidate": {
    group: "behavior",
    name: "Case E candidate framing",
    turns: [
      "/requirement-layer 我们来把这个项目收束一下：帮一个 3-5 人的课题组自动汇总每周进展并生成周报。目标用户就是本课题组。",
      "好的，请把当前理解整理成一份 Candidate，标注每条是已确认、暂定还是未解决。",
    ],
  },
  "b8-overquestion": {
    group: "behavior",
    name: "Case J over-questioning",
    turns: [
      "/requirement-layer 我想做一个私人工具：只给我自己整理读书笔记用，非常轻量，就一个本地命令行的东西。",
      "真的就只有我自己用，不需要目标用户分析。成功指标也不用问了，我觉得差不多可以开始了。",
    ],
  },
};

// ---------------------------------------------------------------------------
const COLLECTOR_TAIL = {};

async function collector(prompt, options) {
  const msgs = [];
  try {
    for await (const m of query({ prompt, options })) {
      msgs.push(m);
    }
  } catch (e) {
    msgs.push({ type: "harness-catch", error: String(e).slice(0, 400) });
  }
  return msgs;
}

function renderMessage(m, acc) {
  if (m.type === "system" && m.subtype === "init") {
    return `[system/init] tools=${m.tools.length} skills=${JSON.stringify(m.skills)}`;
  }
  if (m.type === "system") return "";
  if (m.type === "result") {
    const tail = m.is_error ? "" : `\nREPLY: ${String(m.result ?? "").trim()}`;
    return `[result ${m.subtype}]${m.is_error ? " (error)" : ""}${tail}`.slice(0, 6000);
  }
  if (m.type === "assistant" && Array.isArray(m.content)) {
    const tools = m.content.filter((b) => b.type === "tool_use");
    if (tools.length) {
      return tools
        .map((b) => `TOOL_USE(${b.name}) input=${JSON.stringify(b.input)}`)
        .join("\n")
        .slice(0, 2000);
    }
    const texts = m.content.filter((b) => b.type === "text");
    if (texts.length) {
      if (acc.lastAssistantId === m.id) return "";
      acc.lastAssistantId = m.id;
      return `[assistant] ${texts.map((b) => b.text).join("")}`.slice(0, 6000);
    }
    return "";
  }
  return "";
}

// 注意：夹具必须放在 workspace 内（SDK 会话只允许访问工作目录，os.tmpdir 下的临时目录读不到 —
// M3-C 实测：权限墙会拦截 workspace 外的所有读写，模型会如实报告"权限未授予"）。
async function setupProject(key, scenario) {
  if (!scenario.setup?.artifacts) return { dir: null, prefix: "" };
  const dir = resolve(join("gate", "fixtures", key));
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "artifacts"), { recursive: true });
  for (const [file, content] of Object.entries(scenario.setup.artifacts)) {
    await writeFile(join(dir, "artifacts", file), content, "utf8");
  }
  return { dir, prefix: `（项目根目录：${dir}）` };
}

async function runScenario(key, scenario) {
  const { dir, prefix } = await setupProject(key, scenario);
  let sessionId;
  const acc = {};
  const lines = [];
  const evidence = { skillCalls: [], artifactReads: [], artifactWrites: [], replies: [] };
  // activation 场景走真实 MainAgent.turn()，验证运行时 dispatch（isProjectOriented → /requirement-layer）
  const agent = scenario.useMainAgent ? new MainAgent() : null;
  try {
    for (let i = 0; i < scenario.turns.length; i++) {
      let turn = scenario.turns[i];
      if (i === 0 && prefix) turn = `${prefix} ${turn}`;
      lines.push(`\n--- user turn ${i + 1} (${turn.slice(0, 60)}...) ---`);
      lines.push(`USER: ${turn}`);
      if (agent) {
        const r = await agent.turn(turn);
        sessionId = r.sessionId;
        lines.push(`REPLY: ${r.text}`);
        evidence.replies.push(r.text);
        continue;
      }
      const options = {
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        ...(sessionId ? { resume: sessionId } : {}),
      };
      const msgs = await collector(turn, options);
      const result = [...msgs].reverse().find((m) => m.type === "result");
      if (result?.session_id) sessionId = result.session_id;
      for (const m of msgs) {
        const line = renderMessage(m, acc);
        if (line) lines.push(line);
        if (m.type === "assistant" && Array.isArray(m.content)) {
          for (const b of m.content) {
            if (b.type === "tool_use") {
              const input = JSON.stringify(b.input) ?? "";
              if (/requirement-layer/.test(b.name + input)) {
                evidence.skillCalls.push(`${b.name}:${input.slice(0, 120)}`);
              }
              if (/^(Read|Glob|Bash)/.test(b.name)) {
                evidence.artifactReads.push(`${b.name}:${input.slice(0, 120)}`);
              }
              if (/^(Write|Edit|NotebookEdit)/.test(b.name)) {
                evidence.artifactWrites.push(`${b.name}:${input.slice(0, 120)}`);
              }
            }
          }
        }
        if (m.type === "result" && !m.is_error && m.result) {
          evidence.replies.push(String(m.result).trim());
        }
      }
    }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
  const file = join(OUT, `${key}.md`);
  await writeFile(file, `${file}\n\n${lines.join("\n")}\n`);
  const summary = [
    `[M3C ${key}] ${scenario.name}`,
    `  group=${scenario.group} turns=${scenario.turns.length} viaMainAgent=${scenario.useMainAgent ? "yes" : "no"}`,
    `  skillCalls=${evidence.skillCalls.length} ${evidence.skillCalls[0] ?? ""}`,
    `  artifactReads=${evidence.artifactReads.length} artifactWrites=${evidence.artifactWrites.length}`,
    `  lastReply=${(evidence.replies.at(-1) ?? "").replace(/\s+/g, " ").slice(0, 180)}`,
  ].join("\n");
  console.log(summary);
}

async function main() {
  const only = process.env.SCENARIO;
  const entries = only
    ? [Object.entries(SCENARIOS).find(([k]) => k === only)].filter(Boolean)
    : Object.entries(SCENARIOS);
  for (const [key, s] of entries) {
    try {
      await runScenario(key, s);
    } catch (e) {
      console.error(`[M3C ${key}] FAILED: ${String(e)}`);
    }
  }
  console.log(`\n[M3C] transcripts -> ${OUT}`);
}

main().catch((e) => {
  console.error("[M3C] FATAL:", e);
  process.exitCode = 1;
});