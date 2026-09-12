# M5-B Engineering Decision & Debugging Record

日期：2026-09-11（实现期） / 2026-09-12（验收期补齐）
里程碑：M5-B — Human Confirmation → Baseline Commit → Revision / History（实现 + Runtime 验证）
上游：`doc/Requirement Layer M5 Design v0.1`（冻结，M5-A，含 §11 journal 两阶段事务协议 + §8.4 v2 provenance 语义）

本记录追述 M5-B 实现期与验收期的关键工程决策、SDK 集成问题及修复，供后续维护。**不以任何形式改写冻结设计。**

---

## 0. M5-B 实现不变量（用户 2026-09-11 批准 M5-A 后、M5-B 前明确）

**recovery-before-read**：任何 authoritative Current Baseline 的读取 / 恢复动作，在把 `current-baseline.md` 作为当前有效定义返回之前，必须先检查并处理 `.m5-commit/journal/` 中所有 pending transaction（§11.3：forward-complete 或 rollback）。不能在没有先 recovery 的情况下把 `current-baseline.md` 当作 authoritative committed Baseline 返回。

原因：Step 4（写 current=new）成功而 Step 5（history 定型）未完成时，磁盘上的 `current-baseline.md` 可能已暂时包含 new；直接返回会把这些未完成事务暴露成当前 Baseline。

约束属于 M5-B 实现层，不改 M5-A 设计文档。实现：所有权威读取经 `BaselineCommitStore.readCurrentBaseline()` 单一路径（先 `recoverPending()` 再读文件）。

---

## 1. 高层架构决策（能力导向，最小侵入；沿用 M4-B 既定模式）

| 决策 | 理由 | 证据 |
|------|------|------|
| commit 能力以 **MCP server** 注入（`createSdkMcpServer` → `Options.mcpServers`），沿用 M4-B 的 Options 注入模式（M5-A §16.3） | M4-B 已证明该路径在真实 `MainAgent.turn()` 上稳定 auto-invoke；M5 不引入新核心 loop | `src/commit.ts`；`src/agent.ts` `commitStore` 分支 |
| 只暴露 **两个**工具：`commit_baseline` / `read_baseline` | 确认动作是「Human 驱动的单一动作」，**不放宽为通用 `write_baseline`**；权威读必须是 journal-aware | M5-A §9.2 / §16.3；`src/commit.ts` |
| 确认语义（三要素判定）**不落在工具内**，落在 system prompt / Skill 行为层 | 工具只执行「确认动作」，不判断「是否构成确认」（M5-A §2 / §16.1） | `src/commit.ts` 头注释；`src/agent.ts` M5 system prompt 段落 |
| `.m5-commit/{journal,staging,marks}/` 作为**唯一新持久结构** | 最小 journal，非 DB / 事件存储 / workflow engine（M5-A §11.1 / §12.2） | `src/commit-store.ts` |
| 失败注入（`fault.failAfter: 4|5|6`）**内建在 store**，仅 MR11 测试设置 | 使三点位失败可复现、确定性；生产不设置 | `src/commit-store.ts` `FaultInjection`；`gate/m5-worker.mjs` `M5_FAULT` |

## 2. SDK / 事务集成要点

1. **两阶段与提交点**：Phase1（读 prev → 写 journal(prepared) → 写 staging）无破坏性；Phase2（写 current=步骤4 → `rename(staging → history/<seq>)`=步骤5=**durable commit point** → 清理 journal/staging/marks=步骤6）。步骤 4 成功而步骤 5 未完成时，事务处于 **incomplete-but-recoverable**，不得呈现为已确认修订（§11.1/§11.3）。
2. **唯一分叉（对账判据）**：`current-baseline.md` 内容 == `journal.new` → forward-complete（保留 new、补齐 history、清理）；否则 → rollback（current 不变）。判据只依赖磁盘三态，无随机、无猜测（§11.3 不变量 3）。
3. **seq 单调**：journal 与 history 共用同一 seq 轴；`nextSeq()` = `max(journal seq, history seq) + 1`，跨事务不重用、失败重试不跳号（§11.1 / §11.4 不变量 4）。
4. **原子重命名**：staging → history 用 `rename`（同目录树内原子），使「归档定型」成为单一可判定事件。
5. **权威读单一路径**：`readCurrentBaseline()` = `recoverPending()` + `readCurrentRaw()`；`read_baseline` 工具即此路径（§0 不变量）。
6. **工具名 allowlist merge**：`mcp__m5-commit__commit_baseline` / `mcp__m5-commit__read_baseline` 与既有 `mcp__m4-*` 及调用方注入名单**合并**（不覆盖）——沿用 M4-B 修复 #3 的合并写法。

## 3. M5-B 实现期的生产缺陷（由 MR11-agent 抓到，已修复）

| # | 症状 | 根因 | 修复 |
|---|------|------|------|
| 1 | **首建场景**（无 `current-baseline.md`、**且 `history/` 目录从未存在**）下，步骤 4 成功、步骤 5 失败后，fresh process 的 recovery 抛 ENOENT，事务**永远挂在 pending**，既非 committed 也无法收尾 | `forwardComplete()` 直接 `rename(staging → history/<seq>)`，但首建场景 `history/` 目录从未被创建；`commit()` 的正路径在步骤 5 前有 `mkdir`，recovery 路径**漏了**同一前置 | `forwardComplete()` 在 rename 前 `mkdir(historyDir, {recursive:true})`；若 staging 缺失（异常）则从 journal 重建归档（替换=`prev`、首建=`new`）。见 `src/commit-store.ts` `forwardComplete()` |
| 2 | MR11-agent 的**断言本身**按「修复前的坏行为」标定（`fwd>=1 && hist 以 "2-" 开头`） | 原断言隐含「事务会永远挂着」，生产修复后必然**假阴性** | 改为不写死 seq（本 fixture 无预置 history → 首建 seq=1）：断言 forward-complete / journal+staging 干净 / 归档内容=被取代的 prev / current 保持新定义 |
| 3 | step4/5/6 三个确定性探针的 fixture **预建了 `history/1-baseline.md`**，对「`history/` 目录不存在」这一场景**存在盲区** —— 而该盲区正是缺陷 #1 | 探针 fixture 覆盖不足 | 新增确定性探针 **`p-first`**：显式断言「恢复前 `history/` 目录确实不存在」，再要求 forward-complete 补建并归档 |

缺陷 #1 是 M5-B 实现期唯一被真实 runtime 抓到的**生产缺陷**；`p-first` 成为其永久回归守卫。

## 4. 验收期的 harness 决策与修复（2026-09-12）

验收起点：M5-B 实现已存在、验收未完成。以下 gap **全部定位在 acceptance harness 侧**（外加 1 处 M4-B 期 production 健壮性修复）；**M5 production 实现本身零改动**。

| # | 现象 | 分类 | 处置 |
|---|------|------|------|
| 1 | `mr8` 失败被渲染成 `WORKER-ERROR: undefined`，真实原因不可见 | **harness bug** | `gate/m5-driver.mjs`：worker 在「某轮 turn 抛错」时返回 `{ok:false, turns:[{prompt,error}], files}`，而旧渲染只读 `parsed.error ?? parsed.raw` —— 形状 (a) 下两者皆 `undefined`，把「模型/运行时真实报错」误报成「无输出」。改为显式展开 `turns`（`WORKER-TURN-ERROR: ...`），并在失败时把子进程 **stderr** 一并写入 transcript（`runChild` 新增 stderr 捕获）。 |
| 2 | `mr10` 时通时不通；失败无法区分「模型没调工具」与「recovery-before-read 不生效」 | **harness bug（underconstrained）** | MR10 的 prompt 原先把 `current-baseline.md` 内容**逐字内联**，模型可直接照抄 prompt 作答、**完全不必调用 `read_baseline`** → §11.3 对账根本不触发、pending 事务原样留在磁盘。该 case 退化成「模型这一轮恰好调没调工具」的抛硬币。**去掉内联**（改为「请实际读取项目工件…」），使回答所需内容只能经 `read_baseline` 获得 —— recovery-before-read 必须在真实 MainAgent + 真实 MCP 路径上**实际发生**。修复后 transcript 显示模型自述 `read_baseline` + `forwardCompleted: [2]`，`history/2-baseline.md` 落盘、journal 干净。 |
| 3 | `mr11-agent` 在事务**已 durable** 时仍被判 FAIL（`honest_fail=false`） | **harness bug（假阴性判定）** | 旧判定 `pass = honestFail && noFalseSuccess && step4Done` **无条件**要求 reply 出现失败字样。但 agent 的 `read_baseline` 走 recovery-before-read（§0 不变量），可合法地把 step5 崩溃的事务 forward-complete 至 committed；此时汇报成功是**真话**，再要求「失败」字样即假阴性。改为「如实汇报」**相对磁盘 durable 状态**判定：`honestReporting = durable || honestFail`（同 `noFalseSuccess` 已有的处理逻辑）。同时把 recover 断言从含糊的 `clean/reconciled` 复合量**显式拆开**：`noRollback` / `journalClean` / `stagingClean` / `histOk`(归档=被取代的 prev) / `currentOk`(保持 v2)。 |
| 4 | `mr2` 偶发把「未决：每周发送频率」写入 Baseline | **harness underconstraint + provider/model limitation** | prompt「我确认这份 Candidate 成为新的 Baseline」对**含未决条目**的 Candidate 字面二义（§2.5 默认整体确认 vs §3.2/§2.3 未决不进入）。真实对话里 Agent 会先呈现「进入 / 不进入」两栏（§2.4）再由 Human 表态；harness 跳过呈现步，把歧义直接抛给模型。补上 Human 轮本应存在的语境（「其中标注未决的条目我还没有决定，先保持未决、不要放进 Baseline」）；**判据不动**（`notPolluted` 仍要求 Baseline 不含「未决」/「每周发送频率」）。 |
| 5 | M4 `r5` 时通时不通 → MR12 门连带 FAIL | **harness bug（M4-B 期）+ MR12 耦合** | `src/research.ts` 的读取面相关性启发式按 `/\s+/` 分词：中文问句无空格 → 唯一 token 是整句 → `body.includes(整句)` **恒 false** → research 对中文问题一律返回**空 findings** → 模型**正确地**拒绝写入「不存在的研究结论」→ M4 r5 判定 FAIL（模型行为无错、生产无错）。改为并判「问句与材料正文存在 ≥2 字公共子串」（`hasSharedSubstring`）。 |
| 6 | 个别 case 在某一批次整体失败（同一 run 内 `mr8` + M4 `r1/r11` 同时失败），伴随空输出 | **provider/model limitation** | GLM 端偶发 API / 网络层失败，使该轮 turn 抛错。gap#1 的 stderr 落盘使其可诊断；非生产缺陷、非断言问题。 |

### 4.1 归因纪律（本轮确立）

「模型没调工具」与「功能真的坏了」必须可区分——否则验收会在两者之间抛硬币，并倾向把 provider 波动误记成生产缺陷。本轮的通用做法：

1. **让必须发生的工具调用成为必要动作**（去掉可绕过的内联旁路，gap#2）。
2. **判定相对磁盘真实状态，而非相对固定措辞**（gap#3：`durable` 决定「成功」是否属实）。
3. **判定失败时保留可诊断的错误正文**（gap#1：展开 turn error + stderr）。
4. **不得用重跑掩盖不确定性**——先归因，再修 harness。

## 5. 验收形态与证据纪律

- **真实路径原则**：每个模型 case 都走 `new MainAgent({...}).turn(...)`（child process，cwd=fixture），证到真实 MCP 工具执行、真实磁盘工件状态为止；**不以裸 `query()` 代替**。
- **工件证据优先**：判定落到磁盘（`current-baseline.md` / `candidate.md` / `history/` / `.m5-commit/journal|staging`）或确定性进程状态；reply 文本只作辅助，regex 不单独作证。
- **确定性层与模型层分离**：MR11 的 step4/5/6/retry/first 为**无模型**的 store 级探针（确定性）；MR1–MR10、MR11-agent、MR12 为真实模型路径。两者共同覆盖 MR11 的「三失败点位 + 重试幂等 + 首建盲区 + agent 级注入」。
- **首建盲区守卫**：`p-first` 显式断言「恢复前 `history/` 不存在」，防止 §3 缺陷 #1 回归。

## 6. 已知边界（Deferred / 明确不做）

- `src/main.ts` 生产 CLI 未接线 M4/M5 能力（research / review / write / commit 目前仅经构造注入在验收 harness 可用）——M4-B Known Limitations #1 同源。
- 检索面（Web search backend）Deferred；research 为读取面。
- Research Subagent、workflow engine、state machine、DB、RAG、multi-user。
- Review 无自动批准 / 多轮重跑；不因 Candidate 修改而自动重跑 Review（M5-A §8.4）。
- host MEMORY：指令纪律缓解，非结构性排除。
- History 无 schema / diff / 回滚 / UI（M5-A §15）。
- provider（GLM）批次级波动无法从 harness 侧根除；只保证判定与归因正确（§4.1）。

## 7. 与冻结文档 / 已接受实现的边界

- 全部冻结设计文档、M4-A、M5-A **未改动**；未创建新的设计文档。
- `.claude/skills/requirement-layer/` **未改动**。
- M5 production（`src/commit-store.ts` / `src/commit.ts` / `src/agent.ts` 的 M5 部分）在**验收期零改动**——所有验收 gap 均在 harness 侧定位。
- `src/research.ts` 是本轮唯一的 production 改动，属 **M4-B 期健壮性修复**（中文相关性判定），详见 `notes/milestones/M5-B-Closeout.md` §Known Limitations #1；不涉及 M5 语义，不改变 M4 任何断言。
