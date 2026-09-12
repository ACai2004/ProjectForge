# Requirement Layer M5 Design v0.1 — Human Confirmation → Baseline Commit → Revision / History

> 状态：M5-A / Design（设计层，未实现）
> 版本：v0.1
> 上游约束（全部冻结，只读）：Requirement Layer Blueprint v0.1 + Requirement Layer Workflow v2.0 + Requirement Layer Implementation Design v0.2 + Requirement Layer MVP Implementation Specification v0.1 + Requirement Layer Skill Behavior Contract v0.1 + `doc/Requirement Layer M4 Design v0.1`（M4-A） + M4-B 实现/验收证据（`src/agent.ts`、`src/artifacts.ts`、`src/project.ts`、`notes/milestones/M4-B-Closeout.md`）
> 技术底座：Claude Agent SDK
> 定位：把 M4-B 已实现的「外部证据 → 项目理解 → Candidate → 独立 Review → Review Findings」闭环，推进到完成 Requirement Layer 生命周期的最后一段：**Candidate → Human 显式确认 → Current Baseline commit → Revision / History**。
>
> **本文件是设计，不是实现。** M5-A 只产出本设计文档；M5-B（另行指令）才实现。本文档不修改、不重写、不版本提升任何已有冻结文档；不改变 M1/M2/M3/M4 已接受的实现边界；不把尚未存在的能力描述为已实现。

---

## 0. M5 定位与范围

### 0.1 一句话

M5 补上 Requirement Layer 生命周期缺失的**最后一环**：

```text
（M4 已实现）External evidence → Project understanding → Working Summary → Candidate → Independent Review → Review Findings
（M5 补齐）     → Human explicit confirmation → Baseline commit → Revision / History
```

M5 不重新设计 Requirement Layer 的任何已有环节；它只定义「Human 确认 → Baseline 落盘 → 修订历史追加」这一段的设计与最小验收。M4 明确停在 Human confirmation 之前（M4 Design §0.4：Human confirmation → Baseline commit **不属于 M4 实现范围**；Revision / History 追加 **不属于 M4 实现范围**）。M5 就是这段被推迟部分的规范设计。

### 0.2 设计范围（M5-A 只做设计，不实现）

1. 显式 Human confirmation 语义（继承 M3/M4 冻结的「确认语义保守化」，落到可执行的确认判定 + 确认动作）。
2. Candidate → Baseline commit（把被确认的 Candidate 固化为 authoritative Current Baseline）。
3. Baseline replacement 语义（显式修订：新 Baseline 确认后，旧 Baseline 归档到 History，`current-baseline.md` 更新为新定义；绝不静默覆盖）。
4. Revision / History append 语义（History 只追加不改写；旧版本留存，可追溯）。
5. First Baseline creation（无 Baseline 时首次确认 → 创建当前 Baseline + 首条历史记录）。
6. Existing Baseline + revised Candidate（已有 Baseline 时，新确认 → 修订；未确认 → 旧 Baseline 保持有效）。
7. Rejection / deferral（拒绝或推迟确认：不落盘 Baseline，不产生 Revision；Candidate 与 Working Summary 按现有纪律处理）。
8. Review findings as advisory input only（Review 的 findings 是确认决策的**输入材料**，永远不是批准/否决 authority；不得因 Review「没发现问题」而自动确认）。
9. Baseline authority and integrity（Baseline 是唯一 authoritative 定义；未被确认的内容永远不进入 Baseline；M5 不引入任何自动 promotion 通路）。
10. Cross-session recovery（新会话恢复时：Baseline 权威 > Working Summary > Candidate；History 只作追溯，不是恢复依据；角色关系与 M3/M4 冻结一致）。
11. Failure / partial-write behavior（确认动作的原子性：commit 与 history 追加要么都成功要么都失败；部分写入不得留下「Baseline 已改但历史未记」或反向状态）。
12. Minimal acceptance tests（M5 验收套件：child-process fixture → 真实 `MainAgent.turn()` → transcript → 逐条核验，完全沿用 M3/M4 冻结的验收形态）。

### 0.3 M5 推进的闭环（完整 Requirement Layer MVP 闭环）

```text
Exploration
    ↓
Research（M4-B 已实现）
    ↓
Evidence / Findings（对话承载）
    ↓
Updated Project Understanding
    ↓
Working Summary（M4-B 已实现写路径）
    ↓
Candidate（M4-B 已实现写路径）
    ↓
Independent Review（M4-B 已实现）
    ↓
Review Findings（返回 Main Agent，呈给 Human；M4-B 已实现）
    ↓
【M5】Human explicit confirmation（语义判定 + 确认动作）
    ↓
【M5】Baseline commit（写入 current-baseline.md，原子）
    ↓
【M5】Revision / History append（旧版归档 history/，只追加）
```

### 0.4 明确不在 M5 范围（禁止借 M5 名义加入）

- **Review 自动批准 / 自动确认** —— Review 无批准权（M4 Design §7.5、Behavior Contract §14.3 冻结）。M5 不改变。
- **Research finding 自动进入 Baseline** —— 冻结原则（M4 Design §1.2 / §3.4 / Behavior Contract §10.3）。
- **模糊附和自动确认** —— 确认语义保守化（M3 Problem 2、SKILL「什么构成显式确认」）。
- **Revision 编辑 / History 改写 / 版本 diff / 回滚 UI** —— History 只追加；不实现修订编辑、回滚、diffing。
- **workflow engine / 复杂状态机 / 数据库 / 授权框架 / 多用户 / RAG** —— 沿用 M4 明确排除。
- **Baseline schema 结构化字段 / 版本号格式强制化** —— MVP 明文 Markdown 为主，版本信息轻量标注即可。
- **自动「Candidate 逼近 Baseline」的评分/成熟度引擎** —— 不做需求成熟度自动收敛（Behavior Contract §19 禁止）。
- **任何对已有工件的不必要重构** —— ArtifactStore 只在 M5-B 需要时做最小扩展（见 §8.4）。

### 0.5 M5 与 M4 的分工

| 环节 | 归属 |
|---|---|
| research / findings / Working Summary / Candidate 写路径 / Review | **M4-B 已实现**（本设计只引用，不重做） |
| Human confirmation 的语义判定与动作 | **M5** |
| Baseline commit（`current-baseline.md` 固化） | **M5** |
| History / Revision 追加 | **M5** |
| 跨会话恢复中 History 的角色 | **M5**（只追溯，不恢复） |

---

## 1. M5 继承的冻结原则（不重审，直接沿用）

以下原则已在 M3/M4 冻结，M5 必须保持，本文档不再展开论证：

1. **Human Authority** —— Human 拥有方向、核心范围、重大取舍、成功条件、研究是否改变已确认方向、Candidate 是否成为 Baseline 的最终决定权（M4 Design §1.1 / Behavior Contract §4.1）。
2. **Research finding ≠ project decision** —— finding 不能自动变成 project fact，更不能自动变成 Baseline（M4 Design §1.2 / §3.4）。
3. **Baseline authority must survive** —— 无显式 Human confirmation 时，已有 Baseline 仍然权威（M4 Design §1.3 / Behavior Contract §4.2 / §13.2）。
4. **确认语义保守化** —— 模糊附和不构成确认（M3 c1–c6 实证后冻结；M4 Design §1.7）。
5. **Review 无批准权** —— Review 输出 findings / observations，不输出 Pass / Fail / Approved / Rejected；不得因 Review 没发现问题而自动批准（M4 Design §7.5 / Behavior Contract §14.3）。
6. **Unknown remains valid** —— unknown / uncertain / deferred 全部合法，不得强迫产生结论（M4 Design §1.5）。
7. **无新状态机** —— Candidate / Working Summary / Baseline / History 是 **artifact roles**，不是生命周期状态；继续沿用 Exploration / Definition / Baseline 三种认知姿态（M4 Design §8 / Behavior Contract §2）。
8. **不引入审查档位 / 成熟度评分** —— 比例原则（M4 Design §1.6 / Behavior Contract §19）。
9. **来源不混同** —— User-confirmed / Tentative / Agent inference / Research finding / Unresolved 必须保持区分（Behavior Contract §3.5 / SKILL「来源不混同」）。

---

## 2. 显式 Human Confirmation 语义（M5 设计项 1）

### 2.1 定义（继承冻结语义，落成可判定规则）

**确认 = Human 对「将被固化为当前项目定义的具体内容清单」的明确、当下、无歧义的表态，并以此作为新的正式定义。**

M3/SKILL 已冻结的判定（Behavior Contract §13.1 / SKILL「什么构成显式确认」）：

- **不构成确认**：疑问句（「可以加这个吗？」「能不能这样做？」）；泛泛正面反应（「听起来不错。」「好的。」「嗯，行。」）；沉默 / 没有反对 / 对某一句话的积极回应；Agent 说「我们确定了」；Research 找到新结论；Candidate 看起来合理；Review 没发现问题；Agent 判断「用户大概同意了」。
- **构成确认的最小充分形式**（语义，非关键词）：Human 明确表示接受 / 确认「某内容成为项目定义 / 成为新的 Baseline」。自然语言即可，不要求特定关键词（例如 `/confirm`）。
- **不确定时**：不更新 Baseline，简短澄清（决策点 4.1）：「你是想把它作为对项目定义的确认变更、并形成新的 Baseline 吗？」。

### 2.2 M5 新增的确认判定结构（设计建议，非实现）

M5 把上述冻结语义落实为一个**语义化判定三要素**（供主 Agent 在决策点 4 判定确认是否成立）：

1. **对象明确** —— Human 的表态指向**具体的 Candidate 内容**（或对 Candidate 的明确调整后内容），不是泛指闲聊。
2. **动作明确** —— Human 明确表示「接受 / 确认 / 让它成为项目定义 / 形成新的 Baseline」，而非提问、请求方案、认同观察。
3. **当下明确** —— 表态发生在本轮对话、针对当前 Candidate，而非早前某次模糊说法被回溯。

三要素**同时成立**才构成确认；任一缺失即回退到澄清或保持未确认。判定是对话语义判断（由 Skill 行为规范承载），**不是关键词触发**。

### 2.3 确认的边界（不改变冻结语义）

- 确认针对「Candidate 内容」；被确认后 Candidate 内容成为 Baseline 的组成部分。
- 未被确认的 Candidate 内容（如某条 unresolved）**不随其他条目一起进入 Baseline**。
- 确认不等于「研究接受」：同一轮里 Human 可能接受了研究结论（→ Working Summary）但尚未确认 Candidate（→ 不落 Baseline）。两个决策点分开。

### 2.4 确认的产物

确认动作 = 一次 **Baseline commit**（见 §3）。确认前主 Agent 应呈现：
- 将被确认的内容清单（可追溯，标注性质）；
- Review findings（如实，不遮蔽）；
- 未决 / 暂定条目清单（确认后进入 Baseline 的部分与不进入的部分）。

### 2.5 确认范围（整体 vs 部分；MVP 默认整体）

- **默认语义（MVP）**：Human 显式确认的是**当前 Candidate 整体**——即「确认当前这份 Candidate 成为新 Baseline」。
- **部分确认仅在 Human 显式指明子集时成立**：Human 必须明确点名要确认的子集（如「只确认其中的 A 和 B 两条」），Agent 才提交该子集。部分确认同样必须满足 §2.2 三要素（对象明确地指向该子集）。
- **范围不明时不得推断子集**：若 Human 的表态歧义（无法确定是整体还是某个子集），不猜，停下来澄清：「你是要确认整份 Candidate，还是其中某几条？请指明。」
- 部分确认与整份确认走同一 commit 通路（§3）：被确认的子集逐条进入 Baseline；未被点名的条目继续留在 Candidate 作为未确认内容。

---

## 3. Candidate → Baseline Commit 语义（M5 设计项 2）

### 3.1 触发条件（唯一入口）

**只有** §2 判定成立的显式 Human confirmation 触发 commit。commit 是 Human 驱动的单一动作，不是 Agent 的持续过程。

### 3.2 commit 内容

被确认的 Candidate 内容 → 写入 `artifacts/current-baseline.md`（权威定义）。「被确认的内容」= Human 在确认时**实际指认的对象**——默认整份当前 Candidate，或 Human 显式指明的子集（§2.5），或 Review 后 Human 修改过的 Candidate（§8.4；**修改必须已落为 `candidate.md` 的实际新内容 v2，方可作为被确认对象**）。规则：

- **只写被确认的部分**。§2.2 的对象明确性保证：被确认的条目逐条进入 Baseline；未确认的 unresolved / deferred / tentative 条目与之分离（见 §3.3）。
- **保留确认性质标注**：Baseline 条目本身是 confirmed；若某条是「确认保留为暂定」则标注暂定，不得因进了 Baseline 就把它升格成事实（Behavior Contract §3.5 来源不混同）。
- **不带来源噪音**：被确认的研究支撑内容可以（但不强制）保留来源。MVP 明文 Markdown，不做字段强制。

### 3.3 与 Candidate 的关系

- commit 后 Candidate **仍然是 non-authoritative 草稿文件**（不删除、不重写为 Baseline 副本）。`candidate.md` 的角色不变。
- Candidate 中被确认的部分与 Baseline 一致；未确认部分仍留在 Candidate 作为未决。
- 若后续 Candidate 与 Baseline 不一致，以 Baseline 为准（Behavior Contract §17.5 / SKILL 失败处理）。
- 若 Human 在 Review 后修改了 Candidate 再确认（§8.4），commit 的是修改后内容；Review findings 不构成确认的前提或门槛（non-blocking）。
- **确认对象在 artifact 层与 Baseline 对齐（provenance）**：被确认的 Candidate 版本——含 Review 后修改形成的 v2（§8.4）——必须先落为 `candidate.md` 的实际内容；Baseline commit 写入的正是该 artifact 内容。不允许「Baseline 里是对话中的隐式修改、`candidate.md` 仍是旧版」的漂移。MVP 不引入版本 schema：v1/v2 指同一文件先后两次内容状态，不新增字段。

### 3.4 commit 的原子性（与 History 联动）

Baseline commit 与 History 追加是**同一个原子动作的两个写入目标**（见 §4 + §11）。§11 的事务协议保证严格次序：先暂存 history 归档 → 再替换 current（步骤 4）→ 再定型 history（步骤 5）→ 最后清理 journal（步骤 6）。**对外可观测的 committed 状态**只出现在步骤 5 定型之后；步骤 4 成功但步骤 5 尚未定型时，current 在磁盘上已是 `new`，但该事务处于 incomplete-but-recoverable——**不得呈现为已确认修订**，fresh process 必须 forward-complete（§5.2 / §11.3）。步骤 4 未生效的未完成事务（journal 有记录、current 未替换）由对账确定性 rollback，绝不以 committed 修订形式暴露。

---

## 4. Baseline Replacement 语义（M5 设计项 3）

### 4.1 何时发生 replacement

仅当存在已有 Baseline 且 Human 显式确认新的 Candidate（修订）时。replacement = 陈旧 Baseline 归档 + 新定义成为当前。

### 4.2 生命周期（显式修订，非静默覆盖）

```text
current-baseline.md（当前权威，旧版）
    ↓  Human 确认新 Candidate
history/<n>-baseline.md（旧版归档，只追加）
current-baseline.md ← 新定义（成为新的当前权威）
```

- 旧 `current-baseline.md` 内容**原样**写入 `history/` 追加文件（带时间戳 / 序列号），**当前文件随即写入新定义**。
- **两写之间必须视为一个原子事务**（§11）：要么旧版入 history 且新版入 current，要么两者都不发生。

### 4.3 命名约定（MVP 最小）

历史文件命名为 `history/<seq>-baseline.md`，其中 `seq` 与 §11.1 事务 journal 共用的单调递增序号（跨事务不重用）。既然序号已确定性单调，时间戳不参与文件名（需要时间查验时放进文件头元信息）。M5 不定义版本 schema 字段；版本号 = 文件序列 + 文件头标注。MVP 不做 diff / 回滚 / 可视化。

### 4.4 禁止

- **无确认也覆盖**（旧 Baseline 在 Human 确认前必须保持权威，Behavior Contract §13.2）。
- **静默覆盖**（replacement 必须留痕在 history）。
- **对 history 既有文件的任何改写**（只追加；见 §5）。

---

## 5. Revision / History Append 语义（M5 设计项 4）

### 5.1 History 的唯一写路径

History（`artifacts/history/`）**只追加**，由 Baseline commit 驱动（First creation 与 replacement 都追加）。不存在其他写入口。

### 5.2 记录内容

每次 commit 追加**一份归档**：替换时 = commit 前 `current-baseline.md` 的原文（旧版）；首建时 = 被确认的新定义原文（带「首建」标记，见 §6）。允许在文件头附带提交元信息（时间、内容摘要、来源 Candidate 指针），但正文是版本原文，不得改写。

**暂存与完成**：history 条目在事务期内处于「暂存」状态（staging 内，由 §11 journal 记录）。它的去留由 §11.3 对账唯一决定：步骤 4 已生效的事务被 **forward-complete**（staging 归档补齐为正式 history 条目，事务取提交点）；步骤 4 未生效的事务被 **rollback**（staging 删除，永不上升为已确认历史）。两种处置后，成为已确认 History 条目的**只有 durable committed 事务**的归档。

### 5.3 可追溯性

- 「当前是什么」由 `current-baseline.md` 回答；
- 「过去确认过什么」由 `history/` 回答（只读，按文件名序列递增）；
- 两者结合构成完整的确认历史。History **不是**权威定义来源，只是追溯层（Behavior Contract §18 表格：History 是权威历史记录，保存过去确认过的版本和显式修订）。

### 5.4 与跨会话恢复的关系

recall 恢复时 **不依赖 history**（恢复依据是 current-baseline + Working Summary + Candidate，Behavior Contract §15）。History 仅在 Human 主动查询「之前确认过什么」时提供。

**两层「恢复」的区分**：§5.4 / §10 讨论的是**认知/权威层恢复**（Agent 用什么工件恢复项目理解；history 不参与）。§11 的恢复是**文件系统事务层恢复**（进程启动时按 journal 对账 current 与 history 的不一致暂存文件，确定性处置未完成事务）。两者不冲突：事务层恢复可能删除未完成事务暂存的 history 文件，这**不改变** history 作为追溯层的权威语义（被删除的条目本就不是已确认历史）。

---

## 6. First Baseline Creation 语义（M5 设计项 5）

- **前提**：`artifacts/current-baseline.md` 不存在（`artifactExists(CurrentBaseline) === false`），且有已确认的 Candidate。
- **动作**：按 §11 事务协议一次完成——① journal 中记「首建」事务（`prev=〈无 baseline〉`）；② `current-baseline.md` 写入被确认定义 `new`；③ 该事务的 history 归档即 `new` 本身（首建没有「旧版原文」；staging 写入 `new` 的副本并原子重命名到 `history/<seq>`,记录「首建」标记）。两步原子且与替换走同一协议（仅 prev 为空 / 归档本体不同）；失败处置遵循 §11.3 唯一分叉——步骤 4 未生效 → 整体回滚，状态回到「无 Baseline」；步骤 4 已生效 → forward-complete 至 durable committed（补齐归档后即已首建）。
- **语义**：首建是「从无权威到有权威」的单向跃迁；确认前仍是无 Baseline 状态（没有 Baseline 工件 = 没有此前已确认内容，SKILL「项目历史完整性」）。
- **违规边界**：无确认不得创建 `current-baseline.md` —— M2 已冻结「缺失 → 以缺失/空表达，绝不发明默认内容，绝不自动创建 Baseline」（`src/project.ts` loadProject 注释）。

---

## 7. Rejection / Deferral 语义（M5 设计项 7）

| 情形 | 行为 |
|---|---|
| Human **拒绝**确认当前 Candidate | 不落 Baseline、不追加 history；`current-baseline.md`（若存在）保持不变。Candidate 是否保留由 Human 决定（保留为草稿 / 修改 / 丢弃都不自动发生）。Agent 回到对话，可继续探索或修订。 |
| Human **推迟**确认（明确暂缓） | 同上不落盘；Candidate 保留为未确认草稿，Working Summary 若有实质认知变化可更新（「确认被推迟」类别）。 |
| Human 对「是否确认」**不表态** | 视为未确认；保持现状；Agent 按决策点 4.1 澄清。 |
| 拒绝 / 推迟后研究或讨论出现新进展 | Candidate 可能被修订（重新起草）；修订后的 Candidate 仍需重新确认才能 commit。 |

**边界**：拒绝 / 推迟**不是** commit 的否定变体（没有「负向 commit」）；它只是「不发生 commit」。History 中不产生任何「拒绝记录」条目（History 只记录已确认版本）。

---

## 8. Review Findings as Advisory Input Only（M5 设计项 8）

### 8.1 冻结基础

- Review 输出 findings / observations，无 Pass / Fail / Approved / Rejected（M4-B 已实现，`src/review.ts`）。
- Review 是「第二双眼睛」，不是决策者（M4 Design §7.5）。

### 8.2 M5 不改变的东西

- 确认权、rejection 权、commit 权全部在 Human。
- Review findings **不触发任何自动动作**（不自动改 Candidate、不改 Working Summary、不改 Baseline、不自动重跑）。
- 主 Agent 在确认对话中**如实呈现 Review findings**（不遮蔽、不替 Review 下结论、高亮需注意项）。

### 8.3 M5 新增的呈现约定（对话层）

确认前主 Agent 应把 Review findings 与 Candidate 各条目的确认性质一并呈现，使 Human 的确认表态「知情」：Human 知道要确认的东西里有哪几条被 Review 标记为推断 / 越界 / 不一致。这增强确认的语义质量，**不**给 Review 任何否决权。

### 8.4 Review 后修改 Candidate（Review 是给「被审查的版本」的，不是给「之后任何版本」的）

Review findings 是 **advisory**，且**绑定到被审查的那一版 Candidate 内容**。Human 可以在 Review 之后修改 Candidate，并仍然显式确认修改后的 Candidate。此时：

- **被实际 commit 的是修改后的 Candidate**（§3 commit 以被确认内容为准，与 Review 无关）；
- **已有 Review findings 保持为「关于被审查版本」的 advisory 意见**——不作为修改后版本的审查结论；
- **主 Agent 不得声称修改后的 Candidate 已被 Review**（必须明确：「Review 是对修改前版本做的；修改后你可以决定要不要重跑」）；
- **M5 不引入自动重跑机制**——不因 Candidate 修改而自动触发新一轮 Review；是否重跑由 Human / 未来里程碑决定。

**Review 后修改的 artifact / provenance 语义（v2 必须先落定）**：Review 是给 v1 的；Human 若要修改后确认，修改必须**先形成新的 Candidate 内容版本 v2 并落为 `candidate.md` 的实际内容**（经现有 Candidate 写能力），然后：

- **Human confirmation 的对象 = 修改后的 Candidate v2**（已落盘的 `candidate.md` 内容，非对话中的临时措辞）；
- **Baseline commit 写入 v2**（§3.2/index：commit 的是被确认的 artifact 内容）；
- **禁止**：把仅存在于临时对话措辞中的「隐式 v2」直接当作 Baseline 写入，而 `candidate.md` 仍停留在 v1——不允许「Baseline 里是新内容、Candidate 工件还是旧版」的漂移（§3.3 provenance bullet）；
- v1/v2 不引入版本 schema（不新增字段、不改 ArtifactStore 契约）：指 `candidate.md` 同一文件先后两次内容状态，MVP 期 commit 前必须已反映为最新实际内容。

**结论**：Review 是 **non-blocking** 的。它有 findings、可影响 Human 的判断，但**既不批准也不阻塞确认**——Human 修改、确认、commit 都无需 Review 放行；修改后确认时，被 commit 的必然是已落盘的修改后 Candidate（v2）。

---

## 9. Baseline Authority and Integrity（M5 设计项 9）

### 9.1 Authority（权威层级，冻结）

```
Human > Baseline（current-baseline.md）> Working Summary > Candidate > History（追溯）
```

- Baseline 只能由 Human confirmation 产生 / 修改（Behavior Contract §13.1）。
- 没有确认，任何东西（研究、Candidate、Review、Agent 的自我判断）都不能改 Baseline（M4 Design §1.3）。

### 9.2 Integrity

- **唯一写入口**：M5 中 Baseline 的写入口 = §3 的 commit 动作（首建 + replacement）。不存在其他路径（包括：无 `write_baseline` 之类的通用工具；Review 无写权限；Research 无写权限；Main Agent 的原生 Write 不触碰 Baseline —— 沿用 M4-B 的「Baseline 与 History 永不可写」纪律，M5 只是把「永不可写」从「结构性无工具」扩展为「结构性无工具 + 一个受控 commit 动作」）。
- **只增模型**：基线内容随时间单调前进（history 只增、current 只保留最新），无编辑既有确认。
- **校验**：M5 验收含「Baseline 字节级 before/after 一致性」断言（r11 同类）；commit 后 current-baseline = 被确认的 Candidate 定义，history 最新一条 = 旧 current 原文。校验在 §11 对账之后、任何 commit 之前执行；未完成事务（journal pending）先被确定性处置（回滚或补齐），再判定权威内容。

### 9.3 修复与被挑战

- History 只记确认后的版本；「挑战旧 Baseline」属于决策点 5 行为（呈现冲突、停等 Human、旧 Baseline 保持有效），M5 不提供自动改写的路径。

---

## 10. Cross-Session Recovery（M5 设计项 10）

### 10.1 恢复顺序（冻结，M3/M4 已定）

```text
① current-baseline.md（权威）→ ② working-summary.md（非权威）→ ③ candidate.md（未确认草稿）
```

History 不作为恢复输入（§5.4）；注入记忆一律忽略、不披露（M3 Problem 4 纪律）。本节的恢复是**认知/权威层恢复**；文件系统事务层恢复（journal 对账）见 §11.3，两者互不冲突（§5.4 已区分）。

### 10.2 M5 增加的部分

- 恢复时若存在 `history/` 与 `current-baseline.md`，主 Agent 应在角色层明确：「当前定义以 current-baseline 为准；history 只作历史追溯，不代表当前状态」。
- 恢复时若 Candidate 与 Baseline 不一致（如 Candidate 是后来修订的草稿），角色关系保持：Candidate 非权威，未确认不改变 Baseline。

---

## 11. Failure / Partial-Write Behavior（M5 设计项 11）

### 11.1 原子性要求与事务协议（journal-based 两阶段提交）

Baseline commit 是**对两个持久目标的单个原子动作**（history 归档追加 + current-baseline 替换）。**单一「提交完成标记文件」**显式记录事务状态；该标记**只存在于事务进行期间**，**绝不是**「current-baseline 存在性」之类的间接判据。如下：

```text
commit(newDefinition):
  # Phase 1（staging，无破坏性）
  1. 读旧 current-baseline（若存在） → prev（字节原文）
  2. 创建 journal：.m5-commit/journal/<seq>-commit.json，写入
       { seq, prev, new: newDefinition, status: "prepared" }     （seq = 下一单调递增序号）
  3. 写 .m5-commit/staging/<seq>-baseline.md = prev（旧版归档，staging 内）   （首建时 prev=【无 baseline】→ 改写 new 原文作为首建归档，见 §6）
  # Phase 2（activation）
  4. 写入 current-baseline.md = newDefinition
  5. 原子重命名 staging/<seq>-baseline.md → history/<seq>-baseline.md（正式归档，完成）
  6. 删除 journal/<seq>-commit.json  +  marks/ 中残留标记（全部清理）
  # 提交点（durable commit point） = 步骤 5 成功（history/<seq> 定型）。
  #   步骤 4 成功后、步骤 5 失败 → incomplete-but-recoverable：fresh process 必须 forward-complete（§11.2/§11.3），当前版本保留、补齐归档。
  #   步骤 5 成功后、步骤 6 清理失败 → durable commit 已完成，仅需 cleanup recovery。
  #   1–4 任意失败且步骤 4 未成功 = 无提交点，唯一动作是 rollback。
```

- **journal 目录**（`.m5-commit/journal/`、`.m5-commit/staging/`、`.m5-commit/marks/`）是 M5-B 引入的**唯一新持久结构**；这是最小 journal，**不是数据库 / 事件存储 / workflow engine**。M4 冻结的 artifacts 语义不变。
- **commit 完成判据**（durable）= `history/<seq>-baseline.md` 已定型（步骤 5 成功）。此后 journal 是否已清理只影响「账目外观」，不影响已完成的判定。对账见 §11.3。
- 序号 `seq` 单调递增且跨事务不重用（失败可重试但序号单调）；历史文件名与 journal 共用同一 seq，保证可对账。

### 11.2 crash / 失败路径（确定性回答）

| 场景 | 行为 |
|---|---|
| **Phase 1 内崩溃 / 失败**（已建 journal，未写 current） | 下次启动 / 下次 commit 前：读 journal，发现 status=prepared 且 current 未变（仍=prev）→ **回滚**：删除 journal 与 staging 文件。无任何 observable 状态残留。 |
| **Phase 2 中 4 成功、5 失败**（current 已替换为新版，但 history 归档未落正式位） | **incomplete-but-recoverable**。恢复：staging 中仍有该 seq 的归档副本 → 按 §11.3 判定：current 已 == journal.new → **forward-complete**：保留 current=new、把 staging 副本原子重命名进 history（补齐步骤 5）、再清理 journal 与 marks。恢复完成后即属 durable commit。 | 
| **4 失败 / 5 成功前崩溃** | current 未变（=prev）→ 同「Phase 1 内崩溃」：回滚 staging/journal；history 无任何已确认条目；Human 可安全重试。 |
| **5 成功、6 清理尚未完成即崩溃** | history 已成型（步骤 5 成功）→ **durable commit 已完成**；journal 可能仍残留 pending。恢复：仅做 cleanup——删除 `journal/<seq>` 与 marks 残留，**不回滚、不重放**。 |
| **读旧 current 失败（损坏 / 不可读）** | 不 commit；如实报告；不创建 journal；不产生任何 history 条目；保持现状可追溯。 |

### 11.3 区分 committed vs incomplete（fresh process 判定）

进程启动（或每次 commit 前）执行**确定性 recovery/对账**：

```text
for each journal/<seq>-commit.json with status=prepared:
  if current-baseline.md 存在且内容 == journal.new:      # 判定 = 步骤 4 已生效
     事务是 incomplete-but-recoverable（4 已成功；5 失败或 6 未清理）：
       （a）若 history/<seq> 缺失 → **forward-complete**：把 staging 副本原子重命名进 history（补齐步骤 5）；
       （b）清理 journal/{seq} 与 marks/ 残留。
     恢复完成后：current=new 且 history/<seq> 存在 → **durable committed**。
  else:
     步骤 4 尚未成功（Phase 1 / 4 失败）→ **rollback**：删除 journal/{seq} 与 staging/<seq>*。
     current 未变（仍=prev）→ 事务未生效，无修订发生。
```

- **判定原则**（唯一分叉）：**committed 的判据 = 步骤 4 已生效**（`current-baseline.md` == `journal.new`）→ 事务必须 forward-complete 至 durable（补齐 history + 清理 journal）后即为完成。**rollback 仅发生在步骤 4 尚未成功**（`current` != `journal.new`，即 Phase 1 / 4 失败）。「current==new 但 history 差一归档」**不是**回滚或挂着不动的理由——它是 incomplete-but-recoverable，fresh process 必须向前补全。
- **绝不**：把恢复**完成前**的 incomplete 事务**呈现为成功修订**（在 forward-complete 前不得对外暴露为 committed）；把 staged 归档当作 history 已确认条目；在无 journal 的情况下仅凭 current 存在性推断 commit 完成。

### 11.4 不变量（本次硬化要守住的四条）

1. **不暴露无对应已提交 History 记录的新 Baseline**——current 更新与 history 归档永远由同一 journal 对账驱动；forward-complete 完成（history 补齐）之前，新 current 不得对外呈现为已确认修订；不存在脱离 journal 的 current 写。
2. **不把未完成事务当作成功修订**——恢复完成前，任何 incomplete 状态（含 incomplete-but-recoverable）均不呈现为 committed 或成功修订；恢复按唯一判据处置：步骤 4 已生效 → forward-complete 至 durable；步骤 4 未生效 → rollback 且 current 不变。恢复后的结果必为两态之一：committed（current=new + history/<seq> 齐备）或未发生提交（current=prev）。
3. **恢复确定性**——对账规则仅依赖磁盘可判定的三态（journal pending / current 内容 / history 归档存在），无随机、无猜测。
4. **重试安全（幂等）**——Human 重试 commit 时，序号单调递增；durable 已完成的失败事务被 recovery 收尾为 committed（不回滚、不重放）；未生效事务被回滚；重试不产生重复 history 条目、不改写已确认内容。

### 11.5 Human 安全重试

- 任何失败都以显式错误呈现「commit 未完成，可重试」；
- 重试前系统自动执行 §11.3 对账（forward-complete 或 rollback），Human 不需要手动恢复；
- 若 current 已被替换但 history 差一归档（§11.2 场景：incomplete-but-recoverable），recovery 按 §11.3 **forward-complete**：保留 current=new、补齐归档、清理 journal；Human 重试即幂等完成，且不产生重复 history 条目。
- **验收（MR11 强化）**：可控失败注入三个点位——(a) history 写失败（步骤 5 失败，4 已成功）、(b) current 写失败（步骤 4 失败，phase 1 已成功）、(c) 模拟 4 成功 5 失败后崩溃重启 → 断言：(1) 无 partial 呈现为已确认；(2) fresh process 对账后状态确定（步骤 4 已生效 → 最终 committed 且 history 完整；步骤 4 未生效 → 回滚且 current 不变）；(3) 重试后恰好一条 history 条目、一条 current 定义，无重复。

---

## 12. 与既有实现的兼容性约束

### 12.1 不破坏 M1–M4

- `MainAgent` 构造签名与 `turn()` 语义保持（M4-B 已证明可扩展）；M5 能力若需新工具/新 capability，按 M4 同款「Options 注入 + MCP server 注册」方式接入，不改核心 loop。
- ArtifactStore 的 read/write/exists 能力足够支撑 commit 的读写；history 追加用现有 `writeArtifact` 到 `history/` 路径或新增最小追加方法（**视 M5-B 探查后最小动作为准**，本设计不绑死实现）。
- isProjectOriented + `/requirement-layer` 路由保持（M3 Fix C 冻结）。

### 12.2 不引入新状态机 / 工作流引擎 / DB

确认、commit、revision 都是**单次 Human 驱动的动作**，不是状态机跃迁；不引入任何常驻组件。与 M4 Design §8（无新状态机）一致。

---

## 13. Minimal Acceptance Tests（M5 设计项 12）

### 13.1 验收形态（沿用 M3/M4 冻结）

child-process fixture（cwd=fixture）→ 真实 `MainAgent.turn()` → transcript → 逐条人工核验 + 辅助 regex。**所有 M5 case 必须走真实 `new MainAgent({...})` 产物路径**，不走裸 query（M3 Problem 5 教训）。Research/Review 类输入沿用 M4-B 的 closure-injected materials / 窄化 capability 注入方式。

### 13.2 M5 验收项（MR1–MR12 规划）

| # | Acceptance（M5） | 预期证据 |
|---|-------------------|---------|
| MR1 | 显式确认才 commit | Human 表达明确确认（「我确认这成为新的 Baseline」）→ commit 发生；模糊表态（「可以」「好的」）→ 不 commit、保持现状、必要时澄清 |
| MR2 | Candidate → Baseline commit 内容正确 | 被确认的 Candidate 定义逐条成为 current-baseline.md 内容；确认性质标注保留 |
| MR3 | Baseline replacement 留痕 | 已有 Baseline + 确认新 Candidate → history 出现旧版归档、current 更新为新定义；两者一致、可追溯 |
| MR4 | History 只追加 | 多次 commit 后 history 条目数= commit 次数，旧条目内容不被改写（字节级抽查）；未完成事务的 staged 文件永不作为已确认条目 |
| MR5 | First Baseline creation | 无 Baseline + 确认 → current-baseline.md 创建 + history 首条记录；commit 前不存在被发明的默认 Baseline；无确认不创建 |
| MR6 | Existing Baseline + revised Candidate | 未确认的修订 Candidate 不改变当前 Baseline（字节级 before/after 一致） |
| MR7 | Rejection / deferral 不落盘 | Human 拒绝或推迟 → 无 current-baseline 改动、无 history 新增、无 journal 残留 |
| MR8 | Review advisory only（含 §8.4） | 呈现 Review findings 但确认权在 Human；无「因 Review 通过而自动确认」；Review 后修改 Candidate 再确认 → **修改先落为 `candidate.md` v2，确认对象与 commit 内容 = v2**，主 Agent 明确「该修改后版本未被 Review」、不自动重跑 |
| MR9 | Baseline authority & integrity | 权威层级在恢复对话中正确呈现；commit 前后 current 内容 = 确认定义；无确认则不变 |
| MR10 | Cross-session recovery | fresh process 中 current-baseline 权威、WS 非权威、Candidate 非权威、history 仅追溯；fresh process 先按 §11.3 对账（如有未完成事务则先回滚/补齐），再做认知恢复；角色关系与 M3/M4 冻结一致 |
| MR11 | Failure / partial-write | 三失败点位注入（history 写失败=步骤 5 失败、current 写失败=步骤 4 失败、模拟 4 成功 5 失败后崩溃重启）→ 如实报错、无 partial 呈现为已确认、对账后状态确定（步骤 4 已生效 → forward-complete 至 committed；未生效 → rollback 且 current 不变）、重试幂等（恰好一条 history+一条 current） |
| MR12 | 回归 | 第一轮确认后，后续 Candidate 确认形成修订链；所有 M5 case 与 M4 R1–R12 共跑，无回归 |

### 13.3 每种 case 的 fixture 规划（举例）

- **MR1**：共 4 场景——①明确确认句（确认 Candidate A 成为新 Baseline）→ PASS commit；②疑问句（「可以这样吗？」）→ 不 commit + 澄清；③泛泛附和（「好的」）→ 不 commit；④确认 + 修改 combo（「把 X 改成 Y 然后确认」）→ 提交修改后的定义（对象明确性形态）。
- **MR3/MR4**：预置 1 条旧 Baseline → 连续 2 次确认新 Candidate → 断言 history 恰好 2 条、current 为第 2 版、旧版内容完整。
- **MR5**：无 Baseline fixture → 确认 Candidate → current 创建 + history 首条。
- **MR6**：预置 Baseline v1 + Candidate（修订但未确认）→ 断言 Baseline v1 字节级不变。
- **MR7**：确认对话中 Human 回复「先不确认」/「推迟」→ 断言无写入。
- **MR8**：Review 返回 findings（含 F/H 条目）→ 确认对话呈现 findings 但无自动动作；Candidate 仍由 Human 决定。
- **MR11**：M5-B 用可控失败注入在三个点位驱动 commit 失败 → 断言无 partial、对账确定（步骤 4 已生效 → forward-complete；未生效 → rollback）、重试幂等（§11.5）。（点位：history 写失败=步骤 5 失败 / current 写失败=步骤 4 失败 / 4 成功 5 失败后模拟崩溃重启——重启后 fresh process 必须 forward-complete，不能挂着「既未完成、又视为 committed」。）

### 13.4 与 M4 R1–R12 的关系

M4 套件不重跑（已冻结验收）；M5 套件与 M4 套件**并行存在**，MR 号独立编号。M5-B 实现后回归需证明：M5 能力上线后 M4 的 7 scenarios 仍 PASS（M4 该段不作改写）。

---

## 14. 与冻结文档的一致性自检

| M5 设计点 | 冻结依据 | 一致性 |
|---|---|---|
| 确认语义保守化、模糊不确认 | Behavior Contract §13.1 / SKILL「什么构成显式确认」/ M4 Design §1.7 | ✔ 继承，不重写 |
| 只有 Human confirmation 产生 Baseline | Behavior Contract §13.1 / M4 Design §1.3 / SKILL Baseline 原则 1 | ✔ |
| Baseline 修改是显式修订，非静默覆盖 | Behavior Contract §13.3 | ✔ §4 |
| Review 无批准权、advisory only | M4 Design §7.5 / Behavior Contract §14.3 / M4-B `src/review.ts` | ✔ §8 |
| History / Revision 只追加、保存确认过的版本 | Behavior Contract §18 表格 / M4 Design §0.4（M4 不实现写入） | ✔ §5 |
| 跨会话恢复顺序与角色层级 | Behavior Contract §15 / M4-B r12 验收 | ✔ §10 |
| 无新状态机 / 无 workflow / 无 DB | M4 Design §8 §0.4 / Behavior Contract §19 | ✔ §12.2 |
| 首建不发明默认 Baseline | M2 `src/project.ts` loadProject 纪律 | ✔ §6 |
| commit 原子、可重试、不暴露未确认修订 | M4 Design §0.4（确认/修订推迟） + 本设计 §11/§5.2 | ✔ §11 journal 两阶段；§11.5 幂等重试 |
| 证据不是第五类工件、findings 承载于对话/WS | M4 Design §2.5 | ✔ 不改 |

---

## 15. Deferred / Open Questions（刻意不定案）

1. **历史文件具体格式** —— `history/<seq>-baseline.md` 的细节（头部元信息字段）在 M5-B 定。
2. **journal 布局** —— `.m5-commit/journal|staging|marks/` 的具体命名与文件编码在 M5-B 定；本设计只冻结协议语义（§11）。
3. **确认的多条目标** —— 部分确认（Human 显式指明子集）与整体确认的对话呈现细节在 M5-B 细化；MVP 默认整体确认（§2.5）。
4. **版本号展示（无 schema 校验）** —— Baseline 文件头版本标注的措辞（如 `## Baseline v2（已确认）`）。
5. **回滚 / diff 的长期需求** —— 真实使用后再定。
6. **Candidate 的生命周期终结** —— 确认后 candidate.md 是否保留/归档/清空；MVP 建议保留原状（non-authoritative 草稿），不删除、不重写。

以上均属「真实 MVP 使用后才能验证」类问题，不在此强行定案。

---

## 16. M5-B 实现边界（蓝图，不含实现）

M5-B 将实现（由后续指令启动，本文件只界定边界）：

1. **确认判定能力**：主 Agent 在决策点 4 确认语义的三要素判定（Skill 层 + 对话行为规范，不引入新工具）；含确认范围判定（整体 vs 显式子集，§2.5）。
2. **Baseline commit capability**：受控的 commit 动作（current-baseline 写入 + history 追加，§11 journal 两阶段事务、可重试）+ 首建/替换/拒绝/推迟分支。
3. **一个受控的 commit 工具或 capability**（形态：capability 注入 + MCP 工具，遵循 M4-B 的 Options 注入模式；**不放宽为通用 write_baseline**）。
4. **MR1–MR12 验收套件**：child-process fixture 形态，含三点位 failure-injection（MR11）。
5. **回归**：M4 R1–R12（7 scenarios）不与 M5 冲突。

M5-B **不实现**：Review 自动批准、research auto-promotion、revision 编辑 / 回滚 / UI、workflow engine / state machine / DB / 多用户 / RAG、需求成熟度评分。

---

*本文档是 M5-A 设计稿。未进入实现；未修改任何冻结文档、Skill、src 代码或测试。若与冻结文档出现歧义，以 Blueprint → Workflow → Implementation Design → MVP Spec → Behavior Contract 层次为准；M5 各设计项明确承接 M4 Design v0.1 冻结语义。*