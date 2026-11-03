"use client";

import { useEffect, useRef } from "react";

// A calm office, painted once at low resolution and softened so it reads
// like an out-of-focus photo behind the glass panels.

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function paintOffice(ctx: CanvasRenderingContext2D) {
  const R = rng(11);
  let g: CanvasGradient;
  ctx.fillStyle = "#E9E5DF";
  ctx.fillRect(0, 0, 1600, 1000);
  g = ctx.createLinearGradient(0, 90, 0, 640);
  g.addColorStop(0, "#BCD0E4");
  g.addColorStop(0.55, "#DCE5EE");
  g.addColorStop(1, "#F3EDE4");
  ctx.fillStyle = g;
  ctx.fillRect(0, 90, 1600, 550);
  g = ctx.createRadialGradient(1150, 500, 20, 1150, 500, 560);
  g.addColorStop(0, "rgba(255,247,230,.95)");
  g.addColorStop(1, "rgba(255,247,230,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 90, 1600, 550);
  for (let x = -20; x < 1620; ) {
    const w = 40 + R() * 80;
    const h = 110 + R() * 230;
    ctx.fillStyle = `rgba(${(168 + R() * 20) | 0},${(184 + R() * 16) | 0},${(202 + R() * 14) | 0},.85)`;
    ctx.fillRect(x, 600 - h, w, h);
    x += w + 4 + R() * 10;
  }
  for (let x = -40; x < 1640; ) {
    const w = 70 + R() * 120;
    const h = 60 + R() * 200;
    ctx.fillStyle = `rgba(${(142 + R() * 24) | 0},${(158 + R() * 20) | 0},${(178 + R() * 18) | 0},.9)`;
    ctx.fillRect(x, 622 - h, w, h);
    ctx.fillStyle = "rgba(232,239,246,.35)";
    for (let yy = 622 - h + 10; yy < 612; yy += 14) ctx.fillRect(x + 6, yy, w - 12, 4);
    x += w + 6 + R() * 16;
  }
  ctx.fillStyle = "#E7E3DC";
  ctx.fillRect(0, 0, 1600, 92);
  ctx.save();
  ctx.shadowColor = "rgba(255,244,214,.95)";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#FFFDF7";
  rr(ctx, 180, 40, 520, 12, 6);
  rr(ctx, 900, 40, 520, 12, 6);
  ctx.restore();
  ctx.fillStyle = "#3B424C";
  ctx.fillRect(0, 86, 1600, 10);
  ctx.fillRect(0, 252, 1600, 7);
  for (let x = 110; x < 1600; x += 236) ctx.fillRect(x, 90, 13, 550);
  ctx.fillStyle = "#4A515B";
  ctx.fillRect(0, 628, 1600, 18);
  ctx.fillStyle = "rgba(255,250,238,.16)";
  ctx.beginPath();
  ctx.moveTo(860, 96);
  ctx.lineTo(1240, 96);
  ctx.lineTo(1560, 1000);
  ctx.lineTo(980, 1000);
  ctx.fill();
  g = ctx.createLinearGradient(0, 646, 0, 1000);
  g.addColorStop(0, "#DDD3C5");
  g.addColorStop(1, "#C9BBA7");
  ctx.fillStyle = g;
  ctx.fillRect(0, 646, 1600, 354);
  ctx.fillStyle = "rgba(255,255,255,.18)";
  ctx.fillRect(0, 646, 1600, 40);
  ctx.fillStyle = "#E3D3BC";
  ctx.fillRect(28, 150, 300, 640);
  ctx.fillStyle = "#CDB898";
  for (let y = 150; y <= 790; y += 128) ctx.fillRect(28, y, 300, 10);
  ctx.fillRect(28, 150, 10, 640);
  ctx.fillRect(318, 150, 10, 640);
  const books = ["#7C8B76", "#2F3E55", "#B5735A", "#D3A84E", "#8C9098", "#EDE6D8", "#5B6F8A", "#A9B7A2"];
  for (let s = 0; s < 4; s++) {
    let x = 46;
    const base = 150 + 128 * (s + 1);
    while (x < 300) {
      const w = 12 + R() * 16;
      const h = 64 + R() * 46;
      if (R() < 0.18) {
        x += 24;
        continue;
      }
      ctx.fillStyle = books[(R() * books.length) | 0];
      ctx.fillRect(x, base - h, w, h);
      x += w + 2;
    }
  }
  for (const x of [820, 1060]) {
    ctx.fillStyle = "#2F353D";
    ctx.fillRect(x - 1, 92, 2, 140);
    ctx.beginPath();
    ctx.ellipse(x, 236, 46, 24, 0, Math.PI, 0);
    ctx.fill();
    const lg = ctx.createRadialGradient(x, 246, 4, x, 246, 170);
    lg.addColorStop(0, "rgba(255,226,170,.75)");
    lg.addColorStop(1, "rgba(255,226,170,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(x - 180, 236, 360, 260);
  }
  ctx.fillStyle = "rgba(40,30,20,.10)";
  ctx.beginPath();
  ctx.ellipse(900, 900, 560, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, c] of [
    [600, "#8DA8C8"],
    [860, "#A6BDD6"],
  ] as const) {
    ctx.fillStyle = "#2A2F38";
    rr(ctx, x, 548, 220, 136, 8);
    const sg = ctx.createLinearGradient(0, 556, 0, 676);
    sg.addColorStop(0, c);
    sg.addColorStop(1, "#DDE6EF");
    ctx.fillStyle = sg;
    rr(ctx, x + 8, 556, 204, 120, 4);
    ctx.fillStyle = "#2A2F38";
    ctx.fillRect(x + 104, 684, 12, 22);
    rr(ctx, x + 76, 700, 68, 8, 4);
  }
  ctx.fillStyle = "#3A4049";
  ctx.beginPath();
  ctx.moveTo(1130, 612);
  ctx.lineTo(1262, 612);
  ctx.lineTo(1252, 700);
  ctx.lineTo(1140, 700);
  ctx.fill();
  ctx.fillStyle = "#C3C7CD";
  rr(ctx, 1118, 698, 158, 8, 3);
  ctx.fillStyle = "#F5F2ED";
  rr(ctx, 1300, 664, 30, 40, 6);
  ctx.strokeStyle = "#F5F2ED";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(1334, 682, 9, -1.2, 1.2);
  ctx.stroke();
  ctx.strokeStyle = "#2F353D";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(500, 704);
  ctx.lineTo(520, 600);
  ctx.lineTo(580, 560);
  ctx.stroke();
  ctx.fillStyle = "#2F353D";
  ctx.beginPath();
  ctx.ellipse(588, 566, 26, 14, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#C9A67B";
  ctx.fillRect(420, 704, 980, 26);
  ctx.fillStyle = "#B08D62";
  ctx.fillRect(420, 728, 980, 8);
  ctx.fillStyle = "#2E333A";
  ctx.fillRect(452, 736, 14, 220);
  ctx.fillRect(1356, 736, 14, 220);
  for (const x of [690, 1010]) {
    ctx.fillStyle = "#3A414B";
    rr(ctx, x, 736, 200, 210, 40);
    ctx.fillStyle = "#30363F";
    rr(ctx, x - 14, 900, 228, 60, 24);
  }
  ctx.fillStyle = "#ECE6DC";
  rr(ctx, 1442, 780, 120, 180, 14);
  const greens = ["#5E8A58", "#4D7A4A", "#739E68", "#3F6B42"];
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 2.2;
    const len = 160 + R() * 220;
    ctx.fillStyle = greens[i % 4];
    ctx.beginPath();
    ctx.ellipse(1502 + Math.cos(a) * len * 0.6, 784 + Math.sin(a) * len * 0.6, 26 + R() * 22, 64 + R() * 40, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#EDE7DD";
  rr(ctx, 230, 112, 50, 40, 8);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (R() - 0.5) * 1.8;
    ctx.fillStyle = greens[i % 4];
    ctx.beginPath();
    ctx.ellipse(255 + Math.cos(a) * 30, 112 + Math.sin(a) * 30, 9, 24, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function OfficeScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const k = 0.4;
      const w = Math.max(2, Math.ceil(window.innerWidth * k));
      const h = Math.max(2, Math.ceil(window.innerHeight * k));
      const off = document.createElement("canvas");
      off.width = w;
      off.height = h;
      const o = off.getContext("2d");
      const c = canvas.getContext("2d");
      if (!o || !c) return;
      const s = Math.max(w / 1600, h / 1000);
      o.setTransform(s, 0, 0, s, (w - 1600 * s) / 2, (h - 1000 * s) * 0.6);
      paintOffice(o);
      canvas.width = w;
      canvas.height = h;
      if ("filter" in c) {
        c.filter = `blur(${(9 * k).toFixed(1)}px)`;
      } else {
        canvas.classList.add("soft");
      }
      c.drawImage(off, 0, 0);
      canvas.classList.add("ready");
    };
    draw();
    let t: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(draw, 160);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <canvas id="scene" ref={ref} aria-hidden="true" />
      <div className="veil" aria-hidden="true" />
    </>
  );
}
