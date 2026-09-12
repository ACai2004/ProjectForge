/**
 * M5-B Baseline commit store — §11 journal 两阶段事务 + recovery-before-read 不变量。
 *
 * 受控的 commit 动作（Human 显式确认后触发，M5-A §3）：history 归档追加 + current-baseline
 * 替换，作为**同一个原子动作的两个写入目标**，走 `.m5-commit/` journal 两阶段事务
 * （M5-A §11.1，冻结协议）：
 *
 *   Phase 1（staging，无破坏性）
 *     1. 读旧 current-baseline（若存在）→ prev（字节原文）
 *     2. 创建 journal：.m5-commit/journal/<seq>-commit.json（{ seq, prev, new, status:"prepared" }）
 *     3. 写 .m5-commit/staging/<seq>-baseline.md = prev（首建时 prev=null → 改写 new 原文）
 *   Phase 2（activation）
 *     4. 写入 current-baseline.md = newDefinition
 *     5. 原子重命名 staging/<seq>-baseline.md → history/<seq>-baseline.md（durable commit point）
 *     6. 删除 journal + marks（cleanup）
 *
 * 唯一分叉（§11.3）：对账判据 = 步骤 4 是否生效（current == journal.new）。
 *   - 已生效 → incomplete-but-recoverable → forward-complete（保留 current=new、补齐 history、
 *     清理 journal）后即 durable committed；绝不回滚。
 *   - 未生效 → rollback（删除 journal + staging；current 不变）。
 *
 * **recovery-before-read 不变量（用户 2026-09-11 明确）**：任何 authoritative Current
 * Baseline 的读取 / 恢复动作，在把 `current-baseline.md` 作为当前有效定义返回之前，必须
 * 先检查并处理 `.m5-commit/journal/` 中所有 pending 事务。本类的 `readCurrentBaseline()`
 * 是唯一 journal-aware 权威读路径，M5 的全部权威读取（commit 内 prev 读除外——事务前置）
 * 都应经它。
 *
 * 本模块不引入 DB / workflow / 状态机；`.m5-commit/` 是最小 journal（M5-A §0.4 / §11.1）。
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** journal 元信息（落盘 JSON）。 */
export interface CommitJournal {
  seq: number;
  /** 旧 current 原文；null = 首建（无 baseline）。 */
  prev: string | null;
  /** 被确认的新定义原文。 */
  new: string;
  status: "prepared";
  reason?: string;
  createdAt?: string;
}

export interface CommitResult {
  seq: number;
  committed: boolean;
  /** 归档文件名（`<seq>-baseline.md`）。 */
  historyFile: string;
  previousExisted: boolean;
}

export interface RecoveryReport {
  forwardCompleted: number[];
  rolledBack: number[];
}

/** MR11 测试专用失败注入：在指定步骤成功后抛错，模拟崩溃 / 写失败。生产不设置。 */
export interface FaultInjection {
  failAfter: 4 | 5 | 6;
}

export interface BaselineCommitStoreOptions {
  /** artifacts 目录绝对路径（已解析）。 */
  artifactsDir: string;
  /** MR11 测试专用失败注入。 */
  fault?: FaultInjection;
}

export class CommitError extends Error {}

export class BaselineCommitStore {
  readonly artifactsDir: string;
  private readonly journalRoot = ".m5-commit";
  private readonly fault?: FaultInjection;

  constructor(opts: BaselineCommitStoreOptions) {
    this.artifactsDir = opts.artifactsDir;
    this.fault = opts.fault;
  }

  // ---- 路径 ----
  private currentFile(): string {
    return join(this.artifactsDir, "current-baseline.md");
  }
  private historyDir(): string {
    return join(this.artifactsDir, "history");
  }
  private journalDir(): string {
    return join(this.artifactsDir, this.journalRoot, "journal");
  }
  private stagingDir(): string {
    return join(this.artifactsDir, this.journalRoot, "staging");
  }
  private marksDir(): string {
    return join(this.artifactsDir, this.journalRoot, "marks");
  }

  // ---- 底层 IO ----

  private async ensureDirs(): Promise<void> {
    await mkdir(this.journalDir(), { recursive: true });
    await mkdir(this.stagingDir(), { recursive: true });
    await mkdir(this.marksDir(), { recursive: true });
  }

  /** 读 current-baseline 原文；不存在返回 null。 */
  async readCurrentRaw(): Promise<string | null> {
    try {
      return await readFile(this.currentFile(), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw new CommitError(`读取 current-baseline 失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await stat(p);
      return true;
    } catch {
      return false;
    }
  }

  /** 扫描目录中 `<seq>-xxx` 前缀的序号（journal 与 history 共用同一 seq 轴）。 */
  private async maxSeqIn(dir: string, pattern: RegExp): Promise<number> {
    let max = 0;
    try {
      const names = await readdir(dir);
      for (const n of names) {
        const m = pattern.exec(n);
        if (m) max = Math.max(max, Number(m[1]));
      }
    } catch {
      /* dir 不存在 = 0 */
    }
    return max;
  }

  /** 下一单调递增序号（跨事务不重用；失败重试不跳号）。 */
  async nextSeq(): Promise<number> {
    const [j, h] = await Promise.all([
      this.maxSeqIn(this.journalDir(), /^(\d+)-commit\.json$/),
      this.maxSeqIn(this.historyDir(), /^(\d+)-baseline\.md$/),
    ]);
    return Math.max(j, h) + 1;
  }

  private journalFileFor(seq: number): string {
    return join(this.journalDir(), `${seq}-commit.json`);
  }
  private stagingFileFor(seq: number): string {
    return join(this.stagingDir(), `${seq}-baseline.md`);
  }
  private historyFileFor(seq: number): string {
    return join(this.historyDir(), `${seq}-baseline.md`);
  }

  /** 列出所有 status=prepared 的 journal（按 seq 升序，确定性）。 */
  private async listJournals(): Promise<CommitJournal[]> {
    let names: string[];
    try {
      names = await readdir(this.journalDir());
    } catch {
      return [];
    }
    const seqs = names
      .map((n) => /^(\d+)-commit\.json$/.exec(n)?.[1])
      .filter((s): s is string => s !== undefined)
      .map(Number)
      .sort((a, b) => a - b);
    const out: CommitJournal[] = [];
    for (const seq of seqs) {
      try {
        const raw = await readFile(this.journalFileFor(seq), "utf8");
        const meta = JSON.parse(raw) as CommitJournal;
        if (meta.status === "prepared") out.push(meta);
      } catch {
        // 损坏的 journal 不阻塞恢复：跳过（外部篡改超出本协议范围）。
      }
    }
    return out;
  }

  private async rmIfExists(p: string): Promise<void> {
    try {
      await rm(p, { force: true });
    } catch {
      /* ignore */
    }
  }

  // ---- recovery（§11.3：唯一分叉）----

  /**
   * 对账所有 pending 事务。对每份 status=prepared 的 journal：
   *   current == journal.new（步骤 4 已生效）→ forward-complete（补齐 history + 清理 journal）；
   *   else（步骤 4 未生效）→ rollback（删除 journal + staging；current 不变）。
   * 确定性：仅依赖磁盘三态（journal pending / current 内容 / history 存在）。
   */
  async recoverPending(): Promise<RecoveryReport> {
    const report: RecoveryReport = { forwardCompleted: [], rolledBack: [] };
    const journals = await this.listJournals();
    for (const meta of journals) {
      const current = await this.readCurrentRaw();
      if (current !== null && current === meta["new"]) {
        // forward-complete
        await this.forwardComplete(meta);
        report.forwardCompleted.push(meta.seq);
      } else {
        // rollback
        await this.rollback(meta.seq);
        report.rolledBack.push(meta.seq);
      }
    }
    return report;
  }

  /** forward-complete：保留 current=new，补齐 history/<seq>（若缺），清理 journal 与 staging。 */
  private async forwardComplete(meta: CommitJournal): Promise<void> {
    const historyFile = this.historyFileFor(meta.seq);
    const stagingFile = this.stagingFileFor(meta.seq);
    if (!(await this.exists(historyFile))) {
      if (await this.exists(stagingFile)) {
        // 步骤 5：staging 副本原子重命名进 history。
        // 必须先确保 history/ 存在：首建 Baseline 时该目录从未被创建过，而
        // commit() 在步骤 5 前有 mkdir —— recovery 路径同样需要，否则 rename 抛 ENOENT。
        await mkdir(this.historyDir(), { recursive: true });
        await rename(stagingFile, historyFile);
      } else {
        // staging 缺失（异常）→ 从 journal 重建归档：替换=prev、首建=new
        await mkdir(this.historyDir(), { recursive: true });
        await writeFile(historyFile, meta.prev ?? meta["new"], "utf8");
      }
    } else {
      await this.rmIfExists(stagingFile);
    }
    // 步骤 6（cleanup）
    await this.cleanup(meta.seq);
  }

  /** rollback：删除 journal 与 staging；current 未变（=prev）。 */
  private async rollback(seq: number): Promise<void> {
    await this.rmIfExists(this.journalFileFor(seq));
    await this.rmIfExists(this.stagingFileFor(seq));
  }

  /** cleanup：删除 journal、staging、marks 残留。 */
  private async cleanup(seq: number): Promise<void> {
    await this.rmIfExists(this.journalFileFor(seq));
    await this.rmIfExists(this.stagingFileFor(seq));
    try {
      await rm(this.marksDir(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    await mkdir(this.marksDir(), { recursive: true });
  }

  // ---- 权威读取（recovery-before-read 不变量）----

  /**
   * 权威读：先对账所有 pending 事务，再返回 current-baseline 内容。
   * 这是把 `current-baseline.md` 作为当前有效定义返回的**唯一**路径（不变量）。
   */
  async readCurrentBaseline(): Promise<{ content: string | null; recovered: RecoveryReport }> {
    const recovered = await this.recoverPending();
    const content = await this.readCurrentRaw();
    return { content, recovered };
  }

  // ---- commit 事务（§11.1）----

  /**
   * 执行一次受控的 Baseline commit。被确认的新定义原文 next 进入 journal + staging + current
   * + history（首建时归档即 next 本身）。失败时抛 CommitError；恢复语义见 §11.2/§11.3。
   */
  async commit(next: string, opts: { reason?: string } = {}): Promise<CommitResult> {
    const content = String(next ?? "");
    if (content.trim().length === 0) {
      throw new CommitError("commit 内容为空：不提交空定义。");
    }
    await this.ensureDirs();

    // Phase 1（staging，无破坏性）
    const prev = await this.readCurrentRaw();
    const seq = await this.nextSeq();
    const journal: CommitJournal = {
      seq,
      prev,
      new: content,
      status: "prepared",
      ...(opts.reason ? { reason: opts.reason } : {}),
      createdAt: new Date().toISOString(),
    };
    const journalFile = this.journalFileFor(seq);
    const stagingFile = this.stagingFileFor(seq);
    await writeFile(journalFile, JSON.stringify(journal, null, 2), "utf8");
    // 归档本体：替换=prev 原文；首建=被确认的新定义原文
    await writeFile(stagingFile, prev ?? content, "utf8");

    // Phase 2（activation）
    if (this.fault?.failAfter === 4) throw new CommitError(`[fault:step4] commit 在写入 current 前失败（模拟写入失败）。`);
    await writeFile(this.currentFile(), content, "utf8"); // 步骤 4
    if (this.fault?.failAfter === 5) throw new CommitError(`[fault:step5] commit 在 history 归档前失败（模拟崩溃）。`);
    await mkdir(this.historyDir(), { recursive: true });
    await rename(stagingFile, this.historyFileFor(seq)); // 步骤 5 = durable commit point
    if (this.fault?.failAfter === 6) throw new CommitError(`[fault:step6] commit 在 cleanup 前失败（模拟清理中断）。`);
    await this.cleanup(seq); // 步骤 6（cleanup）

    return { seq, committed: true, historyFile: `${seq}-baseline.md`, previousExisted: prev !== null };
  }

  // ---- history 只读 ----

  /** 列出 history 归档文件名（按 seq 升序）。 */
  async listHistory(): Promise<string[]> {
    try {
      const names = await readdir(this.historyDir());
      return names
        .filter((n) => /^\d+-baseline\.md$/.test(n))
        .sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));
    } catch {
      return [];
    }
  }
}
