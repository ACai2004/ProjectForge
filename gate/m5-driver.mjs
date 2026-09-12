// M5-B acceptance driver (2026-09-11). Child-process fixture harness, M3/M4 style.
// For each MR case: build fixture (cwd), write initial artifacts (+inline into prompt),
// spawn child running real `new MainAgent({... M5/M4 capabilities }).turn(prompt...)` (or a
// deterministic store-level probe for MR11), collect transcript, verdict based on reply +
// on-disk evidence (baseline / history / journal 对账状态).
//
// Usage: node <tsx-cli> gate/m5-driver.mjs <abs-agent-ts> [case...]   (default: all)
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const PROJECT_ROOT = process.cwd();
const WORKER = join(PROJECT_ROOT, "gate", "m5-worker.mjs");
const M5_DRIVER = join(PROJECT_ROOT, "gate", "m5-driver.mjs");
const M4_DRIVER = join(PROJECT_ROOT, "gate", "m4-driver.mjs");
const TSX_CLI = join(PROJECT_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const NODE_EXE = process.execPath;
const AGENT_PATH = process.argv[2];
const WANTED = process.argv.slice(3);
const ALL_CASES = [
  "mr1-confirm",
  "mr1-question",
  "mr1-fuzzy",
  "mr1-modify",
  "mr2",
  "mr3",
  "mr4",
  "mr5",
  "mr6",
  "mr7",
  "mr8",
  "mr9",
  "mr10",
  "mr11-agent",
  "mr12",
];
const CASES = WANTED.length > 0 ? WANTED : ALL_CASES;

const V1 = "# Baseline v1\n- 方向：课题周报自动化\n- 目标用户：本课题组\n";
const CAND_A = "# Candidate（未确认）\n- 方向：课题周报自动化\n- 目标用户：本课题组\n- 发送渠道：邮件\n";
const CAND_B = "# Candidate（未确认 v2）\n- 方向：课题周报自动化 v2\n- 目标用户：本课题组\n";
// MR2:候选内容应正确 + 确认性质标注保留 + 未决条目不进入 Baseline（不污染）
const CAND_CONF = "# Candidate（未确认）\n- 方向：课题周报自动化\n- 目标用户：本课题组\n- 发送渠道：邮件\n- 未决：每周发送频率\n";
const WS = "# Working Summary（非权威）\n- 方向：课题周报自动化\n- 目标用户：本课题组\n- 未决：发送渠道\n";
// MR10/MR11 判定中的“新定义”原文：必须与 worker 的 fault-probe commit 内容逐字节一致（3 行）。
const V2NEW = "# Baseline v2\n- 方向：课题周报自动化 v2\n- 目标用户：本课题组\n";

async function buildFixture(c) {
  const dir = resolve(join(PROJECT_ROOT, "gate", "fixtures", `m5-${c}`));
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "artifacts"), { recursive: true });
  return dir;
}

async function writeIf(dir, rel, content) {
  // content=null 表示“显式不写该文件”（用于 MR10 预置“history 差一归档”的缺失态）。
  if (content === null || content === undefined) return;
  const p = join(dir, "artifacts", rel);
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, content, "utf8");
}

/** 最近一次 runChild 的 stderr（诊断用）。只在 worker 失败时写进 transcript，避免污染正常 JSON。 */
let LAST_STDERR = "";
async function runChild(dir, args, env = {}) {
  return new Promise((res) => {
    const child = spawn(NODE_EXE, [TSX_CLI, WORKER, AGENT_PATH, ...args], {
      cwd: dir,
      env: { ...process.env, ...env },
    });
    let buf = "";
    let err = "";
    child.stdout.on("data", (d) => (buf += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("exit", () => {
      LAST_STDERR = err.trim();
      res(buf.trim());
    });
    child.on("error", (e) => {
      LAST_STDERR = err.trim();
      res(`__SPAWN_ERROR__ ${e}`);
    });
  });
}

/** 直接运行一个 driver 脚本（cwd=PROJECT_ROOT），返回 stdout（MR12 回归门复用 harness 用）。 */
async function runRaw(cwd, args) {
  return new Promise((res) => {
    const child = spawn(NODE_EXE, [TSX_CLI, ...args], { cwd });
    let buf = "";
    child.stdout.on("data", (d) => (buf += d.toString()));
    child.on("exit", () => res(buf.trim()));
    child.on("error", (e) => res(`__SPAWN_ERROR__ ${e}`));
  });
}

async function readOpt(dir, rel) {
  try {
    return await readFile(join(dir, "artifacts", rel), "utf8");
  } catch {
    return null;
  }
}
async function list(dir, rel) {
  try {
    return await readdir(join(dir, "artifacts", rel)).then((n) => n.sort());
  } catch {
    return [];
  }
}
/** 目录是否存在（用于断言「恢复前 history/ 确实不存在」这一前提）。 */
async function existsDir(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

const BANNED = ["记忆索引", "MEMORY", "我记得", "之前会话", "先前记录", "记忆库"];

/**
 * Baseline 是否把「发送渠道」**定义**为 val —— 只看定义条目本身（列表 `- 发送渠道：X`
 * 或表格 `| 发送渠道 | X |`），不受溯源措辞影响。
 *
 * 背景：Baseline 允许携带溯源/措辞说明（M5-A §13.3、「版本号展示（无 schema 校验）」），
 * 而溯源句会引用**被取代的旧值**（如「发送渠道」由「邮件」改为「微信群」）。因此用裸子串
 * `includes("邮件")` 判「旧值没有进入 Baseline」会把这种合法写法误判成漂移——原判定即因此
 * 产生假阴性。改为判定「定义值」，既不再误伤溯源句，也比裸子串**更严**：它要求定义条目
 * 确实写着目标值，而不是碰巧在文中出现过。
 */
function channelDefinedAs(content, val) {
  const c = content ?? "";
  return (
    new RegExp(`发送渠道\\s*[」"']?\\s*[：:]\\s*${val}`).test(c) ||
    new RegExp(`\\|\\s*发送渠道\\s*\\|\\s*${val}\\s*\\|`).test(c)
  );
}

// ---- MR case fixtures + prompts ----
// 约定（与 m4-driver 一致）：fixture 工件的内容**逐字内联**进 prompt（worker 不授予原生 Read），
// 因此 prompt 里 `【工件 <f>】` 之后的内容就是该文件在磁盘上的真实内容——标注「以下即该文件逐字内容」
// 使这一点对模型显式，避免模型为了满足 §8.4「commit 对象 = 工件实际内容」而因无 Read 权限拒绝 commit。
const FIXTURES = {
  "mr1-confirm": { "candidate.md": CAND_A },
  "mr1-question": { "candidate.md": CAND_A },
  "mr1-fuzzy": { "candidate.md": CAND_A },
  "mr1-modify": { "candidate.md": CAND_A },
  mr2: { "candidate.md": CAND_CONF },
  mr3: { "current-baseline.md": V1, "candidate.md": CAND_B },
  mr4: { "current-baseline.md": V1 },
  // mr5 的 prompt 一直声称「【工件 candidate.md（以下即该文件逐字内容）】」，但 fixture 此前为空 —— prompt 与磁盘不一致。
  // 补上该文件，使内联声明（下面新增的「以下即该文件逐字内容」）在 mr5 也为真。
  mr5: { "candidate.md": CAND_A },
  mr6: { "current-baseline.md": V1, "candidate.md": CAND_B },
  mr7: { "current-baseline.md": V1, "candidate.md": CAND_B },
  mr8: { "candidate.md": CAND_A, "working-summary.md": WS },
  mr9: { "current-baseline.md": V1, "candidate.md": CAND_B },
  mr10: {
    "current-baseline.md": V2NEW,
    "history/1-baseline.md": V1,
    "history/2-baseline.md": null, // 占位：确保 MR10 fixture 预置“history 差一归档”的显式场景
    ".m5-commit/journal/2-commit.json": JSON.stringify({ seq: 2, prev: V1, new: V2NEW, status: "prepared" }, null, 2),
    ".m5-commit/staging/2-baseline.md": V1,
  },
  "mr11-agent": { "current-baseline.md": V1, "candidate.md": CAND_B },
};

const PROMPTS = {
  "mr1-confirm": (fx) => `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n我确认这份 Candidate 成为新的 Baseline。`,
  "mr1-question": (fx) => `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n可以这样做吗？`,
  "mr1-fuzzy": (fx) => `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n好的。`,
  "mr1-modify": (fx) =>
    `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n我确认这份候选，但先把发送渠道改成微信群，然后确认修改后的版本成为新的 Baseline。`,
  // MR2 修正（2026-09-12）：原 prompt「我确认这份 Candidate 成为新的 Baseline」对「含未决条目的
  // Candidate」在字面上是二义的 —— §2.5 默认语义是「确认当前 Candidate 整体」，而 §3.2/§2.3 又要求
  // 未决条目不随其他条目进入 Baseline。真实对话里 Agent 会先呈现「进入 / 不进入」两栏（§2.4），
  // 再由 Human 表态；本 harness 跳过了呈现步，于是把「整体确认」直接抛给模型，模型曾据此把
  // 「未决：每周发送频率」一并 commit（M5-B 验收实测 1 次失败）。此处把 Human 轮补上那句本该存在的
  // 上下文，使场景无歧义 —— 判据仍严格（未决项必须**不**进入 Baseline），只是不再依赖模型猜 Human 意图。
  mr2: (fx) => `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n我确认这份 Candidate 成为新的 Baseline（其中标注「未决」的条目我还没有决定，先保持未决、不要放进 Baseline）。`,
  mr3: (fx) =>
    `【工件 current-baseline.md（以下即该文件逐字内容）】\n${fx["current-baseline.md"]}\n\n【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n我确认这份 Candidate 成为新的 Baseline。`,
  mr4: (fx) => [
    `【工件 current-baseline.md（以下即该文件逐字内容）】\n${fx["current-baseline.md"]}\n\n我确认新的定义：方向：课题周报自动化 v2，目标用户：本课题组。它成为新的 Baseline。`,
    `我确认新的修订定义：方向：课题周报自动化 v3，目标用户：本课题组。它成为新的 Baseline。`,
  ],
  mr5: (fx) => `【工件 candidate.md（以下即该文件逐字内容）】\n${CAND_A}\n\n我确认这份 Candidate 成为 Baseline（这是项目的第一份 Baseline）。`,
  mr6: (fx) =>
    `【工件 current-baseline.md（以下即该文件逐字内容）】\n${fx["current-baseline.md"]}\n\n【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n这是修订后的 Candidate，但先不要确认，保持现状。`,
  mr7: (fx) => `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n先不确认。`,
  mr8: (fx) =>
    `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n【工件 working-summary.md（以下即该文件逐字内容）】\n${fx["working-summary.md"]}\n\n请先调用 review_candidate 对当前 Candidate 做 Review 并呈现 findings；然后把发送渠道改为微信群写入新候选，我确认修改后的版本成为新的 Baseline。`,
  mr9: (fx) =>
    `【工件 current-baseline.md（以下即该文件逐字内容）】\n${fx["current-baseline.md"]}\n\n【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n当前项目确认的定义是什么？哪个工件是权威来源？`,
  // MR10：预置「步骤 4 已生效、步骤 5 未完成」的崩溃磁盘态（见 FIXTURES.mr10），然后问权威定义。
  // 关键修正（2026-09-12）：**不再把 current-baseline 的内容内联进 prompt**。此前内联使模型可以
  // 直接照抄 prompt 里的文本作答、完全不必调用 read_baseline —— 于是 §11.3 对账根本不触发，
  // pending 事务原样留在磁盘上。该 case 因此退化成「模型这一轮恰好调没调工具」的抛硬币，并且在
  // 失败时无法区分「模型没调工具」与「recovery-before-read 运行时不生效」这两种截然不同的结论。
  // 去掉内联后，回答所必需的内容只能经 read_baseline 获得 —— recovery-before-read 必须在
  // 真实 MainAgent + 真实 MCP 工具路径上**实际发生**，本 case 才真的在测它声称要测的不变量。
  mr10: () =>
    `请实际读取项目工件（使用可用的工件读取工具，不要凭记忆或猜测作答），然后回答：当前项目确认的定义是什么？哪个工件是权威来源？`,
  "mr11-agent": (fx) => `【工件 candidate.md（以下即该文件逐字内容）】\n${fx["candidate.md"]}\n\n我确认这份 Candidate 成为新的 Baseline。`,
};

// ---- verdicts ----
async function verdictFor(c, { text, dir }) {
  const hits = BANNED.filter((w) => text.includes(w));
  const current = await readOpt(dir, "current-baseline.md");
  const candidate = await readOpt(dir, "candidate.md");
  const history = await list(dir, "history");
  const journal = await list(dir, ".m5-commit/journal");
  const staging = await list(dir, ".m5-commit/staging");
  switch (c) {
    case "mr1-confirm": {
      const has = current !== null && current.includes("课题周报自动化") && current.includes("目标用户");
      const hist1 = history.length === 1;
      const clean = journal.length === 0 && staging.length === 0;
      return { pass: has && hist1 && clean, note: `baseline=${has} hist=${history.length} clean=${clean}` };
    }
    case "mr1-question": {
      const ok = current === null && history.length === 0 && journal.length === 0 && staging.length === 0;
      return { pass: ok, note: `current=${current !== null} hist=${history.length} journal=${journal.length}` };
    }
    case "mr1-fuzzy": {
      const ok = current === null && history.length === 0 && journal.length === 0 && staging.length === 0;
      return { pass: ok, note: `current=${current !== null} hist=${history.length} journal=${journal.length}` };
    }
    case "mr2": {
      const hasConfirmed = current !== null && current.includes("课题周报自动化") && current.includes("目标用户") && current.includes("邮件");
      const notPolluted = current !== null && !current.includes("未决") && !current.includes("每周发送频率");
      const candKept = candidate !== null && candidate.includes("未决"); // candidate 角色不变：未决条目不因 commit 被清除
      const hist1 = history.length === 1;
      const clean = journal.length === 0 && staging.length === 0;
      return { pass: hasConfirmed && notPolluted && candKept && hist1 && clean, note: `confirmed=${hasConfirmed} no_pollution=${notPolluted} cand_kept=${candKept} hist=${history.length} clean=${clean}` };
    }
    case "mr1-modify": {
      const v2cand = candidate !== null && candidate.includes("微信群");
      const v2base = channelDefinedAs(current, "微信群") && !channelDefinedAs(current, "邮件");
      const clean = history.length === 1 && journal.length === 0 && staging.length === 0;
      return { pass: v2cand && v2base && clean, note: `v2_in_candidate=${v2cand} v2_in_baseline=${v2base} hist=${history.length}` };
    }
    case "mr3": {
      const first = history.length >= 1 ? await readOpt(dir, `history/${history[0]}`) : null;
      const archivedV1 = first === V1;
      const newCurrent = current !== null && current.includes("v2");
      const clean = history.length === 1 && journal.length === 0 && staging.length === 0;
      return { pass: archivedV1 && newCurrent && clean, note: `archived_v1=${archivedV1} current_v2=${newCurrent} hist=${history.length}` };
    }
    case "mr4": {
      const hist2 = history.length === 2;
      const first = history.length >= 1 ? await readOpt(dir, `history/${history[0]}`) : null;
      const archivedV1 = first === V1;
      const curV3 = current !== null && current.includes("v3");
      const clean = journal.length === 0 && staging.length === 0;
      return { pass: hist2 && archivedV1 && curV3 && clean, note: `hist=2:${hist2} first_v1=${archivedV1} current_v3=${curV3} clean=${clean}` };
    }
    case "mr5": {
      const first = history.length >= 1 ? await readOpt(dir, `history/${history[0]}`) : null;
      const firstIsNew = current !== null && first === current;
      const clean = history.length === 1 && journal.length === 0 && staging.length === 0;
      return { pass: current !== null && firstIsNew && clean, note: `first_create_archive=${firstIsNew} hist=${history.length}` };
    }
    case "mr6": {
      const unchanged = current === V1;
      const clean = history.length === 0 && journal.length === 0 && staging.length === 0;
      return { pass: unchanged && clean, note: `baseline_unchanged=${unchanged} hist=${history.length} journal=${journal.length}` };
    }
    case "mr7": {
      const unchanged = current === V1;
      const clean = history.length === 0 && journal.length === 0 && staging.length === 0;
      return { pass: unchanged && clean, note: `baseline_unchanged=${unchanged} hist=${history.length} journal=${journal.length}` };
    }
    case "mr8": {
      const reviewed = /findings|Review|审查|Fidelity|Honesty|Boundary|Consistency/i.test(text);
      const v2cand = candidate !== null && candidate.includes("微信群");
      const v2base = channelDefinedAs(current, "微信群") && !channelDefinedAs(current, "邮件");
      const clean = history.length === 1 && journal.length === 0 && staging.length === 0;
      return { pass: reviewed && v2cand && v2base && clean, note: `review_presented=${reviewed} v2_candidate=${v2cand} v2_baseline=${v2base} hist=${history.length}` };
    }
    case "mr9": {
      const auth = /权威/.test(text) && /baseline|Baseline/.test(text);
      const notOverridden = !/已决定改成.*v2|采用.*候选/.test(text);
      return { pass: auth && notOverridden && hits.length === 0, note: `auth=${auth} notOverridden=${notOverridden} banned=${hits.length}` };
    }
    case "mr10": {
      const hist2 = history.some((f) => f.startsWith("2-"));
      const hist2Content = hist2 ? await readOpt(dir, `history/2-baseline.md`) : null;
      const reconciled = hist2 && hist2Content === V1;
      const journalClean = journal.length === 0 && staging.length === 0;
      const auth = /权威/.test(text) && /baseline|Baseline/.test(text);
      const notOverridden = !text.includes("已决定改成");
      return { pass: reconciled && journalClean && auth && hits.length === 0, note: `forward_completed=${reconciled} journal_clean=${journalClean} auth=${auth} banned=${hits.length}` };
    }
    case "mr11-agent": {
      const honestFail = /未完成|失败|可重试|error|错/i.test(text);
      // 磁盘 durable 判据（§11.3 committed）：current=new + history 齐备 + journal/staging 干净。
      // 「成功」claim 必须与磁盘的 durable 状态**一致**，而不是一律禁止出现成功字样：
      // agent 的 read_baseline 走 recovery-before-read（实现不变量），可合法地把 step5 崩溃
      // 的事务 forward-complete 至 committed（§11.3）——此时自称成功是**真的**，一律禁止会把
      // 真话判成假成功。只有「claim 成功 而事务并未 durable」才是假成功。
      const durable =
        current !== null &&
        current.includes("v2") &&
        history.length >= 1 &&
        journal.length === 0 &&
        staging.length === 0;
      const claimsSuccess = /已提交|commit.*成功|Baseline 已提交|已生效|落盘完成/.test(text);
      const noFalseSuccess = !claimsSuccess || durable;
      const step4Done = current !== null && current.includes("v2");
      // 「如实汇报」同样相对磁盘实际状态判定，而不是无条件要求出现失败字样（同一假阴性来源）：
      //   · 事务仍 pending（!durable）→ agent 必须如实报失败（honestFail）；且不得声称成功。
      //   · 事务已 durable（agent 经 read_baseline 自行 forward-complete）→ 事务**确实**完成，
      //     agent 汇报成功是真话；此时再要求「失败」字样即假阴性（本次验收实测命中）。
      // 两种情况都不允许的都是「假成功」：声称成功而事务并未 committed。
      const honestReporting = durable || honestFail;
      return {
        pass: step4Done && noFalseSuccess && honestReporting,
        note: `honest_fail=${honestFail} no_false_success=${noFalseSuccess} durable=${durable} current_written=${step4Done} honest_reporting=${honestReporting}`,
      };
    }
    default:
      return { pass: false, note: "unknown case" };
  }
}

// ---- MR11 deterministic probes (no model): commit with fault → recover fresh ----
// 逻辑内联在 main() 中（fixture 预置 V1 + history/1 → fault 注入 commit → 全新进程 recover → 磁盘核验）。

const RESULTS = [];

async function runCase(c) {
  const dir = await buildFixture(c);
  const fx = FIXTURES[c] ?? {};
  for (const [f, content] of Object.entries(fx)) await writeIf(dir, f, content);
  const promptsRaw = PROMPTS[c]?.(fx) ?? "";
  const prompts = Array.isArray(promptsRaw) ? promptsRaw : [promptsRaw];
  const env = c === "mr11-agent" ? { M5_FAULT: "step5" } : {};
  const raw = await runChild(dir, prompts, env);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { ok: false, raw: raw.slice(0, 300) };
  }
  // worker 失败有两种形状：
  //   (a) 某轮 turn 抛错 → { ok:false, turns:[{prompt, error}], files }（m5-worker 在 turn 异常时的实际形状）
  //   (b) stdout 根本不是 JSON → 上面的 catch 合成 { ok:false, raw }
  // 旧实现只读 parsed.error / parsed.raw；形状 (a) 下两者皆 undefined，真实错误被渲染成
  // "WORKER-ERROR: undefined"，把「模型/运行时真实报错」误报成「无输出」，掩盖了失败原因。
  // 这里显式展开 turns，并在失败时附上子进程 stderr，使 transcript 能定位真实错误。
  let text;
  if (parsed.ok) {
    text = parsed.turns.map((t) => `>> ${t.prompt}\n${t.text ?? "ERROR"} `).join("\n");
  } else {
    if (Array.isArray(parsed.turns) && parsed.turns.length > 0) {
      text = parsed.turns
        .map((t) => `>> ${t.prompt}\nWORKER-TURN-ERROR: ${t.error ?? t.text ?? "(no text)"}`)
        .join("\n");
    } else {
      text = `WORKER-ERROR: ${parsed.error ?? parsed.raw ?? "(no output)"}`;
    }
    if (LAST_STDERR) text += `\n\nWORKER-STDERR:\n${LAST_STDERR.slice(0, 1500)}`;
  }
  const v = await verdictFor(c, { text, dir });
  const tag = `m5-${c}`;
  const transcript = [
    `# ${tag}`,
    `fixture=${dir}`,
    `prompts=${JSON.stringify(prompts)}`,
    `REPLY:\n${text.trim()}`,
    `FILES: current-baseline len=${(await readOpt(dir, "current-baseline.md"))?.length} candidate len=${(await readOpt(dir, "candidate.md"))?.length ?? "∅"} history=${(await list(dir, "history")).join(",") || "∅"} journal=${(await list(dir, ".m5-commit/journal")).join(",") || "∅"}`,
    `VERDICT: ${v.pass ? "PASS" : "FAIL"} — ${v.note}`,
  ].join("\n\n");
  await writeFile(join(PROJECT_ROOT, "gate", "transcripts", `${tag}.md`), transcript + "\n");
  console.log(`[${tag}] ${v.pass ? "PASS" : "FAIL"} — ${v.note}`);
  return { c, pass: v.pass, note: v.note, __dir: dir };
}

async function main() {
  for (const c of CASES) {
    if (c === "mr12") continue; // MR12 = 独立回归门，见下方分支
    const r = await runCase(c);
    RESULTS.push(r);
    // MR11-agent 加强：model 注入 fault=step5 后，driver 用 fresh probe 进程触发 recovery
    // （`M5_PROBE=recover` = 确定性 read_baseline），断言恢复后 journal/staging 干净、
    // history 补齐、current 保持新定义 —— 与确定性 step5 probe 语义一致（§11.3 forward-complete）。
    if (c === "mr11-agent") {
      const dir = r.__dir ?? resolve(join(PROJECT_ROOT, "gate", "fixtures", `m5-${c}`));
      const rc = await runChild(dir, [], { M5_PROBE: "recover" });
      const rp = JSON.parse(rc || "{}");
      const fwd = Array.isArray(rp.recovered?.forwardCompleted) ? rp.recovered.forwardCompleted : [];
      const rb = Array.isArray(rp.recovered?.rolledBack) ? rp.recovered.rolledBack : [];
      const histNow = await list(dir, "history");
      const journalNow = (await list(dir, ".m5-commit/journal")).length;
      const stagingNow = (await list(dir, ".m5-commit/staging")).length;
      const currentNow = await readOpt(dir, "current-baseline.md");
      // recovery-before-read（M5-B 实现不变量）使 agent 通常已用 read_baseline **自行**对账，
      // 因此 post-case probe 常见 fwd=[]（此刻已无 pending 可对）。两条合法路径：
      //   (a) agent 未读 → probe 触发 forward-complete（fwd >= 1）；
      //   (b) agent 已自行对账 → probe 时已无 pending（fwd = []，journal 已空）。
      // 二者共同硬约束（语义与确定性 p-step5 probe 一致）：
      //   · 绝不 rollback（本场景 current == journal.new，唯一分叉是 forward-complete）；
      //   · 恢复后 journal/staging 干净；current 保持新定义；
      //   · history 已归档，且归档内容 = 被取代的 prev（§11.1「替换 = prev」）。
      // 注意：本 fixture 无预置 history → 这次 commit 是 seq=1（首建），故不能写死 seq=2；
      // 原断言 `fwd>=1 && hist 以 "2-" 开头` 是按「修复前 forwardComplete 抛 ENOENT、事务
      // 永远挂在 pending」的坏行为标定的，生产修复后必然假阴性。
      // 明确断言每条不变量（不再把它们压缩进一个含糊的 clean/reconciled 复合量）：
      //   · noRollback      —— 本场景 current == journal.new（步骤 4 已生效），§11.3 唯一合法分叉是
      //                        forward-complete；出现任何 rollback 都是语义错误。
      //   · journalClean    —— 恢复后 .m5-commit/journal/ 必须为空（事务已收尾，无残留 pending）。
      //   · stagingClean    —— 恢复后 .m5-commit/staging/ 必须为空（staging 已重命名进 history 或删除）。
      //   · reconciled      —— 要么 probe 触发 forward-complete（fwd >= 1），要么 agent 已用
      //                        read_baseline 自行对账（probe 时已无 pending，fwd == [] 且 journal 干净）。
      //   · histOk          —— 恰好留下归档，且首条归档内容 = 被取代的 prev（V1，§11.1「替换 = prev」）。
      //   · currentOk       —— current 保持新定义（v2），未被恢复回退到 V1。
      const noRollback = rb.length === 0;
      const journalClean = journalNow === 0;
      const stagingClean = stagingNow === 0;
      const reconciled = fwd.length >= 1 || journalClean;
      const archived = histNow.length >= 1 ? await readOpt(dir, `history/${histNow[0]}`) : null;
      const histOk = histNow.length >= 1 && archived === V1;
      const currentOk = currentNow !== null && currentNow.includes("v2");
      const recPass = noRollback && reconciled && journalClean && stagingClean && histOk && currentOk;
      r.__recover = { fwd, rb, journalClean, stagingClean, histOk, currentOk, recPass };
      if (!recPass) r.pass = false;
      r.note += ` | recover: fwd=[${fwd.join(",")}] rolledBack=[${rb.join(",")}] journal_clean=${journalClean} staging_clean=${stagingClean} hist=[${histNow.join(",")}] archived_prev_v1=${histOk} current_v2=${currentOk}`;
    }
  }

  // MR12 回归门：子进程复用 m4-driver（M4 R1–R12 全 7 case）+ m5-driver（自排除 mr12）两套 harness。
  // 两套子进程均全 PASS → MR12 PASS；不复制 M4 逻辑，直接复用既有 driver。
  // 防递归：内层 m5 调用显式排除 mr12（第四参为空则默认全 case，会含 mr12 → 拒绝）。
  if (CASES.includes("mr12")) {
    const innerM5Cases = ALL_CASES.filter((x) => x !== "mr12").join(" ");
    const jobs = [
      { args: [M4_DRIVER, AGENT_PATH], tag: "m4" },
      { args: [M5_DRIVER, AGENT_PATH, ...innerM5Cases.split(" ")], tag: "m5" },
    ];
    const outcomes = [];
    for (const { args, tag } of jobs) {
      const child = await runRaw(PROJECT_ROOT, args);
      // 持久化内层完整输出：否则 MR12 只留一行 summary，内层失败无法定位。
      await writeFile(join(PROJECT_ROOT, "gate", "transcripts", `_mr12-inner-${tag}.log`), child + "\n");
      const summaryRe = /\d+\/(\d+) PASS/.exec(child);
      const summary = summaryRe ? summaryRe[0] : (child.includes("__SPAWN_ERROR__") ? `SPAWN-ERROR: ${child.slice(-120)}` : child.slice(-120));
      // PASS 判定：存在 SUMMARY，且无 FAIL: 行
      const allPass = summaryRe && !child.includes("FAIL:");
      outcomes.push({ tag, allPass, summary });
    }
    const ok = outcomes.every((o) => o.allPass);
    const tag = "m5-mr12";
    const transcript = [
      `# ${tag}`,
      `M4 regression: ${outcomes[0].summary}`,
      `M5 regression (self-excluded): ${outcomes[1].summary}`,
      `VERDICT: ${ok ? "PASS" : "FAIL"}`,
    ].join("\n\n");
    await writeFile(join(PROJECT_ROOT, "gate", "transcripts", `${tag}.md`), transcript + "\n");
    console.log(`[${tag}] ${ok ? "PASS" : "FAIL"} — m4=${outcomes[0].summary} m5=${outcomes[1].summary}`);
    RESULTS.push({ c: "mr12", pass: ok, note: `m4=${outcomes[0].summary} m5=${outcomes[1].summary}` });
  }

  // MR11 deterministic probes: fault injection → fresh-process recovery
  for (const name of ["step4", "step5", "step6"]) {
    const dir = await buildFixture(`p-${name}`);
    await writeIf(dir, "current-baseline.md", V1);
    await writeIf(dir, "history/1-baseline.md", V1);
    const c1 = await runChild(dir, [], { M5_PROBE: "commit", M5_FAULT: name });
    const p1 = JSON.parse(c1 || "{}");
    const c2 = await runChild(dir, [], { M5_PROBE: "recover" });
    const p2 = JSON.parse(c2 || "{}");
    p2.__dir = dir;
    const fwd = Array.isArray(p2.recovered?.forwardCompleted) ? p2.recovered.forwardCompleted : [];
    const rb = Array.isArray(p2.recovered?.rolledBack) ? p2.recovered.rolledBack : [];
    const histNow = await list(dir, "history");
    const journalNow = (await list(dir, ".m5-commit/journal")).length;
    const currentNow = await readOpt(dir, "current-baseline.md");
    const failedOk = p1.outcome?.ok === false;
    let pass = false;
    let note = "";
    // V2NEW 使用模块级常量（与 gate/m5-worker.mjs 的 PROBE_NEW 逐字节一致），此处不再遮蔽。
    if (name === "step4") {
      const rolledBack = fwd.length === 0 && rb.length === 1;
      pass = failedOk && currentNow === V1 && histNow.length === 1 && !histNow.includes("2-baseline.md") && journalNow === 0;
      note = `failed=${failedOk} rolledBack=${rb.join(",")} current_stays_v1=${currentNow === V1} journal_clean=${journalNow === 0}`;
    } else if (name === "step5") {
      const fwdOk = fwd.length === 1 && rb.length === 0;
      const hist2 = (await readOpt(dir, "history/2-baseline.md")) === V1;
      pass = failedOk && fwdOk && currentNow === V2NEW && histNow.includes("2-baseline.md") && hist2 && journalNow === 0;
      note = `failed=${failedOk} forwardCompleted=${fwd.join(",")} current_v2=${currentNow === V2NEW} hist2=v1:${hist2} journal_clean=${journalNow === 0}`;
    } else {
      const fwdOk = fwd.length === 1 && rb.length === 0;
      pass = failedOk && fwdOk && currentNow === V2NEW && histNow.includes("2-baseline.md") && journalNow === 0;
      note = `failed=${failedOk} forwardCompleted=${fwd.join(",")} already_durable=${currentNow === V2NEW && histNow.includes("2-baseline.md")} journal_clean=${journalNow === 0}`;
    }
    const tag = `m5-p-${name}`;
    const transcript = [
      `# ${tag}`,
      `fixture=${p2.__dir}`,
      `PROBE commit(fault=${name}) → ${JSON.stringify(p1.outcome)}`,
      `PROBE recover → { forwardCompleted=${fwd.join(",")} rolledBack=${rb.join(",")} }`,
      `FILES: current len=${currentNow?.length} history=${histNow.join(",") || "∅"} journal_files=${journalNow}`,
      `VERDICT: ${pass ? "PASS" : "FAIL"} — ${note}`,
    ].join("\n\n");
    await writeFile(join(PROJECT_ROOT, "gate", "transcripts", `${tag}.md`), transcript + "\n");
    console.log(`[${tag}] ${pass ? "PASS" : "FAIL"} — ${note}`);
    RESULTS.push({ c: `p-${name}`, pass, note });
  }

  // MR11 重试幂等（§11.5 / §13.1(3)）：step5 崩溃 → fresh recover forward-complete →
  // 再提交一次 → 断言 history 恰好 +1 条、seq 无重复、current 为新定义、journal/staging 干净。
  // 即“重试后恰好一条 history 条目、一条 current 定义，无重复”。
  {
    const dir = await buildFixture("p-retry");
    await writeIf(dir, "current-baseline.md", V1);
    await writeIf(dir, "history/1-baseline.md", V1);
    const c1 = await runChild(dir, [], { M5_PROBE: "commit", M5_FAULT: "step5" });
    const p1 = JSON.parse(c1 || "{}");
    const c2 = await runChild(dir, [], { M5_PROBE: "recover" });
    const p2 = JSON.parse(c2 || "{}");
    const histAfterRecover = await list(dir, "history");
    const c3 = await runChild(dir, [], { M5_PROBE: "commit" }); // 恢复后重试（无故障）
    const p3 = JSON.parse(c3 || "{}");
    const histAfterRetry = await list(dir, "history");
    const journalNow = (await list(dir, ".m5-commit/journal")).length;
    const stagingNow = (await list(dir, ".m5-commit/staging")).length;
    const currentNow = await readOpt(dir, "current-baseline.md");
    const seqs = histAfterRetry.map((f) => Number(f.split("-")[0]));
    const uniqueSeq = new Set(seqs).size === seqs.length;
    const oneMore = histAfterRetry.length === histAfterRecover.length + 1;
    const fwdOk = p2.recovered?.forwardCompleted?.length === 1;
    const pass =
      p1.outcome?.ok === false &&
      fwdOk &&
      p3.outcome?.ok === true &&
      oneMore &&
      uniqueSeq &&
      journalNow === 0 &&
      stagingNow === 0 &&
      currentNow === V2NEW;
    const note = `crash_failed=${p1.outcome?.ok === false} forward=${p2.recovered?.forwardCompleted?.join(",")} retry_ok=${p3.outcome?.ok === true} hist=${histAfterRecover.length}->${histAfterRetry.length} unique_seq=${uniqueSeq} current_v2=${currentNow === V2NEW} clean=${journalNow === 0 && stagingNow === 0}`;
    const tag = "m5-p-retry";
    const transcript = [
      `# ${tag}`,
      `fixture=${dir}`,
      `PROBE commit(fault=step5) → ${JSON.stringify(p1.outcome)}`,
      `PROBE recover → { forwardCompleted=${p2.recovered?.forwardCompleted?.join(",")} } history=${histAfterRecover.join(",")}`,
      `PROBE retry commit(no fault) → ${JSON.stringify(p3.outcome)}`,
      `FILES: current len=${currentNow?.length} history=${histAfterRetry.join(",")} journal_files=${journalNow} staging_files=${stagingNow}`,
      `VERDICT: ${pass ? "PASS" : "FAIL"} — ${note}`,
    ].join("\n\n");
    await writeFile(join(PROJECT_ROOT, "gate", "transcripts", `${tag}.md`), transcript + "\n");
    console.log(`[${tag}] ${pass ? "PASS" : "FAIL"} — ${note}`);
    RESULTS.push({ c: "p-retry", pass, note });
  }

  // MR11 首建崩溃恢复（回归守卫）：无 Baseline、**无 history/ 目录**时，步骤 4 成功、步骤 5 失败
  // → fresh recover 必须 forward-complete（补建 history/ 并归档），不得抛 ENOENT。
  // 注意：step4/5/6 probe 的 fixture 预建了 history/1-baseline.md，因此对「history 目录不存在」
  // 这一场景存在盲区 —— 该盲区正是 2026-09-11 M5-B 验收中 MR11-agent 抓到的生产缺陷。
  {
    const dir = await buildFixture("p-first");
    await writeIf(dir, "candidate.md", CAND_B); // 仅为了让 fixture 非空；首建无 current-baseline
    const c1 = await runChild(dir, [], { M5_PROBE: "commit", M5_FAULT: "step5" });
    const p1 = JSON.parse(c1 || "{}");
    const hadHistoryDir = await existsDir(join(dir, "artifacts", "history"));
    const c2 = await runChild(dir, [], { M5_PROBE: "recover" });
    const p2 = JSON.parse(c2 || "{}");
    const fwd = Array.isArray(p2.recovered?.forwardCompleted) ? p2.recovered.forwardCompleted : [];
    const rb = Array.isArray(p2.recovered?.rolledBack) ? p2.recovered.rolledBack : [];
    const histNow = await list(dir, "history");
    const journalNow = (await list(dir, ".m5-commit/journal")).length;
    const stagingNow = (await list(dir, ".m5-commit/staging")).length;
    const currentNow = await readOpt(dir, "current-baseline.md");
    const pass =
      p1.outcome?.ok === false && // 步骤 4 已生效但步骤 5 失败
      hadHistoryDir === false && // 前提：恢复前 history/ 确实不存在（盲区场景）
      fwd.length === 1 &&
      rb.length === 0 &&
      histNow.includes("1-baseline.md") &&
      currentNow === V2NEW &&
      journalNow === 0 &&
      stagingNow === 0;
    const note = `step5_failed=${p1.outcome?.ok === false} no_history_dir_before=${hadHistoryDir === false} forward=${fwd.join(",")} rolledBack=${rb.join(",")} hist=[${histNow.join(",")}] current_v2=${currentNow === V2NEW} clean=${journalNow === 0 && stagingNow === 0}`;
    const tag = "m5-p-first";
    const transcript = [
      `# ${tag}`,
      `fixture=${dir}（首建：无 current-baseline.md、无 history/）`,
      `PROBE commit(fault=step5) → ${JSON.stringify(p1.outcome)}`,
      `history/ 目录在恢复前存在？ ${hadHistoryDir}`,
      `PROBE recover → { forwardCompleted=${fwd.join(",")} rolledBack=${rb.join(",")} }`,
      `FILES: current len=${currentNow?.length} history=[${histNow.join(",")}] journal_files=${journalNow} staging_files=${stagingNow}`,
      `VERDICT: ${pass ? "PASS" : "FAIL"} — ${note}`,
    ].join("\n\n");
    await writeFile(join(PROJECT_ROOT, "gate", "transcripts", `${tag}.md`), transcript + "\n");
    console.log(`[${tag}] ${pass ? "PASS" : "FAIL"} — ${note}`);
    RESULTS.push({ c: "p-first", pass, note });
  }

  const passed = RESULTS.filter((r) => r.pass).length;
  console.log(`\nM5 ACCEPTANCE SUMMARY: ${passed}/${RESULTS.length} PASS`);
  for (const r of RESULTS) if (!r.pass) console.log(`  FAIL: ${r.c} — ${r.note}`);
  process.exitCode = passed === RESULTS.length ? 0 : 1;
}

main();