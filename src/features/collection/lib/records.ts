import type { Catch, JournalEntry, FishId, RodId } from "../../../shared/types.ts";
export function recordCatch(
  journal: Partial<Record<FishId, JournalEntry>>,
  catchItem: Catch,
) {
  const old = journal[catchItem.fish];
  return {
    ...journal,
    [catchItem.fish]: {
      count: (old?.count ?? 0) + 1,
      best: Math.max(old?.best ?? 0, catchItem.weight),
      first: old?.first ?? catchItem.time,
    },
  };
}
export function bagWeight(bag: Catch[]) {
  return bag.reduce((n, c) => n + c.weight, 0);
}
/** 某鱼种的全部鱼获（含旧鱼获，旧鱼获 rod 为 undefined）。 */
export function catchesOf(bag: Catch[], fish: FishId): Catch[] {
  return bag.filter((c) => c.fish === fish);
}
/** 某鱼种使用指定竿型的最高判定峰值；没有对应记录返回 null。 */
export function peakForRod(
  bag: Catch[],
  fish: FishId,
  rod: RodId,
): number | null {
  const peaks = catchesOf(bag, fish)
    .filter((c) => c.rod === rod)
    .map((c) => c.peakTension);
  return peaks.length ? Math.max(...peaks) : null;
}
/** 是否存在升级前的旧鱼获（装备未知）。 */
export function hasLegacyCatch(bag: Catch[], fish?: FishId): boolean {
  return bag.some((c) => c.rod === undefined && (!fish || c.fish === fish));
}
/** 装备挑战统计：用指定竿型上岸且峰值落在区间内的鱼获数。 */
export function countRodCatches(
  bag: Catch[],
  rod: RodId,
  minPeak = 0,
  maxPeak = Number.POSITIVE_INFINITY,
): number {
  return bag.filter(
    (c) =>
      c.rod === rod && c.peakTension >= minPeak && c.peakTension <= maxPeak,
  ).length;
}
