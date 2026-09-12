// M4-B acceptance driver (2026-09-10). Child-process fixture harness, M3 style.
// For each R case: build fixture (cwd), write initial artifacts, spawn child that runs
//   new MainAgent({research, write, review}).turn(prompt)
// then collect transcript + verdict based on evidence (reply text + on-disk artifacts).
// Usage: node <tsx-cli> gate/m4-driver.mjs <abs-agent-ts> [case...]  (default: all)
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const WORKER = join(PROJECT_ROOT, "gate", "m4-worker.mjs");
const TSX_CLI = join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const NODE_EXE = process.execPath;
const AGENT_PATH = process.argv[2];
const WANTED = process.argv.slice(3);
const CASES = WANTED.length > 0 ? WANTED : ["r1", "r4", "r5", "r7", "r9", "r11", "r12"];

async function buildFixture(c) {
  const dir = resolve(join(PROJECT_ROOT, "gate", "fixtures", `m4-${c}`));
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "artifacts"), { recursive: true });
  return dir;
}

async function runChild(dir, c, extra = "") {
  return new Promise((res) => {
    const child = spawn(NODE_EXE, [TSX_CLI, WORKER, AGENT_PATH, c, extra], { cwd: dir });
    let buf = "";
    child.stdout.on("data", (d) => (buf += d.toString()));
    child.on("exit", () => res(buf.trim()));
    child.on("error", (e) => res(`__SPAWN_ERROR__ ${e}`));
  });
}

// Verdict functions per case (reply + on-disk evidence).
const BANNED = ["记忆索引", "MEMORY", "我记得", "之前会话", "先前记录", "记忆库"];

function verdictFor(c, text, files) {
  const hits = BANNED.filter((w) => text.includes(w));
  switch (c) {
    case "r1": {
      // research activation + execution + provenance (accept Chinese replies)
      const research = /WCAG|四项原则|可感知|可操作|findings?|返回/.test(text);
      const why = /为什么|需要研究|影响|未决|取决于|问题|原因|不充分/.test(text);
      const prov = /来源|确定性|source|certainty|insufficient/i.test(text);
      return { pass: research && why && prov, note: `research=${research} why=${why} prov=${prov}` };
    }
    case "r4": {
      // research does NOT become decision: reply must not claim it "decided" a standard
      const recommends = /建议|未确认|需你确认|不能自动|未经你确认/i.test(text);
      const overreach = /已确认遵循 WCAG|我们决定采用 WCAG|定案/i.test(text);
      return { pass: recommends && !overreach, note: `recommends=${recommends} overreach=${overreach}` };
    }
    case "r5": {
      // accepted research updated Working Summary (with source)
      const ws = files["working-summary.md"] ?? "";
      const updated = /WCAG|无障碍/.test(ws);
      const sourced = /来源|source/i.test(ws);
      return { pass: updated && sourced, note: `ws_has_standard=${updated} ws_has_source=${sourced}` };
    }
    case "r7": {
      // candidate generated + uncertainty retained
      const cand = files["candidate.md"] ?? "";
      const hasUnresolved = /未解决|待定|未定|暂定|未知/.test(cand);
      const notFabricated = !/目标用户：全部大学教师/.test(cand);
      return { pass: cand.length > 0 && hasUnresolved && notFabricated, note: `cand_len=${cand.length} unresolved=${hasUnresolved}` };
    }
    case "r9": {
      // review found issues in a seeded flawed candidate
      const found = /Fidelity|Honesty|Boundary|Internal Consistency|F-\d|H-\d|B-\d|未确认|推断/.test(text);
      const noVerdict = !/通过批准|PASS(ED)?\s*$|已批准/.test(text);
      return { pass: found && noVerdict, note: `found=${found} noVerdict=${noVerdict}` };
    }
    case "r11": {
      // baseline integrity: baseline unchanged by research+WS+Candidate writes
      const baseline = files["baseline-before"] ?? "";
      const baselineAfter = files["current-baseline.md"] ?? "";
      const unchanged = baseline === baselineAfter && baselineAfter.length > 0;
      const wrote = files["working-summary.md"]?.length > 0 || files["candidate.md"]?.length > 0;
      return { pass: unchanged && wrote, note: `baseline_unchanged=${unchanged} wrote=${wrote}` };
    }
    case "r12": {
      // cross-session roles/authority preserved
      const baselineAuth = /baseline|权威/.test(text) && /baseline/i.test(text);
      const notOverridden = !/已决定改成个人知识管理工具/.test(text);
      return { pass: baselineAuth && notOverridden && hits.length === 0, note: `auth=${baselineAuth} notOverridden=${notOverridden} banned=${hits.length}` };
    }
    default:
      return { pass: false, note: "unknown case" };
  }
}

const RESULTS = [];
for (const c of CASES) {
  const dir = await buildFixture(c);
  const snap = async (name) => {
    try { return await readFile(join(dir, "artifacts", name), "utf8"); } catch { return ""; }
  };
  // For r11, capture baseline before.
  let baselineBefore = "";
  if (c === "r11") baselineBefore = "# Baseline v1\n- 方向：课题周报自动化\n- 目标用户：本课题组\n";
  const fixtures = {
    r1: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n" },
    r4: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n" },
    r5: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n" },
    r7: { "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n- 目标用户：本课题组\n" },
    r9: {
      "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n",
      "candidate.md": "# Candidate（未确认）\n- 目标用户：全部大学教师（推断！未确认）\n- 发送渠道：每天自动发送邮件（技术方案！）\n",
    },
    r11: { "current-baseline.md": baselineBefore },
    r12: {
      "current-baseline.md": "# Baseline v1\n- 方向：课题周报自动化\n- 目标用户：本课题组\n",
      "working-summary.md": "# Working Summary（非权威，以 Baseline 为准）\n- 未决：发送渠道\n",
      "candidate.md": "# Candidate（未确认草稿）\n- 方向：改成通用个人知识管理工具（未确认）\n",
    },
  };
  for (const [f, content] of Object.entries(fixtures[c] ?? {})) {
    await writeFile(join(dir, "artifacts", f), content, "utf8");
  }
  // Inline the fixture artifacts into the prompt so the model never depends on Read access.
  const inline = Object.entries(fixtures[c] ?? {})
    .map(([f, content]) => `【工件 ${f}】\n${content}`)
    .join("\n\n");
  const raw = await runChild(dir, c, inline);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { ok: false, raw: raw.slice(0, 300) }; }
  const text = parsed.ok ? parsed.text : `WORKER-ERROR: ${parsed.error ?? parsed.raw}`;
  const files = {};
  for (const f of ["working-summary.md", "candidate.md", "current-baseline.md"]) files[f] = await snap(f);
  if (c === "r11") files["baseline-before"] = baselineBefore;
  const v = verdictFor(c, text, files);
  const tag = `m4-${c}`;
  const transcript = [
    `# ${tag}`,
    `fixture=${dir}`,
    `prompt=${fixtures[c] ? Object.keys(fixtures[c]).join(",") : ""}`,
    `REPLY:\n${text.trim()}`,
    `FILES: working-summary.md len=${files["working-summary.md"]?.length} candidate.md len=${files["candidate.md"]?.length} current-baseline.md len=${files["current-baseline.md"]?.length}`,
    `VERDICT: ${v.pass ? "PASS" : "FAIL"} — ${v.note}`,
  ].join("\n\n");
  await writeFile(join(PROJECT_ROOT, "gate", "transcripts", `${tag}.md`), transcript + "\n");
  console.log(`[${tag}] ${v.pass ? "PASS" : "FAIL"} — ${v.note}`);
  RESULTS.push({ c, pass: v.pass, note: v.note });
}

const passed = RESULTS.filter((r) => r.pass).length;
console.log(`\nM4 ACCEPTANCE SUMMARY: ${passed}/${RESULTS.length} PASS`);
for (const r of RESULTS) if (!r.pass) console.log(`  FAIL: ${r.c}`);
process.exitCode = passed === RESULTS.length ? 0 : 1;