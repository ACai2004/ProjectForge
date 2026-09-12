/**
 * Main Agent runtime — Milestone 1.
 *
 * 仅承载“一个最小可运行的对话 Agent”：接收用户输入 → 调用 Claude Agent SDK 的
 * `query()` → 返回 Agent 文本回复。
 *
 * 职责边界（Milestone 1 刻意保持最小）：
 *   - 不包含 Requirement Layer workflow（探索/定义/Baseline）
 *   - 不包含 Research Tool / Review Subagent / Artifact / Baseline
 *   - 只维护“同一次运行内”的多轮会话上下文（session_id + resume）
 */
import { createSdkMcpServer, query } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { ArtifactWriteCapability } from "./artifact-capabilities.js";
import type { BaselineCommitStore } from "./commit-store.js";
import { createCommitMcpServer } from "./commit.js";

/**
 * 最小 system prompt：身份 + 一条 Skill 路由指令。
 * 路由指令只是“何时调用 requirement-layer skill”，不把 skill 全文复制进系统提示，
 * 也不写死 provider/模型（Skill 工具本身在 SDK 会话中默认可用）。
 */
export const DEFAULT_SYSTEM_PROMPT = `你是本项目的 Main Agent。

对话规则：
- 当用户表达的是**项目相关意图**（模糊的项目想法、项目方向、需求/范围/边界、目标用户、成功条件、候选定义、Baseline 确认、要求整理或收束项目定义）时：先通过 Skill 工具调用 \`requirement-layer\`，遵循其行为规范。
- 普通对话、与项目定义无关的提问、纯技术/编码/调试任务：正常回答，不要套用需求层流程。

M4 能力工具（若本会话可用，一律使用它们，不要改用系统自带的 Write/Edit 去碰工件）：
- \`research\`：对单一研究问题返回外部证据 findings（claim/source/certainty/limitation）。需要外部事实时使用；绝不编造结果。
- \`write_working_summary\` / \`write_candidate\`：写入/覆盖 Working Summary 与 Candidate（两者皆非权威）。只在实质认知转折点更新 Summary；Candidate 标注确认性质。
- \`review_candidate\`：对当前 Candidate 做一次独立、只读的 Review，输入仅 Candidate + Working Summary + 指令，输出 findings，无批准权。

M5 能力工具（若本会话可用）：
- \`commit_baseline\`：受控的 Baseline commit（journal 两阶段：history 归档 + current 替换）。只在 Human **显式确认**当前 Candidate（或显式指明的子集、或已落盘为 candidate.md 实际内容的修改后 v2）成为新 Baseline 时调用；commit 是 Human 驱动的单一动作。
- \`read_baseline\`：读取当前 authoritative Baseline（recovery-before-read：先自动对账未完成事务再返回）。需要把 current-baseline 当作当前有效定义的任何场景都用它，不要用原生 Read 直接读 current-baseline.md。

M5 确认语义（保守化，M5-A §2/§8.4）：
- **构成确认的最小充分形式**：Human 明确表示「接受 / 确认某内容成为项目定义 / 成为新的 Baseline」。
- **不构成确认**：疑问句（「可以吗？」）、泛泛正面反应（「听起来不错」「好的」）、沉默 / 无反对、Agent 自判「用户大概同意了」、Research 有结论、Candidate 看起来合理、Review 没发现问题。
- 三要素同时成立才确认：①对象明确（指向具体 Candidate 内容）②动作明确（接受 / 确认为新定义）③当下明确（本轮对话）。任一缺失 → 澄清，不 commit。
- 整体确认是默认；部分确认仅当 Human 显式点名子集。
- **只写被确认的条目**：Candidate 中的 unresolved / deferred / tentative（「未决 / 暂定」）条目**不随其他条目一起进入 Baseline**（M5-A §2.3/§3.2/§3.3）——它们继续留在 candidate.md 作为未确认内容。整体确认一份仍含未决条目的 Candidate 时，commit 内容只含被确认的定义条目；无法判断某条是否属于被确认范围时先澄清，不猜。确认前应区分呈现「将进入 Baseline 的部分」与「不进入的部分」（§2.4）——这种区分是**对话中的呈现**，不是要写进工件的内容：commit 只写被确认的定义条目，未决条目既不进入 Baseline，也不在 Baseline 里补一个「未计入」章节，current-baseline.md 保持为纯粹的定义条目列表。
- Review 后修改的 Candidate：修改必须先经 write_candidate 落为 candidate.md 的实际内容（v2）再确认；确认与 commit 的对象是 v2，不得把仅存在于对话措辞中的隐式修改直接当 Baseline 写入；修改后版本不得声称已被 Review。同一轮里「把 X 改成 Y，然后确认」是**有效确认**（M5-A §13.3 MR1④）：改动由本轮指示给定并随即被接受，即对修改后定义的确认——先 write_candidate 落 v2，再 commit v2，不要以「确认发生在落盘之前」为由拒绝写入。
- 不因 Review 通过而自动确认，不自动重跑 Review。

工件路径纪律：
- Working Summary / Candidate 的写入只能通过上述 write_* 工具完成。
- Baseline 与 History 的**唯一写入口**是 \`commit_baseline\`（Human 显式确认后）。不得以任何其他方式（原生 Write/Edit/自制工具）修改 current-baseline.md 或 history/。

回答保持简洁。`;

/** 对外暴露的用户可见错误（已脱敏）。 */
export class AgentError extends Error {}

/**
 * 最小项目意图路由 —— Requirement Layer Skill 的运行时激活机制（Milestone 3-C Fix C）。
 *
 * 背景：在 DeepSeek-via-OpenRouter 下，模型不会自发调用 Skill 工具（M3-B 与 M3-C 实测），
 * 因此用一条保守启发式在运行时判断“这是否项目定义相关工作”，命中则在用户输入前预置
 * `/requirement-layer`（SDK 按名称分发，等价于显式激活 Skill）。
 *
 * 设计原则：
 * - 反信号（日常问答 / 解释 / 调试 / 修复 / 天气 / 通用 how-to）优先：命中即不激活，
 *   保证 Requirement Layer 不劫持普通对话与技术任务。
 * - 正信号（创建类项目意图：做一个…工具/产品、项目、想法、方向、需求、Baseline…）命中才激活。
 * - 它是“最小可激活兜底”：模棱两可的输入交给系统提示里的路由指令，由模型尽力而为。
 */
const RL_NEGATIVE: RegExp[] = [
  /天气/,
  /吃\w*饭|菜谱|食谱/,
  /解释(一下)?/,
  /什么是/,
  /为什么/,
  /(怎么|如何)(写|做|实现|配置|调试|修复|修改|改|部署|安装|运行|使用|优化|重构|返回|转换)/,
  /bug/i,
  /调试/,
  /报错/,
  /\berror\b/i,
  /修复/,
  /重构/,
  /console/,
  /这段代码|我的代码/,
  /编译|语法错误/,
  /帮我(看看|算(一)?下|查(一)?下|找(一)?下|翻译|总结(一)?下|检查|核对|跑(一)?下)/,
];
const RL_POSITIVE: RegExp[] = [
  /想?做\s*[一个款套种]/, // 做一个…工具/产品/系统…
  /想做|打算做|计划做|准备做|考虑做|在做一个/,
  /项目/,
  /产品/,
  /需求/,
  /想法/,
  /方向/,
  /目标用户/,
  /成功条件/,
  /候选定义/,
  /baseline/i,
  /收束/,
  /项目定义/,
];

/** 判断一段用户输入是否需要激活 Requirement Layer Skill（供 turn() 使用，亦可测试）。 */
export function isProjectOriented(input: string): boolean {
  if (RL_NEGATIVE.some((re) => re.test(input))) return false;
  return RL_POSITIVE.some((re) => re.test(input));
}

const TOKEN_PATTERNS: RegExp[] = [
  /sk-or-v1-[A-Za-z0-9_-]+/g,
  /sk-ant-[A-Za-z0-9_-]+/g,
  /(Bearer\s+)[A-Za-z0-9._-]{6,}/g,
  /(x-api-key:\s*)[A-Za-z0-9._-]{6,}/gi,
];

/** 任何错误信息在对外输出前都经过脱敏，绝不携带 credential 原文。 */
function sanitize(input: string): string {
  return TOKEN_PATTERNS.reduce((acc, re) => acc.replace(re, "$1[redacted]"), input);
}

export interface TurnResult {
  /** Agent 的最终文本回复。 */
  text: string;
  /** 本轮所属会话 id（可用于 resume）。 */
  sessionId: string;
}

/**
 * MainAgent 构造选项。M1 仅接受 systemPrompt/model；
 * M4-B 能力接入点：可注入 in-process MCP custom tool server（Research Tool 等）
 * 与其 allowlist。均为纯 Options 透传，不引入 workflow / 状态机。
 */
export interface MainAgentOptions {
  systemPrompt?: string;
  model?: string;
  /** 注入的 in-process MCP server（如 Research Tool），直接透传给 SDK Options.mcpServers。 */
  mcpServers?: Options["mcpServers"];
  /** 自动放行名单（一律用 MCP 前缀全名，如 mcp__<server>__<tool>），透传 Options.allowedTools。 */
  allowedTools?: string[];
  /** M4-B：Review capability 注入点。由调用方注入独立只读 Review 会话实现。 */
  reviewCaller?: (input: { candidate: string; workingSummary: string; instruction: string }) => Promise<string>;
  /** M4-B：窄化工件写能力（仅 Working Summary / Candidate）。Baseline/History 结构性不可写。 */
  artifactWrite?: ArtifactWriteCapability;
  /** M5-B：受控的 Baseline commit store。存在时暴露 commit_baseline / read_baseline 工具。 */
  commitStore?: BaselineCommitStore;
}

export class MainAgent {
  private sessionId: string | undefined;

  constructor(private readonly opts: MainAgentOptions = {}) {}

  /** 当前维护的会话 id（未建立时为 undefined）。 */
  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /**
   * 运行一轮对话。
   * - 第一轮：不带 resume，作为新会话启动。
   * - 从第二轮起：用第一次调用保存的 session_id 走 `resume`，保证上下文延续。
   * 实际 session id 以 SDK result 返回值为准，并保存在实例内供后续轮次复用。
   */
  async turn(prompt: string): Promise<TurnResult> {
    const options: Options = {
      systemPrompt: this.opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    };
    if (this.sessionId) {
      options.resume = this.sessionId;
    }
    if (this.opts.model) {
      options.model = this.opts.model;
    }
    // M4-B 能力接入点：注入的 custom tool server 与其 allowlist 原样透传。
    if (this.opts.mcpServers) {
      options.mcpServers = this.opts.mcpServers;
    }
    // M4-B：Review capability。存在 reviewCaller 时将其暴露为 review_candidate 工具，
    // 放入独立 server，避免与调用方注入的 mcpServers 冲突。
    const reviewServer = this.opts.reviewCaller
      ? createSdkMcpServer({
          name: "m4-review",
          alwaysLoad: true,
          tools: [
            {
              name: "review_candidate",
              description:
                "对当前 Candidate 做一次轻量、独立、只读的 Review：输入仅 Candidate + Working Summary + 指令；输出 findings；无批准权。",
              inputSchema: {
                candidate: z.string(),
                workingSummary: z.string(),
                instruction: z.string(),
              },
              handler: async (args) => {
                const a = args as { candidate?: string; workingSummary?: string; instruction?: string };
                const findings = await this.opts.reviewCaller!({
                  candidate: String(a.candidate ?? ""),
                  workingSummary: String(a.workingSummary ?? ""),
                  instruction: String(a.instruction ?? ""),
                });
                return { content: [{ type: "text", text: findings }] };
              },
            },
          ],
        })
      : undefined;
    if (reviewServer) {
      options.mcpServers = { ...options.mcpServers, "m4-review": reviewServer };
    }
    // M4-B：工件写能力（窄化：仅 Working Summary / Candidate）。存在 artifactWrite
    // 时暴露 write_working_summary / write_candidate 两工具；Baseline/History 结构性无写。
    const writeServer = this.opts.artifactWrite
      ? createSdkMcpServer({
          name: "m4-write",
          alwaysLoad: true,
          tools: [
            {
              name: "write_working_summary",
              description:
                "覆盖写入 Working Summary（非权威，跨会话恢复/Review 对照；仅在实质认知转折点更新；不接受已拒绝结论伪装为 accepted）。",
              inputSchema: { content: z.string() },
              handler: async (args) => {
                const a = args as { content?: string };
                await this.opts.artifactWrite!.writeWorkingSummary(String(a.content ?? ""));
                return { content: [{ type: "text", text: "working-summary.md 已写入（非权威）。" }] };
              },
            },
            {
              name: "write_candidate",
              description:
                "覆盖写入 Candidate（非权威，未确认草稿；表述确认性质，不发明缺失信息）。",
              inputSchema: { content: z.string() },
              handler: async (args) => {
                const a = args as { content?: string };
                await this.opts.artifactWrite!.writeCandidate(String(a.content ?? ""));
                return { content: [{ type: "text", text: "candidate.md 已写入（未确认草稿）。" }] };
              },
            },
          ],
        })
      : undefined;
    if (writeServer) {
      options.mcpServers = { ...options.mcpServers, "m4-write": writeServer };
    }
    // M5-B：受控的 Baseline commit。存在 commitStore 时暴露 commit_baseline / read_baseline
    // 两工具（journal 两阶段事务 + recovery-before-read 权威读，见 commit-store.ts）。
    const commitServer = this.opts.commitStore
      ? createCommitMcpServer(this.opts.commitStore)
      : undefined;
    if (commitServer) {
      options.mcpServers = { ...options.mcpServers, ...commitServer.config };
    }
    // 合并 allowlist：先加上本 agent 自注册的工具，再合并调用方注入的名单（不覆盖）。
    const ownAllowed = [
      ...(reviewServer ? ["mcp__m4-review__review_candidate"] : []),
      ...(writeServer ? ["mcp__m4-write__write_working_summary", "mcp__m4-write__write_candidate"] : []),
      ...(commitServer ? [commitServer.toolName, commitServer.readToolName] : []),
    ];
    options.allowedTools = [
      ...(options.allowedTools ?? []),
      ...ownAllowed,
      ...(this.opts.allowedTools ?? []),
    ];

    // 运行时 Skill 激活（Fix C）：项目定义相关工作自动预置 /requirement-layer。
    // 纯 prompt 变换，不引入状态机 / 工作流 / 新组件，与现有 SDK 会话完全兼容；
    // 非项目输入原样透传，Requirement Layer 不劫持普通对话与技术任务。
    const effectivePrompt = isProjectOriented(prompt) ? `/requirement-layer ${prompt}` : prompt;

    let text = "";
    let seenSessionId: string | undefined;

    try {
      for await (const message of query({ prompt: effectivePrompt, options })) {
        if (message.type === "assistant" && "error" in message && message.error) {
          throw new AgentError(`模型返回错误：${message.error}`);
        }
        if (message.type === "result") {
          seenSessionId = message.session_id;
          if (message.subtype === "success" && !message.is_error) {
            text = message.result;
            continue;
          }
          // 错误终止路径：$errors 仅存在于 error 变体，做窄化访问
          const errors = (message as { errors?: string[] }).errors ?? [];
          throw new AgentError(
            `会话异常结束（${message.subtype}${errors.length ? `: ${errors.join("; ")}` : ""}）`,
          );
        }
      }
      // query() 正常耗尽输入流但仍然没有 result / text => 视为异常
      if (seenSessionId) {
        this.sessionId = seenSessionId;
      }
      if (!text) {
        throw new AgentError("没有收到模型文本回复（会话可能异常中断）。");
      }
    } catch (err) {
      // query() 可能在产出 error result 后抛出；把已见到的 session 保留下来
      if (seenSessionId) {
        this.sessionId = seenSessionId;
      }
      if (err instanceof AgentError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AgentError(sanitize(msg));
    }

    return { text, sessionId: seenSessionId ?? this.sessionId! };
  }
}