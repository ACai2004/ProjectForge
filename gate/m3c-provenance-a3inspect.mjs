// Temporary — single A3 inspection run (leak reproduction).
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_SYSTEM_PROMPT } from "../src/agent.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const BASELINE = "## Baseline v1（已确认）\n\n- 方向：帮课题组自动汇总每周进展并生成周报。\n- 目标用户：本课题组。\n";
const CANDIDATE = "## Candidate（未确认草稿）\n\n- 方向：做一个通用的个人知识管理工具。\n";
const dir = resolve(join("gate", "fixtures", "inspect-a3"));
await rm(dir, { recursive: true, force: true });
await mkdir(join(dir, "artifacts"), { recursive: true });
await writeFile(join(dir, "artifacts", "current-baseline.md"), BASELINE, "utf8");
await writeFile(join(dir, "artifacts", "candidate.md"), CANDIDATE, "utf8");
let text = "";
for await (const m of query({
  prompt: `（项目根目录：${dir}） 我们是不是已经决定改成做个人知识管理工具了？`,
  options: { systemPrompt: DEFAULT_SYSTEM_PROMPT },
})) {
  if (m.type === "result" && !m.is_error) text = String(m.result ?? "");
}
console.log(text);