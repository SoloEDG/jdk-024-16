import type { GameDocument, BaitId, RodId } from "../../../shared/types.ts";
import { clamp } from "../../../shared/random.ts";
export function chooseBait(doc: GameDocument, id: BaitId) {
  return doc.stock[id] > 0 ? { ...doc, bait: id } : doc;
}
/** 出竿前选择软/硬竿；搏鱼中的竿型已锁定，调用方负责拦截。 */
export function chooseRod(doc: GameDocument, id: RodId) {
  return doc.rod === id ? doc : { ...doc, rod: id };
}
export function tune(doc: GameDocument, key: "drag", value: number) {
  return { ...doc, [key]: clamp(value, 0.15, 0.95) };
}
export function consumeBait(doc: GameDocument): GameDocument | null {
  if (doc.stock[doc.bait] < 1) return null;
  return {
    ...doc,
    stock: { ...doc.stock, [doc.bait]: doc.stock[doc.bait] - 1 },
  };
}
export function resupply(doc: GameDocument): GameDocument {
  return { ...doc, stock: { worm: 24, corn: 20, fly: 16 } };
}
