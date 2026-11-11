"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { markNewsSeen } from "@/app/actions/news";
import { Icon } from "@/components/Icon";
import { helpFor, tourFor, type TourStep } from "@/lib/news";

type R = "lead" | "member" | "admin";

/** The "?" help on every page, and the update tour (shown once per update, replayable from the help). */
export default function Guide({ role, autoTour, version }: { role: R; autoTour: boolean; version: number }) {
  const path = usePathname();
  const [help, setHelp] = useState(false);
  const [tour, setTour] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    if (!autoTour) return;
    const t = setTimeout(() => setTour(true), 900);
    return () => clearTimeout(t);
  }, [autoTour]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelp(false);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const page = helpFor(path, role);
  const endTour = () => {
    setTour(false);
    void markNewsSeen(version).catch(() => {});
  };
  if (!ready) return null;
  return (
    <>
      <button type="button" className="help-fab" data-tour="help" aria-label="Help for this page" aria-expanded={help} onClick={() => setHelp((v) => !v)}>
        <Icon name="help" size={20} />
      </button>
      {help &&
        createPortal(
          <div className="help-wrap" onPointerDown={(e) => e.target === e.currentTarget && setHelp(false)}>
            <aside className="help" role="dialog" aria-labelledby="help-h">
              <div className="help-h">
                <span className="news-tag">Help</span>
                <h2 id="help-h">{page.title}</h2>
                <button type="button" className="icon-btn sm" aria-label="Close" onClick={() => setHelp(false)}>
                  <Icon name="x" size={15} />
                </button>
              </div>
              <ol className="help-list">
                {page.items.map(([t, d], i) => (
                  <li key={t}>
                    <span className="help-n">{i + 1}</span>
                    <span>
                      <b>{t}</b>
                      <span>{d}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <div className="help-f">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setHelp(false);
                    setTour(true);
                  }}
                >
                  <Icon name="spark" size={14} />
                  Replay the what&apos;s new tour
                </button>
              </div>
            </aside>
          </div>,
          document.body,
        )}
      {tour && <Tour steps={tourFor(role)} onDone={endTour} />}
    </>
  );
}

function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const step = steps[i];

  const place = useCallback(() => {
    const els = step.target ? Array.from(document.querySelectorAll<HTMLElement>(step.target)) : [];
    const el = els.find((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 0);
    if (!el) return setBox(null);
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 });
  }, [step]);
  useLayoutEffect(() => {
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight" || e.key === "Enter") setI((v) => (v + 1 < steps.length ? v + 1 : (onDone(), v)));
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onDone, steps.length]);

  // Card sits under (or above) the highlighted thing; centred when there's nothing to point at.
  const W = Math.min(360, window.innerWidth - 24);
  let style: React.CSSProperties = { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: W };
  if (box) {
    const below = box.top + box.height + 12;
    const top = below + 230 < window.innerHeight ? below : Math.max(12, box.top - 12 - 230);
    const left = Math.min(Math.max(12, box.left + box.width / 2 - W / 2), window.innerWidth - W - 12);
    style = { top, left, width: W };
  }
  const last = i === steps.length - 1;
  return createPortal(
    <div className="tour">
      <div className="tour-block" />
      <div className={`tour-ring${box ? "" : " none"}`} style={box ?? { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0 }} />
      <div className="tour-card" style={style} role="dialog" aria-live="polite">
        <div className="tc-step">
          What&apos;s new · {i + 1} of {steps.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tc-f">
          <span className="tc-dots">
            {steps.map((_, k) => (
              <i key={k} className={k === i ? "on" : ""} />
            ))}
          </span>
          {!last && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={onDone}>
              Skip
            </button>
          )}
          {i > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setI(i - 1)}>
              Back
            </button>
          )}
          <button type="button" className="btn btn-sm btn-primary" autoFocus onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
