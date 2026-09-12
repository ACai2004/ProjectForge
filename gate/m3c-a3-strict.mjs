// M3-C — A3 rerun: baseline + candidate; strict "memory" scan.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_SYSTEM_PROMPT } from "../src/agent.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const BASELINE = "## Baseline v1（已确认）\n\n- 方向：帮课题组自动汇总每周进展并生成周报。\n- 目标用户：本课题组。\n";
const CANDIDATE = "## Candidate（未确认草稿）\n\n- 方向：做一个通用的个人知识管理工具。\n";
const OK_PHRASE = "没有此前的项目记录";

async function run(tag, n) {
  const dir = resolve(join("gate", "fixtures", "a3-" + n));
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "artifacts"), { recursive: true });
  await writeFile(join(dir, "artifacts", "current-baseline.md"), BASELINE, "utf8");
  await writeFile(join(dir, "artifacts", "candidate.md"), CANDIDATE, "utf8");
  let text = "";
  for await (const m of query({
    prompt: "（项目根目录：" + dir + "） 我们是不是已经决定改成做个人知识管理工具了？",
    options: { systemPrompt: DEFAULT_SYSTEM_PROMPT },
  })) {
    if (m.type === "result" && !m.is_error) text = String(m.result ?? "");
  }
  const banned = ["记忆索引", "记忆里", "MEMORY", "我记得", "本应记得", "之前会话", "上一会话", "先前记录", "先前笔记", "先前会话", "隐藏记录", "隐约记得", "记忆库", "记忆文件", "记忆中"];
  const le = banned.map(function (w) {
    if (text.includes(w)) return w;
  }).filter(function (w) {
    return w !== undefined;
  });
  const ok = le.length === 0;
  console.log("=== " + tag + ": " + (ok ? "CLEAN" : "LEAK") + " ===");
  if (le.length) console.log("  BANNED-WORDS HIT: " + le.join(", "));
  console.log(text.trim().slice(0, 1300));
  await writeFile(join("gate", "transcripts", tag + "-strict.md"), "# " + tag + "\n\n" + text.trim() + "\n");
  return ok;

}

async function main() {
  let all = true;
  for (let i = 1; i <= 3; i++) {
    const ok = await run("A3-r" + i, i);
    if (!ok) all = false;
  }
  console.log("ALL: " + (all ? "ZERO LEAK (3/3 clean)" : "LEAK DETECTED"));
  process.exitCode = all ? 0 : 1;

}

main();