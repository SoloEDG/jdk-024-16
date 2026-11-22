import { Fish, MousePointer2, RotateCcw, Anchor } from "lucide-react";
import type { Command } from "../../../shared/commands.ts";
import type { GameDocument, Session, FightMode } from "../../../shared/types.ts";
import { species } from "../../../shared/catalog.ts";
import { RODS, BREAK_TENSION } from "../lib/physics.ts";
import { rodLabel } from "../../tackle/index.ts";
const MODE_TEXT: Record<FightMode, string> = {
  taut: "张紧受力",
  payout: "泄力出线",
  locked: "余线耗尽 · 硬受力",
  slack: "鱼线松弛",
};
const EVENT_TEXT: Record<string, string> = {
  taut: "张紧",
  payout: "出线",
  locked: "硬受力",
  slack: "松弛",
  overload: "超限",
  break: "断线",
};
export function FishingPanel({
  doc,
  session: s,
  send,
}: {
  doc: GameDocument;
  session: Session;
  send: (c: Command) => void;
}) {
  const finish = s.phase === "landed" || s.phase === "escaped";
  const rod = RODS[s.rod];
  const peakPct = Math.round(s.peak * 100);
  const breakPct = Math.round(BREAK_TENSION * 100);
  return (
    <div className="fishing-controls">
      <div className="live-status" role="status">
        <span className={"status-dot " + s.phase} />
        <span>{s.message}</span>
      </div>
      {s.phase === "fighting" && (
        <div className="fight-meters">
          <div className="fight-mode-row">
            <span className={"mode-badge mode-" + s.mode}>
              {MODE_TEXT[s.mode]}
            </span>
            <span className="rod-badge">{rod.name}</span>
            <span className="event-trail" aria-label="状态切换顺序">
              {s.events.slice(-5).map((e, i) => (
                <em key={i} className={"event event-" + e.kind}>
                  {EVENT_TEXT[e.kind]}
                  <small>{e.t.toFixed(1)}s</small>
                </em>
              ))}
            </span>
          </div>
          <label>
            鱼线张力 <strong>{Math.round(s.tension * 100)}%</strong>
            <meter
              aria-label="鱼线张力"
              min="0"
              max="1"
              low={0.25}
              high={0.8}
              optimum={0.55}
              value={s.tension}
            />
          </label>
          <label className="peak-line">
            判定峰值 <strong>{peakPct}%</strong>
            <small>（断线阈值 {breakPct}%，持续超限 1 秒才断）</small>
            <progress
              aria-label="判定峰值张力"
              className="peak-bar"
              max="1"
              value={Math.min(1, s.peak)}
            />
          </label>
          <div className="dual-meters">
            <label>
              线杯余量 <strong>{Math.round(s.spool * 100)}%</strong>
              <progress
                aria-label="线杯余量"
                className={"spool " + (s.spool <= 0 ? "empty" : "")}
                max="1"
                value={s.spool}
              />
            </label>
            <label>
              距离上岸 <strong>{Math.round(s.progress * 100)}%</strong>
              <progress aria-label="收线进度" max="1" value={s.progress} />
            </label>
          </div>
          <div className="dual-meters">
            <label>
              竿梢弯曲 <strong>{Math.round(s.bend * 100)}%</strong>
              <progress aria-label="竿梢弯曲" max="1" value={s.bend} />
            </label>
            <label>
              鱼线延展 <strong>{Math.round(s.stretch * 100)}%</strong>
              <progress aria-label="鱼线延展" max="1" value={s.stretch} />
            </label>
          </div>
          <label className="drag-inline">
            实时泄力 <output>{Math.round(doc.drag * 100)}%</output>
            <input
              aria-label="搏鱼中调整泄力"
              type="range"
              min="15"
              max="95"
              value={doc.drag * 100}
              onChange={(e) =>
                send({ type: "drag", value: +e.target.value / 100 })
              }
            />
          </label>
          <small>
            鱼的体力 {Math.round(s.energy * 100)}% · 松线{" "}
            {s.slackTime.toFixed(1)} / 5 秒 · 硬受力超限{" "}
            {s.overload.toFixed(1)} / 1 秒
          </small>
        </div>
      )}
      <div className="action-row">
        <span className="control-tip">
          <MousePointer2 size={15} />
          {s.phase === "ready"
            ? "点击蓄力，再次点击抛竿"
            : s.phase === "charging"
              ? `抛竿力度 ${Math.round(s.charge * 100)}%`
              : s.phase === "fighting"
                ? "按住收线 · 冲刺先弯竿出线，峰值过高就调松泄力"
                : "享受这一刻的宁静"}
        </span>
        {s.phase === "ready" && (
          <button
            className="primary"
            disabled={!doc.stock[doc.bait]}
            onClick={() => send({ type: "charge-start" })}
          >
            <Anchor size={17} />
            开始抛竿
          </button>
        )}
        {s.phase === "charging" && (
          <button className="primary" onClick={() => send({ type: "cast" })}>
            抛竿 · {Math.round(s.charge * 100)}%
          </button>
        )}
        {s.phase === "waiting" && (
          <button className="primary" disabled>
            等待咬钩…
          </button>
        )}
        {s.phase === "bite" && (
          <button
            className="primary bite-button"
            onClick={() => send({ type: "strike" })}
          >
            <Fish size={17} />
            提竿！
          </button>
        )}
        {s.phase === "fighting" && (
          <button
            className={"primary reel-button " + (s.reeling ? "held" : "")}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              send({ type: "reel", held: true });
            }}
            onPointerUp={() => send({ type: "reel", held: false })}
            onPointerCancel={() => send({ type: "reel", held: false })}
            onLostPointerCapture={() => send({ type: "reel", held: false })}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                send({ type: "reel", held: true });
              }
            }}
            onKeyUp={() => send({ type: "reel", held: false })}
            onBlur={() => send({ type: "reel", held: false })}
          >
            按住收线
          </button>
        )}
        {finish && (
          <button className="primary" onClick={() => send({ type: "next" })}>
            <RotateCcw size={16} />
            再抛一竿
          </button>
        )}
      </div>
      {s.phase === "charging" && (
        <progress className="charge-bar" max="1" value={s.charge} />
      )}{" "}
      {s.phase === "landed" && s.fish && (
        <div className="catch-toast">
          <Fish />
          <span>
            新收获{" "}
            <strong>
              {species(s.fish).name} · {s.weight.toFixed(2)} kg
            </strong>
            <small>
              {rodLabel(s.rod)} · 判定峰值 {Math.round(s.peak * 100)}% ·
              已放入背包，图鉴同步记录
            </small>
          </span>
        </div>
      )}
    </div>
  );
}
