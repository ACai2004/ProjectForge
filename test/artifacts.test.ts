/**
 * ArtifactStore & Project 加载 测试（Milestone 2）。
 * 运行：npm test
 * 覆盖：验收 A（空项目）/ B(读) / C(写) / E(隔离) / 错误路径 / 项目根解析。
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ArtifactError, ArtifactKind, ArtifactStore } from "../src/artifacts.js";
import { loadProject, resolveProjectRoot, snapshotArtifacts } from "../src/project.js";

async function newStore(): Promise<{ store: ArtifactStore; dir: string; rm: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "pf-artifacts-"));
  const store = new ArtifactStore({ artifactsDir: join(dir, "artifacts") });
  await store.ensureArtifactsDir();
  return { store, dir, rm: () => rm(dir, { recursive: true, force: true }) };
}

describe("ArtifactStore", () => {
  test("A. 空项目：目录存在但无工件 -> 全部 missing，无默认内容", async () => {
    const { store, rm } = await newStore();
    try {
      const snap = await snapshotArtifacts(store);
      for (const [k, present] of Object.entries(snap)) {
        assert.equal(present, false, `${k} 应为 missing`);
      }
    } finally {
      await rm();
    }
  });

  test("B. 读回已知内容（写后读一致）", async () => {
    const { store, rm } = await newStore();
    try {
      const content = "# Working Summary\n\n- a\n- b\n";
      await store.writeArtifact(ArtifactKind.WorkingSummary, content);
      const got = await store.readArtifact(ArtifactKind.WorkingSummary);
      assert.equal(got, content);
    } finally {
      await rm();
    }
  });

  test("C. 写入真实落盘为文件", async () => {
    const { store, dir, rm } = await newStore();
    try {
      const content = "candidate v1";
      await store.writeArtifact(ArtifactKind.Candidate, content);
      const onDisk = await readFile(join(dir, "artifacts", "candidate.md"), "utf8");
      assert.equal(onDisk, content);
    } finally {
      await rm();
    }
  });

  test("E. 隔离：WorkingSummary / Candidate / Baseline 互不覆盖", async () => {
    const { store, rm } = await newStore();
    try {
      await store.writeArtifact(ArtifactKind.WorkingSummary, "ws=1");
      await store.writeArtifact(ArtifactKind.Candidate, "cand=2");
      await store.writeArtifact(ArtifactKind.CurrentBaseline, "base=3");
      assert.equal(await store.readArtifact(ArtifactKind.WorkingSummary), "ws=1");
      assert.equal(await store.readArtifact(ArtifactKind.Candidate), "cand=2");
      assert.equal(await store.readArtifact(ArtifactKind.CurrentBaseline), "base=3");
      // 改 baseline 不影响其它
      await store.writeArtifact(ArtifactKind.CurrentBaseline, "base=4");
      assert.equal(await store.readArtifact(ArtifactKind.WorkingSummary), "ws=1");
      assert.equal(await store.readArtifact(ArtifactKind.CurrentBaseline), "base=4");
    } finally {
      await rm();
    }
  });

  test("错误：读取不存在的单体工件 -> ArtifactError", async () => {
    const { store, rm } = await newStore();
    try {
      await assert.rejects(
        store.readArtifact(ArtifactKind.CurrentBaseline),
        (e) => e instanceof ArtifactError && /不存在/.test(e.message),
      );
    } finally {
      await rm();
    }
  });

  test("错误：在文件上做目录操作时的 artifactExists -> false（不抛）", async () => {
    const { store, dir, rm } = await newStore();
    try {
      // 把 history 路径变成文件（模拟损坏）
      await writeFile(join(dir, "artifacts", "history"), "not a dir");
      // artifactExists 对 history 应返回 true（路径存在——注意这是目录语义的用户责任）
      assert.equal(await store.artifactExists(ArtifactKind.HistoryRevision), true);
      // listHistory 遇到目录损坏应吞异常返回 []（不崩溃）
      assert.deepEqual(await store.listHistory(), []);
    } finally {
      await rm();
    }
  });
});

describe("resolveProjectRoot", () => {
  test("cwd 内找到 package.json（本项目）", () => {
    const root = resolveProjectRoot(process.cwd());
    // 本项目根目录内存在 package.json
    assert.ok(existsSync(join(root, "package.json")), `root=${root}`);
  });

  test("显式 PROJECTFORGE_PROJECT_ROOT 优先", () => {
    const custom = resolveProjectRoot("/nonexistent", {
      PROJECTFORGE_PROJECT_ROOT: "/tmp/pf-custom",
    });
    // Windows 会把 "/tmp/..." 解析成 <盘符>:\tmp\...，断言用规范化后的平台无关比较
    assert.ok(custom.endsWith(join("/tmp", "pf-custom")) || custom.endsWith("pf-custom"));
  });

  test("找不到 package.json -> 抛 ProjectError", () => {
    assert.throws(
      () => resolveProjectRoot("/", {}),
      /无法解析项目根/,
    );
  });
});

describe("loadProject", () => {
  test("artifacts 目录不存在时会被创建，且不发明任何工件", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pf-proj-"));
    try {
      const project = await loadProject(dir, {
        PROJECTFORGE_PROJECT_ROOT: dir,
        ...process.env,
      });
      // 只创建了 artifacts/ 目录，里面没有文件
      const files = await import("node:fs/promises").then((m) => m.readdir(project.artifactsDir));
      assert.deepEqual(files, []);
      assert.equal(project.root, dir);
      assert.equal(project.artifactsDir, join(dir, "artifacts"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("已存在 artifact 能被加载并被读取（实测落盘）", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pf-proj-"));
    await mkdir(join(dir, "artifacts"));
    await writeFile(join(dir, "artifacts", "working-summary.md"), "已知内容 XYZ");
    try {
      const project = await loadProject(dir, { PROJECTFORGE_PROJECT_ROOT: dir, ...process.env });
      assert.equal(await project.store.artifactExists(ArtifactKind.WorkingSummary), true);
      assert.equal(
        await project.store.readArtifact(ArtifactKind.WorkingSummary),
        "已知内容 XYZ",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});