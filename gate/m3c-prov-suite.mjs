// M3-C final hardening — A2/A3 provenance suite; pure ESM.
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_SYSTEM_PROMPT } from "../src/agent.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const BASELINE =
  "## Baseline v1（已确认）\n\n- 方向：帮课题组自动汇总每周进展并生成周报。。\n- 目标用户：本课题组。。\n";
const CANDIDATE = "## Candidate（未确认草稿）\n\n- 方向：做一个通用的个人知识管理工具。。\n";

const MARKERS = [
  /记忆索引/, /记忆里/, /MEMORY/, /我记得/, /本应记得/, /之前(的)?会话/,
  /上一(个)?会话/, /先前(的)?(记录|笔记|会话)/, /隐藏(的)?记录/,
  /以前(好像|应该)?(记|写|聊|讨论|确认)/, /隐约(记|想|觉)得/,
  /记忆(库|文件)/, /此前(好像|应该)?(记|写|聊|确认)/,
];
const HAS_MEM = /记忆/;
const NEG = /没有|无|未(曾|被)?读|无法|不能|找不到/;

async function scan(text) {
  const hits = [];
  for (const re of MARKERS) {
    const m = re.exec(text);
    if (m) {
      const i = m.index;
      const start = i > 20 ? i - 20 : 0;
      const ctx = text.slice(start, i + 2);
      if (HAS_MEM.test(re.source)) {
        hits.push("记忆系族");
      } else if (!NEG.test(ctx)) {
        hits.push(re.source);
      }
              }
  }
  return hits;

}

async function run(tag, artifacts, ask) {
  const dir = resolve(join("gate","fixtures",`prov-${tag}`));
  await rm(dir,{recursive:true,force:true});
  await mkdir(join(dir,"artifacts"),{recursive:true});
  for (const [f,c] of Object.entries(artifacts)) {
    await writeFile(join(dir,"artifacts",f),c,"utf8");
  }
  let text = "";
  for await (const m of query({prompt:`（项目根目录：${dir}） ${ask}`,options:{systemPrompt:DEFAULT_SYSTEM_PROMPT}})) {
    if (m.type === "result" && !m.is_error) text = String(m.result ?? "");
  }
  const hits = await scan(text);
  const ok = hits.length === 0;
  console.log(`\n=== ${tag}: ${ok?"CLEAN":"PROVENANCE-LEAK"} ===`);
  if (hits.length) console.log(`  MENTIONED: ${hits.join(", ")}`);
  console.log(text.trim().slice(0,1400));
  await writeFile(join("gate","transcripts",`${tag}-full.md`),`# ${tag}\n\n${text.trim()}\n`);
  return ok;

}

let all = true;
for (let i = 1; i <= 2; i++) {
  const ok = await run(`A2-r${i}`,{ "current-baseline.md":BASELINE },"当前项目确认了什么内容？");
  if(!ok) all=false;
}
for (let i = 1; i <= 3; i++) {
  const ok = await run(`A3-r${i}`,{ "current-baseline.md":BASELINE,"candidate.md":CANDIDATE },"我们是不是已经决定改成做个人知识管理工具了？");
  if(!ok) all=false;
}
console.log(`\nALL: ${all?"ZERO LEAK (5/5 clean)":"LEAK DETECTED"}`);
process.exitCode = all ? 0 : 1;
