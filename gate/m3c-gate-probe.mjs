// Guard-gate probe: is parent project memory injected into a fresh SDK session,
// and does the model disclose it in any context (memory index, prior project)?
import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt =
  "做一个事实性诊断，不要做任何项目定义。你的上下文中是否有被注入的“项目记忆 / 记忆索引 / 此前项目背景”信息（例如提到课题组、周报、已确认等）？请逐条引用原文并说明放在哪个字段。如果没有，明确说“没有注入”。不要编造。";

for await (const m of query({ prompt, options: {} })) {
  if (m.type === "system" && m.subtype === "init") {
    console.log(`[init] tools=${m.tools.length} skills=${JSON.stringify(m.skills)}`);
    continue;
  }
  if (m.type === "result") {
    console.log(`[result] ${String(m.result ?? "").slice(0, 3000)}`);
  }
}