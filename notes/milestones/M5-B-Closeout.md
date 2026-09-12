# M5-B Closeout

日期：2026-09-12
里程碑：M5-B — Human Confirmation → Baseline Commit → Revision / History（实现 + Runtime 验证）
上游：`doc/Requirement Layer M5 Design v0.1`（M5-A，冻结，含 §11 journal 两阶段事务 + §8.4 v2 provenance）

## Final Status

**M5-B ACCEPTED**

- M5-A（设计）ACCEPTED —— `doc/Requirement Layer M5 Design v0.1` 冻结、**本轮未改动**。
- M5-B 实现完成，已在真实 runtime 上验证：child-process fixture → 真实 `new MainAgent({...}).turn()` → 真实 MCP 工具路径 → 真实磁盘工件 → transcript → 逐条核验。
- MR1–MR12 全部 PASS；确定性失败注入探针（step4/step5/step6/retry/first）全部 PASS；MR12 回归门（M4 7/7 + M5 19/19）PASS。
- **M5 production 代码在本轮验收中零改动**：`src/commit-store.ts`、`src/commit.ts`、`src/agent.ts` 的 M5 部分按原样通过全部验收；本轮所有验收 gap 均定位在 **acceptance harness 侧**（外加一处 M4-B 期的 production 健壮性修复，见 §Gap 分类与 §Known Limitations）。

---

## 实现范围（M5-B 产出）

| 文件 | 角色 |
|---|---|
| `src/commit-store.ts` | `BaselineCommitStore`：§11.1 journal 两阶段事务（Phase1 staging / Phase2 activation）+ §11.3 确定性对账（forward-complete / rollback）+ recovery-before-read 权威读 + MR11 故障注入（`fault.failAfter: 4|5|6`） |
| `src/commit.ts` | `createCommitMcpServer`：`commit_baseline` / `read_baseline` 两个 MCP 工具（不放宽为通用 `write_baseline`） |
| `src/agent.ts` | M5 能力接入：`commitStore` 注入 → `m5-commit` server + allowlist 合并；system prompt 增补 M5 确认语义（保守化 / 只写被确认条目 / v2 先落盘 / 不因 Review 通过而自动确认） |
| `.claude/skills/requirement-layer/SKILL.md` | 未改动（M3 已冻结的确认语义在本轮继续生效） |

**唯一新持久结构**：`.m5-commit/{journal,staging,marks}/`（最小 journal，非 DB / 事件存储 / workflow engine）。

---

## 验收形态（沿用 M3/M4 冻结）

fixture cwd → child process（`gate/m5-worker.mjs`）→ 真实 `new MainAgent({ research, reviewCaller, artifactWrite, commitStore })` → 真实 `research` / `review_candidate` / `write_*` / `commit_baseline` / `read_baseline` MCP 工具路径 → 真实磁盘工件状态 → transcript（`gate/transcripts/m5-*.md`）→ driver 逐条核验。

**不以裸 `query()` 代替 `MainAgent.turn()`**；**不以 regex 单独作为证据**——每条判定都落到磁盘工件状态（`current-baseline.md` / `candidate.md` / `history/` / `.m5-commit/journal|staging`）或确定性进程状态上，reply 文本只作辅助。

---

## MR1–MR12 验收矩阵

| # | Acceptance | 结果 | 证据（fixture / 关键断言） |
|---|------------|------|---------------------------|
| MR1 | 显式确认才 commit | **PASS** | 4 场景：`mr1-confirm`（明确确认 → current 生成 + `history/1-baseline.md` + journal/staging 干净）；`mr1-question`（「可以这样做吗？」→ current 不存在、history 空、澄清）；`mr1-fuzzy`（「好的。」→ 不 commit）；`mr1-modify`（「改成微信群然后确认」→ 先落盘 v2 再 commit，Baseline 定义值为微信群、不含邮件）。 |
| MR2 | commit 内容正确 + 未决不污染 | **PASS** | `mr2`：3 条已确认定义进入 `current-baseline.md`；`未决：每周发送频率` **未**进入 Baseline（`no_pollution=true`）；`candidate.md` 保留未决条目（`cand_kept=true`）；history 1 条；journal/staging 干净。 |
| MR3 | Baseline replacement 留痕 | **PASS** | `mr3`：归档 `history/1-baseline.md` 内容 === 旧 `current-baseline.md` 原文（V1，字节级）；current 更新为 v2；journal/staging 干净。 |
| MR4 | History 只追加 | **PASS** | `mr4`：连续 2 次确认 → history 恰好 2 条（`1-baseline.md`=V1、`2-baseline.md`=v2）；current=v3；旧条目未被改写；journal/staging 干净。 |
| MR5 | First Baseline creation | **PASS** | `mr5`：无 Baseline + 确认 → current 创建；history 首条 === current 本身（首建归档=新定义原文，§6）；journal/staging 干净。 |
| MR6 | Existing Baseline + revised Candidate | **PASS** | `mr6`：未确认的修订 Candidate → Baseline 字节级不变（`current === V1`）；无 history 新增；无 journal 残留。 |
| MR7 | Rejection / deferral 不落盘 | **PASS** | `mr7`：「先不确认。」→ current 不变、history 空、journal/staging 空。 |
| MR8 | Review advisory only（含 §8.4） | **PASS** | `mr8`：先 `review_candidate` 呈现 findings（无 Pass/Fail）；再把「发送渠道」改为微信群**落盘为 `candidate.md` v2**；确认对象与 commit 内容 = v2（Baseline 定义值 = 微信群，不含邮件）；history 1 条；journal/staging 干净。 |
| MR9 | Baseline authority & integrity | **PASS** | `mr9`：权威层级正确呈现（current-baseline 权威；candidate 非权威未确认，不因写得更「新」而生效）；`banned=0`（零 MEMORY 泄漏）。 |
| MR10 | Cross-session recovery + 事务层对账 | **PASS** | `mr10`：预置「步骤 4 已生效、步骤 5 未完成」崩溃盘态（current=V2NEW + `journal/2-commit.json`(prepared) + `staging/2-baseline.md`=V1、**无** `history/2`）。模型**实际调用 `read_baseline`**（transcript 自述 `forwardCompleted: [2]`、无 rollback）→ §11.3 forward-complete 补齐 `history/2-baseline.md`(V1) → 恢复后 journal/staging 干净、current 保持 v2。**recovery-before-read 在真实 MainAgent + 真实 MCP 路径上实际发生**。 |
| MR11 | Failure / partial-write | **PASS** | 见下方「MR11 证据」——确定性三点位（step4/step5/step6）+ 重试幂等 + 首建盲区 + agent 级注入，全部 PASS。 |
| MR12 | 回归 | **PASS** | `m5-mr12`：M4 regression 7/7 + M5 regression（自排除 mr12）19/19 → `VERDICT: PASS`。 |

### MR11 证据（failure / partial-write）

| 探针 | 注入 | 断言 | 结果 |
|------|------|------|------|
| `p-step4` | 步骤 4 前失败（current 未写） | 如实报错；**rollback**；current 保持 V1；history 仍 1 条；journal 干净 | **PASS** |
| `p-step5` | 步骤 5 前失败（current 已写） | 如实报错；**forward-complete**（fwd=[2]）；current=V2NEW；`history/2-baseline.md`=V1；journal 干净 | **PASS** |
| `p-step6` | 步骤 6 前失败（已 durable） | 如实报错；forward-complete；已 durable 不被回滚；journal 干净 | **PASS** |
| `p-retry` | step5 崩溃 → recover → 再 commit | 重试幂等：history `1→2→3` 恰好 +1；seq 无重复；current=V2NEW；journal/staging 干净 | **PASS** |
| `p-first` | **首建**（无 current-baseline、**无 `history/` 目录**）+ step5 崩溃 | 恢复前 `history/` 确实不存在；forward-complete **补建 history/ 并归档**（不抛 ENOENT）；current=v2；journal/staging 干净 | **PASS** |
| `mr11-agent` | agent 进程注入 `failAfter=5` | agent 如实汇报失败（不假成功）；fresh `read_baseline` 对账后 **durable**；journal/staging 干净；归档 = 被取代的 prev(V1)；current=v2 | **PASS** |

`p-first` 覆盖的正是 2026-09-11 M5-B 实现期由 MR11-agent 抓到的生产缺陷（见 Engineering Record §3）；`mr11-agent` 的 recovery 断言与确定性 `p-step5` 语义一致（§11.3 forward-complete）。

---

## 回归矩阵

| 项目 | 命令 / 范围 | 结果 |
|------|-------------|------|
| TypeScript 检查 | `npm run check` | **PASS**（exit 0） |
| 单元测试（M2 核心） | `npm test` | **PASS** 11/11 |
| M3 回归 | `gate/m3c-prov-suite.mjs`（A2×2 + A3×3 provenance，5 次真实模型调用） | **PASS** ZERO LEAK (5/5 clean) |
| M4 回归 | `gate/m4-driver.mjs`（R1–R12 全 7 case，真实 MainAgent） | **PASS** 7/7 |
| M5 MR1–MR12 | `gate/m5-driver.mjs`（14 真实 case + 5 确定性探针 + MR12 门） | **PASS** 19/19 + MR12 PASS |

---

## 本轮验收发现的 gap 与分类

本轮验收的起点是「M5-B 实现已存在、验收未完成」。逐项分类如下（区分 production code bug / harness bug / test coverage gap / provider-model limitation）：

| # | 现象 | 分类 | 处置 |
|---|------|------|------|
| 1 | `mr8` 报 `WORKER-ERROR: undefined`，失败原因不可见 | **harness bug** | `gate/m5-driver.mjs`：worker 在「某轮 turn 抛错」时返回 `{ok:false, turns:[{error}]}`，旧渲染只读 `parsed.error/parsed.raw`（皆 undefined）→ 真实错误被吞。改为显式展开 `turns`，并捕获子进程 stderr 写入 transcript。 |
| 2 | `mr10` 时通时不通；无法区分「模型没调工具」与「recovery-before-read 不生效」 | **harness bug**（underconstrained） | `gate/m5-driver.mjs`：MR10 prompt 原先把 `current-baseline.md` 内容**内联**，模型可照抄作答而完全不调 `read_baseline` → §11.3 对账不触发。**去掉内联**，回答所需内容只能经 `read_baseline` 获得。 |
| 3 | `mr11-agent` 在事务已 durable 时仍被判 FAIL | **harness bug**（假阴性判定） | `gate/m5-driver.mjs`：旧判定无条件要求 reply 出现失败字样；但 agent 经 `read_baseline` 自行 forward-complete 后事务**确实** committed，汇报成功是真话。改为「如实汇报」相对磁盘 durable 状态判定（同 `noFalseSuccess` 已有的处理）。同时把 recover 断言显式拆成 `journal_clean` / `staging_clean` / `noRollback` / `histOk` / `currentOk`。 |
| 4 | `mr2` 偶发把「未决：每周发送频率」写入 Baseline | **harness underconstraint + provider/model limitation** | 原 prompt「我确认这份 Candidate 成为新的 Baseline」对含未决条目的 Candidate 字面二义（§2.5 整体确认 vs §3.2 排除未决）。harness 跳过了 Agent 的「进入/不进入」呈现步（§2.4），把歧义直接抛给模型。补上 Human 轮的本来语境（未决项保持未决）；**判据不动**（未决项必须不进入 Baseline）。 |
| 5 | M4 `r5` 时通时不通 → MR12 门连带 FAIL | **harness bug（M4-B 期）+ 触发 MR12** | `src/research.ts` 的相关性启发式按 `/\s+/` 分词：中文问句无空格 → 唯一 token 是整句 → `body.includes(整句)` 恒 false → research 对中文问题一律返回**空 findings** → 模型**正确地**拒绝写入 WS → M4 r5 判定 FAIL（模型行为无错）。修复见 §Known Limitations #1。 |
| 6 | 个别 case 在某一批次整体失败（如某次 run 同时 `mr8`+M4 `r1/r11` 失败），伴随 `WORKER-TURN-ERROR` / 空输出 | **provider/model limitation** | GLM 端偶发 API/网络层失败导致该轮 turn 抛错。已由 gap#1 的 stderr 落盘使其可诊断；非生产缺陷、非 harness 断言问题。 |

**关键结论**：上述 1–5 全部在 harness 侧（外加 1 处 M4-B 期的 production 健壮性修复）；**M5 production 实现本身（commit-store / commit / agent 的 M5 部分）在本轮验收中未发现任何缺陷、未做任何改动**。

---

## Known Limitations

1. **`src/research.ts` 相关性启发式（M4-B 期健壮性修复，本轮改动）**：M4-B 原实现的读取面相关性按空白分词，对无空白的中文问句恒不命中，使 research 对中文问题一律返回空 findings。本轮在 M4-B 验收尚未覆盖中文问句形态的前提下，为其补上「问句与材料正文存在 ≥2 字公共子串」的判定（`hasSharedSubstring`）。**这是 M4-B 设备（research tool）的修复，不属于 M5-B 设计范围**；M5-A 设计文档未改。该修复不放宽任何断言——M4 r5 的判据（WS 含标准 + 来源）不变，只是让 research 在中文下按契约（§2.1 读取面）真的能返回相关要点。副作用：2 字重叠在单材料 MVP 下可能带来轻微过匹配，已用「不相关问题返回 0 findings」验证（`今天天气怎么样，午饭吃什么` → 0）。
2. **provider 非确定性**：GLM 端（`.env.providers` 指向的 Anthropic 兼容端点）在工具调用与 API 稳定性上存在批次级波动。本轮的应对不是重跑，而是**修正 harness 的判定与归因**（gap#1–#5），使每条 case 测的是「它声称要测的不变量」而非「模型这一轮恰好调没调工具」。仍有残余的 provider 层偶发失败（gap#6），已通过 transcript 的 stderr 落盘可诊断。
3. **host MEMORY**：SDK 子会话可能继承宿主 auto-memory；缓解为指令纪律（SKILL「项目历史完整性」+ system prompt），非结构性排除。M5 全部 case `banned=0`，M3 provenance 套件 5/5 ZERO LEAK 复现同一纪律。
4. **`mr1-*` / `mr8` 等 case 的工件来源**：fixture 工件内容**逐字内联**进 prompt（模型在 child 中不授予原生 Read），使「commit 对象 = 工件实际内容」对模型显式。这是 M3/M4 既有手法（M4-B Known Limitations #5 同源），本轮沿用；MR10 是**唯一**刻意不内联的 case（见 gap#2），因为它测的正是「必须实际读取」。
5. **History 形态**：MVP 明文 Markdown；`history/<seq>-baseline.md` 由 seq 命名，无版本 schema 字段、无 diff / 回滚 / UI（M5-A §15 Deferred）。
6. **MR12 的成本与耦合**：MR12 以「M4 7 case + M5 14 case 各自完整重跑」为门，因此**继承两套 suite 的全部 flakiness**。本轮已修掉可归因的 harness 侧 flakiness（gap#2/#5），使 MR12 可确定性通过；但若未来 provider 端出现批次级失败，MR12 仍会连带失败——这是该门设计上的已知耦合，未在本轮改动其判定语义。

## Not Implemented（M5 明确范围外）

- Review 自动批准 / 自动确认（Review 无批准权，advisory only）
- Research finding 自动进入 Baseline（auto-promotion）
- Revision 编辑 / History 改写 / 版本 diff / 回滚 UI
- 需求成熟度评分 / 自动收敛引擎
- workflow engine / 复杂状态机 / DB / 授权框架 / 多用户 / RAG
- Baseline schema 结构化字段 / 版本号格式强制化
- `src/main.ts` 生产 CLI 的 M4/M5 能力接线（research/review/write/commit 目前仅经构造注入在验收 harness 中可用；M4-B Known Limitations #1 同源）

## 文件清单

**Created（M5-B）**
- `src/commit-store.ts`（journal 两阶段事务 + recovery-before-read + 故障注入）
- `src/commit.ts`（`createCommitMcpServer`：commit_baseline / read_baseline）
- `gate/m5-worker.mjs`、`gate/m5-driver.mjs`（MR1–MR12 child-process fixture harness + 确定性探针）
- `notes/milestones/M5-B-Closeout.md`（本文）
- `notes/engineering/M5-B-Engineering-Decision-and-Debugging-Record.md`

**Modified（本轮验收期）**
- `gate/m5-driver.mjs` —— harness 修正：错误渲染 + stderr 落盘（gap#1）、MR10 去内联（gap#2）、MR11-agent 判定与 recover 断言（gap#3）、MR2 prompt 语境（gap#4）。**未改动任何断言阈值以放宽判定**。
- `src/research.ts` —— M4-B 期健壮性修复：中文（无空白）问句的相关性判定（gap#5，见 Known Limitations #1）。
- `src/agent.ts` —— **本轮未改动**（M5 能力接线在 M5-B 实现期已完成；本轮验收零改动）。

**Unchanged**
- 全部冻结 Requirement Layer 设计文档（Blueprint / Workflow / Implementation Design / MVP Spec / Behavior Contract）
- `doc/Requirement Layer M4 Design v0.1`（M4-A）、`doc/Requirement Layer M5 Design v0.1`（M5-A）
- `.claude/skills/requirement-layer/`（SKILL.md + references）
- `src/commit-store.ts` / `src/commit.ts` / `src/artifacts.ts` / `src/project.ts` / `src/main.ts` / M1–M2 测试
- `~/.claude/settings.json` / CC Switch（未读取、未修改）

## 显式声明

- M5-A（设计）**已接受且未被改动**；所有冻结文档保持原样；本轮未创建新的设计文档。
- M5-B 的 MR1–MR12 验收**全部在真实 `MainAgent.turn()` + 真实 MCP 工具路径 + 真实磁盘工件上完成**；未以裸 `query()` 代替，未以 regex 单独作证。
- M5 的 Baseline 唯一写入口是受控的 `commit_baseline`；**不存在**通用 `write_baseline`；Review / Research 无 Baseline 写能力。
- **历史证据保留**：本轮未声称任何 case「因其有实现即通过」——每条 PASS 都有对应 transcript 与磁盘状态。
