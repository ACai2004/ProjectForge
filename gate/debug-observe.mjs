// Temporary debug observer (not part of Milestone 1). Prints only request URLs/hints; never logs raw credentials.
import { query } from "@anthropic-ai/claude-agent-sdk";

// Minimal turn, debug on. We only extract host/URL fragments below.
for await (const m of query({
  prompt: "Reply with the single word PING",
  options: { debug: true, maxTurns: 1 },
})) {
  // consume stream; nothing printed raw
}
console.log("__DEBUG_RUN_DONE__");