export type SpotId = "reed" | "brook" | "deep";
export type BaitId = "worm" | "corn" | "fly";
export type FishId = "crucian" | "perch" | "carp" | "trout" | "bass" | "pike";
export type RodId = "soft" | "hard";
export type FightMode = "taut" | "payout" | "locked" | "slack";
export type FightEventKind =
  | "taut"
  | "payout"
  | "locked"
  | "slack"
  | "overload"
  | "break";
export interface FightEvent {
  t: number;
  kind: FightEventKind;
}
export type Phase =
  "ready" | "charging" | "waiting" | "bite" | "fighting" | "landed" | "escaped";
export interface FishSpecies {
  id: FishId;
  name: string;
  latin: string;
  color: string;
  rarity: string;
  min: number;
  max: number;
  strength: number;
  waters: SpotId[];
  baits: BaitId[];
  note: string;
}
export interface Catch {
  id: string;
  fish: FishId;
  weight: number;
  spot: SpotId;
  bait: BaitId;
  /** 实际使用的竿型；升级前的旧鱼获没有该字段，展示为装备未知。 */
  rod?: RodId;
  time: number;
  duration: number;
  /** 判定断线/上岸所依据的搏鱼峰值张力。 */
  peakTension: number;
}
export interface JournalEntry {
  count: number;
  best: number;
  first: number;
}
export interface GameDocument {
  version: 1;
  spot: SpotId;
  bait: BaitId;
  /** 出竿前选择的竿型，搏鱼开始后写入 Session 不再变化。 */
  rod: RodId;
  /** 泄力阈值（0.15–0.95），搏鱼中也可实时调整。 */
  drag: number;
  seed: number;
  stock: Record<BaitId, number>;
  bag: Catch[];
  journal: Partial<Record<FishId, JournalEntry>>;
  stats: { casts: number; catches: number; escapes: number; released: number };
  claimed: string[];
}
export interface Session {
  id: string;
  phase: Phase;
  clock: number;
  charge: number;
  castPower: number;
  spot: SpotId;
  bait: BaitId;
  /** 本次搏鱼锁定的竿型（出竿后不可再切换）。 */
  rod: RodId;
  fish: FishId | null;
  weight: number;
  biteAt: number;
  progress: number;
  tension: number;
  energy: number;
  slackTime: number;
  overload: number;
  peak: number;
  reeling: boolean;
  duration: number;
  /** 线杯余量 0..1，耗尽后由出线切为硬受力。 */
  spool: number;
  /** 鱼线延展量（归一化），仅在张紧时为正。 */
  stretch: number;
  /** 竿梢弯曲量（归一化），软竿弯得更深。 */
  bend: number;
  /** 当前物理状态：张紧 / 出线 / 硬受力 / 松弛。 */
  mode: FightMode;
  /** 内部固定节拍的时间累加器，保证不同帧率结果一致。 */
  physAcc: number;
  /** 最近的状态切换与危险事件，用于画面展示判定顺序。 */
  events: FightEvent[];
  message: string;
}
export interface Workspace {
  doc: GameDocument;
  session: Session;
  notice: string;
}
