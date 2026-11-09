"use client";

import { useEffect, useState, useTransition } from "react";
import { markNewsSeen } from "@/app/actions/news";
import { Icon } from "@/components/Icon";
import type { NewsItem } from "@/lib/news";

/** Floating "What's new" note, shown once per update for each person. */
export default function WhatsNew({ items, version }: { items: NewsItem[]; version: number }) {
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [, start] = useTransition();
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 700);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const close = () => {
    setLeaving(true);
    start(async () => {
      await markNewsSeen(version).catch(() => {});
    });
    setTimeout(() => setShow(false), 280);
  };
  return (
    <aside className={`news${leaving ? " out" : ""}`} role="dialog" aria-labelledby="news-h">
      <div className="news-h">
        <span className="news-tag">New</span>
        <h2 id="news-h">What&apos;s new in Agthia Enhancements</h2>
        <button type="button" className="icon-btn sm" aria-label="Close" onClick={close}>
          <Icon name="x" size={15} />
        </button>
      </div>
      <ul className="news-list">
        {items.map((it) => (
          <li key={it.title}>
            <span className="news-i">
              <Icon name={it.icon} size={17} />
            </span>
            <span>
              <b>{it.title}</b>
              <span>{it.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="news-f">
        <button type="button" className="btn btn-primary btn-sm" onClick={close}>
          Got it
        </button>
      </div>
    </aside>
  );
}
