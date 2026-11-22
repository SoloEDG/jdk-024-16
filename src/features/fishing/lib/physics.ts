import type {
  Session,
  GameDocument,
  FishSpecies,
  RodId,
  FightMode,
  FightEvent,
} from "../../../shared/types.ts";
import { clamp } from "../../../shared/random.ts";

/**
 * 搏鱼物理模型
 *
 * 张力不再是单一数值，而是三套弹性/余量部件共同作用的结果：
 *  1. 竿梢弹性（rod stiffness）：软竿软、弯得深、缓冲冲刺但回鱼慢；
 *     硬竿硬、回鱼快、峰值更高。
 *  2. 鱼线延展（line stretch）：串联在竿之后，吸收一部分冲击。
 *  3. 线杯余量（spool reserve）：还有余线时高于泄力阈值就出线；
 *     余线耗尽后切为硬受力（locked），张力直接顶向断线路径。
 *
 * 为保证不同画面帧率、不同刚度下的推进都保留
 * “先张紧 → 出线耗尽 → 硬受力 → 持续超限断线”的顺序，
 * 所有物理推进都在固定内部节拍 SUB_STEP 上进行；
 * 单个外部 tick 会被切成多个子步，且每个子步内部先解析
 * 出线→硬受力的切换时刻，再决定是否断线，绝不只看步末结果。
 */

/** 内部固定物理节拍（秒），独立于外部帧率。 */
export const SUB_STEP = 1 / 120;
/** 单次 tick 最多推进的子步数，防止卡顿后追帧过多。 */
const MAX_SUBSTEPS = 24;
/** 断线张力阈值。 */
export const BREAK_TENSION = 0.92;
/** 张力持续超限多久才断线（秒）。 */
const OVERLOAD_LIMIT = 1;
/** 松弛太久脱钩（秒）。松弛的线不能反过来推鱼。 */
const SLACK_LIMIT = 5;
/** 搏鱼超时（秒）。 */
const TIME_LIMIT = 55;
/** 画面事件列表最多保留条数。 */
const EVENT_LIMIT = 12;

export interface RodProfile {
  id: RodId;
  name: string;
  /** 竿梢刚度：越小越软。 */
  stiffness: number;
  /** 张力响应速率：软竿慢，硬竿快。 */
  response: number;
  /** 回鱼速率系数。 */
  retrieve: number;
  /** 最大弯曲量（归一化）。 */
  maxBend: number;
  note: string;
}

export const RODS: Record<RodId, RodProfile> = {
  soft: {
    id: "soft",
    name: "软调竿",
    stiffness: 0.55,
    response: 2.6,
    retrieve: 0.8,
    maxBend: 1,
    note: "竿梢软、弯得深，冲刺先弯竿缓冲峰值，回鱼稍慢。",
  },
  hard: {
    id: "hard",
    name: "硬调竿",
    stiffness: 1.35,
    response: 4.6,
    retrieve: 1.3,
    maxBend: 0.62,
    note: "竿梢硬、回鱼快，缓冲弱，鱼冲刺时峰值张力更高。",
  },
};

export const ROD_ORDER: RodId[] = ["soft", "hard"];

/** 鱼线延展刚度（与竿串联的第二级弹簧）。 */
const LINE_STIFFNESS = 2.4;
const LINE_LIMIT = 0.16;

/** 竿、线串联后的等效刚度。 */
function effectiveStiffness(rod: RodProfile) {
  return (
    (rod.stiffness * LINE_STIFFNESS) / (rod.stiffness + LINE_STIFFNESS)
  );
}

/** 出线速度（归一化余量/秒）。 */
const PAYOUT_RATE = 0.5;
/** 硬受力时竿稍被顶死的额外张力上限。 */
const LOCKUP_EXTRA = 0.22;
/** 重新进入出线保护前需要先回补到的余线水位（迟滞，避免状态抖动）。 */
const SPOOL_REFILL = 0.12;
/** 余线低于该值即视为耗尽（带容差，避免 0.0001 量级的浮点抖动）。 */
const SPOOL_EMPTY = 0.002;
const EPS = 1e-9;

interface Derived {
  rod: RodProfile;
  stiffness: number;
  surge: number;
  /** 当前泄力设置（搏鱼中可调）。 */
  drag: number;
}

function pushEvent(events: FightEvent[], kind: FightEvent["kind"], t: number) {
  // 相邻同类事件只保留最新时刻，避免在迟滞边界附近刷屏。
  const last = events[events.length - 1];
  if (last && last.kind === kind) {
    const merged = [...events.slice(0, -1), { t, kind }];
    return merged;
  }
  const next = [...events, { t, kind }];
  return next.length > EVENT_LIMIT ? next.slice(next.length - EVENT_LIMIT) : next;
}

/**
 * 单个固定节拍的物理推进。
 * 若本步内发生“余线耗尽 → 硬受力”切换，先解析切换时刻，
 * 在同一子步内分段推进，保证顺序不被大节拍吞掉。
 */
function runSubstep(s: Session, d: Derived): Session {
  const h = SUB_STEP;
  let tension = s.tension;
  let spool = s.spool;
  let stretch = s.stretch;
  let bend = s.bend;
  let overload = s.overload;
  let slackTime = s.slackTime;
  let progress = s.progress;
  let energy = s.energy;
  let mode = s.mode;
  let events = s.events;
  const duration = s.duration + h;

  // 鱼的需求张力：收线时由摇轮施加主拉力；不收线时仅在冲刺峰值产生拉扯。
  const reelPull = s.reeling ? d.stiffness * 0.62 : 0;
  const fishPull = s.reeling
    ? 0.12 + d.surge * 0.6
    : Math.max(0, d.surge - 0.42) * 0.55;
  const demand = clamp(
    fishPull + reelPull,
    0,
    BREAK_TENSION + LOCKUP_EXTRA,
  );
  const dragSetting = clamp(s.reeling ? Math.max(0.15, d.drag) : d.drag, 0.15, 0.95);

  /** 在指定时长的一个“相”内推进张力与弹性量。 */
  const integrate = (
    span: number,
    phase: FightMode,
    target: number,
  ): { tension: number; stretch: number; bend: number } => {
    const k = d.rod.response * (phase === "locked" ? 1.35 : 1);
    const t = clamp(
      tension + (target - tension) * (1 - Math.exp(-k * span)),
      0,
      BREAK_TENSION + LOCKUP_EXTRA,
    );
    const st = clamp(t / LINE_STIFFNESS, 0, LINE_LIMIT);
    const bd = clamp(t / d.rod.stiffness, 0, d.rod.maxBend);
    return { tension: t, stretch: st, bend: bd };
  };

  // 摇轮回补线杯：收线且保持接触时持续回补（回补慢于鱼抽线，
  // 因此只有在鱼松劲、玩家主动收线时才能恢复出线保护）。
  const inContactNow = s.reeling || demand > 0.08;
  if (s.reeling && inContactNow) {
    spool = clamp(spool + 0.1 * h, 0, 1);
  }

  // —— 决定本步的相 ——
  // locked 只在余线真正耗尽时进入；必须摇轮回补到迟滞水位才解除，
  // 在此之前保持硬受力、绝不重新出线，避免在边界来回抖动。
  const spoolEmpty = spool <= SPOOL_EMPTY;
  const staysLocked = mode === "locked" && spool < SPOOL_REFILL;
  const choosePayout =
    !staysLocked && !spoolEmpty && demand > dragSetting + EPS;
  if (staysLocked) {
    // 硬受力相：余线已尽，竿/线直接承担全部需求张力。
    mode = "locked";
    const target = clamp(
      demand + LOCKUP_EXTRA * d.rod.stiffness,
      0,
      BREAK_TENSION + LOCKUP_EXTRA,
    );
    const r = integrate(h, "locked", target);
    tension = r.tension;
    stretch = r.stretch;
    bend = r.bend;
  } else if (choosePayout) {
    if (mode !== "payout") events = pushEvent(events, "payout", s.duration);
    mode = "payout";
    // 出线期间张力被泄力阀限制在阈值附近，余线被抽走。
    const drain = PAYOUT_RATE * h * (0.6 + demand - dragSetting);
    if (drain < spool) {
      spool -= drain;
      const r = integrate(h, "payout", dragSetting);
      tension = r.tension;
      stretch = r.stretch;
      bend = r.bend;
    } else {
      // 本步内余线耗尽：先出线到耗尽，再切硬受力，顺序必须保留。
      const tEmpty = spool / PAYOUT_RATE / (0.6 + demand - dragSetting);
      const first = clamp(tEmpty, 0, h);
      let r = integrate(first, "payout", dragSetting);
      tension = r.tension;
      stretch = r.stretch;
      bend = r.bend;
      spool = 0;
      const rest = h - first;
      if (rest > EPS) {
        events = pushEvent(events, "locked", s.duration + first);
        mode = "locked";
        const lockTarget = clamp(
          demand + LOCKUP_EXTRA * d.rod.stiffness,
          0,
          BREAK_TENSION + LOCKUP_EXTRA,
        );
        r = integrate(rest, "locked", lockTarget);
        tension = r.tension;
        stretch = r.stretch;
        bend = r.bend;
      }
    }
  } else if (!inContactNow) {
    if (mode !== "slack") events = pushEvent(events, "slack", s.duration);
    mode = "slack";
    // 松弛：线不传递力，张力与弹性量回到 0，且不能反向推鱼。
    const r = integrate(h, "slack", 0);
    tension = r.tension;
    stretch = r.stretch;
    bend = r.bend;
  } else {
    // 保持接触且不出线：余线为空即硬受力，否则张紧。
    const nextMode: FightMode = spoolEmpty ? "locked" : "taut";
    if (nextMode === "locked" && mode !== "locked")
      events = pushEvent(events, "locked", s.duration);
    if (nextMode === "taut" && (mode === "slack" || mode === "payout"))
      events = pushEvent(events, "taut", s.duration);
    mode = nextMode;
    const target = clamp(
      spoolEmpty ? demand + LOCKUP_EXTRA * d.rod.stiffness : demand,
      0,
      BREAK_TENSION + LOCKUP_EXTRA,
    );
    const r = integrate(h, mode, target);
    tension = r.tension;
    stretch = r.stretch;
    bend = r.bend;
  }

  // —— 危险判定：只有硬受力（余线耗尽）下持续超限才累计 ——
  const overLimit = mode === "locked" && tension >= BREAK_TENSION;
  if (overLimit) {
    if (overload <= EPS) events = pushEvent(events, "overload", duration);
    overload += h;
  } else {
    overload = Math.max(0, overload - h * 1.5);
  }
  const peak = Math.max(s.peak, tension);

  // —— 接触与松弛计时 ——
  const slack = tension < 0.08;
  slackTime = slack ? s.slackTime + h : 0;

  // —— 体力 ——
  energy = clamp(
    energy + (s.reeling ? -0.06 * d.rod.retrieve : 0.022) * h,
  );

  // —— 鱼的位置（收线进度）：松弛的线不能推鱼，负向漂移也被限制 ——
  if (s.reeling && !slack) {
    const gain =
      d.rod.retrieve *
      (0.2 - energy * 0.05) *
      (1 - d.surge * 0.3) *
      (mode === "payout" ? 0.35 : 1) *
      h;
    progress = clamp(progress + gain);
  } else if (mode === "payout") {
    // 鱼把线拉走，位置向深水回退，但受余线抽走速率约束。
    progress = clamp(progress - 0.05 * h);
  } else if (slack) {
    // 松弛不能反过来推鱼：仅保留极缓慢的自然漂移。
    progress = clamp(progress - 0.006 * h);
  }

  // —— 结束判定（顺序：先断线，再上岸，再脱钩/超时）——
  const broken = overload >= OVERLOAD_LIMIT;
  const landed = !broken && progress >= 1;
  const unhooked = !broken && !landed && slackTime >= SLACK_LIMIT;
  const timeout = !broken && !landed && !unhooked && duration >= TIME_LIMIT;
  const lost = broken || unhooked || timeout;

  if (broken) events = pushEvent(events, "break", duration);

  const message = broken
    ? "余线耗尽后张力持续超限，鱼线绷断了。下次记得提前调松泄力。"
    : unhooked
      ? "鱼线松弛太久，鱼儿脱钩了。"
      : timeout
        ? "鱼儿游回了深水。下一竿，再试一次。"
        : landed
          ? "漂亮！收获了一份来自湖水的礼物。"
          : mode === "payout"
            ? "鱼在冲刺，泄力正在出线保护鱼线。"
            : mode === "locked"
              ? "余线已尽，竿梢在硬受力，快调松泄力或松开收线！"
              : slack
                ? "线松了，轻轻收线保持接触。"
                : "按住收线；峰值过高时松开，让竿梢与鱼线化解冲刺。";

  return {
    ...s,
    duration,
    tension,
    energy,
    progress,
    overload,
    slackTime,
    peak,
    spool,
    stretch,
    bend,
    mode,
    events,
    phase: broken || lost ? "escaped" : landed ? "landed" : "fighting",
    reeling: broken || lost || landed ? false : s.reeling,
    message,
  };
}

function derive(s: Session, fish: FishSpecies, doc: GameDocument): Derived {
  const rod = RODS[s.rod];
  const weightFactor = 0.85 + clamp(s.weight / fish.max) * 0.5;
  const surge =
    (Math.sin(s.duration * 2.3) * 0.5 + 0.5) * fish.strength * weightFactor;
  return {
    rod,
    stiffness: effectiveStiffness(rod),
    surge,
    drag: doc.drag,
  };
}

/**
 * 外部 tick：把任意帧率的 dt 切成固定内部节拍推进。
 * 用累加器消化余数，同一串输入在任何帧率下走的子步序列一致，
 * 因此上岸/断线结论可重复。
 */
export function fightStep(
  s: Session,
  doc: GameDocument,
  fish: FishSpecies,
  dt: number,
): Session {
  let acc = s.physAcc + Math.max(0, dt);
  let current = s;
  let guard = 0;
  while (acc + EPS >= SUB_STEP && guard < MAX_SUBSTEPS) {
    const d = derive(current, fish, doc);
    current = runSubstep(current, d);
    acc -= SUB_STEP;
    guard += 1;
    if (current.phase !== "fighting") {
      acc = 0;
      break;
    }
  }
  if (guard >= MAX_SUBSTEPS) acc = 0;
  return { ...current, physAcc: acc };
}
