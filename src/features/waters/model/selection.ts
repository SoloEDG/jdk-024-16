import type { GameDocument, SpotId } from "../../../shared/types.ts";
import { canVisit } from "../lib/habitat.ts";
export function selectWater(doc: GameDocument, id: SpotId): GameDocument {
  return canVisit(doc, id) ? { ...doc, spot: id } : doc;
}
