import { useState } from "react";
import {
  Fish,
  BookOpen,
  Flag,
  HelpCircle,
  Check,
  Sun,
  ArrowUpRight,
  X,
  Compass,
} from "lucide-react";
import { isBusy } from "../shared/initial.ts";
import { WaterPanel, WaterConditions, water } from "../features/waters/index.ts";
import { BaitPanel, RigPanel } from "../features/tackle/index.ts";
import { LakeScene, FishingPanel } from "../features/fishing/index.ts";
import { CollectionPanel } from "../features/collection/index.ts";
import { ChallengePanel, TripStats } from "../features/challenges/index.ts";
import { useGame } from "./useGame.ts";
export function App() {
  const { state, send, saved } = useGame();
  const { doc, session } = state;
  const [help, setHelp] = useState(false);
  const busy = isBusy(session);
  const place = water(doc.spot);
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="#" className="brand">
          <span className="brand-mark">
            <Fish size={25} />
          </span>
          <span>
            <strong>
              静水手记<span>STILLWATER</span>
            </strong>
            <small>把日子，过成一池涟漪。</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a className="nav-active" href="#fishing">
            <Compass size={16} />
            去钓鱼
          </a>
          <a href="#collection">
            <BookOpen size={16} />
            鱼类图鉴
          </a>
          <a href="#challenges">
            <Flag size={16} />
            钓手挑战
          </a>
        </nav>
        <div className="header-end">
          <span className="save-state">
            <Check size={12} />
            {saved ? "手记已保存" : "本地保存不可用"}
          </span>
          <button
            aria-label="垂钓指南"
            className="icon-btn"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={19} />
          </button>
          <span className="avatar">舟</span>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <span className="eyebrow">A LITTLE TIME BY THE WATER</span>
            <h1>
              今天，也去钓鱼吧<span>。</span>
            </h1>
            <p>不赶时间，只等一尾心动的鱼。</p>
          </div>
          <div className="weather">
            <Sun size={32} strokeWidth={1.2} />
            <div>
              <strong>晴 · 21°</strong>
              <small>一个适合垂钓的早晨</small>
            </div>
          </div>
        </div>
        <div className="workspace">
          <aside className="left-column">
            <WaterPanel doc={doc} busy={busy} send={send} />
            <div className="left-footer">
              <span className="online-dot" />
              离线也能享受垂钓时光
            </div>
          </aside>
          <div className="center-column">
            <section className="fishing-stage" id="fishing">
              <div className="lake-top">
                <div>
                  <span className="eyebrow">{place.subtitle}</span>
                  <h2>
                    {place.name}
                    <span>自由垂钓</span>
                  </h2>
                </div>
                <span className="location-tag">
                  <span />
                  开放水域
                </span>
              </div>
              <div className="scene-wrap">
                <LakeScene session={session} spot={doc.spot} />
                <div className="scene-caption">
                  <span>清晨 / 07:30</span>
                  <span>{place.description}</span>
                </div>
                <div className="scene-label">STILLNESS IS A KIND OF JOY.</div>
              </div>
              <WaterConditions spot={doc.spot} />
              <FishingPanel doc={doc} session={session} send={send} />
            </section>
            <div className="equipment-row">
              <BaitPanel doc={doc} busy={busy} send={send} />
              <RigPanel
                doc={doc}
                busy={busy}
                fighting={session.phase === "fighting"}
                send={send}
              />
            </div>
            <div className="journal-strip">
              <span>✳</span>
              <p>
                每一竿都是新的开始。
                <small>不论收获多少，湖面总会给你一个好心情。</small>
              </p>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <aside className="right-column">
            <div id="collection">
              <CollectionPanel doc={doc} send={send} />
            </div>
            <div id="challenges">
              <ChallengePanel doc={doc} send={send} />
            </div>
            <TripStats doc={doc} />
          </aside>
        </div>
        <footer className="page-footer">
          <span>
            STILLWATER FIELD NOTES <b>·</b> EST. 2026
          </span>
          <span>
            慢一点，鱼儿会来的。
            <Fish size={14} />
          </span>
        </footer>
      </main>
      {state.notice && (
        <div className="notice" role="status" key={state.notice}>
          {state.notice}
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            className="guide"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-btn close"
              autoFocus
              aria-label="关闭指南"
              onClick={() => setHelp(false)}
            >
              <X size={19} />
            </button>
            <span className="eyebrow">YOUR FIRST CAST</span>
            <h2 id="guide-title">一竿，一次相遇。</h2>
            <ol>
              <li>
                选择已开放的钓点，搭配鱼饵，并在出竿前选好软调或硬调竿。不同水域和鱼饵会改变上钩鱼群。
              </li>
              <li>点击开始抛竿，再次点击确定力度，耐心等待浮漂跳动。</li>
              <li>看到咬钩提示后，在四秒内提竿。</li>
              <li>
                搏鱼时张力由竿梢弹性、鱼线延展和线杯余量共同决定：鱼冲刺先弯竿、再触发出线；软竿缓冲深但回鱼慢，硬竿回鱼快但峰值更高。
              </li>
              <li>
                余线耗尽后会从出线切为硬受力，只有张力持续超过断线阈值才会断线；松弛的鱼线推不动鱼，松线超过五秒会脱钩。搏鱼中随时可调泄力，键盘可按住空格或回车收线。
              </li>
              <li>
                收获会保存实际竿型与判定峰值到背包、图鉴和装备挑战；升级前的旧鱼获保留原重量并显示为装备未知。
              </li>
            </ol>
            <p>
              离开页面时对抗暂停；刷新会结束本次垂钓，已经消耗的鱼饵不会返还。
            </p>
            <button className="primary" onClick={() => setHelp(false)}>
              去湖边坐坐
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
