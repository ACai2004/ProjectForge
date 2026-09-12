/**
 * M4-B 工件写能力面（修正 5 / 用户批准）。
 *
 * M4 的模型可见写能力**窄化**为两操作：
 *   writeWorkingSummary(content)
 *   writeCandidate(content)
 *
 * 两者内部复用 ArtifactStore（M2）。CurrentBaseline 与 History 在本能力层
 * 结构性不可写 —— 不存在任何模型可见写入口，也不暴露 generic write_artifact。
 */
import { ArtifactKind, ArtifactStore } from "./artifacts.js";

/** M4 允许写入的工件种类：仅 Working Summary 与 Candidate。 */
export type M4WritableKind = Extract<ArtifactKind, ArtifactKind.WorkingSummary | ArtifactKind.Candidate>;

/** 面向需求层的窄写能力（内部复用 ArtifactStore）。 */
export class ArtifactWriteCapability {
  constructor(private readonly store: ArtifactStore) {}

  /** 模型可见：写 Working Summary（非权威）。 */
  async writeWorkingSummary(content: string): Promise<void> {
    await this.store.writeArtifact(ArtifactKind.WorkingSummary, content);
  }

  /** 模型可见：写 Candidate（非权威，未确认草稿）。 */
  async writeCandidate(content: string): Promise<void> {
    await this.store.writeArtifact(ArtifactKind.Candidate, content);
  }

  // 明确不提供：
  //   - writeBaseline / writeHistory：M4 结构性禁写。
}