// M3-C final hardening — activation classifier check against the exact
// representative natural-language prompts from the acceptance criteria.
import { isProjectOriented } from "../src/agent.js";

const positive = [
  "我准备给课题组做一个自动汇总每周进展并生成周报的工具。",
  "我一直觉得现在做科研项目特别乱，想想办法解决。",
  "我有个工具想法，但还没想清楚具体是什么。",
  "帮我把这个东西的方向理一理。",
];
const negative = [
  "爱因斯坦的相对论主要讲了什么？", // ordinary factual
  "今天上海天气怎么样？", // weather/current info
  "帮我调试这段代码：const x = 1; x = 2; 为什么报错？", // coding/debug
  "如何用 PostgreSQL 实现一个外键约束？", // pure technical implementation
];
let fail = 0;
for (const c of positive) {
  const got = isProjectOriented(c);
  if (!got) fail++;
  console.log(`${got ? "PASS" : "FAIL"}  pos  ${c.slice(0, 46)}`);
}
for (const c of negative) {
  const got = isProjectOriented(c);
  if (got) fail++;
  console.log(`${got ? "FAIL" : "PASS"}  neg  ${c.slice(0, 46)}`);
}
console.log(fail === 0 ? "ALL OK (8/8)" : `${fail} FAILED`);
process.exitCode = fail === 0 ? 0 : 1;