import { newDocument } from "../shared/initial.ts";
import { fishCatalog } from "../shared/catalog.ts";
import type { GameDocument, Catch, RodId } from "../shared/types.ts";
const key = "stillwater-jdk024-v1";
const rods: RodId[] = ["soft", "hard"];
function validCatch(value: unknown, fishIds: string[]): value is Catch {
  const c = value as Catch;
  return (
    !!c &&
    typeof c.id === "string" &&
    fishIds.includes(c.fish) &&
    ["reed", "brook", "deep"].includes(c.spot) &&
    ["worm", "corn", "fly"].includes(c.bait) &&
    // 升级前的旧鱼获没有 rod 字段：保留原重量与装备未知状态。
    (c.rod === undefined || rods.includes(c.rod)) &&
    [c.weight, c.time, c.duration, c.peakTension].every(Number.isFinite)
  );
}
/**
 * 宽松校验：同时接受升级前（无 rod、可能带已废弃的 power）与升级后存档。
 * 结构性字段仍严格校验，损坏数据依旧进入恢复模式。
 */
function valid(value: unknown): value is GameDocument & { power?: number } {
  if (!value || typeof value !== "object") return false;
  const d = value as GameDocument & { rod?: RodId; power?: number };
  const fishIds = fishCatalog.map((f) => f.id);
  const spots = ["reed", "brook", "deep"];
  const baits = ["worm", "corn", "fly"];
  return (
    d.version === 1 &&
    spots.includes(d.spot) &&
    baits.includes(d.bait) &&
    (d.rod === undefined || rods.includes(d.rod)) &&
    (d.power === undefined ||
      (Number.isFinite(d.power) && d.power >= 0.15 && d.power <= 0.95)) &&
    Number.isFinite(d.drag) &&
    d.drag >= 0.15 &&
    d.drag <= 0.95 &&
    Number.isInteger(d.seed) &&
    !!d.stock &&
    baits.every(
      (b) =>
        Number.isInteger(d.stock[b as keyof typeof d.stock]) &&
        d.stock[b as keyof typeof d.stock] >= 0,
    ) &&
    !!d.stats &&
    ["casts", "catches", "escapes", "released"].every(
      (k) =>
        Number.isInteger(d.stats[k as keyof typeof d.stats]) &&
        d.stats[k as keyof typeof d.stats] >= 0,
    ) &&
    Array.isArray(d.claimed) &&
    d.claimed.every((c) => typeof c === "string") &&
    Array.isArray(d.bag) &&
    d.bag.every((c) => validCatch(c, fishIds)) &&
    !!d.journal &&
    Object.entries(d.journal).every(
      ([id, e]) =>
        fishIds.includes(id as (typeof fishIds)[number]) &&
        e &&
        Number.isInteger(e.count) &&
        e.count > 0 &&
        Number.isFinite(e.best) &&
        Number.isFinite(e.first),
    )
  );
}
/**
 * 兼容升级前的存档：补默认竿型供新对局使用，并移除已废弃的收线力度字段；
 * 旧鱼获对象本身不回填 rod，继续以“装备未知”展示、原重量不变。
 */
function migrate(doc: GameDocument & { power?: number }): GameDocument {
  const { power: _removed, ...rest } = doc;
  void _removed;
  return { ...rest, rod: rods.includes(doc.rod) ? doc.rod : "soft" };
}
export function loadGame(): { doc: GameDocument; notice: string; recovery?: true } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { doc: newDocument(), notice: "" };
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed)
      ? { doc: migrate(parsed), notice: "" }
      : {
          doc: newDocument(),
          notice: "本地手记格式或版本无法读取，已保留原手记并开启临时游玩。",
          recovery: true,
        };
  } catch {
    return {
      doc: newDocument(),
      notice: "无法读取本地手记，已暂停自动保存，本次可以临时游玩。",
      recovery: true,
    };
  }
}
export function saveGame(doc: GameDocument) {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}
