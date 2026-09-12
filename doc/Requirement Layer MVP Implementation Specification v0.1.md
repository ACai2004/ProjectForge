# Requirement Layer MVP Implementation Specification v0.1

> 状态：Implementation Specification（编码前最小规格）
> 版本：v0.1
> 上游约束：Requirement Layer Blueprint v0.1（概念层） + Requirement Layer Workflow v0.2（工作流层） + Requirement Layer Implementation Design v0.2（实现设计层）
> 技术底座：Claude Agent SDK
> 定位：把 Implementation Design 翻译成「明天开始写代码最少需要实现什么、组件如何连接」。
>
> 本文档不是重新设计，不扩大 MVP。凡不影响第一条路径 / 不影响 Main Agent、Research、Review、Artifact、Baseline 基本运行、可留待真实运行后再决定的问题，一律标 Deferred。
>
> 约束红线（沿用，不重审）：单主 Agent；Review 单次独立只读无权不阻塞；研究=工具能力不拆子代理；持久化的最小工件集；比例原则不档位化；Baseline 无生命周期状态。

---

## 1. MVP Runtime Architecture

第一版运行时只有这些组件：

| 组件 | 是什么 | 运行时形态 | 与谁连接 |
|------|--------|-----------|---------|
| Main Agent | 唯一对话 Agent；驱动探索/定义/确认/基线 | SDK agent 循环 | 直接面对人；持有 Skill + 全部工具 |
| requirement-layer Skill | Workflow 的行为化规范（探索不问卷/研究纪律/起草规则/确认纪律/摘要规则） | 加载进 Main Agent 上下文的指令文本，非独立进程 | 只被 Main Agent 读取 |
| Research Tool | 单一外部检索能力 | Main Agent 工具列表中的一个 tool | 仅 Main Agent 调用 |
| File Tools | 读/写/编辑文件 | SDK 文件工具（自带或薄封装） | 仅 Main Agent 调用 |
| Review Subagent | 候选点的单次独立检查 | 候选形成后由 Main Agent 通过 SDK 子代理机制**临时派生**，跑完即终 | 只与 Main Agent 交换输入/发现 |
| Artifact / File Persistence | 项目真实性所在 | 每个项目一个目录，内含最小工件集（见 §5） | Main Agent 读写；Review 只读 |
| Session | 一次对话运行单元 | SDK session | 一个会话聚焦一个项目；跨会话靠项目目录恢复 |

调用关系（概念层，非代码）：

```
Human ⇄ Main Agent（Session 内）
   │  加载（会话开始）→ 项目目录工件
   │  调用（需要时）  → Research Tool → 发现回对话
   │  写入（定义点）  → Candidate 草稿文件
   │  派生（候选后）  → Review Subagent（候选+摘要）→ 发现文本回 Main Agent
   │  写入（人确认后）→ Current Baseline + History/Revision
```

**第一条 MVP 路径不涉及**：数据库、服务、编排框架、多 Agent 常驻进程、API 层。

---

## 2. Main Agent Runtime

**生命周期**：Agent = 一次会话中持续运行的对话循环。需求层的三种认知姿态（探索/定义/修订）是该 Agent 内部的行为模式切换，不是进程切换。会话结束时进程即终；项目真实性全部留在工件文件里。

**项目 ⇄ Session 关系**：
- 一个项目 = 一个目录（项目句柄）。
- 一个会话只聚焦一个项目；「继续项目 X」= 起一个新会话，Main Agent 按人给的句柄载入该目录。
- 同一项目的多个历史会话天然共存（每会话是独立对话流），项目的唯一性由目录承担。

**读取已有信息（会话开始）**：
- 读 Current Baseline → 权威定义，作为本项目此后所有判断的锚。
- 读 Working Summary → 非权威上下文，恢复「项目现在谈到哪里」。
- 若存在 Candidate（上次被打断）→ 提示人「有未完成的候选，继续还是重新开始」。
- History/Revision 按需才读（不默认全量载入）。

**调用 Research Tool**：工具在 Main Agent 工具列表中；Agent 按 Skill 决定是否调用（对话无法解决 / 需验证外部事实 / 方向成立性需查证），先对人说明理由与要回答的问题，得到同意或派发后调用；返回发现后按「要点+来源+关系标注」组织回对话；**被接受**的结论写入 Working Summary（带来源），未接受不落盘。

**Candidate 形成后调用 Review**：
1. Agent 把候选定型为 Candidate 草稿文件；
2. 派生 Review Subagent（输入：候选 + Working Summary，见 §3）；
3. 回收发现文本——只作参考材料呈现，不下「通过/不通过」结论。

**Review 返回后 → Human Confirmation**：Agent 把候选 + 审查发现（含高亮项）一并呈现，停等。人确认 → 提升为 Baseline；人修改 → 更新候选后**不默认重跑 Review**，重新呈现直到人确认或退回探索。

---

## 3. Review Runtime

严格保持 Implementation Design v0.2 的定位：**单次、独立、只读、无批准权、不阻塞、不自动多轮**。

```text
Candidate（草稿文件已写）
   ↓
Main Agent 派生 Review Subagent
   ↓（只读输入：Candidate 文件 + Working Summary 文件 + 审查范围指令）
Review Subagent 输出 Findings（文本，发现材料）
   ↓
Main Agent 原样呈现 Findings + 高亮，与 Candidate 一并交人
   ↓
Human 裁决（不受 Review 阻断）
```

| 项 | 定义 |
|----|------|
| 调用时机 | 仅在 Candidate 形成后、Human Confirmation 之前。每次候选生成一次；候选被修订后**默认不重跑**（人修订即人在审），仅人明确要求时才重跑。 |
| 输入 | ① Candidate 文件路径 ② Working Summary 文件路径 ③ 指令：只查四件事（忠实/诚实/越界/明显一致性），输出发现清单，不下结论、不改任何文件。 |
| 输出 | 发现文本：遗漏或歪曲的已谈定项 / 假设写成事实 / 推断写成人的决定 / 未知写成确定 / 技术方案混入问题定义 / 候选内部或与 Baseline 的矛盾。无通过/不通过，无评分。 |
| 权限边界 | 只读。不得调用任何写工具；不得修改任何文件；不得接触 Baseline 文件；无批准权。 |
| 是否修改文件 | 否（任何文件都不改，候选与摘要也只在 Read 侧）。 |
| 是否修改 Baseline | 否。Review 发现只有经人采纳并走确认流程后才可能影响未来 Baseline；自身丝毫无权。 |
| 不阻塞 | Main Agent 身后始终进行到 Human；发现只是参考材料，不是门禁。 |
| 独立性 | 新上下文 + 只读输入，与 Main Agent 共享的项目上下文隔离（否则独立性失效）。 |

不在此设计 Review Framework、多轮纠错、质检评分、独立 Review 子系统。

---

## 4. Tool Boundary

MVP 只实现两个必需工具：

**Research Tool**（一个）：接收一个研究问题 → 外部检索/读取 → 返回结构化发现 `{要点, 来源, 与当前方向的关系标注(支持/威胁/无关/启发)}`。不做论文/代码/网页多个专用工具；具体后端（用哪个搜索源/API）边写边定。

**File Tools**（读/写/编辑，可直接用 SDK 自带能力）：读用户材料；写候选；维护摘要；写读 Baseline 与 History。

**不需要工具的（Claude 原生能力）**：提问与澄清、质疑与重构、矛盾识别、总结归纳、比较方向、候选措辞、理解执行 Skill 行为规范。**不给这些造 tool。**

**明确不新增的非必需**：向量检索、定时任务、表格采集 UI、邮件/通知。一切在真实运行暴露需求后再议。

---

## 5. Artifact Boundary

第一版工件集（就这四个，够用）：

| 工件 | 谁创建 | 谁读 | 谁改 | 何时改 | 权威性 |
|------|--------|------|------|--------|--------|
| Candidate | Main Agent（定义点） | Main Agent / Review / Human | Main Agent（按人意见） | 定义点写入；确认循环中随人修订更新；人退回探索则作废重开 | 非权威 |
| Working Summary | Main Agent（项目初始化，空档） | Main Agent / Review | Main Agent | 仅在实质认知转折点（方向级变化/已定项产生/研究被接受）；不随探索流逐句更新 | 非权威上下文 |
| Current Baseline | Main Agent（首次确认时） | Main Agent（会话开始/修订时载入）、后续技术阶段 | **仅**「候选→人确认→提升」这一条通路 | 每次人确认新候选时整体替换 | **权威** |
| History / Revision | Main Agent（首次 Baseline 时） | 按需（默认不载入） | 只追加，不事后改 | 每次新 Baseline 产生时追加 | 权威记录（指向过去，非当前） |

- 项目目录本身即项目句柄；项目发现 = 列目录（原生能力即可），MVP 不设额外清单文件。
- 项目命名在初始化时由人确认（供恢复口头引用）。

**不设计**：schema、字段体系、关系模型、版本 diff 工具。

---

## 6. First Runnable Path（第一条路径）

逐节点系统行为（不写代码）：

1. **User**：新会话，用自然语言表达一个模糊意图（可附材料/链接）。
2. **Main Agent 启动**：按 Skill 建立项目目录（问人一句名字，可忽略）；载入空工件（Summary 初始化）；开始理解——**不要求填任何字段**。
3. **Exploration**：对话推进（理解→追问→质疑→比较→提候选方向）。每次实质认知转折的对话小结由 Agent 在对话中给出；同一触发点更新 Working Summary。不催收敛，人始终有权不收敛。
4. **optional Research**：Agent 判断「对话解决不了」→ 提议 → 人同意 → 调 Research Tool → 发现以「要点+来源+关系标注」回对话 → 人判断是否接受 → 被接受结论写入 Summary。
5. **Definition**：人示意「差不多可以固化了吧」→ Agent 停止发散，列出「已谈定的」候选清单，不回落到对话外 → 确认 Summary 与清单一致。
6. **Candidate**：Agent 写 Candidate 草稿（每条：内容 + 确认位置 + 一句话来源；不自行补缺口）；派生 Review Subagent。
7. **Review**：回收发现文本；Agent 将候选 + 发现（含高亮项）一并呈现给 Human；不下结论。
8. **Human Confirmation**：人确认 / 逐条修改 / 退回某条讨论；Agent 更新候选；不默认重跑 Review；直到人最终确认。
9. **Baseline**：Agent 把候选提升为 Current Baseline（写新文件 + 追加 History/Revision，记录相对上一版的变化与理由）；公告结果；项目从此有权威定义，可跨会话继续。

**本路径即 MVP 的核心闭环**（Workflow §17 的前段结构）。

---

## 7. Baseline Revision Path（第二条路径）

1. **新信息出现**：本项目任何会话内的研究/讨论，或技术阶段反馈，出现可能影响方向/范围/成功条件的信息。
2. **冲突可能被检出**：由 Agent 判断「这可能改变我们已确认的 X」，明确指出影响的具体条目，停等（决策点）。**MVP 不要求自动化冲突检测**——检出即 Agent 判断即可。
3. **Human 判断**：不构成影响 → 维持 Baseline；构成 → 重新进入探索（旧 Baseline **仍有效**，不标记暂停/废弃）。
4. **Exploration**：围绕新信息探索；逐步形成新的候选定义（与旧 Baseline 对照呈现差异）。
5. **New Candidate → Review → Human Confirmation**：同 §6 的第 6–8 步。
6. **New Baseline**：确认后写新版本；History/Revision 追加记录「相对上一版改了什么、为什么」；旧版保留标注为非当前，**不删除、不假装有效**；无 suspended/pending/dead 标志。

**MVP 只做到这里**。版本间 diff 工具、回滚操作、细化判据一律 Deferred。

---

## 8. Minimal Repository-Level Components

第一版代码形态大致是这些（**只列类型，不展开实现**）：

| 组件 | 职责 |
|------|------|
| Main Agent runner | SDK 入口：装配 Skill + 工具列表，运行对话循环；不包含业务逻辑 |
| Skill definition（`requirement-layer`） | Workflow 行为化的指令文档（探索/研究纪律/起草/Review 调用/确认/摘要/比例原则） |
| Research Tool | 外部检索 → 结构化发现 |
| Review Subagent caller | 一个启动 Review Subagent、传输入、回收发现的封装函数 |
| Artifact persistence utility | 工件的读写与固定操作：初始化项目、保存/载入 Summary、写/更新 Candidate、提升候选为 Baseline、追加 History/Revision |
| Session / project loading logic | 解析项目句柄 → 定位目录 → 按 §2 顺序载入工件 |

**明确不需要**：数据库、消息队列、Web 服务、配置系统、管理后台、插件机制。

---

## 9. MVP Dependency Order（编码顺序）

按「最小系统尽快跑起来」排序：

1. **Artifact persistence utility + 项目目录加载/初始化**——先让「建项目、读写工件」可运行（可手动验证）。
2. **Main Agent runner + File Tools + 最小 Skill**——能起对话、能做会话开始时的工件载入。
3. **第一条垂直切片（无 Research、无 Review）**：探索 → 定义 → 候选 → 人确认 → Baseline 落盘 → 同目录新会话可恢复。**← 第一里程碑：核心闭环全通。**
4. **Research Tool 接入**：作为可选分支打进切片（Agent 能触发 → 发现回对话 → 被接受进 Summary）。
5. **Review Subagent caller 接入**：候选形成后派生 → 发现呈现 → 人确认。
6. **Revision path 打磨**：History/Revision 追加、退回探索、新版本生成、恢复油差完善。

理由：3 之前不写 Research 与 Review 的代码——核心闭环先证明，再叠加组件。

---

## 10. Start-Coding Gate

**结论：足够开始写 MVP。** 无阻塞性问题。

**可以边写边决定的细节**（此刻不必定案）：
- 项目目录的命名与内部文件摆放（单一文件 vs 多文件，History 存单文件追加 vs 目录）——先用最简，运行后调整。
- Working Summary 的具体标题结构——先用最简清单（方向 / 已定暂定 / 影响方向的未决 / 候选与研究接受状态）。
- Research Tool 的后端选择与凭据（用哪个搜索源 / 是否 SDK 自带 / key 如何配）——环境问题，写第一步时定。
- Review Subagent 的派生方式（SDK 子代理传文件路径 vs 传文本）与所用模型档位（可用轻量模型，省 token）——写第 5 步时定。
- Candidate / Summary 的模板措辞——随用随调。
- Skill 是否拆内部子文件——写第 2 步时按体量定。

以上全部属于「不影响结构、随写随定」的层。若真要指出一个可能的环境阻塞，只有：**外部搜索后端的可用性**——若暂无可用检索能力，第一步路径可以先以「读人提供的材料/链接」作为研究的雏形（Research Tool 的读取面保留、检索面后置），这同样不构成设计层面的阻塞。

---

*本文档到此为止。已完成 Implementation Design → Coding 之间最后一层翻译，不继续进入 Repository Design 或 Coding。*