/**
 * M5-B Commit capability — MCP server 注入（遵循 M4-B 的 Options 注入模式，M5-A §16.3）。
 *
 * 一个受控 commit 动作 + 一个 journal-aware 权威读：
 *   - `commit_baseline(content)`：仅在 Human 显式确认后调用；执行 journal 两阶段事务
 *     （history 归档 + current 替换，§11.1）。**不放宽为通用 write_baseline** —— 它是
 *     「确认动作」的实现，不是任意写入口；失败时按 §11.2/§11.3 回滚或对账恢复，绝不在
 *     恢复完成前呈现为已确认。
 *   - `read_baseline()`：当前 authoritative Baseline 的 journal-aware 读取
 *     （recovery-before-read 不变量），返回 current 内容 + 对账报告 + history 列表。
 *
 * 确认语义本身（三要素判定）在 Skill/对话行为层（M5-A §2/§16.1），不在本工具内实现；
 * 本工具只执行「确认动作」，不判断「是否构成确认」。
 */
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { BaselineCommitStore, CommitError } from "./commit-store.js";

export interface CommitMcpServer {
  /** 生成的 MCP server 配置，供 Options.mcpServers 使用。 */
  config: Options["mcpServers"];
  /** commit_baseline 工具全名（allowlist 用，MCP 前缀格式）。 */
  toolName: string;
  /** read_baseline 工具全名（allowlist 用）。 */
  readToolName: string;
}

export function createCommitMcpServer(store: BaselineCommitStore): CommitMcpServer {
  const server = createSdkMcpServer({
    name: "m5-commit",
    alwaysLoad: true,
    tools: [
      {
        name: "commit_baseline",
        description:
          "受控的 Baseline commit（journal 两阶段事务：history 归档 + current 替换）。" +
          "仅在 Human 显式确认「当前 Candidate（或显式指明的子集，或已落盘为 candidate.md 的修改后 v2）" +
          "成为新的 Baseline」后调用一次；commit 是 Human 驱动的单一动作，不是自动过程。" +
          "失败时返回错误、不产生部分成功；系统会在下次读取/重试前自动对账（forward-complete 或 rollback）。",
        inputSchema: {
          content: z
            .string()
            .describe(
              "被 Human 显式确认的完整定义原文（默认整份当前 Candidate，或显式指明的子集，或已落盘为 candidate.md 实际内容的修改后 v2）。",
            ),
          reason: z
            .string()
            .optional()
            .describe("确认依据摘要（写入 journal 元信息，供追溯）。"),
        },
        handler: async (args) => {
          const a = args as { content?: string; reason?: string };
          const content = String(a.content ?? "").trim();
          if (!content) {
            return {
              content: [{ type: "text", text: "commit_baseline 需要 content（被 Human 显式确认的定义内容）。" }],
            };
          }
          try {
            const r = await store.commit(content, { reason: a.reason });
            return {
              content: [
                {
                  type: "text",
                  text: `Baseline 已提交（seq=${r.seq}，history 归档=${r.historyFile}，之前已有 Baseline=${r.previousExisted}）。`,
                },
              ],
            };
          } catch (err) {
            const msg = err instanceof CommitError ? err.message : String(err);
            return {
              content: [
                {
                  type: "text",
                  text: `commit 未完成：${msg}。这是可恢复的失败——系统会在下次读取/重试前自动对账（forward-complete 或 rollback），不会把未完成事务当作已确认修订。`,
                },
              ],
            };
          }
        },
      },
      {
        name: "read_baseline",
        description:
          "读取当前 authoritative Baseline（recovery-before-read：先对账 .m5-commit/journal/ 中所有 pending 事务，再返回 current-baseline.md 内容）。" +
          "返回：是否存在、内容、对账报告、history 列表。任何需要把 current-baseline 当作当前有效定义的场景都应使用它（不要用原生 Read 直接读 current-baseline.md）。",
        inputSchema: {},
        handler: async () => {
          const { content, recovered } = await store.readCurrentBaseline();
          const history = await store.listHistory();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    exists: content !== null,
                    content,
                    recovered: {
                      forwardCompleted: recovered.forwardCompleted,
                      rolledBack: recovered.rolledBack,
                    },
                    history,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      },
    ],
  });
  return {
    config: { "m5-commit": server },
    toolName: "mcp__m5-commit__commit_baseline",
    readToolName: "mcp__m5-commit__read_baseline",
  };
}
