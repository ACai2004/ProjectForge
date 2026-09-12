# M3 Engineering Decision & Debugging Record

本文件是 M3（Requirement Layer）工程与调试记录。它不是时序日志，而是按「问题 → 根因 → 影响 → 调查 → 失败/不足的尝试 → 修复 → 为何此修复 → 验证 → 最终状态 → 面试要点」统一结构整理的真实问题。

文档中所有「确认」均来自实际测试与 probe 结果；未经验证的推断一律标注为「推测」。

---

## Problem 1 — 模型编造此前项目事实

### Symptom
在早期 Gate harness（hist-1 等）中，模型在没有任何工件的情况下，凭空回答「此前确认过……」「我们之前讨论过……」，甚至虚构出一套 "v2/v3/v4 修订史 / 已更新 v4" 的版本演进叙述，而项目目录中根本不存在任何工件可供支撑。

### Root Cause
**已确认**。共存两个直接诱因：
1. fixture 目录被放在 `os.tmpdir`（位于宿主 workspace 之外），SDK 权限墙（permission wall）阻止读取该目录下的工件 → 模型看到「工件确实存在」（目录里可见）却读不到内容，被迫补白 → 编造。
2. 更早版本 harness 直接调用 `query()` 裸 prompt，未经过 `MainAgent.turn()` 的 `/requirement-layer` 路由 → requirement-layer Skill 的「项目历史完整性」规则根本没有被加载。

两个诱因都属于 harness 层问题，不属于产品行为。正是这两个问题触发了后续对整个验收路径的彻底重审。

### Impact
破坏 Requirement Layer 最核心的接受准则：**零容忍 fabricated provenance**。用户明确：「Zero fabricated provenance occurrences are required... A later disclaimer such as 'that is non-authoritative' does NOT make the occurrence acceptable.」

### Investigation
- probe1（`gate/diag/iso-probe.mjs`）用 `CONFIG=default|project|projectempty|none` 探测：SDK workspace 权限与 `settingSources` 的关系；确认「缺 content」情境确实诱发补白。
- `gate/diag/rt-probe2.mjs` 决定性 probe：在 `cwd=fixture` 的子进程中显式读取 fixture 文件 → 得到 `READ_OK: PROBE_READABLE_99` → 证明可读性由权限（非提示词）决定。

### Insufficient / Failed Attempt
把「禁止编造」写进 SKILL 提示词。这能压制一部分编造，但治标不治本：**当模型读不到工件却知道工件存在时，它仍会补白**。作为独立修复还不够；必须解决「工件可读」这一前置条件。此外初始 harness 直接 `query()` 绕过了 MainAgent/Skill 路径，导致即便提示词更严，也无法成为真实路径的验收证据。

### Fix
1. 将 fixtures 全部移入宿主 workspace 内（`gate/fixtures/`），并通过 child-process `cwd=fixture` 让 SDK 授权根随 fixture 变化，使工件真正可读（见 Problem 6/7）。
2. 感知到「工件存在但与事实不符」的取径，一律改为显式 `Read` tool 调用读取工件原文，而不是由模型凭「印象」转述。
3. 保持 SKILL 中「项目历史完整性」规则（合法来源只有：当前对话中 Human 明确说/确认，或真实读取的 `${project root}/artifacts/` 文件）并维持「没有工件 ≠ 以前有过又丢了 / 没有工件 ≠ 我不记得」的措辞。

### Why This Fix
编造的根因是「有存在感、无内容」的输入状态，而非模型性格缺陷。修复必须从**输入状态**下手（让内容真实可读），并同时保证验收**走真实产品路径**（MainAgent.turn + Skill），两者缺一不可。

### Verification
- A1 ×3：无工件 fixture 下模型回复「我没有此前的项目记录」，零虚构修订史（`gate/transcripts/child-a1-run{1,2,3}.md`）。
- 真实运行时 provenance 套件 11/11 CLEAN；最终行为套件 provenance 组 a1/a2/a3 全部 PASS。

### Final Status
Resolved。

### Interview Takeaway
面对「模型编造历史」类问题，面试者应说明：先证明这是**测试环境层面的"只可感知不可读取"导致补白**（权限问题），而不是简单归因为「模型不可靠」；修复手段是把「工件可读」变成运行时前提，并把验收路径卡在真实产品运行路径上。这样既解决了现象，也让后续验收可信。

---

## Problem 2 — 模糊确认可能错误触发 Baseline 更新

### Symptom
早期版本中，用户给出「可以加这个吗」「能不能这样做」「听起来不错」「好的」这类**模糊/附和式**回复时，模型有时会把它当作「确认实际落地了某项变更」，从而自动更新 Baseline / 改写项目定义。

### Root Cause
**已确认**。确认语义最初按关键词（如「可以」）或句式启发触发，未区分「表达兴趣/附和」与「显式确认变更」。SKILL 缺少「什么构成显式确认」的精确刻画，Behavior Contract 的保守原则（confirmation is conservative）未映射到判定逻辑。

### Impact
破坏 Behavior Contract 的保守确认原则：模糊对话噪声不应改动项目定义；改动项目定义属于重大语义动作，必须由 Human 显式确认。这也是验收准则 B 组（confirmation）的直接目标。

### Investigation
- 最终行为套件运行 6 个确认 case（c1–c6）：4 个模糊（「可以加这个吗」「能不能这样做」「听起来不错」「好的」）+ 2 个显式（「我确认这一变更…」「让它成为新 Baseline」）。
- 重点实测：模糊输入是否被模型升级为 Baseline 变更。

### Insufficient / Failed Attempt
记忆中对「你是想让我确认吗」这类反问回复，在更早版本中曾被模型误当成「确认」。这表明：**单靠模型的语气判断不可靠**；一旦「确认」成为自由裁量，模糊输入与显式输入的边界就会被模型自行模糊掉。尝试在提示词里增加「不要自动确认」措辞，仍不能与「允许显式确认」形成稳定区分。

### Fix
在 SKILL 中明确「什么构成显式确认」：确认必须是 Human 对**具体变更内容**的明确表态（如「我确认把 X 作为项目定义的确认变更」「让 X 成为新 Baseline」）；纯情绪/附和/疑问（听起来不错、好的、可以加这个吗）**不算确认**。Behavior Reference 同步补充 counterexample（模糊确认 → Baseline 的负面样例）+ 自检项「explicit confirmation」。

### Why This Fix
因为 Boundary 的正确位置在语义层而非关键词层：`确认` 是一个**语义事件**，关键词与句式无法稳定刻画它；只有把「显式确认的最小充分形式」写入行为契约，模型才有一致的判断依据。这也是 Checklist 中「Human confirmation semantics should be semantic, not keyword-based」的直接来源。

### Verification
- 最终行为套件 c1–c6 全部 PASS：4 个模糊 case 均**不**自动升级 Baseline，2 个显式 case 才进入确认处理。
- 最终行为套件 17/17 PASS。

### Final Status
Resolved。

### Interview Takeaway
确认必须语义化。面试者可说明：我把「确认」定义为对具体变更内容的显式表态，并分别写出正面与反面样例写进行为契约；模糊附和一律不升级 Baseline。这体现的是"把重要语义动作的判定交给契约，而不是交给模型的语感"。

---

## Problem 3 — DeepSeek/OpenRouter 不自动调用 Skill

### Symptom
在 provider stack 为 DeepSeek-via-OpenRouter（`ANTHROPIC_BASE_URL=https://openrouter.ai/api`）的运行时，即使 prompt 明显属于项目意图，模型也**不会自动调用** requirement-layer Skill（裸 query harness 观察：skillCalls=0）。甚至在部分模型配置下，即使 prompt `self-invocation` 指令明确，tool 调用仍不发生。

### Root Cause
**已确认（行为层面）**。该 provider 栈上的模型不具备可靠的工具自主调用能力——至少对「自行选择并激活一个 Skill」这类高阶动作不稳定。这不属于我们代码的 bug，但会影响产品形态：若依赖模型自动调用 Skill，requirement-layer 将经常不激活。

### Impact
影响验收准则 C（activation）：requirement layer 必须在项目意图出现时稳定激活；若只能靠模型自行决定，激活成功率将不可控。

### Investigation
- `gate/debug-observe.mjs` / `m3c-toolprobe.mjs`：直接观察 `event.skills` 与 tool_use 流，确认 skillCalls=0。
- 对比：同一 prompt 下人工强制 `/requirement-layer` 前缀后，Skill 行为正常（激活/读取/作答全部走通）。
- 结论：**激活必须由 runtime 决定，不能由模型决定**。

### Insufficient / Failed Attempt
在 prompt 中写「如果这是项目相关的问题，请调用 requirement-layer skill」这类自调用指令。单独使用不可靠——模型不稳定的自动调用能力无法通过措辞修复；并且把入场判定交给模型自由裁量，会使验收结果不可复现。

### Fix
采用最小的 runtime fallback：`MainAgent.turn()` 内做 `isProjectOriented(prompt)` 分类器判断，若命中项目意图则 `effectivePrompt = "/requirement-layer " + prompt` 前缀 dispatch，由 runtime（而非模型）保证路由。同时保留模型自动调用能力作为叠加通道（若 provider 将来具备该能力，会自动发生；由于 `/requirement-layer` 前缀与自调用殊途同归，两者不冲突）。

### Why This Fix
工具调用的入场判定属于 **runtime 控制面**，不属于模型自由度。用一个分类器 + 固定前缀即可在不改造 Agent 架构的前提下保证激活确定性；比"在提示词里求模型"可靠，也比"重写整个 Agent 循环以注入 skill 调度"侵入性小得多。这是「provider 特性差异用最小 runtime 适配吸收」的实例。

### Verification
- M1 回归：p1 项目意图 → turn1 激活 requirement-layer（`classify(p1)=true`），turn2 session 连续性正常；纯调试问题 p3 → `classify(p3)=false` 不走 skill。
- 最终行为套件 activation+ 组 p1–p4 全部 PASS，activation− 组 n1–n4 全部 PASS（4 正 4 负）。
- 最终真实运行时套件 A1/A2/A3 全部经 `/requirement-layer` 路由。

### Final Status
Resolved（作为固定设计：runtime 前缀 + 分类器）。

### Interview Takeaway
可这样表达：「模型不自动调用工具的 provider 差异，我用一个最小的 runtime 适配吸收——意图分类 + 固定前缀路由，而不是把工具调用交给模型自由裁量或重写整个架构。」这展示的是：对供应商差异做最小侵入适配，而不是为单一供应商重写全局设计。

---

## Problem 4 — SDK 子会话继承宿主 MEMORY.md 上下文

### Symptom
SDK child session（`query({options:{resume, settingSources}})`）会**继承宿主项目 auto-memory**：宿主 `MEMORY.md` 的 index + 单行摘要被注入到 SYSTEM 上下文。模型在部分 qualified 场景下会输出「我记忆索引里有……」「我记得之前……」。这正是早期 transcript 中 "memory index" 措辞的来源——不是纯模型空想，而是「被注入的上下文被误用作项目历史」。

### Root Cause
**已确认**。SDK 子会话无条件继承父项目 auto-memory，且 `settingSources` 无法清除它：
- `settingSources: ["project"]`：MEMORY 仍被注入；
- `settingSources: []`：MEMORY 仍被注入，但 **project Skills（含 requirement-layer）也随之消失**。
没有 runtime 配置能在保留 Skill 的同时清除 host MEMORY 注入。

### Impact
这是「host/environment 层限制」。若模型把被注入的 MEMORY 内容当作项目历史回答，就构成 provenance 泄漏；但**它不属于 Requirement Layer 的产品逻辑 bug**。

### Investigation
- 3 种 `settingSources` 配置全部实测（`gate/diag/iso-probe.mjs` 的 `CONFIG=default|project|projectempty|none`）→ 结论如上。
- 用「Baseline 已确认：帮课题组…」（与宿主真实 MEMORY.md 完全一致的文本）构造 fixture 与 prompt，观察模型是否披露注入的 MEMORY。

### Insufficient / Failed Attempt
试图从 runtime 层**隔离** MEMORY 注入（尝试切换 settingSources、换 workspace 根）——全部失败且不可行。这也反向证明：之前若把「泄露是因为 SDK 继承了 MEMORY」当作产品 bug 去修，方向就错了；必须改走「不披露」路线。

### Fix
不尝试从 runtime 清除注入（不可行），改为在 Behavior Contract 层面定死两条规则：
1. **忽略一切被注入的 MEMORY，不将其作为项目历史，也不提及它**；
2. Requirement Layer 唯一的项目历史来源是真实读取到的 `artifacts/` 工件。
SKILL「项目历史完整性」章节与 Behavior Reference 自检项（memory-as-source ban、no invented intermediate source）承载这两条规则。

### Why This Fix
在「无法隔离」与「保持 Skill 可用」不可兼得时，取「**隔离做不到，就用可验证的行为约束代替**」：不指望模型分不清，而是给它一条明确、可被人工核验的规则。验收也相应改为「检测模型是否披露/采信注入内容」，而不是「清除注入」。

### Verification
- 最终真实运行时套件 11/11 CLEAN：模型既不采信 MEMORY 内容，也不提及 MEMORY。
- A2 三条均只以 `current-baseline.md` 为来源；A3 五条均只以 Baseline+Candidate 为来源，无一条引用注入内容。
- 回归：记忆相关 regex 扫描零命中（辅助），全部 11 条 transcript 人工逐条核验。

### Final Status
Resolved（以「不披露」为验收线）+ 保持记录为已知环境限制。

### Interview Takeaway
这个问题最能展示"区分产品 bug 与宿主环境限制"。面试者可说：「SDK 子会话继承了宿主 MEMORY，且没有运行时可配置隔离；我验证了所有 settingSources 组合后，放弃了不可行的隔离路线，改为在行为契约中定义——注入的 MEMORY 既不能被当作项目历史，也不能被提及——并用真实运行时套件证明模型的『不披露』行为。」不要把它描述成产品缺陷。

---

## Problem 5 — 首个 A1/A2/A3 harness 绕过 MainAgent.turn()，未验证 Skill 行为

### Symptom
早期 A1/A2/A3 suite（`gate/m3c-provenance-*.mjs`、`m3c-a3-strict.mjs`）直接调用 `query({prompt, options})` 裸 prompt——虽然观察到了部分泄漏/披露，但**这些运行根本没有经过 `MainAgent.turn()`**，也就没有 `/requirement-layer` 路由，requirement-layer Skill 从未被真正加载。

### Root Cause
**已确认（harness 设计缺陷）**。验收要证明的是「真实产品路径：MainAgent → Skill → 工件 → 回答」；而裸 query 只证明了「模型 + 默认系统提示」的行为，两者不是一回事。早期 suite 的 CLEAN/FAIL 都**不是**对产品的验收证据。

### Impact
直接影响验收有效性：Gap-A 准则要求每个 A1/A2/A3 case 必须 import `MainAgent`、`new MainAgent()`、走 `agent.turn()`；违反它，任何「CLEAN」与「LEAK」的计数都无法上升到产品层面。

### Investigation
- 对比裸 query 的结果（skillCalls=0 / 泄漏）与真实 MainAgent 路径的结果（激活+读取+作答）。
- `rt-probe2` 证实权限问题与裸 query/真实路径无关，属于 workspace 授权根问题（Problem 6）。

### Insufficient / Failed Attempt
在裸 query harness 上反复增/改 prompt 措辞（「请读取工件」「不要编造」）来解决泄漏——“在错误的路径上优化提示词”。这解决不了两件事：(a) 无法证明真实产品路径的行为；(b) 无法区分「模型问题」与「Skill 规则未被加载」。

### Fix
弃用裸 query 作为验收路径；重新设计 harness：parent driver spawn 独立 child 子进程，child 通过绝对路径 `import` `src/agent.ts`，`new MainAgent().turn(prompt)`。全部 A1/A2/A3 case 改为走真实 MainAgent + `/requirement-layer` 路由。裸 query 时代的证据归档为「历史实验」，不再计入验收。

### Why This Fix
验收必须与产品运行同构，否则通不过自身有效性质询。让每个 case 以产品入口（MainAgent.turn）为必经点，既能验证 Skill 行为，也让后续一切计数具有产品意义。

### Verification
- 最终真实运行时 provenance 套件 11/11 CLEAN（全部经 MainAgent.turn）。
- A1 3/3、A2 3/3、A3 5/5，transcript 均带 `fixture=` 与运行路径记录。
- 每个 case 都有独立 child 进程，可逐条人工核验。

### Final Status
Resolved（harness 重设计并冻结为验收形态）。

### Interview Takeaway
「我们最初用裸 query 跑验收，虽然数值好看，但它没经过产品入口，不算数。」这句话在面试里很有分量——它说明你理解验收有效性与产品路径同构的关系，而不是只会读测试输出。面试者可补充：错误也很有价值，它暴露了『我很可能在错误路径上优化了很久』。

---

## Problem 6 — process.chdir(fixture) 不改变 SDK 授权根，工件读取被权限墙拦截

### Symptom
第一次实现「真实 runtime」时，harness 采用 in-process `process.chdir(fixture)` 后调用 `MainAgent().turn(...)`。结果 11 次运行 8/11 走到 **honest-refusal** 分支：模型「看到有工件在读不到内容」（如 `current-baseline.md`），回答「有工件但读不到内容」——不是产品行为 PASS，而是被权限墙挡住。

### Root Cause
**已确认**。SDK 对 child 子进程的**允许 workspace 根（authorization root）在进程启动时固化**，`process.chdir()` 不改变它。`cwd`（进程工作目录）与「SDK 授权根」不是一回事：chdir 改了前者，后者没变，夹具仍在授权根之外 → 读 cast、诚实拒绝。

### Impact
验收准则「真实 MainAgent 进程的 cwd 必须就是 fixture」表面满足，但**实质目标（真实读取工件）未实现**。若按「诚实拒绝也算 PASS」记账，会把「未发生读取」标记为「读取成功」——直接违反用户明确指示：「不要把 honest-refusal 记成 PASS」。

### Investigation
- 该轮结束 11/11「看起来 CLEAN」但其中 8 条是 honest-refusal；逐条人工核验暴露此问题。
- `rt-probe2` 决定性 probe 对比两种 spawn 形态，确认授权根随 **child 启动时 `cwd`** 变化，随 `chdir` 不变。

### Insufficient / Failed Attempt
in-process `process.chdir()` + 绝对路径 import 的「单进程 ISO 模拟」。它试图在保持单进程的前提下偷喝权限边界，结果：授权根没变、fixture 不可读、真实路径没走通。**这次失败恰是指向正确手段的杠杆——它排除了「调整 prompt 可绕开权限墙」的路线**，证明必须用进程级隔离。

### Fix
改用 **child-process spawn 隔离**：parent driver 对每个 case 用 `spawn(node, [tsx, worker, <absMainAgent>, <fixture>, case], { cwd: fixture })` 启动独立 Node 进程，worker 内置绝对路径 import 并 `new MainAgent().turn()`。授权根随启动 `cwd` 切换 → fixture 工件真实可读。

### Why This Fix
这是唯一一行代码级可用、且不改 src/SKILL/doc 的机制：进程启动参数是 SDK 授权根的唯一可靠入口（probe2 实证）。比「in-process chdir」（不可行）与「裸 query 绕过 MainAgent」（无效）都正确。

### Verification
- `rt-probe2`：`READ_OK: PROBE_READABLE_99`。
- 最终套件中 A2 3/3 全部「已读取 current-baseline.md 并引用原文」，A3 5/5 全部「已读取 Baseline+Candidate」——无一为 honest-refusal，真实读取路径全部走通。

### Final Status
Resolved。

### Interview Takeaway
「cwd 与 SDK 授权根不是一回事——后者在进程启动时固化，process.chdir 改不了它，只有以 fixture 作为子进程启动 cwd 才能让授权根跟随。」这是可以在面试中直接使用的精确语句，同时强调：被迫撤掉一个看似优雅的单进程方案不是浪费，它证明了权限边界只能由进程级隔离跨越。

---

## Problem 7 — 子进程 fixture 隔离建立真正可读的 runtime，并完整走通预期 A1/A2/A3 路径

### Symptom
在所有先前修复之上，最终 harness 建立了**真正可读的 fixture-level runtime**，且 11 次运行全部完整走通「MainAgent.turn → /requirement-layer → 真实 Read 工件 → 基于工件作答」路径。

### Root Cause
这是修复的**最终形态**（非新问题），根因=前 6 个问题全部收敛：
- 夹具可读（Problem 1 的权限定位 + Problem 6 的进程级隔离）；
- 走真实入口（Problem 5 的 harness 重设计）；
- 保守确认（Problem 2）+ 确定性激活（Problem 3）+ 不披露注入（Problem 4）。

### Impact
满足验收的全部核心准则：fixture-level readable runtime 成立、A2 能引用真实 Baseline 内容、A3 能区分 Baseline/Candidate 权威性、零 provenance 泄漏。

### Investigation
- 完整套件（`gate/diag/rt-driver.mjs`）逐 case 构建独立 fixture、spawn 子进程、写 transcript、输出 FINAL SUMMARY。
- 11 条 transcript 逐条人工核验（不只是 regex）：A1 无工件→诚实「没有记录」；A2 引原文、不补全；A3 严格区分权威性、无泄漏。

### Insufficient / Failed Attempt
（N/A 语义上无失败尝试——前 6 个问题的失败已在此处终结；此处只保留结论。）

### Fix
冻结当前 harness 形态作为 M3 验收形态：`rt-driver.mjs`（parent）+ `rt-worker2.mjs`（child）+ `gate/fixtures/child-*` + `gate/transcripts/child-*`。所有计数（11/11、3/3、5/5）均以它为唯一来源。

### Why This Fix
它是所有前面约束（不改 src、不改 Skill、每 case 独立 fixture、真实进程 cwd=fixture、真实 Read tool）的交集解，并且可用 probe 独立复证（`rt-probe2`），不是「在某一次运行里碰巧读到了」。

### Verification
- FINAL SUMMARY：`{"CLEAN":11}`，DETAIL 11 项全部 CLEAN，exit 0。
- A1 3/3、A2 3/3、A3 5/5；A2 逐字引用真实 Baseline 原文；A3 五条均区分 Baseline（权威）与 Candidate（未确认草稿）且结论「尚未决定改成个人知识管理工具」。
- 回归全绿：npm run check 通过、npm test 11/11、M1 回归通过、M2 e2e 通过、最终行为套件 17/17 PASS。

### Final Status
Resolved —— M3 ACCEPTED。

### Interview Takeaway
最终第 7 个问题的事实是：**验收必须证明「这条链路真的通了」，而不是「看起来绿了」**。面试者可总结：从「编造—> 确认语义 —> 激活 —> MEMORY 注入 —> harness 错配 —> 权限错配」一步步收敛，得到「真实可读的运行时 + 逐条人工核验」的验收形态；这是把一个会被质疑的"看起来通过"变成"可复现、可核验、过审"的完整闭环。

---

## M3 Timeline

**M3-B — 初始 Skill 实现**：实现 requirement-layer skill（项目历史完整性、Baseline/Candidate 权威、保守确认）与 Behavior Reference，行为契约冻结。

**幻觉历史被发现**：在早期 harness 下模型凭空回答「此前确认过……」，甚至虚构 "v2/v3/v4 修订史"，触发对 provenance 零容忍准则的全面重审。

**确认语义加固**：把「什么构成显式确认」精确定义为对具体变更内容的明确表态，模糊附和（可以加吗/听起来不错/好的）一律不升级 Baseline，并写入 Behavior Reference 自检项与 counterexample。

**runtime Skill 激活 fallback**：确认 DeepSeek/OpenRouter 不自动调用 Skill（skillCalls=0）后，加入 `isProjectOriented()` 分类器 + `/requirement-layer` 前缀 dispatch，由 runtime 保证激活确定性。

**provenance 加固**：SKILL「项目历史完整性」章节定死合法来源（会话内显式确认 / 真实读取工件），明确禁止编造中间来源（记忆库/记忆索引/先前笔记/先前会话回忆），即使补「非权威」也不允许。

**宿主 MEMORY 注入诊断**：3 种 settingSources 实测均无法在保留 Skills 的同时清除宿主 MEMORY.md 注入 → 放弃「隔离」路线，改走「不采信、不披露」行为约束 + 真实运行时检测。

**harness 错配发现**：裸 query 时代的 A1/A2/A3 套件绕过 MainAgent.turn()，Skill 从未被加载 → 弃用，改为真实入口验收。

**fixture 权限错配发现**：in-process process.chdir(fixture) 不改变 SDK 授权根 → 8/11 honest-refusal，被识破并弃用（诚实拒绝不得计为 PASS）。

**子进程 fixture 隔离**：parent spawn child，`cwd=fixture` 启动独立 Node 进程、绝对路径 import MainAgent、真实 Read 工件；probe2 实证可读（READ_OK: PROBE_READABLE_99）。

**最终真实运行时验证**：11/11 CLEAN（A1 3/3、A2 3/3、A3 5/5），11 条 transcript 逐条人工核验；回归全绿（check/test/M1/M2/behavior 17/17）。

**M3 ACCEPTED**。

---

## Engineering Lessons

1. **项目 provenance 必须与泛用 agent 记忆分离**——宿主 auto-memory 会被 SDK 继承进子会话，且运行时无法可靠清除；Requirement Layer 只能把「真实读取的工件」当项目来源，把注入记忆当作必须忽略、且不得披露的东西。Probe 证明它可能产生泄漏候选，行为契约证明它可以被压制。

2. **行为契约必须通过真实生产 runtime 路径验收**——裸 query 绕过 MainAgent 的套件无论数值多漂亮，都不是产品行为证据；验收路径与运行路径不同构，测试等于测了别的系统。

3. **一个通过的负用例不代表正路径被真正执行过**——"honest-refusal" 看起来像安全通过（无泄漏、无编造），但那只是权限墙下的礼貌拒绝；真正的 A2/A3 验收要求「确实读到工件并基于内容作答」。

4. **cwd 与 SDK 授权根不一定等价**——`process.chdir()` 改得了前者，改不了后者；授权根随子进程的启动 cwd 固化。这一条是用 probe 反复实证后写下的，不是推测。

5. **provider 差异的工具行为用最小 runtime 适配吸收，而不是污染整个架构**——模型不自动调用 Skill，只引入一个分类器 + 固定前缀路由，不改 Agent 循环设计；比「让模型自决定」可靠，比「为供应商重写架构」侵入小。

6. **Human 确认语义应语义化，而不是关键词化**——「可以」「好的」是附和，不是确认；确认必须具备「针对具体变更内容的明确表态」。这条从 c1–c6 六个 case 的差异中被测试出来，并固化进契约。

7. **验收指标要绑定「真实可读的运行时」这一前提**——给出 11/11、17/17 之前，先回答「这些运行里模型是否真的读到了工件」。没有这个前提，任何计数都只是提示词工程的结果，而不是产品行为的结果。

8. **失败的实验要留档、并标注其历史形态，而不是删除或混淆进验收证据**——旧的裸 query 泄漏（A3-r3-strict 等）是真实的工程记录（暴露了 harness 错配），但它不是在最终验收形态下发生的，必须与最终验收证据明确区分，防止「老 bug 被当作当前产品 bug」。