// Temporary classifier sanity check for Fix C runtime dispatch.
import { isProjectOriented } from "../src/agent.js";

const cases = [
  ["我想做一个给科研人员用的 AI 工具。这个想法还比较模糊。", true],
  ["我有一个模糊的项目想法：想做一个帮人把零散想法整理成清晰项目定义的东西。", true],
  ["我们来把项目收束一下，形成候选定义。", true],
  ["我想做一个帮课题组自动汇总每周进展并生成周报的工具。", true],
  ["今天天气怎么样？", false],
  ["帮我解释一下什么是递归函数。", false],
  ["帮我调试这段代码：const x = 1; x = 2; 为什么 JavaScript 会报错？", false],
  ["帮我修复这个 bug", false],
  ["你好", false],
  ["帮我翻译这段话", false],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = isProjectOriented(input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  want=${want}  got=${got}  ${input.slice(0, 60)}`);
}
console.log(fail === 0 ? "ALL OK" : `${fail} FAILED`);
process.exitCode = fail === 0 ? 0 : 1;