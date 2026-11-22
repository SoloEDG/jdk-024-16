import type { Session, GameDocument } from "../../../shared/types.ts";
import { species } from "../../../shared/catalog.ts";
import { clamp } from "../../../shared/random.ts";
import { fightStep } from "../lib/physics.ts";
export function tickSession(
  s: Session,
  doc: GameDocument,
  dt: number,
): Session {
  if (s.phase === "charging")
    return {
      ...s,
      clock: s.clock + dt,
      charge: clamp((Math.sin((s.clock + dt) * 2.2 - Math.PI / 2) + 1) / 2),
    };
  if (s.phase === "waiting") {
    const clock = s.clock + dt;
    return {
      ...s,
      clock,
      phase: clock >= s.biteAt ? "bite" : "waiting",
      message:
        clock >= s.biteAt ? "有鱼咬钩！点击「提竿」抓住时机。" : s.message,
    };
  }
  if (s.phase === "bite") {
    const clock = s.clock + dt;
    return clock - s.biteAt > 4
      ? {
          ...s,
          clock,
          phase: "escaped",
          message: "错过了咬钩时机，留心浮漂，再来一次。",
        }
      : { ...s, clock };
  }
  if (s.phase === "fighting" && s.fish)
    return fightStep(s, doc, species(s.fish), dt);
  return s;
}
export function strike(s: Session): Session {
  return s.phase === "bite"
    ? {
        ...s,
        phase: "fighting",
        clock: 0,
        mode: "taut",
        tension: 0.2,
        events: [{ t: 0, kind: "taut" }],
        message: "按住收线；鱼冲刺时先弯竿、出线，峰值过高记得调松泄力。",
      }
    : s;
}
