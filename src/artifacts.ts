/**
 * ArtifactStore — Milestone 2。
 *
 * 最小、基于文件系统的持久化层。只负责「怎么读写四类工件」，不负责工件生命周期
 * （不做 Candidate→Review→确认→Baseline 等流程；那些属于后续 Milestone）。
 *
 * 四类 artifact 类别：
 *   - WorkingSummary   （非权威，跨会话恢复入口 / Review 对照基准）
 *   - CurrentBaseline  （权威，仅人确认后生成 —— 本阶段不创建）
 *   - Candidate        （非权威，候选定义草稿 —— 本阶段不创建）
 *   - HistoryRevision  （权威记录，只追加 —— 本阶段不创建）
 *
 * 本 Milestone 只要求持久化层能「地址化区分」这些类别并支持 read/write/exists。
 * 明确禁止：数据库、RAG、事件存储、artifact graph、复杂框架；也不自动生成任何工件。
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** 工件类别 —— 持久化层的可寻址键。 */
export enum ArtifactKind {
  WorkingSummary = "working-summary",
  CurrentBaseline = "current-baseline",
  Candidate = "candidate",
  HistoryRevision = "history",
}

/** 面向调用方的、已脱敏的可读错误。 */
export class ArtifactError extends Error {}

function notFound(path: string): ArtifactError {
  return new ArtifactError(`工件文件不存在：${path}`);
}

function sanitizePathMsg(input: unknown): string {
  return input instanceof Error ? input.message : String(input);
}

/** 目录型 vs 单文件型工件的相对路径。 */
function relativePathFor(kind: ArtifactKind): string {
  switch (kind) {
    case ArtifactKind.WorkingSummary:
      return "working-summary.md";
    case ArtifactKind.CurrentBaseline:
      return "current-baseline.md";
    case ArtifactKind.Candidate:
      return "candidate.md";
    case ArtifactKind.HistoryRevision:
      return "history";
  }
}

export interface ArtifactStoreOptions {
  /** artifacts 目录的绝对路径（已解析）。 */
  artifactsDir: string;
}

export class ArtifactStore {
  readonly artifactsDir: string;

  constructor(opts: ArtifactStoreOptions) {
    this.artifactsDir = opts.artifactsDir;
  }

  /** 该类别对应的文件/目录绝对路径。 */
  pathOf(kind: ArtifactKind): string {
    return join(this.artifactsDir, relativePathFor(kind));
  }

  async ensureArtifactsDir(): Promise<void> {
    try {
      await mkdir(this.artifactsDir, { recursive: true });
    } catch (err) {
      throw new ArtifactError(
        `无法创建工件目录 ${this.artifactsDir}：${sanitizePathMsg(err)}`,
      );
    }
  }

  async artifactExists(kind: ArtifactKind): Promise<boolean> {
    const p = this.pathOf(kind);
    try {
      await stat(p);
      return true;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") return false;
      throw new ArtifactError(`无法访问工件路径 ${p}：${sanitizePathMsg(err)}`);
    }
  }

  /** 读取单文件型工件（WorkingSummary / CurrentBaseline / Candidate）。 */
  async readArtifact(kind: ArtifactKind.WorkingSummary | ArtifactKind.CurrentBaseline | ArtifactKind.Candidate): Promise<string> {
    const p = this.pathOf(kind);
    try {
      return await readFile(p, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") throw notFound(p);
      throw new ArtifactError(`读取工件失败 ${p}：${sanitizePathMsg(err)}`);
    }
  }

  /** 覆盖写入单文件型工件。 */
  async writeArtifact(kind: ArtifactKind.WorkingSummary | ArtifactKind.CurrentBaseline | ArtifactKind.Candidate, content: string): Promise<void> {
    const p = this.pathOf(kind);
    try {
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, content, "utf8");
    } catch (err) {
      throw new ArtifactError(`写入工件失败 ${p}：${sanitizePathMsg(err)}`);
    }
  }

  /** 列出 History/Revision 目录下的修订文件（存在且可读时）。缺失=[]。 */
  async listHistory(): Promise<string[]> {
    const p = this.pathOf(ArtifactKind.HistoryRevision);
    try {
      const entries = await stat(p).then(async () => entriesOf(p));
      return entries;
    } catch {
      return [];
    }
  }
}

async function entriesOf(dir: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(dir);
  return names.sort();
}