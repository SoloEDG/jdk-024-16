import type { GameDocument } from "../../../shared/types.ts";
import { challengeReady } from "../lib/progress.ts";
export function claimReward(doc: GameDocument, id: string) {
  return challengeReady(doc, id)
    ? { ...doc, claimed: [...doc.claimed, id] }
    : doc;
}
