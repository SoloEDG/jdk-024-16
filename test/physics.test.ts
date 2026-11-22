/**
 * 搏鱼物理的确定性回放测试。
 * 直接用 Node 的类型擦除运行 TS（Node >=22.6，--experimental-strip-types），
 * 不引入任何第三方依赖，也不读取工作区外的不可信数据。
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  fightStep,
  SUB_STEP,
  BREAK_TENSION,
  RODS,
} from "../src/features/fishing/lib/physics.ts";
import { idleSession } from "../src/shared/initial.ts";
import type {
  Session,
  GameDocument,
  FishSpecies,
  RodId,
} from "../src/shared/types.ts";
import { countRodCatches } from "../src/features/collection/lib/records.ts";

const pike: FishSpecies = {
  id: "pike",
  name: "白斑狗鱼",
  latin: "Esox lucius",
  color: "#7a918c",
  rarity: "稀有",
  min: 2,
  max: 8.4,
  strength: 0.95,
  waters: ["deep"],
  baits: ["fly", "worm"],
  note: "",
};

const crucian: FishSpecies = {
  id: "crucian",
  name: "银鲫",
  latin: "Carassius auratus",
  color: "#bdd4ce",
  rarity: "常见",
  min: 0.25,
  max: 1.3,
  strength: 0.35,
  waters: ["reed", "brook"],
  baits: ["worm", "corn"],
  note: "",
};

function makeDoc(overrides: Partial<GameDocument> = {}): GameDocument {
  return {
    version: 1,
    spot: "deep",
    bait: "worm",
    rod: "soft",
    drag: 0.4,
    seed: 1,
    stock: { worm: 1, corn: 0, fly: 0 },
    bag: [],
    journal: {},
    stats: { casts: 0, catches: 0, escapes: 0, released: 0 },
    claimed: [],
    ...overrides,
  };
}

function makeFight(rod: RodId, drag = 0.4): Session {
  const s = idleSession();
  return {
    ...s,
    phase: "fighting",
    rod,
    fish: "pike",
    weight: 7,
    mode: "taut",
    tension: 0.2,
    events: [{ t: 0, kind: "taut" }],
  };
}

/** 用一序列外部 tick 推进，reeling 由回调按当前状态决定。 */
function replay(
  start: Session,
  doc: GameDocument,
  schedule: number[],
  policy: (s: Session) => boolean,
): Session[] {
  let s = start;
  const frames: Session[] = [];
  for (const dt of schedule) {
    s = { ...s, reeling: policy(s) };
    s = fightStep(s, doc, pike, dt);
    frames.push(s);
    if (s.phase !== "fighting") break;
  }
  return frames;
}

/** 均匀帧率的 tick 序列。 */
function uniformSchedule(dt: number, seconds: number): number[] {
  const n = Math.ceil(seconds / dt);
  return Array.from({ length: n }, () => dt);
}

/** 抖动帧率：把同样的总时长切成不规则的步长。 */
function jitterSchedule(seconds: number): number[] {
  const out: number[] = [];
  let t = 0;
  let i = 0;
  while (t < seconds - 1e-9) {
    const dt = Math.min(seconds - t, [0.016, 0.05, 0.1, 0.033][i % 4]);
    out.push(dt);
    t += dt;
    i += 1;
  }
  return out;
}

const holdReel = () => true;
// 真实玩家策略：张力安全时持续收线（含摇轮回补余线），过高就松手化解。
const cautious = (s: Session) => s.tension < 0.72;

test("固定节拍常量独立于帧率", () => {
  assert.equal(SUB_STEP, 1 / 120);
  assert.ok(BREAK_TENSION > 0.9);
});

test("极软与极硬竿在大步长下都保持完整转换顺序，不会跳过状态", () => {
  // 接近耗尽的状态用 0.15s 大步长（18 个内部子步）推进，
  // 两种极端刚度都必须先记录 locked，且不允许越过它直接断线。
  for (const rod of ["soft", "hard"] as RodId[]) {
    let s = { ...makeFight(rod, 0.2), spool: 0.015, tension: 0.5 };
    const doc = makeDoc({ rod, drag: 0.2 });
    s = fightStep({ ...s, reeling: true }, doc, pike, 0.15);
    const kinds = s.events.map((e) => e.kind);
    assert.ok(kinds.includes("locked"), `${rod} 必须进入硬受力`);
    if (kinds.includes("break")) {
      assert.ok(
        kinds.indexOf("break") > kinds.indexOf("locked"),
        `${rod} 断线不能早于硬受力`,
      );
    }
  }
});

test("同一输入在任意帧率下上岸/断线结论一致且峰值接近", () => {
  const schedules = [
    uniformSchedule(0.05, 40),
    uniformSchedule(0.016667, 40),
    uniformSchedule(0.1, 40),
    jitterSchedule(40),
  ];
  const outcomes = schedules.map((sch) => {
    const frames = replay(makeFight("soft"), makeDoc(), sch, cautious);
    const end = frames[frames.length - 1];
    return {
      phase: end.phase,
      peak: Number(end.peak.toFixed(6)),
      duration: Number(end.duration.toFixed(4)),
      progress: Number(end.progress.toFixed(4)),
    };
  });
  const first = outcomes[0];
  for (const o of outcomes) {
    assert.equal(o.phase, first.phase, "结论必须与帧率无关");
    // 固定内部节拍保证子步序列一致；峰值差异只来自外部采样时刻，
    // 同量级即可，不影响上岸/断线结论。
    assert.ok(Math.abs(o.peak - first.peak) < 0.12, "峰值应保持同量级");
    assert.ok(Math.abs(o.duration - first.duration) < 0.25);
  }
});

test("重复播放同一条输入轨迹得到完全相同的结果", () => {
  const sch = jitterSchedule(30);
  const run = () =>
    replay(makeFight("hard", 0.35), makeDoc({ rod: "hard", drag: 0.35 }), sch, holdReel);
  const a = run();
  const b = run();
  const ea = a[a.length - 1];
  const eb = b[b.length - 1];
  assert.equal(ea.phase, eb.phase);
  assert.equal(ea.peak, eb.peak);
  assert.equal(ea.duration, eb.duration);
  assert.equal(ea.spool, eb.spool);
  assert.equal(ea.overload, eb.overload);
});

test("余线耗尽先于硬受力，硬受力先于断线：转换顺序被保留", () => {
  // 紧泄力 + 硬竿 + 全程按住收线 + 大鱼，必然抽光余线后硬受力并断线。
  const start = { ...makeFight("hard", 0.15), weight: 8.2 };
  const frames = replay(
    start,
    makeDoc({ rod: "hard", drag: 0.15 }),
    uniformSchedule(0.05, 40),
    holdReel,
  );
  const end = frames[frames.length - 1];
  const kinds = end.events.map((e) => e.kind);
  const firstLocked = kinds.indexOf("locked");
  const firstOverload = kinds.indexOf("overload");
  const firstBreak = kinds.indexOf("break");
  assert.ok(firstLocked >= 0, "必须出现余线耗尽的硬受力事件");
  assert.ok(firstOverload > firstLocked, "超限必须发生在硬受力之后");
  assert.ok(firstBreak > firstOverload, "断线必须发生在持续超限之后");
  // 事件时间戳单调不减。
  const times = end.events.map((e) => e.t);
  times.forEach((t, i) => assert.ok(i === 0 || t >= times[i - 1] - 1e-9));
  // 断线前必然经历过余线耗尽（事件轨迹已证明），结束时余线处于低位。
  assert.ok(end.spool < 0.1);
  assert.equal(end.phase, "escaped");
  assert.ok(end.peak >= BREAK_TENSION);
});

test("单步内的多段转换不会被大步长吞掉（大步长也保持顺序）", () => {
  // 0.1s 的外部步长包含 12 个内部子步；在接近耗尽的状态上推进。
  let s = makeFight("hard", 0.2);
  const doc = makeDoc({ rod: "hard", drag: 0.2 });
  s = { ...s, spool: 0.02, tension: 0.5 };
  const before = s.events.length;
  s = fightStep({ ...s, reeling: true }, doc, pike, 0.1);
  const newKinds = s.events.slice(before).map((e) => e.kind);
  assert.ok(newKinds.includes("locked"), "本步内必须记录到硬受力切换");
  // 若发生断线，其事件一定在 locked 之后。
  if (newKinds.includes("break")) {
    assert.ok(newKinds.indexOf("break") > newKinds.indexOf("locked"));
  }
});

test("软竿峰值更低、耗时更长；硬竿回收更快但峰值更高", () => {
  const sch = uniformSchedule(0.05, 45);
  const soft = replay(
    makeFight("soft", 0.5),
    makeDoc({ rod: "soft", drag: 0.5 }),
    sch,
    cautious,
  );
  const hard = replay(
    makeFight("hard", 0.5),
    makeDoc({ rod: "hard", drag: 0.5 }),
    sch,
    cautious,
  );
  const se = soft[soft.length - 1];
  const he = hard[hard.length - 1];
  // 同策略下硬竿回收更快：上岸耗时更短。
  assert.ok(he.duration <= se.duration);
  // 硬竿的全程峰值不低于软竿。
  assert.ok(he.peak >= se.peak - 1e-9);
  // 软竿弯曲量峰值比硬竿更深（缓冲更充分）。
  const softBend = Math.max(...soft.map((f) => f.bend));
  const hardBend = Math.max(...hard.map((f) => f.bend));
  assert.ok(softBend > hardBend);
  // 竿参数本身满足设计差异。
  assert.ok(RODS.soft.stiffness < RODS.hard.stiffness);
  assert.ok(RODS.soft.retrieve < RODS.hard.retrieve);
});

test("松弛的鱼线不能反过来推鱼：松线期进度不出现负冲击", () => {
  let s = { ...makeFight("soft"), fish: "crucian", weight: 0.5 };
  const doc = makeDoc();
  s = { ...s, tension: 0.02, mode: "slack", reeling: false };
  const before = s.progress;
  for (let i = 0; i < 20; i += 1) {
    s = fightStep(s, doc, crucian, 0.05);
  }
  // 仅允许极缓慢自然漂移（每步 -0.006*h），20 步累计不超过该上界。
  assert.ok(s.progress >= before - 0.006 * 20 * 0.05 - 1e-9);
  assert.ok(s.slackTime >= 0.99);
  assert.equal(s.mode, "slack");
});

test("提高泄力并配合松手可避免断线（搏鱼中可调泄力改变结论）", () => {
  const sch = uniformSchedule(0.05, 40);
  const tight = replay(
    { ...makeFight("hard", 0.15), weight: 8.2 },
    makeDoc({ rod: "hard", drag: 0.15 }),
    sch,
    holdReel,
  );
  const loose = replay(
    makeFight("hard", 0.6),
    makeDoc({ rod: "hard", drag: 0.6 }),
    sch,
    cautious,
  );
  const tEnd = tight[tight.length - 1];
  const lEnd = loose[loose.length - 1];
  assert.equal(tEnd.phase, "escaped", "全程硬拉紧泄力应断线");
  assert.notEqual(lEnd.phase, "escaped", "调松泄力并及时松手应能保命");
  assert.ok(lEnd.peak < tEnd.peak);
});

test("装备挑战统计只认真实竿型，旧鱼获（无 rod）不计入", () => {
  const bag = [
    {
      id: "a",
      fish: "pike",
      weight: 5,
      spot: "deep",
      bait: "worm",
      rod: "hard",
      time: 1,
      duration: 10,
      peakTension: 0.85,
    },
    {
      id: "b",
      fish: "carp",
      weight: 3,
      spot: "reed",
      bait: "corn",
      rod: "soft",
      time: 2,
      duration: 12,
      peakTension: 0.5,
    },
    {
      // 升级前旧鱼获：没有 rod 字段。
      id: "c",
      fish: "crucian",
      weight: 0.6,
      spot: "reed",
      bait: "worm",
      time: 3,
      duration: 8,
      peakTension: 0.7,
    },
  ] as GameDocument["bag"];
  assert.equal(countRodCatches(bag, "hard", 0.8), 1);
  assert.equal(countRodCatches(bag, "soft", 0, 0.6), 1);
  assert.equal(countRodCatches(bag, "soft"), 1, "旧鱼获不被算作任何竿型");
});
