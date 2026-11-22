/**
 * 端到端：走真实 reducer 完成一整局，验证实际竿型与判定峰值
 * 写入鱼获、图鉴，并验证旧鱼获保持装备未知。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { gameReducer } from "../src/app/gameReducer.ts";
import { newDocument, idleSession } from "../src/shared/initial.ts";
import { landCatch } from "../src/features/collection/index.ts";
import type { Workspace, Command } from "../src/shared/types.ts";

function send(state: Workspace, c: Command): Workspace {
  return gameReducer(state, c);
}

/** 用固定 dt 推进到搏鱼结束。 */
function runFight(initial: Workspace, reelPolicy: (t: number) => boolean) {
  let state = initial;
  let guard = 0;
  while (state.session.phase === "fighting" && guard < 4000) {
    state = send(state, {
      type: "reel",
      held: reelPolicy(state.session.tension),
    });
    state = send(state, { type: "tick", dt: 0.05 });
    guard += 1;
  }
  return state;
}

test("硬竿搏鱼的实际竿型与判定峰值写入背包与图鉴", () => {
  let state: Workspace = {
    doc: { ...newDocument(), rod: "hard", drag: 0.6 },
    session: idleSession(),
    notice: "",
  };
  state = send(state, { type: "charge-start" });
  state = send(state, { type: "cast" });
  // 推进到咬钩并提竿。
  let guard = 0;
  while (state.session.phase !== "bite" && guard < 400) {
    state = send(state, { type: "tick", dt: 0.05 });
    guard += 1;
  }
  assert.equal(state.session.phase, "bite");
  state = send(state, { type: "strike" });
  assert.equal(state.session.phase, "fighting");
  assert.equal(state.session.rod, "hard");

  state = runFight(state, (t) => t < 0.7);
  const endPhase = state.session.phase;
  assert.ok(
    endPhase === "landed" || endPhase === "escaped",
    "搏鱼必须有确定结论",
  );

  if (endPhase === "landed") {
    assert.equal(state.doc.bag.length, 1);
    const caught = state.doc.bag[0];
    assert.equal(caught.rod, "hard", "鱼获记录实际竿型");
    assert.ok(caught.peakTension > 0, "鱼获记录判定峰值");
    assert.equal(caught.weight, state.session.weight);
    assert.ok(state.doc.journal[caught.fish]);
    assert.equal(state.doc.stats.catches, 1);
  }
});

test("升级前旧鱼获保留原重量且装备未知，不影响新记录", () => {
  const doc = newDocument();
  const legacyBag = [
    {
      id: "old-1",
      fish: "crucian" as const,
      weight: 0.66,
      spot: "reed" as const,
      bait: "worm" as const,
      time: 1000,
      duration: 12,
      peakTension: 0.71,
      // 没有 rod 字段
    },
  ];
  const state: Workspace = {
    doc: { ...doc, bag: legacyBag },
    session: idleSession(),
    notice: "",
  };
  assert.equal(state.doc.bag[0].weight, 0.66);
  assert.equal(state.doc.bag[0].rod, undefined);
  // 新鱼获仍可正常追加并带竿型。
  const fightSession = {
    ...idleSession(),
    id: "new-1",
    phase: "landed" as const,
    rod: "soft" as const,
    fish: "perch" as const,
    weight: 1.2,
    spot: "reed" as const,
    bait: "worm" as const,
    peak: 0.55,
    duration: 20,
  };
  const updated = landCatch(state.doc, fightSession, 2000);
  const fresh = updated.bag.find((c) => c.id === "new-1");
  assert.ok(fresh);
  assert.equal(fresh?.rod, "soft");
  assert.equal(fresh?.peakTension, 0.55);
  // 旧鱼获原封不动。
  const old = updated.bag.find((c) => c.id === "old-1");
  assert.equal(old?.weight, 0.66);
  assert.equal(old?.rod, undefined);
});

test("搏鱼中调整泄力的命令被接受，出竿前才能切换竿型", () => {
  let state: Workspace = {
    doc: newDocument(),
    session: idleSession(),
    notice: "",
  };
  // 空闲时可换竿。
  state = send(state, { type: "rod", id: "hard" });
  assert.equal(state.doc.rod, "hard");
  state = send(state, { type: "charge-start" });
  state = send(state, { type: "cast" });
  let guard = 0;
  while (state.session.phase !== "bite" && guard < 400) {
    state = send(state, { type: "tick", dt: 0.05 });
    guard += 1;
  }
  state = send(state, { type: "strike" });
  // 搏鱼中换竿被忽略。
  const before = state.doc.rod;
  state = send(state, { type: "rod", id: "soft" });
  assert.equal(state.doc.rod, before);
  // 搏鱼中泄力可调。
  state = send(state, { type: "drag", value: 0.8 });
  assert.equal(state.doc.drag, 0.8);
});
