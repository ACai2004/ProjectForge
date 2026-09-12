# Requirement Layer M4 Design v0.1 — Evidence-Grounded Requirement Formation

> 状态：M4-A / Implementation Design（设计层，未实现）
> 版本：v0.1
> 上游约束（全部冻结，只读）：Requirement Layer Blueprint v0.1（概念层）+ Requirement Layer Workflow v0.2（工作流层）+ Requirement Layer Implementation Design v0.2（实现设计层）+ Requirement Layer MVP Implementation Specification v0.1（MVP 规格层）+ Requirement Layer Skill Behavior Contract v0.1（行为契约层）
> 技术底座：Claude Agent SDK
> 定位：把已接受的 M3 Requirement Layer（探索 → 项目理解 → Candidate）推进到「外部证据 → 项目理解 → Candidate → 独立检查 → Review Findings」的完整闭环设计。
>
> **本文件是设计，不是实现。** M4-A 只产出本设计文档；M4-B（另行指令）才实现。
> 本文档不修改、不重写、不版本提升任何已有冻结文档；不改变 M1/M2/M3 已接受的实现边界。

---

## 0. M4 定位与范围

### 0.1 一句话

M4 建立 Requirement Layer 的**证据接地闭环**：

> 外部证据 → 项目理解 → Working Summary → Candidate → 独立 Review → Review Findings。

M4 不重新设计 Requirement Layer，只把已有闭环从「探索 → 项目理解 → Candidate」推进到「Research 建立证据基础、独立 Review 提供第二双眼睛」。

### 0.2 M4 推进的闭环

```text
Exploration
    ↓
Research 需要被识别（Human 要求 或 Agent 判断对话无法可靠回答）
    ↓
Research Return Protocol（问题 → 工具 → findings + sources → 解释关系 → Human 裁定）
    ↓
Evidence / Findings（对话承载，含来源与不确定性标注）
    ↓
Updated Project Understanding（被解释、被讨论后的当前项目理解）
    ↓
Working Summary（仅在实质认知转折点更新；被 Human 接受的结论带来源沉淀）
    ↓
Candidate（定义点形成；表达各条目的确认性质，不发明缺失信息）
    ↓
Independent Review（单次、只读、新上下文；输出 findings，无批准权）
    ↓
Review Findings（交回 Main Agent，与 Candidate 一并呈给 Human）
```

**M4 在此停止。** Human confirmation → Baseline commit / revision 的**代码化实现**不属于 M4 范围，见 §0.4。

### 0.3 最终 Requirement Layer MVP 闭环 vs M4 范围（显式区分）

| 环节 | 完整 MVP 闭环 | M4 范围 |
|------|--------------|---------|
| Exploration | ✔ | ✔（沿用 M3） |
| Research | ✔ | ✔ 本阶段建立 |
| Evidence / Findings | ✔ | ✔ 本阶段建立 |
| Updated Project Understanding | ✔ | ✔ 本阶段建立 |
| Working Summary 更新 | ✔ | ✔ 本阶段建立 |
| Candidate 成稿 | ✔ | ✔ 本阶段建立 |
| Independent Review | ✔ | ✔ 本阶段建立 |
| Review Findings 返回 | ✔ | ✔ 本阶段建立 |
| Human confirmation | ✔ | **不属于 M4 实现范围**（沿用 Skill 现有对话行为；代码化落盘留待后续） |
| Candidate → Baseline commit | ✔ | **不属于 M4 实现范围** |
| Revision / History 追加 | ✔ | **不属于 M4 实现范围** |

### 0.4 明确不在 M4 范围（禁止借 M4 名义加入）

- Research Subagent、multi-round Research、复杂 Research orchestration
- multi-round Review、自动 Review 批准、Review gate 系统
- 自动 Candidate → Baseline、revision engine、复杂 Baseline 生命周期
- workflow engine、复杂状态机、授权框架、多用户支持、数据库、RAG
- project-type-specific requirement pipeline
- 把 M4 做成大型 orchestration framework

---

## 1. 继承的冻结原则（不重审，直接沿用）

以下原则已在 M3 冻结，M4 必须保持，本文档不再展开论证：

1. **Human Authority** —— Human 拥有方向、核心范围、重大取舍、成功条件、研究是否改变已确认方向、Candidate 是否成为 Baseline 的最终决定权。Agent 只能 propose / explain / compare / research / summarize / draft。
2. **Research finding ≠ project decision** —— finding 不能自动变成 project fact，更不能自动变成 Baseline。正确路径：finding → Agent 解释关系 → Human 考虑 / 接受 / 拒绝 / 推迟 → 被接受的结论才可能进入 Working Summary。
3. **Baseline authority must survive** —— 即使出现新 Research finding、新 Candidate、新 proposed direction，没有显式 Human confirmation 时，已有 Baseline 仍然权威。M4 不引入自动 Baseline promotion。
4. **Requirement / Technical Boundary** —— M4 仍在 Requirement Layer；处理 why / what / for whom / context / problem / desired outcome / scope / constraints / success criteria。技术讨论可以出现，但不能偷渡成 Requirement Definition。
5. **Unknown remains valid** —— Research 不是「必须研究到有确定答案」。unknown / uncertain / inconclusive / insufficient evidence / deferred 全部合法，不得强迫产生结论。
6. **比例原则** —— 不设探索 / 研究 / 审查的档位；治理重量随「方向不确定性 × 复杂度」自然伸缩。
7. **确认语义保守化** —— 模糊附和不构成确认（M3 c1–c6 实证后冻结）。

---

## 2. 组件与职责分层

### 2.1 Research Tool（单一、通用、最小）

**职责**：获取与整理外部 evidence。它不做认知判断、不解释与项目的关系。

**契约（第一版）**：

```text
research(question: 一个明确的研究问题) → Findings: Finding[]
```

**Finding 数据形态**（对话承载，见 §4.2）：

| 字段 | 含义 |
|------|------|
| claim / finding | 外部获得的一条事实性陈述 |
| source | 来源（见下） |
| certainty | conclusive / inconclusive / insufficient-evidence / speculative 之一，必须显式标注 |
| limitation | 已知局限（时效、范围、样本、对抗性来源等），无则写明「未发现明显局限」 |
| relationship | 与当前项目理解的关系（支持 / 削弱 / 挑战 / 无关 / 启发）——由 Main Agent 标注，不是 Tool 自己判定 |

**source representation（最小）**：`{ 来源标识, 类型(URL/文档/材料), 可验证性说明 }`。MVP 不做来源评分、不做引用数据库。

**输入要求**：`research()` 只接受**一个问题**（research_question），不接受「去查一堆东西」。问题由 Main Agent 按 Research Return Protocol（§3.1）形成。

**读取面 vs 检索面**：
- **读取面（M4-B 默认优先）**：读入 Human 提供的材料 / 链接 / 文档，返回要点 + 来源。这正是 MVP Implementation Specification §10 预留给「暂无可用检索能力」的雏形路径。
- **检索面（Deferred）**：通用外部搜索。激活条件与选型由 M4-B 对 target runtime 做工具探查（probe 现有 SDK 会话原生工具列表，类比 M3 `gate/diag/iso-probe.mjs` 的做法）后决定；不存在时可长期保持读取面。
- 设计红线：**Tool 层面不区分两种面向的调用形态**。`research(question)` 是唯一入口，背后接读取面还是检索面是实现细节。

**failure behavior（Tool 层）**：
- 无结果 / 检索失败 / 来源不可验证 → 返回空 Findings + 失败原因文本，**绝不编造**；
- 部分失败 → 返回成功部分 + 失败部分显式标注；
- 不确定 → 用 `certainty` 字段表达，不抹平。

### 2.2 Main Agent（唯一对话 Agent）

**职责**：判断为什么研究、研究什么问题、结果意味着什么、与当前项目理解有什么关系。它持有 Research Tool 与文件工具，按 Skill 纪律驱动研究返回协议、维持 Working Summary、起草 Candidate、调用 Review。

Main Agent 不做：替 Human 接受 / 拒绝研究结论；把 finding 自动写进项目定义。

### 2.3 Human

**职责**：是否接受研究结果、研究结果是否影响项目方向、Candidate 是否确认。所有「研究改变已确认内容」和「Candidate 升级」都是 Human 的决策点。

### 2.4 Review Capability（单次、轻量、独立、findings-only）

详见 §7。它是 Main Agent 在候选点临时派生的一次性独立检查，不是常驻组件，不是独立生命周期状态。

### 2.5 Artifact 边界（四类工件，不新增第五类）

M4 **不引入新的 artifact 类别**。以下语义在本设计中保持严格分离：

| 概念 | 载体 | 权威性 |
|------|------|--------|
| Current Baseline | `artifacts/current-baseline.md` | 权威（仅 Human 确认后产生 / 修改） |
| Working Summary | `artifacts/working-summary.md` | 非权威（恢复 + Review 对照基准） |
| Candidate | `artifacts/candidate.md` | 非权威（待确认草稿） |
| History / Revision | `artifacts/history/` | 权威记录（M4 不实现写入） |
| Evidence / Findings | **对话上下文**（不落盘为工件）；被接受结论沉淀于 Working Summary (带来源) | — |

> **Evidence 不是第五类工件。** 这与 Implementation Design v0.2 §4.3「原始研究过程留在对话；被接受结论写入 Working Summary」一致。M4 不发明「findings 目录 / 证据库 / 引用清单文件」。

---

## 3. Research 闭环设计

### 3.1 Research Return Protocol（标准行为，不可绕过）

**Research 执行不需要「研前审批」。** 依据冻结分工（Behavior Contract §10.1、Implementation Design v0.2 §2.2、MVP Spec §2），research suggestion 与 research execution 是 Agent 自主能力；Human 的研究相关决策点只有「研究结论是否被接受、是否改变已确认方向」，不是「是否允许 Agent 开始研究」。因此不新增第六个「Research approval」decision point，原有五个 Human decision points 保持不变。

```text
Agent 识别 research need（Human 要求，或 Agent 判断仅靠对话无法可靠回答且影响项目判断）
    ↓
Agent 说明 why + 要回答的问题 + 结果可能影响判断的哪个部分（面向 Human 说明，非征求允许）
    ↓
调用 research(question)（Agent 自主执行）
    ↓
findings + sources 返回对话
    ↓
Agent 解释 relevance（支持 / 削弱 / 挑战 / 无关 / 启发）+ 不确定性
    ↓
Human 考虑 / 接受 / 拒绝 / 推迟
    ↓
被接受的结论 → Working Summary（带来源）；其余留在对话
```

**唯一例外**：若 Research 本身需要**不可逆的外部副作用**（如发布、下单、对外发送、修改他人资源等），则需先经 Human 同意；读取 / 检索类研究默认无此例外，Agent 自主执行。

**缺口约束**：findings 不能绕过「返回讨论」这一步直接修改任何项目状态。违反即构成 provenance 违规（沿用 M3 验收线）。

### 3.2 Research provenance（六问，findings 必须能回答）

1. **What was researched?** —— 原始 research_question。
2. **What was found?** —— claim / finding 原文或要点。
3. **Where did it come from?** —— source。
4. **How certain / limited is it?** —— certainty + limitation。
5. **How does it relate to the current project?** —— relationship。
6. **Was it accepted by Human?** —— 接受状态（未裁定 / 已接受 / 已拒绝 / 已推迟）。

第 6 问的「已接受」状态**只存在于对话判断与 Working Summary 沉淀中**，不被记录为独立工件状态；未经验证不得声称「已接受」。

### 3.3 证据四层分离（永不混同）

| 层 | 是什么 | 能否自动进入下一层 |
|----|--------|-------------------|
| Research evidence | 外部获得的事实性输入 | 否（需 Agent 解释 + 对话讨论） |
| Research interpretation | Agent 对「它意味着什么 / 关系是什么」的解释 | 否（需 Human 裁定） |
| Human-accepted project understanding | 被 Human 接受为当前项目依据的认知 | 是（沉淀入 Working Summary，带来源） |
| Baseline | Human 显式确认的正式项目定义 | 是（仅经确认通路；M4 不实现自动通路） |

一句话：**evidence 不是 interpretation，interpretation 不是 accepted understanding，accepted understanding 不是 Baseline。**

### 3.4 Research 挑战已确认内容 → 决策点 3

若 findings 与当前 Baseline 或已确认项冲突：
- Agent 必须明确指出「这可能改变我们先前确认的 X」，指出受影响条目；
- 停等 Human（决策点 3）；
- 旧 Baseline 在确认之前仍有效（§1.3），M4 不提供自动改写的路径。

---

## 4. Evidence / Findings 与 Updated Project Understanding

### 4.1 Updated Project Understanding 是什么

它是 Main Agent 在会话内流动的「当前项目理解」（Implementation Design v0.2 §6 的已有概念）。Research 之后，理解按以下顺序被更新：

```text
findings 进入对话
    ↓
Agent 解释 relevance + certainty
    ↓
Human 讨论 / 裁定
    ↓
被接受结论 → 当前项目理解的更新（并可能在转折点沉淀入 Working Summary）
    ↓
未被接受结论 → 仅作为「已知但未接受」的讨论材料保留在对话，不进入项目理解
```

关键规则：**findings 本身不直接更新项目理解**；只有「被解释、被讨论、被 Human 接受」的结论才更新理解。未接受 ≠ 不存在——它作为候选材料保留，但不得伪装成项目认知。

### 4.2 Findings 的承载

- 原始 findings + sources：**对话上下文**。
- 被接受结论：**Working Summary**（带来源），作为后续 Candidate「依据」条目的出处。
- 两者之间不得有其他持久化中间层。

---

## 5. Working Summary 更新规则

Working Summary 是 persistent、lightweight、**非权威**、跨会话恢复上下文、未来 Review 输入。

### 5.1 什么构成「实质认知转折点」（至少以下三类）

1. 项目方向 material 级变化；
2. 重要的研究结论被 Human **接受**并成为项目依据；
3. 重要的未决 / 有意推迟项发生变化（新出现 / 被解决 / 被推迟）。

### 5.2 明确的反例

| ✗ 错误 | ✓ 正确 |
|--------|--------|
| 每一轮用户消息都重写 Summary | 只有实质认知转折点才更新 |
| 把整个探索过程逐轮复制进 Summary | Summary 只承载「当前方向 / 已定·暂定 / 影响方向的未决 / 被接受的依据」 |
| Agent 觉得某条研究「有价值」就写入「accepted understanding」 | 只有 Human 接受后才写入，并带来源 |

### 5.3 unaccepted research 纪律

**未被 Human 接受的研究结论，不得因 Agent 自行判断其价值而写入 Working Summary。** 它可以：留在对话、被再讨论、被记为「该问题已做过研究但结论未被接受」——后者属于「影响后续探索的认知变化」，可归入 §5.1 第 3 类在转折点更新，但必须保留「未接受」身份，不得写成 accepted understanding。

### 5.4 头注与权威性

Working Summary 文件头注维持「非权威，以 Baseline 为准」的既有纪律（Implementation Design v0.2 关键风险 9 的护栏）。M4 不改变其头部约定，仅在设计层面重述。

---

## 6. Candidate（M4 中成为稳定产物）

Candidate 是「准备交人确认」的定义草稿。M4 让 Candidate 成为稳定、可交付 Review 检查的产物，同时保持**非权威**——写入文件不使其自动成为 Baseline。

### 6.1 Candidate 至少表达以下确认性质（文本级标注即可）

- **confirmed**（已确认）
- **tentative**（暂定）
- **unresolved**（未解决）
- **intentionally deferred**（有意推迟）
- **inference / hypothesis**（推断 / 假设，必须显式标注）
- **research-backed understanding**（研究支撑的认知，必须带来源，且仅指被 Human 接受的部分）

### 6.2 表示方式

优先简单 Markdown / text。不做复杂 schema、不做字段强制、不做结构化枚举。每条重要内容一行标注确认性质即可（MVP Implementation Specification §10 已允许「模板措辞随用随调」）。

### 6.3 Candidate 的核心限制（不变式）

- 忠实表达当前讨论（fidelity）；
- 保留不确定性（unresolved / deferred 可存在）；
- 不发明缺失信息；
- 不把 inference 变成 fact；
- 不把 research finding 变成 accepted project fact；
- 不把技术实现决策（架构 / 框架 / RAG / API / 数据库等）偷渡进需求。

---

## 7. Review Capability 设计

### 7.1 定位与运行时机

- 单次、轻量、独立、findings-only；
- 运行时机：Candidate 草稿形成后、交付 Human 确认前（与 Behavior Contract §14 / Implementation Design v0.2 §3.3 一致）；
- 每次候选生成一次；候选被修订后**不默认重跑**（人修订视为人在审）。

### 7.2 输入 / 输出

| | |
|---|---|
| 输入 | ① Candidate 内容 ② Working Summary 内容 ③ Review 指令（检查范围 + 只读要求） |
| 输出 | findings / observations（发现条目，文本）；**无** Pass / Fail / Approved / Rejected，无评分 |

### 7.3 检查范围（固定四类，不扩展）

1. **Fidelity** —— Candidate 是否忠实表达已有讨论（遗漏 / 歪曲）。
2. **Honesty** —— 是否把 inference / assumption / research finding 包装成 confirmed fact。
3. **Requirement / Technical Boundary** —— 是否把架构 / 实现 / 框架 / RAG / API / 数据库等内容写成 requirement。
4. **Obvious Internal Consistency** —— Candidate 内部是否明显自相矛盾。

**明确不检查**（Review 不是）：product quality judge / technical architecture judge / business feasibility judge / market judge / generic「这是个好项目吗」评估器。Review 只回答「Candidate 有没有准确、诚实地表达当前已形成的定义」。

### 7.4 独立性（这是 Review 存在的唯一理由）

- **新 / 独立上下文**：不复用 Main Agent 当前完整对话上下文；不得「换一种语气重新检查自己」。
- **只读输入**：Candidate + Working Summary + Review 指令；**不得接触 Baseline 文件**；不得调用任何写工具；不得修改任何文件。
- 输入边界决定了可测的独立性判据：**Review 输出不得出现「仅存在于 Main Agent 对话中、且未写入 Candidate / Working Summary」的信息**（见 §10 Review independence）。
- 实现形态（SDK subagent vs 独立进程）由 M4-B 决定；无论哪种，都必须满足：Review 运行时对工件文件的读取权限真实可用（M3 Problem 6 的授权根教训：若 Review 需要读工件，必须运行在可读的授权根内，不能依赖 `process.chdir` 之类的表面切换）。

### 7.5 Review 与 Human 的关系

```text
Candidate
    ↓
Review → findings
    ↓
Main Agent 如实呈现（不遮蔽、不替 Review 下结论、高亮需注意项）
    ↓
Human 讨论 / 裁决
```

Review finding **不自动**：修改 Candidate、修改 Working Summary、修改 Baseline、批准 Candidate。Review 发现不新增打断点——它只是决策点 4（确认）时的参考材料。

---

## 8. 状态模型

M4 **不引入新的状态机**。

- 继续使用已有三种认知姿态：**Exploration / Definition / Baseline**。
- Research 是 capability，不是正式生命周期状态；
- Review 是 capability，不是正式生命周期状态；
- Candidate / Working Summary / Baseline 是 **artifact roles**，不是状态。

**禁止设计为**：`RESEARCHING / RESEARCHED / REVIEWING / REVIEWED / AWAITING_CONFIRMATION / ...` 之类的状态序列。这些是姿态与产物，不是机器的状态跃迁。

---

## 9. Failure Paths（最小集合）

| 场景 | 正确行为 |
|------|---------|
| Research tool failure（工具失败 / 无结果 / 不可验证） | honest failure + 继续探索；不编造结果 |
| Research inconclusive（证据不足） | 保留 unknown / inconclusive / insufficient-evidence，不强迫结论 |
| Human rejects research implication | finding 保留为 research finding（对话层），**不**进入 accepted project understanding / Working Summary 的 accepted 部分 |
| Candidate remains incomplete | 允许 unresolved / deferred 保留 |
| Review finds issues | 输出 findings；不自动修改、不自动批准、不自动无限重跑 |
| Research 与已知内容冲突 | 决策点 3：呈现冲突、停等 Human、旧 Baseline 保持有效 |

不引入「失败恢复状态」；所有失败路径都在 Exploration / Definition 姿态内自然消化。

---

## 10. Acceptance Test Design（M4-B 验收规划，设计阶段即定）

验收方法沿用 M3 冻结形态：**child-process fixture（cwd=fixture）→ 真实 MainAgent.turn() 必经 → transcript → 逐条人工核验 + 辅助 regex**。Research 类 case 用「fixture 内可控的本地材料/假想材料文件」作为检索面 stub，保证验收不依赖真实网络、来源可追溯。

| # | Acceptance | 预期证据 |
|---|------------|---------|
| R1 | Research activation | 存在「需外部事实且影响项目判断」的问题时，Agent 提出合理 research_question 并说明 why |
| R2 | Research execution | research() 被真实调用并返回 findings + sources |
| R3 | Research provenance | findings 能回答 §3.2 六问（尤其 source + certainty） |
| R4 | Research does not become decision | 无 Human acceptance 时，finding 不被写成 accepted project fact / 不进入 Candidate 的 confirmed 部分 |
| R5 | Accepted research updates Working Summary | 明确接受后才进入 Summary，且带来源 |
| R6 | Rejected / deferred research does not upgrade | 不接受时不进入 accepted understanding |
| R7 | Candidate generation | Candidate 忠实表达讨论内容，标注确认性质 |
| R8 | Candidate uncertainty | unknown / unresolved 保留，不被补全 |
| R9 | Review finds issues | Review 能发现 unsupported claim / inference-as-fact / research-as-fact / technical boundary crossing / obvious inconsistency（构造含问题的 Candidate fixture） |
| R10 | Review independence | 三维验证（M4-B 自选证据形式，但必须可验收）：<br>① **behavioral isolation** —— Review 输出不使用只存在于 Main Agent 私有对话中的信息（构造「仅在对话中出现、未写入 Candidate/WS」的诱饵内容，输出不得引用）；<br>② **input/context isolation** —— 有证据证明 Review invocation 实际只收到 Candidate + Working Summary + Review instruction，而非 Main Agent 完整对话（如受控 stub / 记录 invocation 的输入清单 + 输出交叉核对）；<br>③ **capability isolation** —— Review 无 Baseline 写入能力，也无 write tools（违反即 FAIL）。 |
| R11 | Baseline integrity | M4 新增内容（含 Research / Review 结果）未经确认不修改 Baseline |
| R12 | Cross-session recovery | Working Summary + Candidate + Baseline 的角色关系保持正确（Baseline 权威、Candidate 非权威、WS 非权威且以 Baseline 为准） |

---

## 11. 与 M3 runtime 的兼容性

- **保留 `isProjectOriented()` + `/requirement-layer` 最小 runtime activation fallback**，不无理由重写。
- `src/agent.ts` / `src/main.ts` 保持当前边界；**不把 Requirement workflow orchestration 塞进 MainAgent**。
- M3 已证明 runtime adapter 可吸收 provider 差异；M4 优先保持最小侵入。若 M4-B 的实际 capability integration 要求修改（例如显式注册 artifact 工具），其判定条件如下：

**工件写入路径（设计决策 + 激活条件）**：
- 主选：Main Agent 通过 **SDK 会话原生文件工具**（Read / Write / Edit）读写工件，路径约定来自 Skill 纪律 + 系统提示；
- fallback（激活条件：M4-B runtime 实测模型不自发调用写工具，class M3 Problem 3）：提供 **minimal artifact tool**（按 `ArtifactKind` 寻址，薄封装 ArtifactStore，暴露 read_artifact / write_artifact），作为 runtime adapter 吸收 provider 差异，不改架构、不改 MainAgent 核心逻辑；
- **项目根注入**：M4-B 需将项目根 / `artifacts/` 路径注入 Agent 上下文，使模型能定位工件（M3 A2/A3 已验证「告知路径后可真实读取」；`main.ts` 启动 banner 已打印路径，但 SDK 会话内需要同样可用的显式告知）。

---

## 12. Deferred / Open Questions（本设计刻意不定案）

1. Research 是否未来拆成独立 Subagent（重研究场景出现后再定）。
2. Research Tool 长期是否需要专用搜索能力 / 多检索源编排（MVP 读取面优先，检索面验证后定）。
3. Working Summary 最终 schema 与更细的更新频率边界。
4. Candidate 最终 schema（确认度标注是否结构化为字段）。
5. Review 的长期强度与边界演进（自动批准 / 多轮 / 是否扩宽——目前禁止）。
6. Review 是否支持「Candidate 大改后重跑」（目前不默认重跑）。
7. Baseline 最终 versioning format（History / Revision 的组织）。
8. Human confirmation → Baseline commit 的**代码化**通路（当前 M4 明确不做，交付形态待后续里程碑）。
9. 检索面激活后 Research Tool 的凭据与后端选型。

以上均属「真实 MVP 使用后才能验证」类问题，与 Implementation Design v0.2 Deferred 列表一致，不在 M4-A 强行定案。

---

## 13. M4-B 实现边界（蓝图，不含实现）

M4-B 将实现（由后续指令启动，本文件只界定边界）：

1. **Research Tool**：`research(question) → Findings`，读取面优先；含 findings 形状、source representation、failure / uncertainty 表达。
2. **Research Return Protocol 的运行时接入**：Main Agent 经 Skill + 工具边界跑通「提议 → 调用 → 返回 → 解释 → Human 裁定」。
3. **Working Summary 更新触发**：在实质认知转折点落盘（复用 ArtifactStore.writeArtifact）；unaccepted research 纪律落实。
4. **Candidate 成稿路径**：Definition 点写入 `candidate.md`（复用 ArtifactStore），标注确认性质。
5. **Review caller**：Candidate + WS + 指令 → 新上下文、只读 → findings 返回。
6. **验收套件**：§10 的 R1–R12，child-process fixture 形态。

M4-B **不实现**：Human confirmation、Candidate → Baseline 自动通路、revision、History 追加写入、workflow engine / state machine、Research Subagent、检索后端选型（若 probe 表明读取面足够，检索面继续 Deferred）。

---

## 14. 设计一致性自检（对照冻结文档）

| M4 设计点 | 冻结依据 | 一致性 |
|-----------|---------|--------|
| 证据不是第五类工件 | Implementation Design v0.2 §4.3 / MVP Spec §5 | ✔ |
| Research Tool 单一通用、读取面优先 | MVP Spec §4 / §10 / Implementation Design v0.2 §3.2 | ✔ |
| Research Return Protocol 不可绕过 | Behavior Contract §10.2 / Skill「Research 纪律」 | ✔ |
| evidence / interpretation / accepted / Baseline 四层分离 | Blueprint §6 / MVP Spec §6 | ✔ |
| Working Summary 实质转折点更新 | Behavior Contract §12 / Skill「Working Summary 维护」 | ✔ |
| unaccepted research 不入 Summary | Behavior Contract §10.3 / Skill「Research 纪律」 | ✔ |
| Candidate 非权威、标注确认性质、不发明 | Behavior Contract §8 / Skill「Candidate 规则」 | ✔ |
| Review 单次、独立、findings-only、无批准权 | Implementation Design v0.2 §3.3 / Behavior Contract §14 / MVP Spec §3 | ✔ |
| Review 独立性 = 新上下文 + 只读 | Implementation Design v0.2 §3.3 风险 8 | ✔ |
| 无新状态机；Research/Review 是 capability | Workflow v0.2 §2.2 / Behavior Contract §2 / 禁止事项 | ✔ |
| Baseline 权威性不被 M4 触碰 | Behavior Contract §4.2 / §13 / 本设计 §1.3 | ✔ |
| 保留 isProjectOriented + /requirement-layer | M3 Problem 3 冻结结论 / 本设计 §11 | ✔ |

全文无一处与上述冻结原则冲突。

---

*本文档是 M4-A 设计稿。未进入实现；未修改任何冻结文档、Skill、src 代码或测试。若与冻结文档出现歧义，以 Blueprint → Workflow → Implementation Design → MVP Spec → Behavior Contract 层次为准。*