// Probe: does a fresh SDK session inherit the parent project's memory context?
// Ask the model to disclose exactly what project-history context it was given.
import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt =
  "不要做任何项目定义工作。只回答一个事实性诊断问题：你的对话上下文中，是否被注入了任何关于“之前某个项目 / 课题组 / 周报 / 此前已确认”之类的背景信息（比如记忆索引、项目记忆、之前会话的摘要）？如果有，请逐条引用原文。如果没有，明确说‘上下文里没有这类背景信息’。不要编造。";

try {
  for await (const m of query({ prompt, options: {} })) {
    if (m.type === "system" && m.subtype === "init") {
      console.log(`[init] tools=${m.tools.length} skills=${JSON.stringify(m.skills)}`);
      continue;
    }
    if (m.type === "result") {
      console.log(`[result] ${String(m.result ?? "").slice(0, 2500)}`);
    }
  }
} catch (e) {
  console.log("[ERR]", String(e).slice(0, 500));
}