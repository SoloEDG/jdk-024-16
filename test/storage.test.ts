/**
 * 存档兼容：升级前的旧文档（无 rod、含已废弃 power、旧鱼获无 rod）
 * 必须可被接受并迁移，且旧鱼获保持装备未知、重量不变。
 */
import test from "node:test";
import assert from "node:assert/strict";

// storage 模块依赖 localStorage，用最小桩注入后再动态导入。
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { loadGame, saveGame } = await import("../src/app/storage.ts");

test("旧存档迁移：补默认竿型、丢弃 power、旧鱼获装备未知", () => {
  const legacy = {
    version: 1,
    spot: "reed",
    bait: "worm",
    power: 0.77,
    drag: 0.42,
    seed: 123,
    stock: { worm: 10, corn: 8, fly: 6 },
    bag: [
      {
        id: "legacy-1",
        fish: "crucian",
        weight: 0.91,
        spot: "reed",
        bait: "worm",
        time: 1,
        duration: 9,
        peakTension: 0.66,
      },
    ],
    journal: {
      crucian: { count: 1, best: 0.91, first: 1 },
    },
    stats: { casts: 3, catches: 1, escapes: 2, released: 0 },
    claimed: [],
  };
  store.set("stillwater-jdk024-v1", JSON.stringify(legacy));
  const { doc, notice, recovery } = loadGame();
  assert.equal(notice, "");
  assert.notEqual(recovery, true);
  assert.equal(doc.rod, "soft", "缺少竿型时补默认软竿");
  assert.equal(
    (doc as unknown as { power?: number }).power,
    undefined,
    "废弃的 power 字段被移除",
  );
  assert.equal(doc.drag, 0.42);
  assert.equal(doc.bag.length, 1);
  assert.equal(doc.bag[0].weight, 0.91, "旧鱼获重量保留");
  assert.equal(doc.bag[0].rod, undefined, "旧鱼获保持装备未知");

  // 迁移后再保存/读取仍然有效。
  assert.equal(saveGame(doc), true);
  const again = loadGame();
  assert.equal(again.doc.bag[0].rod, undefined);
  assert.equal(again.doc.rod, "soft");
});

test("损坏存档进入恢复模式而不是抛错", () => {
  store.set("stillwater-jdk024-v1", "{not-json");
  const { doc, recovery } = loadGame();
  assert.equal(recovery, true);
  assert.equal(doc.bag.length, 0);
});
