/**
 * Main Agent — 最小 CLI 入口（Milestone 1 + Milestone 2 项目加载）。
 *
 * 用法：
 *   npm start                       # 交互式
 *   echo "Hello" | npm start        # 管道/一次性输入
 *
 * 退出：输入 /quit（或 Ctrl+C / 输入流结束）。
 * 可选环境变量：
 *   PROJECTFORGE_MODEL        覆盖模型名（默认使用当前环境的模型配置，不在此写死）。
 *   PROJECTFORGE_PROJECT_ROOT 显式指定项目根（默认沿 cwd 向上找 package.json）。
 */
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { MainAgent, AgentError } from "./agent.js";
import { loadProject, snapshotArtifacts } from "./project.js";
import { ArtifactKind } from "./artifacts.js";

const EXIT_COMMANDS = new Set(["/quit", "/exit", "exit", "quit"]);

async function main(): Promise<void> {
  const agent = new MainAgent({
    model: process.env.PROJECTFORGE_MODEL || undefined,
  });

  console.log("Requirement Layer — Main Agent（Runtime 验证阶段 + 项目加载）");
  console.log("输入 /quit 或 Ctrl+C 退出。\n");

  // 启动时加载项目（只读）：解析项目根、确保 artifacts 目录存在、打印工件可见性快照。
  // 本阶段不自动创建/修改任何工件文件。
  try {
    const project = await loadProject(process.cwd(), process.env);
    console.log(`项目根: ${project.root}`);
    console.log(`artifacts 目录: ${project.artifactsDir}`);
    const snap = await snapshotArtifacts(project.store);
    console.log(`工件状态:${snap[ArtifactKind.WorkingSummary] ? " working-summary(有)" : " working-summary(无)"}${snap[ArtifactKind.CurrentBaseline] ? " current-baseline(有)" : " current-baseline(无)"}${snap[ArtifactKind.Candidate] ? " candidate(有)" : " candidate(无)"}${snap[ArtifactKind.HistoryRevision] ? " history(有)" : " history(无)"}`);
    console.log();
  } catch (err) {
    console.error(
      `[启动警告] 项目加载失败：${err instanceof Error ? err.message : String(err)}（Agent 仍会启动）`,
    );
  }

  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY) });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    rl.close();
  };
  // 输入流 EOF（如管道）时 readline 会自行关闭，同步标记以便后续动作跳过
  rl.on("close", () => {
    closed = true;
  });
  const safePrompt = () => {
    if (!closed) rl.prompt();
  };
  rl.setPrompt("> ");
  safePrompt();

  rl.on("SIGINT", () => {
    console.log("\n退出。");
    close();
  });

  // 串行队列：同一时刻只处理一个 user turn，保证多轮上下文不被并发打断
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(task);
  };
  const handleLine = async (line: string): Promise<void> => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (EXIT_COMMANDS.has(trimmed.toLowerCase())) {
      console.log("退出。");
      close();
      return;
    }
    try {
      const { text } = await agent.turn(trimmed);
      console.log(`\nAgent: ${text}\n`);
      if (process.env.VERBOSE) {
        console.log(`[session: ${agent.getSessionId()}]`);
      }
    } catch (err) {
      if (err instanceof AgentError) {
        console.error(`\n[错误] ${err.message}`);
      } else {
        console.error(`\n[错误] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  rl.on("line", (line) => {
    enqueue(async () => {
      await handleLine(line);
      if (!closed) rl.prompt();
    });
  });

  await new Promise<void>((resolve) => rl.on("close", resolve));
  // 输入流结束后仍可能有排队的 turn 尚未完成：等待队列清空再退出，避免丢回复
  await queue;
}

main().catch((err: unknown) => {
  console.error(`[致命错误] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});