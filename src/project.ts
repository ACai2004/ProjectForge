/**
 * Project 加载 —— Milestone 2。
 *
 * 职责：
 *   - 解析 Project Root（显式 env 优先，其次向上查找含 package.json 的目录）
 *   - 启动时只读加载既有工件：缺失 → 以「缺失/空」表达，绝不发明默认内容，
 *     绝不自动创建 Baseline / Candidate / Working Summary。
 *
 * 与 Session 的边界：Project 是持久化工件（Artifacts）的载体；Session 是本次运行的
 * 对话状态（MainAgent.sessionId）。二者互不替代。
 */
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ArtifactKind, ArtifactStore } from "./artifacts.js";

/** 项目根定位失败时的清晰错误（不泄露 credential）。 */
export class ProjectError extends Error {}

export interface Project {
  /** 项目根目录绝对路径。 */
  root: string;
  /** artifacts 目录绝对路径。 */
  artifactsDir: string;
  /** 默认使用；也可用 new ArtifactStore({ artifactsDir }) 自行创建。 */
  store: ArtifactStore;
}

/**
 * 解析项目根目录：
 * 1) PROJECTFORGE_PROJECT_ROOT 显式指定（优先）；
 * 2) 从 cwd 向上查找最近包含 package.json 的目录；
 * 3) 找不到则抛 ProjectError。
 */
export function resolveProjectRoot(cwd: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PROJECTFORGE_PROJECT_ROOT;
  if (explicit) {
    const abs = resolve(cwd, explicit);
    return abs;
  }
  let dir = resolve(cwd);
  for (;;) {
    const marker = `${dir}/package.json`;
    try {
      statSync(marker);
      return dir;
    } catch {
      /* continue walking up */
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new ProjectError(
        `无法解析项目根：在 "${cwd}" 及其上级目录中找不到 package.json。` +
          `可用 PROJECTFORGE_PROJECT_ROOT 显式指定。`,
      );
    }
    dir = parent;
  }
}

export function artifactsDirFor(root: string): string {
  return resolve(root, "artifacts");
}

/**
 * 启动时加载项目：解析根、构造 store、确保 artifacts 目录存在（创建目录本身不算
 * 发明内容），并把「哪些工件已存在/缺失」作为只读快照返回。不创建任何工件文件。
 */
export async function loadProject(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<Project> {
  const root = resolveProjectRoot(cwd, env);
  const artifactsDir = artifactsDirFor(root);
  const store = new ArtifactStore({ artifactsDir });
  try {
    await store.ensureArtifactsDir();
  } catch (err) {
    if (err instanceof ProjectError) throw err;
    throw new ProjectError(`工件目录不可用：${err instanceof Error ? err.message : String(err)}`);
  }
  return { root, artifactsDir, store };
}

/** 只读快照：各类工件当前是否存在（缺失 = false）。 */
export async function snapshotArtifacts(store: ArtifactStore): Promise<Record<ArtifactKind, boolean>> {
  const result = {} as Record<ArtifactKind, boolean>;
  for (const kind of [
    ArtifactKind.WorkingSummary,
    ArtifactKind.CurrentBaseline,
    ArtifactKind.Candidate,
    ArtifactKind.HistoryRevision,
  ]) {
    result[kind] = await store.artifactExists(kind);
  }
  return result;
}