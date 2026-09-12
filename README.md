# ProjectForge

面向「从模糊项目意图到稳定项目定义」的 Agent 系统，基于 **Claude Agent SDK**。

它帮助人把一个还说不清楚的项目想法，通过对话式探索、研究、澄清与归纳，逐步收敛成一份**诚实、显式、可由人确认**的项目定义 —— 而不是急着生成一份看起来很完整的 PRD。

## 当前实现

当前产品是 **TypeScript / Node.js** 实现，位于 [`src/`](src/)：

| 文件 | 职责 |
|---|---|
| [`src/agent.ts`](src/agent.ts) | Main Agent runtime：调用 Claude Agent SDK、维护多轮会话、注入能力工具 |
| [`src/main.ts`](src/main.ts) | CLI 入口（交互式 / 管道） |
| [`src/project.ts`](src/project.ts) | 项目根解析与启动加载 |
| [`src/artifacts.ts`](src/artifacts.ts) | ArtifactStore：四类工件的文件系统持久化 |
| [`src/research.ts`](src/research.ts) | Research Tool：`research(question) -> Finding[]`（读取面） |
| [`src/review.ts`](src/review.ts) | 独立只读 Review capability（fresh 会话、无工具、findings-only） |
| [`src/artifact-capabilities.ts`](src/artifact-capabilities.ts) | 窄化工件写能力（仅 Working Summary / Candidate） |
| [`src/commit-store.ts`](src/commit-store.ts) | Baseline commit：journal 两阶段事务 + recovery-before-read |
| [`src/commit.ts`](src/commit.ts) | 受控 commit 工具（`commit_baseline` / `read_baseline`） |

Requirement Layer 的行为规范以 Skill 形式提供：[`.claude/skills/requirement-layer/`](.claude/skills/requirement-layer/)。

## 里程碑状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M1 | Main Agent Runtime | 完成（最初为 Python 原型，已由 TypeScript 实现取代，不再保留于本仓库） |
| M2 | Artifact Persistence / Project Loading | 完成 |
| M3 | Requirement Layer Skill + 激活 + provenance 完整性 | 已验收 |
| M4 | Research + Working Summary + Candidate + 独立 Review | 已验收 |
| M5 | Human 确认 → Baseline commit → Revision / History | 已验收 |

M5-A（设计）与 M5-B（实现 + 验收）均已冻结/验收；验收证据记录于 [`notes/`](notes/)。

## 核心原则

- **Human 拥有最终权威** —— 方向、范围、重大取舍、成功条件与「是否成为 Baseline」都由人决定。
- **不提前收敛** —— 未知（Unknown / 未决 / 有意推迟）是合法状态，不为「完整」而编造。
- **来源不混同** —— 已确认 / 暂定 / 推断 / 研究发现 / 未决必须保持区分。
- **Baseline 只能由 Human 显式确认产生** —— 模糊附和、沉默、Review 通过都不会自动升级为 Baseline。
- **Review 无批准权** —— 只输出 findings，不作 Pass/Fail 判定。

## 运行环境

- Node.js（本项目在 Node 20+ 验证）
- Claude Agent SDK（TypeScript）：`@anthropic-ai/claude-agent-sdk`

## 如何运行

```bash
# 1. 安装依赖
npm install

# 2. 配置 provider（复制模板并填入你自己的值）
cp .env.example .env

# 3. 启动交互式对话
npm start          # 或：echo "你好" | npm start
```

退出：输入 `/quit`，或 `Ctrl+C` / 输入流结束。

## 质量检查

```bash
npm run check      # TypeScript 类型检查
npm test           # 单元测试
```

## 目录结构

```
projectforge/
├── src/                          # 当前产品实现（TypeScript）
├── test/                         # 单元测试
├── .claude/
│   └── skills/requirement-layer/ # Requirement Layer Skill
├── doc/                          # 冻结的上游设计文档
├── notes/                        # 里程碑 closeout 与工程记录
├── gate/                         # 验收 harness（可复用；运行产物不入库）
├── artifacts/                    # 运行时工件目录（内容不入库）
├── .env.example                  # provider 配置模板（仅占位符）
├── package.json
└── tsconfig.json
```

## 设计文档

`doc/` 存放已冻结的上游设计文档，按层次由概念到实现：

- Requirement Layer Blueprint v0.1 —— 概念架构
- Requirement Layer Workflow v0.2 —— 工作流
- Requirement Layer Implementation Design v0.2 —— 实现设计
- Requirement Layer MVP Implementation Specification v0.1 —— MVP 规格
- Requirement Layer Skill Behavior Contract v0.1 —— Skill 行为契约
- Requirement Layer M4 Design v0.1 / M5 Design v0.1 —— 里程碑设计

> `doc/` 是上游冻结文档，**不修改、不移动、不重构**。

## 工件与权威层级

```
Human > Baseline（current-baseline.md）> Working Summary > Candidate > History（追溯）
```

`artifacts/` 下的 Baseline / Working Summary / Candidate / History 属于**用户运行数据**，不进入本仓库；仓库只保留该目录本身。

## 验收

`gate/` 下是可复用的验收 harness（child-process fixture → 真实 `MainAgent.turn()` → transcript → 逐条核验）。运行产物（transcripts / diagnostics / fixtures）为本地证据，不进入本仓库。
