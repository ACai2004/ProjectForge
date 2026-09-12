// Probe: does the model emit tool_use in this SDK environment, and do permission
// requests surface? Answers whether "权限未授予" narratives are real or confabulated.
import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt =
  "请用 Bash 工具执行 `Get-ChildItem $env:TEMP | Select-Object -First 3`，然后把输出内容告诉我。不要编造，如果执行不了就说执行不了。";

for await (const m of query({ prompt, options: {} })) {
  if (m.type === "system" && m.subtype === "init") {
    console.log(`[init] tools=${m.tools.length} skills=${JSON.stringify(m.skills)}`);
    continue;
  }
  if (m.type === "assistant" && Array.isArray(m.content)) {
    for (const b of m.content) {
      if (b.type === "tool_use") console.log(`TOOL_USE(${b.name}) ${JSON.stringify(b.input).slice(0, 200)}`);
      if (b.type === "text") console.log(`[t] ${b.text.slice(0, 500)}`);
    }
    continue;
  }
  if (m.type === "input_request") {
    console.log(`INPUT_REQUEST: ${m.request_type}`);
    continue;
  }
  if (m.type === "result") {
    console.log(`[result ${m.subtype}] ${String(m.result ?? "").slice(0, 1200)}`);
  }
}