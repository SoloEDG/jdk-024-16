import type { GameDocument, Session } from "./types.ts";
export function newDocument(): GameDocument {
  return {
    version: 1,
    spot: "reed",
    bait: "worm",
    rod: "soft",
    drag: 0.4,
    seed: 48127,
    stock: { worm: 24, corn: 20, fly: 16 },
    bag: [],
    journal: {},
    stats: { casts: 0, catches: 0, escapes: 0, released: 0 },
    claimed: [],
  };
}
export function idleSession(): Session {
  return {
    id: "",
    phase: "ready",
    clock: 0,
    charge: 0,
    castPower: 0,
    spot: "reed",
    bait: "worm",
    rod: "soft",
    fish: null,
    weight: 0,
    biteAt: 2,
    progress: 0,
    tension: 0.15,
    energy: 1,
    slackTime: 0,
    overload: 0,
    peak: 0,
    reeling: false,
    duration: 0,
    spool: 1,
    stretch: 0,
    bend: 0,
    mode: "slack",
    physAcc: 0,
    events: [],
    message: "深呼吸，把时间交给湖面。",
  };
}
export function isBusy(s: Session) {
  return ["charging", "waiting", "bite", "fighting"].includes(s.phase);
}
