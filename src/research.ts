/**
 * Research Tool — Milestone 4-B。
 *
 * 契约（M4 Design v0.1 §2.1，冻结）：
 *   research(question) -> Finding[]
 *
 * 只接受**一个问题**；返回外部证据 findings，不做认知判断、不解释与项目的关系。
 * 读取面优先（读入 Human 提供的材料）；检索面 Deferred（无网络后端）。
 *
 * 材料注入边界（用户批准的第 2 项修正）：
 *   - Human 提供的材料在**工具参数面之外**经 closure/context 绑定 —— 工具签名保持
 *     research(question) 单参数，不增加 materials 参数。
 *   - 注入材料列为 ArtifactKind/路径黑名单之外的内容；artifacts/（Baseline / Working
 *     Summary / Candidate / history）与 host MEMORY **结构性不可能**进入本工具 ——
 *     materials 由调用方显式给定，工具自身无任何文件/目录访问能力。
 *
 * 可靠性纪律（§2.1 failure behavior）：
 *   - 无材料可查 -> 返回空 Finding[]，绝不编造；
 *   - certainty 由材料内容标注（conclusive/inconclusive/insufficient-evidence/speculative）；
 *   - relationship 由 Main Agent 标注，本工具不判定。
 */
import { z } from "zod";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

/** 来源表示（最小）：来源标识 + 类型 + 可验证性说明。 */
export interface ResearchSource {
  id: string;
  type: "URL" | "文档" | "材料";
  verifiability: string;
}

export type ResearchCertainty = "conclusive" | "inconclusive" | "insufficient-evidence" | "speculative";

export interface Finding {
  claim: string;
  source: ResearchSource;
  certainty: ResearchCertainty;
  limitation: string;
}

/** Human 提供的一份可研究材料（对话/文件已读入的文本或描述）。 */
export interface ResearchMaterial {
  id: string;
  /** 材料类型：文档/材料/URL。 */
  type: "URL" | "文档" | "材料";
  /** 材料文本内容（URL 未拉取时为描述，见 §空 URL 行为）。 */
  content: string;
  /** 可验证性说明（来源可追溯性）。 */
  verifiability: string;
}

/**
 * Research Tool 构造选项。
 * materials：Human 提供、经调用方注入的研究材料集合（读取面默认优先）。
 * 本工具不读文件、不访问网络；无法提供实例化之外的任何检索能力。
 */
export interface ResearchToolOptions {
  materials?: ResearchMaterial[];
}

/**
 * 供 R1–R12 验收等调用方注入时使用的 MCP server factory。
 * 单一 research 工具，handler 经 closure 闭包绑定 materials（不进入工具参数面）。
 */
export interface ResearchMcpServer {
  /** 生成的 MCP server 配置，供 Options.mcpServers 使用。 */
  config: Options["mcpServers"];
  /** research 工具全名（allowlist 用，MCP 前缀格式）。 */
  toolName: string;
}

/**
 * 相关性判定的最小公共子串长度。
 * 取 2 而非 3：「标准」「无障碍」这类 2 字词在中文里就是实词，取 3 会让「该遵循什么标准」
 * 这类正常问句漏配。材料面是调用方注入的小集合，2 字重叠带来的过匹配在 MVP 读取面可接受。
 */
const MIN_SHARED_SUBLEN = 2;

/**
 * 是否存在长度 >= minLen 的公共子串。用于**无空白语言（中文）**的相关性判定。
 * 原实现只按 /\s+/ 分词：中文问句没有空格 → 唯一 token 是整句 → `body.includes(整句)` 恒为 false
 * → research 对中文问题一律返回空 findings，进而使「已接受的研究结论写入 Working Summary」
 * 在中文场景下无法成立。改为按子串重叠判定后，中文问句也能与材料正文比对相关性。
 */
function hasSharedSubstring(a: string, b: string, minLen: number): boolean {
  if (a.length < minLen || b.length < minLen) return false;
  for (let i = 0; i + minLen <= a.length; i++) {
    if (b.includes(a.slice(i, i + minLen))) return true;
  }
  return false;
}

/**
 * 读取面提取：在注入材料中查找与问题相关的要点。zero project-decision logic ——
 * 只按文本相关性返回材料原文片段，不做「它意味着什么」的判断。
 */
function extractFindingsFromMaterials(question: string, materials: ResearchMaterial[]): Finding[] {
  const q = question.toLowerCase();
  const keywords = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length >= 2);
  const cleanQ = q.replace(/[^\p{L}\p{N}]+/gu, "");
  const findings: Finding[] = [];
  for (const m of materials) {
    if (!m.content || m.content.trim().length === 0) continue;
    const body = m.content.toLowerCase();
    // 相关性（MVP 简单的读取面启发，不做语义检索）：
    //   ① 空白分词后的任一关键词命中材料（英文问句）；或
    //   ② 问句与材料正文存在 >= MIN_SHARED_SUBLEN 的公共子串（无空白的中文问句）。
    const relevant =
      keywords.length === 0 ||
      keywords.some((k) => body.includes(k)) ||
      hasSharedSubstring(cleanQ, body, MIN_SHARED_SUBLEN);
    if (!relevant) continue;
    findings.push({
      claim: m.content.trim(),
      source: { id: m.id, type: m.type, verifiability: m.verifiability },
      certainty: "insufficient-evidence",
      limitation: "读取面材料；未经外部交叉验证（检索面 Deferred）。",
    });
  }
  return findings;
}

export function createResearchMcpServer(opts: ResearchToolOptions = {}): ResearchMcpServer {
  const materials: ResearchMaterial[] = opts.materials ?? [];
  const server = createSdkMcpServer({
    name: "m4-research",
    alwaysLoad: true,
    tools: [
      {
        name: "research",
        description:
          "对给定研究问题返回外部证据 findings（含 claim/source/certainty/limitation）。" +
          "只接受一个问题；无法给出结论时返回空 findings 并说明理由，绝不编造。",
        inputSchema: { question: z.string() },
        handler: async (args) => {
          const a = args as { question?: string };
          const question = String(a.question ?? "").trim();
          // 无材料可查 -> honest empty + reason（§2.1）。
          if (!question) {
            return {
              content: [{ type: "text", text: JSON.stringify({ findings: [], reason: "研究问题为空。" }) }],
            };
          }
          if (materials.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    findings: [],
                    reason: "当前无可用研究材料（读取面无材料注入）。",
                  }),
                },
              ],
            };
          }
          // 读取面：在 Human 注入的材料集合内查找与问题相关的要点，给出 findings。
          // 绝不编造；材料中找不到相关内容时返回空。
          const findings = extractFindingsFromMaterials(question, materials);
          return { content: [{ type: "text", text: JSON.stringify({ question, findings }) }] };
        },
      },
    ],
  });
  return { config: { "m4-research": server }, toolName: "mcp__m4-research__research" };
}

/**
 * 面向调用的 Research Tool 句柄（供 MainAgent 集成 / 验收 harness 使用）。
 * research(question) -> Finding[] 严格契约。
 */
export class ResearchTool {
  constructor(private readonly opts: ResearchToolOptions = {}) {}

  async research(question: string): Promise<Finding[]> {
    const q = String(question ?? "").trim();
    if (!q) return [];
    if (!this.opts.materials || this.opts.materials.length === 0) {
      // honest empty：契约允许空 findings；具体原因由调用方决定是否转达。
      return [];
    }
    return extractFindingsFromMaterials(q, this.opts.materials);
  }
}