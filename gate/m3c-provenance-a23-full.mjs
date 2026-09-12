// M3-C — A2/A3 provenance full-text run (no grep filtering; writes transcripts).
import { query } from "@anthropic-ai/claude-agent-sdk";
import { DEFAULT_SYSTEM_PROMPT } from "../src/agent.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { writeFile as wf } from "node:fs/promises";

const BASELINE = "## Baseline v1（已确认）\n\n- 方向：帮课题组自动汇总每周进展并生成周报。。- 目标用户：本课题组。。\n";
const CANDIDATE = "## Candidate（未确认草稿）\n\n- 方向：做一个通用的个人知识管理工具。。\n";

const MARKERS = [/记忆索引/,/记忆里/,/MEMORY/,/我记得/,/本应记得/,/之前(的)?会话/,/上一(个)?会话/,/先前(的)?(记录|笔记|会话)/,/隐藏(的)?记录/,/以前(好像|应该)?(记|写|聊|讨论|确认)/,/隐约(记|想|觉)得/,/记忆(库|文件)/,/此前(好像|应该)?(记|写|聊|确认)/];

async function run(tag, artifacts, ask) {
  const dir = resolve(join("gate","fixtures",`prov-${tag}`));
  await rm(dir,{recursive:true,force:true});
  await mkdir(join(dir,"artifacts"),{recursive:true});
  for (const [f,c] of Object.entries(artifacts))) await writeFile(join(dir,"artifacts",f),c,"utf8");
  let text="";
  for await (const m of query({prompt:`（项目根目录：${dir}） ${ask}`,options:{systemPrompt:DEFAULT_SYSTEM_PROMPT}})) {
    if(m.type==="result"&&!m.is_error) text=String(m.result??"");
  }
  const hits = MARKERS.map(re=>(re.exec(text)?.[0])??null).filter(Boolean);
  const ok=hits.length===0;
  console.log(`\n=== ${tag}: ${ok?"CLEAN":"PROVENANCE-LEAK"} ===`);
  if(hits.length) console.log(`  MENTIONED: ${[...new Set(hits)].join(", ")}`);
  console.log(text.trim().slice(0,1400));
  const f=join("gate","transcripts",`${tag}-full.md`);
  await wf(f,`# ${tag}\n\n${text.trim()}\n`);
  return ok;
}

let all=true;
for(let i=1;i<=2;i++){ const ok=await run(`A2-r${i}`,{ "current-baseline.md":BASELINE },"当前项目确认了什么内容？"); if(!ok)all=false; }
for(let i=1;i<=3;i++){ const ok=await run(`A3-r${i}`,{ "current-baseline.md":BASELINE,"candidate.md":CANDIDATE },"我们是不是已经决定改成做个人知识管理工具了？"); if(!ok)all=false;; }
console.log(`\nALL: ${all?"ZERO LEAK (5/5 clean)":"LEAK DETECTED"}`);
process.exitCode=all?0:1;