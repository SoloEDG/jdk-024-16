import { SlidersHorizontal } from "lucide-react";
import type { GameDocument } from "../../../shared/types.ts";
import type { Command } from "../../../shared/commands.ts";
import { RODS, ROD_ORDER } from "../../fishing/lib/physics.ts";
export function rodLabel(id: GameDocument["rod"]) {
  return RODS[id]?.name ?? "装备未知";
}
export function RigPanel({
  doc,
  busy,
  fighting,
  send,
}: {
  doc: GameDocument;
  busy: boolean;
  fighting: boolean;
  send: (c: Command) => void;
}) {
  return (
    <section className="rig-panel">
      <div className="section-title">
        <SlidersHorizontal size={16} />
        <h2>溪流轻竿</h2>
        <span>2.4 m</span>
      </div>
      <div className={"rod-drawing rod-" + doc.rod}>
        <i />
        <i />
        <i />
        <b>STILLWATER / 240</b>
      </div>
      <div className="rod-choice" role="group" aria-label="出竿前选择竿型">
        {ROD_ORDER.map((id) => {
          const rod = RODS[id];
          return (
            <button
              key={id}
              className={"rod-card " + (doc.rod === id ? "active" : "")}
              disabled={busy}
              aria-pressed={doc.rod === id}
              onClick={() => send({ type: "rod", id })}
            >
              <strong>{rod.name}</strong>
              <small>{rod.note}</small>
            </button>
          );
        })}
      </div>
      <label>
        泄力设置 <output>{Math.round(doc.drag * 100)}%</output>
        <input
          aria-label="泄力设置"
          type="range"
          min="15"
          max="95"
          value={doc.drag * 100}
          onChange={(e) => send({ type: "drag", value: +e.target.value / 100 })}
        />
      </label>
      <small className="muted">
        {fighting
          ? "搏鱼中可实时调泄力：调松更易出线护线，调紧回鱼更快但峰值更高。"
          : "软竿缓冲深、回鱼慢；硬竿回鱼快、峰值高。泄力决定余线出线的张力门槛。"}
      </small>
    </section>
  );
}
