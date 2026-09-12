# M4-B Engineering Decision & Debugging Record

日期：2026-09-10
里程碑：M4-B — Evidence-Grounded Requirement Formation（实现 + Runtime 验证）
上游：`doc/Requirement Layer M4 Design v0.1`（冻结，M4-A）

本记录追述 M4-B 实现期的关键工程决策、SDK 集成问题及修复，供后续维护。**不以任何形式改写冻结设计**。

---

## 1. 高层架构决策（能力导向，最小侵入）

| 决策 | 理由 | 证据 |
|------|------|------|
| Research Tool 以 **MCP server** 注入（`createSdkMcpServer` → `Options.mcpServers`） | M3 期间原生 Skill auto-invoke 在目标 provider（DeepSeek/OpenRouter）上不稳定；MCP tools 在真实 `MainAgent.turn()` 上可稳定 auto-invoke。MCP-prefix 全名（`mcp__m4-research__research`）供 `allowedTools` allowlist。 | `gate/diag/v4-ma-tool-driver.mjs`（P1 E1/E2/E3 PASS）；`gate/m4-*.mjs` |
| `research(question) -> Finding[]` 严格单参数；Human 材料经**闭包注入**（构造时），不进参数面 | 保留冻结契约（用户批准修正 #2）。工具自身无文件/目录访问能力，artifacts/ 与 host MEMORY 结构性不可能进入。 | `src/research.ts` 头注释；handler 闭包 `materials` |
| Review = fresh independent SDK session（`tools:[]` + `canUseTool: deny` + 无 resume） | M4 Design §7.4 独立性要求：新上下文、只读、不接触 Baseline、无写工具。fresh `query()` 天然不携带 Main Agent 对话。 | `src/review.ts`；P2（v4-review-caller）3 PASS |
| M4 写能力收窄为 `ArtifactWriteCapability`（仅 Working Summary + Candidate） | 用户批准修正 #5：M4 写能力结构性限制为 WS+Candidate；Baseline/History 无 M4 writer。内部复用 `ArtifactStore.writeArtifact(ArtifactKind.*)`。 | `src/artifact-capabilities.ts`；r5/r7/r11 落盘证据 |
| 保留 `MainAgent` 既有构造签名（M1–M3 兼容），M4 能力经 `Options` 注入 | M4 Design §11：不把 Requirement workflow orchestration 塞进 MainAgent；最小侵入。 | `src/agent.ts`（integration 层） |

## 2. SDK 集成要点（可复用的既定配方）

1. **Server 创建**：`createSdkMcpServer({name, alwaysLoad: true, tools: [{name, description, inputSchema(zod), handler}]})`。
2. **注入**：`options.mcpServers = { "<server>": server }`。handler 参数 cast：`const a = args as { question?: string }`——SDK handler 参数类型为 `{ [x: string]: unknown }`，不能用显式类型注解直接收窄。
3. **Allowlist**：工具全名为 MCP-prefix 格式（`mcp__<server>__<tool>`）；`allowedTools` 必须包含该全名，否则 auto-invoke 被权限墙拦截。
4. **PermissionResult 形状**（SDK 0.3.261 必要条件）：`canUseTool` 回调必须返回 **`{ behavior: "deny", message: string }` 对象**，返回 string 会导致拒绝路径失败。Review 会话用 `tools: []` + 全 deny。
5. **Auth**：SDK child subprocess 从 `~/.claude/settings.json` env block 读取 key（host env 未直接暴露时）。
6. **授权根**：child 以 `cwd=fixture` 为 SDK authorization root（M3 Problem 6 教训）。

## 3. 关键修复（调试记录）

| # | 症状 | 根因 | 修复 |
|---|------|------|------|
| 1 | `createSdkMcpServer`/`zod` 未解析 | M4-B 新增依赖导入缺失 | 补 import（先经 Fix-C 分类确认非架构变更） |
| 2 | handler 参数类型硬注解失败 | SDK handler args 为 `{[x:string]:unknown}` | 函数体内 cast：`const a = args as {...}` |
| 3 | `allowedTools` 覆盖 bug：自注册的 review_candidate 被 `opts.allowedTools` 覆盖 | `options.allowedTools = this.opts.allowedTools` 直接赋值 | 改为 merge：`[...(options.allowedTools??[]), ...ownAllowed, ...(this.opts.allowedTools??[])]` |
| 4 | `canUseTool` 返回 string 导致拒绝路径异常 | SDK 需要 `PermissionResult` 对象 | 改为 `async () => ({behavior:"deny", message:"..."})` |
| 5 | `researchServer.toolName` undefined | factory 返回缺字段 | 返回体补 `toolName` |
| 6 | v4-probe 检测不到 tool_use/tool_result | SDK message 结构中它们在 `m.message.content`（BetaMessage）而非顶层 | 修检测逻辑 |
| 7 | E2「nonce not in reply」 | 模型如实重述 finding 但不转抄 harness 管道文本 | 断言改为检查 handler-only 内容（`fixture://probe-source`、`insufficient-evidence`） |
| 8 | v4-memory-neg 初版用孤立 config-dir 模拟注入，未证明真实注入 | 未走真实 host mechanism | 改为真实 host injection dir（fixture slug 路径 `~/.claude/projects/<slug>/memory/`），得到干净 PASS |
| 9 | r1 driver `why` 断言过紧 | 模型中文表达不含断言关键词 | 正则放宽（`/…|问题|原因|不充分/`），模型行为本就正确 |
| 10 | M3 prov-suite 语法损坏（本次 closeout 回归发现） | 早期写入残留：4 处 `for( (` 多余括号、`i- ichtet20` 不完整表达式 | 纯 harness 修复：`for (`、`i- 20`；断言与行为不变。产出代码/冻结文档零改动 |
| 11 | M4 harness 早期 flaky | 模型自发用原生 Write/Read 写工件 → 权限墙 → 服务行为跳变 | 主选窄写工具（system prompt guidance）+ prompt 内联 fixture 工件（不依赖模型 Read） |

## 4. 行为验证的形态学

- **真实路径原则**：每个探针都走 `new MainAgent({...}).turn(...)`，证到 handler 执行（trace file）、tool_result 返回、Main Agent 采用返回值为止。
- **三维独立证据**（R10）：① behavioral —— host MEMORY bait；② input/context —— Review 会话只收到三样输入（代码证据 + P2 真实通路）；③ capability —— Review 会话无工具全 deny，无写入（落盘 len 不变）。
- **工件证据优先**：verdict 尽量落到「磁盘上的 artifact 前后状态」（如 r5 WS len=584、r7 candidate len=525、r11 baseline len=39===39），模型文本只作辅助。

## 5. 与用户批准的修正的对应

1. 真实 MainAgent custom-tool probe → P1（E1/E2/E3 PASS）。
2. Research 签名冻结 `research(question)`，材料 closure 注入，zero project-decision logic，artifacts/host MEMORY 结构性排除 → `src/research.ts`。
3. 真实 Review caller probe → P2（fresh session + Candidate + WS + instruction → findings 返回，无 Baseline、无 write tools）。
4. host MEMORY 显式处理：复现 M3 纪律；负向探针 P3（bait `BUILTIN-2026-DEFAULT` 未使用）。Document A（application payload = Candidate+WS+instruction）与 B（host/runtime injected context）的区分已写入 P3 driver 注释——不声称 B 完全不存在，而是确认其经指令纪律排除。
5. 写能力面 = WS+Candidate 两操作；Baseline/History 无 M4 写能力。

## 6. 已知边界（Deferred / 明确不做）

- Human confirmation → Baseline 代码化通路。
- Research 材料的**生产入口**：当前为构造时注入（供调用方/套件用）；`src/main.ts` 产线接线与运行时材料收集入口为 MVP 已知限制。
- 检索面（Web search backend）Deferred。
- Research Subagent、workflow engine、state machine、DB、RAG、multi-user。
- Review 无自动批准/多轮重跑。
- Host MEMORY：指令纪律缓解，非结构性排除。