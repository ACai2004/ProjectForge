// Provider Compatibility Gate probe (temporary, not part of Milestone 1)
// Verifies: Claude Agent SDK (query) -> current ANTHROPIC_* env -> provider -> Claude
// Usage:  node gate.mjs            (runs Hello + multi-turn in one process)
import { query } from "@anthropic-ai/claude-agent-sdk";

const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 120_000);
const MODEL = process.env.PROBE_MODEL; // optionally override model

function authSummary() {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY ? "present" : "absent",
    authToken: process.env.ANTHROPIC_AUTH_TOKEN ? "present" : "absent",
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? "<unset>",
  };
}

function options(extra = {}) {
  return {
    // Gate only: chat loop. No Requirement-Layer tools/business logic.
    model: MODEL,
    ...extra,
  };
}

async function runTurn(prompt, extraOpts, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`> prompt: ${prompt}`);
  const started = Date.now();
  let finalText = "";
  let resultInfo = {};
  try {
    for await (const message of query({ prompt, options: options(extraOpts) })) {
      if (message.type === "result") {
        resultInfo = {
          subtype: message.subtype,
          is_error: message.is_error,
          session_id: message.session_id,
          num_turns: message.num_turns,
          stop_reason: message.stop_reason,
        };
        if (message.subtype === "success") finalText = message.result;
        else console.log(`[result error subtype: ${message.subtype}]`);
      }
      if (message.type === "assistant" && "error" in message && message.error) {
        console.log(`[assistant error: ${message.error}]`);
      }
    }
  } catch (err) {
    console.log(`[query threw] ${err && err.message ? err.message : err}`);
    return { ok: false, error: err };
  }
  const ms = Date.now() - started;
  console.log(`> time: ${ms}ms | result: ${JSON.stringify(resultInfo)}`);
  if (finalText) {
    console.log(`> agent text:`);
    console.log(finalText.split("\n").slice(0, 12).map((l) => `    ${l}`).join("\n"));
  }
  return { ok: !resultInfo.is_error, text: finalText, sessionId: resultInfo.session_id };
}

async function main() {
  console.log("Provider Compatibility Gate — Claude Agent SDK");
  console.log("auth:", JSON.stringify(authSummary()));
  console.log("SDK query() probe starting...");

  // 1) single-turn Hello
  const hello = await runTurn("Hello", {}, "Hello (single turn)");
  if (!hello.ok) {
    console.log("\n[GATE] Hello FAILED. Stopping before multi-turn.");
    process.exitCode = 2;
    return;
  }

  // 2) multi-turn: same session, second turn must recall first
  const t1 = await runTurn("我的名字是 Alice。", {}, "multi-turn #1 (lecture)");
  if (!t1.ok) {
    console.log("\n[GATE] multi-turn turn#1 FAILED.");
    process.exitCode = 3;
    return;
  }
  const t2 = await runTurn("我刚才在对话中说我的名字是什么？", { continue: true }, "multi-turn #2 (memory check)");
  if (!t2.ok) {
    console.log("\n[GATE] multi-turn turn#2 FAILED.");
    process.exitCode = 4;
    return;
  }

  const recalled = t2.text ? /\bAlice\b/.test(t2.text) : false;
  console.log(`\n[GATE] RECALL echoed 'Alice' in turn#2 reply: ${recalled}`);
  console.log(`[GATE] session continuity (same session_id both turns): ${t1.sessionId === t2.sessionId ? "YES" : `NO (${t1.sessionId} vs ${t2.sessionId})`}`);
  console.log(`[GATE] RESULT: ${hello.ok && t1.ok && t2.ok ? "PASS" : "FAIL"}`);
}

main();