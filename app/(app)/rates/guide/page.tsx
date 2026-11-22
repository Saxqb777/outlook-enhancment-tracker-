import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import PrintButton from "@/components/PrintButton";
import { getViewer } from "@/lib/auth";
import { ratesAccess } from "@/lib/rates";
import { RATES_GUIDE } from "@/lib/rates-guide";

export const metadata: Metadata = { title: "How Rates works" };
export const dynamic = "force-dynamic";

export default async function RatesGuidePage() {
  const { me } = await getViewer();
  if (!ratesAccess(me).view) notFound();
  return (
    <div className="page-in rt-guide">
      <Link className="back no-print" href="/rates">
        <Icon name="back" size={15} />
        Rates
      </Link>
      <header className="ph">
        <div>
          <h1 className="h1">How Rates works</h1>
          <p className="lede">Everything in one page. Read it once; come back when you need a step.</p>
        </div>
        <PrintButton />
      </header>
      {RATES_GUIDE.map((g) => (
        <section className="panel" key={g.title}>
          <h2>{g.title}</h2>
          {g.kind === "p" && g.lines.map((x) => <p key={x} className="lede">{x}</p>)}
          {g.kind === "ul" && <ul>{g.lines.map((x) => <li key={x}>{x}</li>)}</ul>}
          {g.kind === "ol" && <ol>{g.lines.map((x) => <li key={x}>{x}</li>)}</ol>}
          {g.kind === "eg" && <p className="rt-eg">{g.lines.map((x) => <span key={x}>{x}<br /></span>)}</p>}
        </section>
      ))}
    </div>
  );
}
