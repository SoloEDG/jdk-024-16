import type { BaitId, SpotId, RodId } from "./types.ts";
export type Command =
  | { type: "spot"; id: SpotId }
  | { type: "bait"; id: BaitId }
  | { type: "rod"; id: RodId }
  | { type: "drag"; value: number }
  | { type: "charge-start" }
  | { type: "cast" }
  | { type: "strike" }
  | { type: "reel"; held: boolean }
  | { type: "tick"; dt: number }
  | { type: "next" }
  | { type: "release"; id: string }
  | { type: "claim"; id: string }
  | { type: "resupply" };
