// M1 regression via real MainAgent: two independent inputs to the same session
// must produce continuity (same sessionId, resume works), and a technical turn
// must NOT activate requirement-layer dispatch.
import { MainAgent, isProjectOriented } from "../src/agent.js";

const agent = new MainAgent();

// 1) a project-oriented turn (dispatch ON)
const p1 = "我想做一个给课题组用的科研进度记录工具。";
console.log(`classify(p1)=${isProjectOriented(p1)}  (expect true)`);
const r1 = await agent.turn(p1);
console.log(`turn1 sessionId=${r1.sessionId ? "ok" : "MISSING"} reply=${r1.text.slice(0, 120).replace(/\s+/g, " ")}`);

// 2) continuation turn into the SAME session (resume). Ask a follow-up about the idea.
const p2 = "继续这个想法：我其实只需要我自己用。";
const r2 = await agent.turn(p2);
console.log(`turn2 sessionId=${r2.sessionId ? "ok" : "MISSING"} sameAsTurn1=${r2.sessionId === r1.sessionId}`);
console.log(`turn2 reply=${r2.text.slice(0, 160).replace(/\s+/g, " ")}`);

// 3) a purely technical turn must NOT dispatch (ordinary conversation stays normal)
const p3 = "帮我修复这段代码：x = undefined; x.push(1);";
console.log(`classify(p3)=${isProjectOriented(p3)}  (expect false)`);
const r3 = await agent.turn(p3);
console.log(`turn3 sessionId=${r3.sessionId ? "ok" : "MISSING"} reply=${r3.text.slice(0, 160).replace(/\s+/g, " ")}`);