# Requirement Layer Workflow v0.2

> 状态：Process / Workflow Design
> 版本：v0.2
> 上游：Requirement Layer Blueprint v0.1
> 定位：描述一个项目如何从模糊项目意图，通过探索、研究、定义与人工确认，形成稳定的 Project Requirement Baseline。
>
> 本文档描述的是**认知与职责层面的工作流**，不规定 Agent 数量、Skill、Prompt、数据模型、API、文件结构或具体实现方式。
>
> 本 Workflow 的完整形态是**能力上限**，不是所有项目都必须完整经历的固定流程。

---

# 1. Workflow 的核心定位

Requirement Layer 不是一个：

> Input → Step 1 → Step 2 → Step 3 → Output

的线性流水线。

它更准确地是：

> **一个允许探索、研究、定义、回环与确认的项目认知工作流。**

它解决的问题是：

> **如何把一个原本模糊、可能变化甚至可能被推翻的项目意图，逐渐变成一个稳定、明确、边界清晰、能够交给后续技术阶段使用的项目定义。**

因此，Workflow 的核心不是“走完多少步骤”，而是：

> **项目认知是否从模糊状态逐渐形成了一个可信的当前定义。**

---

# 2. Level 1：宏观认知流

```text
                    ┌─────────────────────────────┐
                    │       Requirement Layer      │
                    │                             │
                    │      ┌──────────────┐       │
项目意图 ──────────→ │      │ Exploration  │       │
                    │      └──────┬───────┘       │
                    │             ↕               │
                    │          Research           │
                    │             ↕               │
                    │      ┌──────┴───────┐       │
                    │      │  Definition  │       │
                    │      └──────┬───────┘       │
                    │             │               │
                    │      Human Confirmation     │
                    │             ↓               │
                    │   Project Requirement       │
                    │        Baseline             │
                    └─────────────┬───────────────┘
                                  ↓
                          Technical Research
                                  ↓
                           Technical Design
                                  ↓
                            Implementation
                                  ↓
                              Validation
                                  │
                                  └────→ 若发现问题定义需要改变
                                           ↓
                                      回到 Requirement Layer
```

### 2.1 三个核心状态

Requirement Layer 只设三个核心认知状态：

**Exploration**

项目仍在形成，允许方向变化。

**Definition**

开始把已经形成并被接受的认知整理成稳定定义。

**Baseline**

当前经过人确认、正式生效的项目定义。

---

### 2.2 Research 的位置

Research **不是第四个独立状态**。

它是 Exploration 中的一种能力，也可以在 Definition 前后被调用。

它的意义是：

> 当单纯依靠对话无法可靠回答某个问题时，引入外部证据。

---

# 3. Workflow 的五条核心原则

## 3.1 探索可以改变项目，定义不能无声改变已经确认的项目

Exploration：

> 允许发散、质疑、重构和改变方向。

Definition：

> 忠实整理已经形成并被接受的项目定义。

Baseline：

> 作为当前有效定义，对后续阶段提供稳定依据。

---

## 3.2 Research 可以改变认知，但不会自动改变项目定义

研究结果首先是：

> 新的证据 / 新的认知输入。

只有经过讨论并作出相应判断后，它才能影响 Definition 或 Baseline。

---

## 3.3 关键决策由人拥有

Agent 可以推动整个认知过程，但不能偷偷代替人作出关键方向性决定。

---

## 3.4 Baseline 的改变必须显式

任何已经确认的项目定义：

> 不能被 Agent 无声修改。

需要改变时：

> 新信息 → 明确指出影响 → 人决定是否重新探索 / 修改 → 新 Definition → 新 Baseline。

---

## 3.5 治理强度按项目实际情况缩放

不是所有项目都需要走完整流程。

但以下原则始终成立：

* Agent 不得伪造确认；
* Research 不自动成为 Decision；
* 关键方向由人决定；
* Baseline 只能显式形成与修改。

可以按项目实际情况缩短：

* 探索深度；
* 研究次数；
* 信息整理粒度；
* 确认粒度；
* Review 展开程度。

因此：

> **流程可以缩短，但核心可信性原则不能被静默取消。**

---

# 4. Exploration：探索模式

## 4.1 目标

探索的目标不是“收集完需求”。

而是：

> **让项目本身逐渐形成。**

主要活动包括：

* 理解；
* 追问；
* 质疑；
* 比较；
* 提出候选方向；
* 识别假设；
* 识别未知；
* 外部研究；
* 重构问题；
* 放弃或收窄方向。

---

## 4.2 Agent 的职责

Agent 可以自主：

> 理解 → 提问 → 质疑 → 研究 → 比较 → 归纳 → 提议。

Agent 可以提出：

> “我认为 A 可能比 B 更合理。”

但这个判断只是：

> **候选建议。**

不能被自动视为：

> 项目决定。

---

## 4.3 Exploration 不采用固定提问清单

Agent 不应该机械依次询问：

> 场景 → 功能 → 规则 → 边界 → 约束……

而应该根据：

> **当前什么问题最值得继续澄清**

来推动下一轮讨论。

因此：

> **结构化维度用于确保认知覆盖，不用于规定探索顺序。**

---

## 4.4 Exploration 的结束

Agent 可以判断：

> “当前方向似乎已经比较稳定，可以考虑进入定义。”

但只能：

> **建议。**

真正进入 Definition 需要人的明确意图。

---

# 5. Research：探索中的研究回环

## 5.1 Research Trigger

Research 可以由：

* 人主动要求；
* Agent 判断某个外部事实需要验证；

触发。

---

## 5.2 Research Return

研究完成后：

```text
Research
   ↓
发现
   ↓
解释与当前项目的关系
   ↓
是否影响方向 / 范围 / 假设？
   ↓
回到讨论
```

研究结果必须回到认知过程，而不是直接写入 Baseline。

---

## 5.3 Research 的硬边界

### Research 结论不是自动 Decision

它首先只是：

> 外部依据。

### Research 可以挑战已经形成的项目定义

但必须：

> **指出“它正在挑战什么”。**

### 是否接受这个挑战

由人决定。

---

# 6. Definition：定义模式

进入 Definition 后，目标发生变化：

> 从“继续发现可能性”

变成：

> **“把当前已经足够成熟的项目认知稳定下来。”**

---

## 6.1 Definition 的输入

主要来自：

* Exploration 中形成的认知；
* 已讨论的方向；
* 已确认的边界；
* 已接受的研究结果；
* 已存在的关键约束；
* 尚未解决但需要诚实保留的问题。

---

## 6.2 Agent 的职责

Agent 负责：

* 归纳；
* 结构化；
* 提炼；
* 统一概念；
* 暴露矛盾；
* 起草候选项目定义；
* 区分确定与不确定。

Agent 不负责：

> 为了“让它完整”而自行补答案。

---

## 6.3 Definition 的核心产物

Definition 形成：

> **Candidate Requirement Definition**

即：

> 一份准备接受人确认的候选项目定义。

它不是最终 Baseline。

---

# 7. 确定性与不确定性

本 Workflow 不建立：

> Decision / Assumption / Unknown / Open Question / Deferred

五个平行的正式状态机。

它只要求：

> **每项项目认知都处在诚实的确认位置。**

可以存在：

### 已确认

已经由人认可，进入当前项目定义。

### 暂定

为了推进而暂时采用，但尚未充分验证。

### 未解决

当前没有足够答案。

### 有意推迟

明确决定：

> “现在不处理。”

因此：

> **这些名称描述的是认知性质与处理方式，不是要求实现成五个独立系统状态。**

---

## 7.1 定义阶段真正要做的事

不是：

> 消灭所有 Unknown。

而是：

> **让不确定性被正确表达。**

例如：

```text
未知
 ↓
能否通过讨论解决？
 ↓
能否通过 Research 解决？
 ↓
若仍不能：
   ├─ 暂定采用 → Assumption
   ├─ 暂时无答案 → Unknown / Open Question
   └─ 明确暂不处理 → Deferred
```

---

# 8. Definition → Baseline

当候选定义形成后，需要进行一次最终可信性检查。

只关注三个问题：

## 8.1 忠实

已经形成的关键决定有没有被遗漏、歪曲或改变。

## 8.2 诚实

有没有：

* 把假设写成事实；
* 把 Agent 推断写成人的决定；
* 把未知写成确定答案。

## 8.3 越界

有没有：

> 把技术解决方案偷偷写进需求定义。

---

# 9. Human Confirmation

Review 的作用是：

> **帮助人发现问题。**

但：

> **Review 不替人做最终裁决。**

最终是否建立 Baseline：

> **由人确认。**

人不需要逐句审核。

理想方式是：

> Agent 提交候选定义 + 突出真正需要注意的地方 → 人进行最终确认。

---

# 10. 人与 Agent 的责任边界

## 10.1 Agent 可以自主

* 理解；
* 追问；
* 研究；
* 质疑；
* 比较；
* 总结；
* 识别矛盾；
* 提出候选方案；
* 起草候选定义；
* 检查一致性。

---

## 10.2 Agent 不应偷偷替人决定

尤其是：

* 项目方向；
* 核心范围；
* 重大取舍；
* 成功条件；
* 放弃；
* 收窄；
* 重定义。

Agent 可以：

> **提出建议。**

但不能把：

> 建议

变成：

> 已确认决定。

---

# 11. 从 Exploration 到 Definition

规则非常简单：

```text
Exploration
     ↓
Agent 判断“似乎已经足够成熟”
     ↓
Agent 提议进入 Definition
     ↓
Human 决定
     ├─ 继续探索
     └─ 进入 Definition
```

重要的是：

> **“成熟度判断”可以由 Agent 提供，“状态切换”由人决定。**

---

# 12. 从 Definition 到 Baseline

```text
Definition
   ↓
Candidate Requirement Definition
   ↓
Agent 可信性检查
   ↓
Human Review
   ↓
Human Confirmation
   ↓
Baseline
```

只有到最后一步：

> **人确认**

之后，候选定义才正式变成当前 Baseline。

---

# 13. Baseline → 再探索

Baseline 建立后，如果出现：

> 足以影响项目方向、核心范围、成功条件的新信息，

则：

```text
Current Baseline
      ↓
发现新的重要信息
      ↓
Agent 明确指出：
“它可能影响我们当前的 X”
      ↓
Human 判断
      ├─ 不影响 → 保持 Baseline
      └─ 影响 → 重新进入 Exploration
```

重新探索后：

> 新 Definition → Human Confirmation → 新 Baseline。

---

## 13.1 旧 Baseline 怎么办

不要建立复杂的：

> Active / Suspended / Pending / Dead

状态体系。

原则只有一个：

> **在新的 Baseline 确认之前，旧 Baseline 仍然是当前有效定义。**

如果最终某些内容被改变：

> 新 Baseline 显式记录其变化。

旧信息保留历史，不无声删除。

---

# 14. 技术阶段回环

Requirement Layer 与 Technical Layer 的边界是：

> **Requirement Layer 定义问题空间。**

> **Technical Layer 探索解决空间。**

因此：

技术研究发现：

> “这个实现方法不行。”

不等于：

> Requirement Layer 错了。

但如果技术研究发现：

> “原问题定义本身可能有问题。”

则应该：

```text
Technical Research
       ↓
发现问题定义疑点
       ↓
明确反馈
       ↓
返回 Requirement Layer
       ↓
Human 判断
       ↓
必要时重新探索
       ↓
形成新的 Baseline
```

不能由技术阶段直接偷偷修改需求。

---

# 15. 比例原则的真正含义

本 Workflow 不设置固定的：

> 轻量模式 / 标准模式 / 研究模式

三档流程。

因为这会把：

> **“如何治理项目”

本身变成一个额外配置流程。**

真正的比例原则是：

> **同一套核心原则，根据项目复杂度与方向不确定性自动改变工作深度。**

---

## 15.1 极简单项目

可能实际上只有：

```text
一句想法
  ↓
简短讨论
  ↓
候选定义
  ↓
人确认
  ↓
Baseline
```

不需要长时间探索。

---

## 15.2 中等复杂项目

可能经历：

```text
Exploration
   ↕
Research
   ↓
Definition
   ↓
Human Confirmation
   ↓
Baseline
```

---

## 15.3 高度不确定的研究项目

可能经历：

```text
Exploration
   ↕
Research
   ↕
Exploration
   ↓
暂定 Definition
   ↓
新研究
   ↓
再次 Exploration
   ↓
新的 Definition
   ↓
Baseline
```

核心原则不变。

只是：

> **认知过程更长。**

---

# 16. 失败路径

Workflow 必须支持以下情况：

### 16.1 人不想收敛

继续 Exploration。

没有强制完成。

### 16.2 人中途停止

允许暂停，不强制产出 Baseline。

### 16.3 人改变主意

回到 Exploration。

### 16.4 Research 推翻原方向

回到 Exploration。

### 16.5 人说法矛盾

Agent 指出矛盾，不自行选答案。

### 16.6 Agent 判断错误

如果尚未进入 Baseline：

> 直接修改候选认知。

不要制造额外“修订历史”。

---

# 17. 最小可靠闭环

第一版真正必须跑通的只有：

```text
模糊项目意图
      ↓
Exploration
      ↕
Research（需要时）
      ↓
Definition
      ↓
Candidate Requirement Definition
      ↓
可信性检查
      ↓
Human Confirmation
      ↓
Project Requirement Baseline
```

以及一个必须支持的回路：

```text
Baseline
   ↓
新信息威胁问题定义
   ↓
Human 判断
   ↓
Exploration
   ↓
Definition
   ↓
New Baseline
```

这两个结构就是第一版 Requirement Layer 的核心。

---

# 18. 第一版刻意不解决的问题

以下问题暂不定案：

* Research 是否需要独立 Research Agent；
* Baseline 具体如何存储；
* 确认度如何结构化；
* 是否需要独立自动 Review Agent；
* 如何自动判断项目应该多深；
* 长期暂停 / 恢复的交互方式；
* 是否需要复杂的 Agent Delegation 机制；
* 技术阶段回环的更精细判据。

这些问题等进入 Implementation Design 或真实运行后再决定。

---

# 19. 最终原则

> **探索是为了让项目形成。**

> **Research 是探索能力，而不是固定阶段。**

> **Definition 是把流动认知稳定下来。**

> **Baseline 是当前经过人确认的项目定义。**

> **不确定可以存在，但不能被伪装成确定。**

> **Agent 可以推动思考，但不能偷走人的关键决策。**

> **项目允许变化，但变化必须显式。**

> **治理应随项目复杂度变化，而不是让项目适应流程。**

> **需求层定义问题空间，不预决技术解空间。**

> **概念模型不是数据模型。**

> **第一版追求可靠闭环，而不是完整治理体系。**
