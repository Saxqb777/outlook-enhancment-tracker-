"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { awardQuote, createEnquiry, importRates, removeQuote, saveFx, saveQuote, saveSupplier, sendRateForApproval, setNegotiated, updateEnquiry, type QuoteInput, type RequestInput } from "@/app/actions/rates";
import { Dialog, useAct } from "@/components/Approvals";
import { useAttach, useUploader } from "@/components/Attach";
import { Icon } from "@/components/Icon";
import { DocsTab, FeedbackBox, MonthBook, type DocV, type NoteV } from "@/components/RateExtras";
import { blankQuote, blankRequest, fromExtract, QuoteFields, RateDrop, RequestFields, useRateReader, type Hints } from "@/components/RateForms";
import { toast } from "@/components/work";
import type { Uploaded } from "@/lib/attach-rules";
import { basisText, chargeFor, CURRENCIES, fromAED, MODES, money, normEquip, placeMatch, quoteTotalAED, rtRef, SERVICE_SHORT, SERVICES, shipmentChargesAED, STATES, toAED, unitAllInAED, type Charge, type Equip, type Fx, type Mode, type QuoteState, type Service, type UnitRate } from "@/lib/rate-calc";

export type Req = {
  id: string; title: string; origin: string; origin_country: string; origin_port: string; destination: string; destination_country: string; destination_port: string;
  commodity: string; mode: Mode; service: Service; incoterm: string; equipment: Equip[]; notes: string; requested_on: string; status: "open" | "awarded" | "closed";
  awarded_quote_id: string | null; award_reason: string | null; pr_number: string | null; po_buffer_pct: number; approval_id: string | null;
};
export type Quo = {
  id: string; request_id: string; supplier_id: string; supplier: string; state: QuoteState; quoted_on: string; currency: string; rates: UnitRate[]; charges: Charge[];
  carrier: string; routing: string; transit: string; free_time: string; valid_until: string | null; remarks: string; exclusions: string; decline_reason: string; negotiated: boolean;
};
export type Sup = { id: string; name: string; contact: string; email: string; phone: string; notes: string; quotes: number; declined: number; awarded: number; last_on: string | null };
type Line = { key: string; q: Quo; r: Req; type: string; rate: number; aed: number; allIn: number; active: boolean; awarded: boolean };

const fmtDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "");
const aedText = (n: number) => `AED ${Math.round(n).toLocaleString("en-US")}`;
const route = (r: Req) => `${r.origin || r.origin_port || r.origin_country || "?"} → ${r.destination || r.destination_port || r.destination_country || "?"}`;
const toInput = (r: Req): RequestInput => ({ title: r.title, origin: r.origin, origin_country: r.origin_country, origin_port: r.origin_port, destination: r.destination, destination_country: r.destination_country, destination_port: r.destination_port, commodity: r.commodity, mode: r.mode, service: r.service, incoterm: r.incoterm, equipment: r.equipment, notes: r.notes, requested_on: r.requested_on });
const quoteInput = (x: Quo): QuoteInput => ({ supplier: x.supplier, state: x.state, quoted_on: x.quoted_on, currency: x.currency, rates: x.rates, charges: x.charges, carrier: x.carrier, routing: x.routing, transit: x.transit, free_time: x.free_time, valid_until: x.valid_until ?? "", remarks: x.remarks, exclusions: x.exclusions, decline_reason: x.decline_reason, negotiated: x.negotiated });

export function buildHints(reqs: Req[], quotes: Quo[], sups: Sup[], charges: [string, "container" | "shipment"][]): Hints {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  return {
    places: uniq(reqs.flatMap((r) => [r.origin, r.destination])),
    countries: uniq([...reqs.flatMap((r) => [r.origin_country, r.destination_country]), "UAE", "China", "India", "Saudi Arabia", "Oman", "Turkey", "Egypt", "Germany", "Netherlands", "USA"]),
    ports: uniq([...reqs.flatMap((r) => [r.origin_port, r.destination_port]), "Jebel Ali", "Khalifa Port", "Khor Fakkan", "Shanghai", "Ningbo", "Nhava Sheva", "Jeddah", "Sohar"]),
    commodities: uniq(reqs.map((r) => r.commodity)),
    suppliers: uniq(sups.map((s) => s.name)),
    carriers: uniq([...quotes.map((x) => x.carrier), "MSC", "Maersk", "CMA CGM", "Hapag-Lloyd", "COSCO", "ONE", "Evergreen"]),
    charges,
  };
}
const lastBySupplier = (quotes: Quo[]) => {
  const m: Record<string, Partial<QuoteInput>> = {};
  for (const x of [...quotes].sort((a, b) => a.quoted_on.localeCompare(b.quoted_on))) if (x.state === "quoted") m[x.supplier.toLowerCase()] = { carrier: x.carrier, transit: x.transit, free_time: x.free_time, currency: x.currency, charges: x.charges, exclusions: x.exclusions };
  return m;
};

// ------------------------------------------------------------------ editors

/** New enquiry, optionally with the first quote in the same box (what you get after dropping a supplier's file). */
function EnquiryEditor({ start, hints, today, last, onClose }: { start?: { request: RequestInput; quote: QuoteInput; file: Uploaded | null }; hints: Hints; today: string; last: Record<string, Partial<QuoteInput>>; onClose: () => void }) {
  const router = useRouter();
  const [req, setReq] = useState<RequestInput>(start?.request ?? blankRequest(today));
  const [withQuote, setWithQuote] = useState(!!start);
  const [quote, setQuote] = useState<QuoteInput>(start?.quote ?? blankQuote(today));
  const att = useAttach("rt");
  const [busy, go] = useTransition();
  const types = req.equipment.map((e) => normEquip(e.type)).filter(Boolean);
  const save = () =>
    go(async () => {
      const files = [...(start?.file ? [start.file] : []), ...att.uploaded];
      const r = await createEnquiry(req, withQuote ? quote : null, withQuote ? files : []);
      if (!r.ok) return toast(r.error);
      toast(withQuote ? "Saved. The quote is in the rate book." : "Enquiry saved. Add quotes as they come in.");
      onClose();
      router.push(`/rates/${r.id}`);
    });
  return (
    <Dialog title={start ? "Check what the AI read, then save" : "New enquiry"} onClose={onClose} wide>
      {start && <p className="hint">Everything below came from the file. Fix anything that looks wrong; nothing is saved until you press Save.{start.file ? ` The file "${start.file.name}" will be kept with the quote.` : ""}</p>}
      <h3 className="rt-h">The shipment</h3>
      <RequestFields v={req} set={setReq} hints={hints} />
      {withQuote ? (
        <>
          <h3 className="rt-h">The supplier&apos;s quote</h3>
          <QuoteFields v={quote} set={setQuote} hints={hints} types={types} att={att} last={last} />
        </>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setWithQuote(true)}>
          <Icon name="plus" size={14} />
          Add the first quote now
        </button>
      )}
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || att.busy || (!req.origin.trim() && !req.destination.trim())} onClick={save}>
          {att.busy ? "Uploading…" : busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Dialog>
  );
}

function QuoteEditor({ requestId, types, start, replaceId, file, hints, last, onClose }: { requestId: string; types: string[]; start: QuoteInput; replaceId?: string; file?: Uploaded | null; hints: Hints; last: Record<string, Partial<QuoteInput>>; onClose: () => void }) {
  const [quote, setQuote] = useState<QuoteInput>(start);
  const att = useAttach("rt");
  const { busy, act } = useAct();
  return (
    <Dialog title={replaceId ? `Correct ${start.supplier}'s quote` : "Add a quote"} onClose={onClose} wide>
      {replaceId && <p className="hint">The version you are replacing stays in the history. Nothing is overwritten.</p>}
      {file && <p className="hint">Read from &ldquo;{file.name}&rdquo;, which will be kept with the quote. Check it, then save.</p>}
      <QuoteFields v={quote} set={setQuote} hints={hints} types={types} att={att} last={last} />
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || att.busy || !quote.supplier.trim()} onClick={() => act(() => saveQuote(requestId, quote, [...(file ? [file] : []), ...att.uploaded], replaceId ?? null), replaceId ? "Quote corrected." : "Quote added.", onClose)}>
          {att.busy ? "Uploading…" : "Save quote"}
        </button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ the rate book home: search, dashboard, enquiries, suppliers

export function RatesHome({ reqs, quotes, sups, fx, charges, manage, today, initial, docs, notes, canNote }: { reqs: Req[]; quotes: Quo[]; sups: Sup[]; fx: Fx; charges: [string, "container" | "shipment"][]; manage: boolean; today: string; initial?: { from?: string; to?: string; supplier?: string }; docs: DocV[]; notes: NoteV[]; canNote: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "enquiries" | "suppliers" | "documents">("overview");
  const [month, setMonth] = useState("");
  const [fb, setFb] = useState(false);
  const [from, setFrom] = useState(initial?.from ?? "");
  const [to, setTo] = useState(initial?.to ?? "");
  const [service, setService] = useState<"" | Service>("");
  const [mode, setMode] = useState<"" | Mode>("");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [commodity, setCommodity] = useState("");
  const [type, setType] = useState("");
  const [since, setSince] = useState("");
  const [validOnly, setValidOnly] = useState(false);
  const [editor, setEditor] = useState<null | { start?: { request: RequestInput; quote: QuoteInput; file: Uploaded | null } }>(null);
  const [dlg, setDlg] = useState<null | "import" | "fx" | { sup: Sup | null }>(null);
  const reader = useRateReader();
  const hints = useMemo(() => buildHints(reqs, quotes, sups, charges), [reqs, quotes, sups, charges]);
  const last = useMemo(() => lastBySupplier(quotes), [quotes]);
  const byId = useMemo(() => new Map(reqs.map((r) => [r.id, r])), [reqs]);

  // One line per quote per container type: that is what gets searched and compared.
  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    for (const q of quotes) {
      const r = byId.get(q.request_id);
      if (!r || q.state !== "quoted") continue;
      for (const u of q.rates) {
        const all = unitAllInAED(q, u.type, r.equipment, fx);
        out.push({ key: `${q.id}:${u.type}`, q, r, type: normEquip(u.type), rate: u.rate, aed: toAED(u.rate, q.currency, fx), allIn: all ?? toAED(u.rate, q.currency, fx), active: !q.valid_until || q.valid_until >= today, awarded: r.awarded_quote_id === q.id });
      }
    }
    return out;
  }, [quotes, byId, fx, today]);

  const searching = !!(from.trim() || to.trim() || service || mode || supplier || commodity.trim() || since || month || validOnly);
  const basic = (r: Req) => (!service || r.service === service) && (!mode || r.mode === mode) && (!commodity.trim() || r.commodity.toLowerCase().includes(commodity.trim().toLowerCase()));
  const rest = (l: Line) => basic(l.r) && (!supplier || l.q.supplier === supplier) && (!validOnly || l.active);
  const inDates = (l: Line) => (!since || l.q.quoted_on >= since) && (!month || l.q.quoted_on.startsWith(month));
  const ends = (r: Req) => placeMatch(from, r.origin, r.origin_port, r.origin_country) && placeMatch(to, r.destination, r.destination_port, r.destination_country);
  // One box filled and nothing that way round: look for the place at either end, so "Auckland" typed under From still finds it.
  const single = from.trim() && !to.trim() ? from : to.trim() && !from.trim() ? to : "";
  const eitherEnd = (r: Req) => !!single && placeMatch(single, r.origin, r.origin_port, r.origin_country, r.destination, r.destination_port, r.destination_country);
  const direct = lines.filter((l) => rest(l) && ends(l.r));
  const flipped = !direct.length && !!single && lines.some((l) => rest(l) && eitherEnd(l.r));
  const place = (r: Req) => (flipped ? eitherEnd(r) : ends(r));
  const exactAll = flipped ? lines.filter((l) => rest(l) && eitherEnd(l.r)) : direct;
  // Nothing on that exact route: fall back to the same country on each end. A place we have never seen
  // doesn't narrow the search, so there is still something to go on.
  const cFrom = lines.find((x) => from.trim() && placeMatch(from, x.r.origin, x.r.origin_port, x.r.origin_country))?.r.origin_country;
  const cTo = lines.find((x) => to.trim() && placeMatch(to, x.r.destination, x.r.destination_port, x.r.destination_country))?.r.destination_country;
  const similarAll = !exactAll.length && (cFrom || cTo) ? lines.filter((l) => rest(l) && (!cFrom || l.r.origin_country === cFrom) && (!cTo || l.r.destination_country === cTo)) : [];
  // Every date (for the month-by-month book), and the ones inside the dates asked for (for the answer and the list).
  const poolAll = exactAll.length ? exactAll : similarAll;
  const exact = exactAll.filter(inDates);
  const similar = similarAll.filter(inDates);
  // Enquiries on this route that have no price yet: they must still be findable.
  const quotedReq = new Set(lines.map((l) => l.r.id));
  const waiting = reqs.filter((r) => !quotedReq.has(r.id));
  const waitingHere = searching ? waiting.filter((r) => basic(r) && (place(r) || ends(r) || eitherEnd(r))) : [];
  const pool = exact.length ? exact : similar;
  const types = [...new Map(poolAll.map((l) => [l.type, poolAll.filter((x) => x.type === l.type).length])).entries()].sort((a, b) => b[1] - a[1]);
  const curType = types.some(([t]) => t === type) ? type : (types[0]?.[0] ?? "");
  const shown = pool.filter((l) => !curType || l.type === curType).sort((a, b) => b.q.quoted_on.localeCompare(a.q.quoted_on) || a.allIn - b.allIn);
  const book = poolAll.filter((l) => !curType || l.type === curType);
  const lowest = [...shown].sort((a, b) => a.allIn - b.allIn)[0];
  const latest = shown[0];
  const agreed = shown.find((l) => l.awarded || l.q.negotiated);
  const highest = [...shown].sort((a, b) => b.allIn - a.allIn)[0];
  const perSupplier = [...new Map(shown.map((l) => [l.q.supplier, l])).keys()].map((name) => {
    const ls = shown.filter((l) => l.q.supplier === name);
    return { name, latest: ls[0], lowest: [...ls].sort((a, b) => a.allIn - b.allIn)[0], n: ls.length };
  }).sort((a, b) => a.latest.allIn - b.latest.allIn);
  const usd = (aed: number) => `USD ${Math.round(fromAED(aed, "USD", fx)).toLocaleString("en-US")}`;

  const onFile = async (f: File) => {
    const r = await reader.read(f);
    if (r) setEditor({ start: { ...fromExtract(r.data, today), file: r.file } });
  };
  const exportShown = async (keys: string[]) => {
    const res = await fetch("/rates/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys, title: [from, to].filter(Boolean).join(" to ") }) });
    if (!res.ok) return toast("The export didn't work. Try again.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = `Freight rates ${today}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const clear = () => (setFrom(""), setTo(""), setService(""), setMode(""), setSupplier(""), setCommodity(""), setSince(""), setMonth(""), setValidOnly(false), setType(""));

  const activeQ = quotes.filter((q) => q.state === "quoted" && (!q.valid_until || q.valid_until >= today));
  const soon = quotes.filter((q) => q.state === "quoted" && q.valid_until && q.valid_until >= today && q.valid_until <= new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10));
  const best = [...new Map(lines.filter((l) => l.active).sort((a, b) => a.allIn - b.allIn).map((l) => [`${route(l.r)}|${l.type}|${l.r.service}`.toLowerCase(), l])).values()].slice(0, 8);

  return (
    <>
      <div className="rt-helpbar no-print">
        <Link className="btn btn-sm btn-ghost" href="/rates/guide">
          <Icon name="help" size={14} />
          How Rates works
        </Link>
        <button type="button" className="btn btn-sm" onClick={() => setFb(true)} data-tour="rt-feedback">
          <Icon name="chat" size={14} />
          {canNote ? "Something not right? Tell us" : "Feedback notes"}
          {notes.some((n) => n.status !== "done") && <span className="n">{notes.filter((n) => n.status !== "done").length}</span>}
        </button>
      </div>
      <section className="panel rt-search" aria-label="Find a rate">
        <datalist id="rt-places-s">{hints.places.concat(hints.ports, hints.countries).filter((x, i, a) => a.indexOf(x) === i).map((x) => <option key={x} value={x} />)}</datalist>
        <div className="rt-search-row">
          <label className="rt-big">
            <span>From</span>
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="City, port or country" list="rt-places-s" autoComplete="off" autoFocus data-tour="rt-from" />
          </label>
          <button type="button" className="icon-btn rt-swap" aria-label="Swap From and To" title="Swap" onClick={() => (setFrom(to), setTo(from))}>
            ⇄
          </button>
          <label className="rt-big">
            <span>To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="City, port or country" list="rt-places-s" autoComplete="off" />
          </label>
        </div>
        <div className="rt-filters">
          <div className="chips" role="group" aria-label="Service type">
            <button type="button" className="chip all" aria-pressed={!service} onClick={() => setService("")}>Any service</button>
            {(Object.keys(SERVICES) as Service[]).map((s) => (
              <button key={s} type="button" className="chip all" aria-pressed={service === s} onClick={() => setService(service === s ? "" : s)} title={SERVICES[s]}>
                {SERVICES[s]}
              </button>
            ))}
          </div>
          <div className="rt-filter-row">
            <select className="inp" value={mode} onChange={(e) => setMode(e.target.value as Mode | "")} aria-label="Transport mode">
              <option value="">Any mode</option>
              {(Object.keys(MODES) as Mode[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}
            </select>
            <select className="inp" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
              <option value="">Any supplier</option>
              {sups.map((s) => <option key={s.id}>{s.name}</option>)}
            </select>
            <input className="inp" value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="Commodity" aria-label="Commodity" list="rt-commodities-s" autoComplete="off" />
            <datalist id="rt-commodities-s">{hints.commodities.map((x) => <option key={x} value={x} />)}</datalist>
            <label className="rt-since">
              <span>Quoted since</span>
              <input type="date" className="inp inp-date" value={since} onChange={(e) => setSince(e.target.value)} />
            </label>
            <label className="rt-since">
              <span>Only the month</span>
              <input type="month" className="inp inp-date" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Only quotes from this month" />
            </label>
            <label className="ap-check">
              <input type="checkbox" checked={validOnly} onChange={(e) => setValidOnly(e.target.checked)} />
              Valid today only
            </label>
            {searching && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={clear}>
                Clear
              </button>
            )}
          </div>
        </div>
      </section>

      {searching ? (
        <>
          {waitingHere.length > 0 && (
            <section className="panel" aria-label="Enquiries with no quote yet">
              <div className="panel-h">
                <h2>Saved, but no quote yet <span className="count">{waitingHere.length}</span></h2>
                <span className="small muted">Open one to add the supplier&apos;s price. It then shows in the rates below.</span>
              </div>
              <div className="list">
                {waitingHere.map((r) => (
                  <Link key={r.id} className="aprow rqrow" href={`/rates/${r.id}`}>
                    <span className="cid">{rtRef(r.id)}</span>
                    <span className="ap-main">
                      <span className="ap-title">{r.title}</span>
                      <span className="ap-sub"><span>{fmtDate(r.requested_on)}</span><span>{route(r)}</span><span>{SERVICE_SHORT[r.service]}</span></span>
                    </span>
                    <span className="ap-end"><span className="ap-st rq-open">No quote yet</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {!poolAll.length ? (
            !waitingHere.length && (
              <section className="panel">
                <p className="empty">No rates on record for that yet. {manage ? "When a quote comes in, drop the supplier's email on the Rates page or press New enquiry." : ""}</p>
              </section>
            )
          ) : !pool.length ? (
            <>
              <section className="panel">
                <p className="empty">No quotes in {month ? "that month" : "those dates"} for this route. The months that do have quotes are below.</p>
              </section>
              <MonthBook lines={book.map((l) => ({ key: l.key, date: l.q.quoted_on, supplier: l.q.supplier, allIn: l.allIn, freight: money(l.rate, l.q.currency), agreed: l.awarded || l.q.negotiated }))} type={curType} usd={usd} onMonth={setMonth} />
            </>
          ) : (
            <>
              {flipped && <p className="rt-note">Nothing {from.trim() ? "from" : "to"} &ldquo;{single.trim()}&rdquo; that way round. Showing every route that has it at either end.</p>}
              {!exactAll.length && <p className="rt-note">Nothing on that exact route yet. These are the closest on record{cFrom && cTo ? `: ${cFrom} to ${cTo}` : cTo ? `: anything going to ${cTo}` : `: anything from ${cFrom}`}.</p>}
              {types.length > 1 && (
                <div className="chips" role="group" aria-label="Container or truck type">
                  {types.map(([t, n]) => (
                    <button key={t} type="button" className="chip all" aria-pressed={curType === t} onClick={() => setType(t)}>
                      {t} <span className="chip-r">{n}</span>
                    </button>
                  ))}
                </div>
              )}
              <section className="stats rt-answer" aria-label="The answer">
                <div className="stat attn">
                  <span className="lab">Lowest, all in{curType ? ` · one ${curType}` : ""}</span>
                  <span className="val">{aedText(lowest.allIn)}</span>
                  <span className="ctx">{lowest.q.supplier} · {fmtDate(lowest.q.quoted_on)} · freight {money(lowest.rate, lowest.q.currency)}{lowest.allIn > lowest.aed + 1 ? ` + charges ${aedText(lowest.allIn - lowest.aed)}` : ""}</span>
                </div>
                <div className="stat">
                  <span className="lab">Latest, all in</span>
                  <span className="val">{aedText(latest.allIn)}</span>
                  <span className="ctx">{latest.q.supplier} · {fmtDate(latest.q.quoted_on)} · {latest.active ? "still valid" : "expired"} · freight {money(latest.rate, latest.q.currency)}</span>
                </div>
                <div className="stat">
                  <span className="lab">Last agreed, all in</span>
                  <span className="val">{agreed ? aedText(agreed.allIn) : "None yet"}</span>
                  <span className="ctx">{agreed ? `${agreed.q.supplier} · ${fmtDate(agreed.q.quoted_on)} · ${agreed.awarded ? "awarded" : "negotiated"}` : "No awarded or negotiated rate on this route"}</span>
                </div>
                <div className="stat">
                  <span className="lab">Between suppliers</span>
                  <span className="val">{perSupplier.length > 1 ? aedText(highest.allIn - lowest.allIn) : "1 supplier"}</span>
                  <span className="ctx">{perSupplier.length > 1 ? `${Math.round(((highest.allIn - lowest.allIn) / (lowest.allIn || 1)) * 100)}% from lowest to highest, ${perSupplier.length} suppliers` : "Only one supplier has quoted this"}</span>
                </div>
              </section>
              <p className="rt-foot rt-allin">All in = the freight for one {curType || "container"} plus the charges that belong to it. Charges made once per shipment (documents, telex release) are shown on the enquiry, not spread in here.</p>
              <MonthBook lines={book.map((l) => ({ key: l.key, date: l.q.quoted_on, supplier: l.q.supplier, allIn: l.allIn, freight: money(l.rate, l.q.currency), agreed: l.awarded || l.q.negotiated }))} type={curType} usd={usd} onMonth={setMonth} />
              <div className="rt-two-col">
                <section className="panel" aria-label="Suppliers compared">
                  <div className="panel-h">
                    <h2>Suppliers compared <span className="count">{perSupplier.length}</span></h2>
                    <span className="small muted">Latest rate each, all in, per {curType || "unit"}</span>
                  </div>
                  <div className="rt-bars">
                    {perSupplier.map((s) => (
                      <div key={s.name} className="rt-bar-row">
                        <b>{s.name}</b>
                        <span className="rt-bar-v">{aedText(s.latest.allIn)}</span>
                        <span className="rt-bar"><i style={{ width: `${Math.max(6, (s.latest.allIn / (perSupplier[perSupplier.length - 1].latest.allIn || 1)) * 100)}%` }} className={s.latest.allIn === perSupplier[0].latest.allIn ? "best" : ""} /></span>
                        <span className="small muted">{s.latest.allIn === perSupplier[0].latest.allIn ? "lowest" : `+${aedText(s.latest.allIn - perSupplier[0].latest.allIn)} (+${Math.round(((s.latest.allIn - perSupplier[0].latest.allIn) / (perSupplier[0].latest.allIn || 1)) * 100)}%)`} · {s.n} quote{s.n === 1 ? "" : "s"}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel" aria-label="Price history">
                  <div className="panel-h">
                    <h2>Price history</h2>
                    <span className="small muted">All in, AED, oldest to newest</span>
                  </div>
                  <History lines={[...shown].reverse()} />
                </section>
              </div>
              <section className="panel" aria-label="Matching quotations">
                <div className="panel-h">
                  <h2>All matching quotations <span className="count">{shown.length}</span></h2>
                  <button type="button" className="btn btn-sm" onClick={() => exportShown(shown.map((l) => l.key))}>
                    <Icon name="download" size={14} />
                    Export these to Excel
                  </button>
                </div>
                <LineTable lines={shown} lowestKey={lowest.key} latestKey={latest.key} usd={usd} />
              </section>
            </>
          )}
        </>
      ) : (
        <>
          {manage && <RateDrop onFile={onFile} busy={reader.busy} label="Drop a supplier's quotation here" />}
          <div className="filters">
            <div className="seg" role="group" aria-label="Show">
              <button type="button" aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
              <button type="button" aria-pressed={tab === "enquiries"} onClick={() => setTab("enquiries")}>Enquiries<span className="n">{reqs.length}</span></button>
              <button type="button" aria-pressed={tab === "suppliers"} onClick={() => setTab("suppliers")}>Suppliers<span className="n">{sups.length}</span></button>
              <button type="button" aria-pressed={tab === "documents"} onClick={() => setTab("documents")} data-tour="rt-docs">Documents<span className="n">{docs.length}</span></button>
            </div>
            <span className="sp" />
            {manage && (
              <>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDlg("fx")}>Exchange rates</button>
                <button type="button" className="btn btn-sm" onClick={() => setDlg("import")}>
                  <Icon name="upload" size={14} />
                  Import from Excel
                </button>
              </>
            )}
            <button type="button" className="btn btn-sm" onClick={() => exportShown(lines.map((l) => l.key))} disabled={!lines.length}>
              <Icon name="download" size={14} />
              Export all
            </button>
            {manage && (
              <button type="button" className="btn btn-sm btn-primary" data-key="n" onClick={() => setEditor({})}>
                <Icon name="plus" size={14} />
                New enquiry
                <kbd className="kbd">N</kbd>
              </button>
            )}
          </div>

          {tab === "overview" && (
            <>
              <section className="stats" aria-label="Rate book">
                <div className="stat"><span className="lab">Quotations recorded</span><span className="val">{quotes.filter((q) => q.state === "quoted").length}</span><span className="ctx">across {reqs.length} enquir{reqs.length === 1 ? "y" : "ies"}</span></div>
                <div className="stat attn"><span className="lab">Active</span><span className="val">{activeQ.length}</span><span className="ctx">valid today</span></div>
                <div className={`stat${soon.length ? " bad" : ""}`}><span className="lab">Expiring this week</span><span className="val">{soon.length}</span><span className="ctx">{quotes.filter((q) => q.state === "quoted" && q.valid_until && q.valid_until < today).length} already expired</span></div>
                <div className="stat"><span className="lab">Suppliers</span><span className="val">{sups.length}</span><span className="ctx">{quotes.filter((q) => q.state === "declined").length} declines on record</span></div>
              </section>
              {waiting.length > 0 && (
                <section className="panel" aria-label="Waiting for quotes">
                  <div className="panel-h">
                    <h2>Waiting for a quote <span className="count">{waiting.length}</span></h2>
                    <span className="small muted">Saved enquiries with no price yet. They show in the search once a quote is added.</span>
                  </div>
                  <div className="list">
                    {waiting.slice(0, 8).map((r) => (
                      <Link key={r.id} className="aprow rqrow" href={`/rates/${r.id}`}>
                        <span className="cid">{rtRef(r.id)}</span>
                        <span className="ap-main">
                          <span className="ap-title">{r.title}</span>
                          <span className="ap-sub"><span>{fmtDate(r.requested_on)}</span><span>{route(r)}</span></span>
                        </span>
                        <span className="ap-end"><span className="ap-st rq-open">{manage ? "Add a quote" : "No quote yet"}</span></span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              <div className="rt-two-col">
                <section className="panel" aria-label="Best available rates">
                  <div className="panel-h"><h2>Best available rates</h2><span className="small muted">Lowest valid all-in rate per route, one container</span></div>
                  <div className="list">
                    {best.map((l) => (
                      <button key={l.key} type="button" className="aprow rt-best" onClick={() => (setFrom(l.r.origin || l.r.origin_port), setTo(l.r.destination || l.r.destination_port), setType(l.type))}>
                        <span className="ap-main">
                          <span className="ap-title">{route(l.r)}</span>
                          <span className="ap-sub"><span>{l.type}</span><span>{SERVICE_SHORT[l.r.service]}</span><span>{l.q.supplier}</span></span>
                        </span>
                        <span className="rq-best" title={`Freight ${money(l.rate, l.q.currency)}`}>{aedText(l.allIn)}</span>
                      </button>
                    ))}
                    {!best.length && <p className="empty">Rates will show here once quotes are added.</p>}
                  </div>
                </section>
                <section className="panel" aria-label="Recent quotations">
                  <div className="panel-h"><h2>Recent quotations</h2></div>
                  <div className="list">
                    {quotes.slice(0, 8).map((q) => {
                      const r = byId.get(q.request_id);
                      return r ? (
                        <Link key={q.id} className="aprow rt-best" href={`/rates/${r.id}`}>
                          <span className="ap-main">
                            <span className="ap-title">{q.supplier}</span>
                            <span className="ap-sub"><span>{fmtDate(q.quoted_on)}</span><span>{route(r)}</span></span>
                          </span>
                          <span className="rq-best">{q.state === "quoted" ? q.rates.map((u) => `${u.type} ${money(u.rate, q.currency)}`).join(" · ") : STATES[q.state]}</span>
                        </Link>
                      ) : null;
                    })}
                    {!quotes.length && <p className="empty">{manage ? "No quotes yet. Drop a supplier's email above to add the first one." : "No quotes yet."}</p>}
                  </div>
                </section>
              </div>
            </>
          )}
          {tab === "enquiries" && (
            <section className="panel" aria-label="Enquiries">
              <div className="list">
                {reqs.map((r) => {
                  const qs = quotes.filter((q) => q.request_id === r.id);
                  const won = qs.find((q) => q.id === r.awarded_quote_id);
                  return (
                    <Link key={r.id} className="aprow rqrow" href={`/rates/${r.id}`}>
                      <span className="cid">{rtRef(r.id)}</span>
                      <span className="ap-main">
                        <span className="ap-title">{r.title}</span>
                        <span className="ap-sub"><span>{fmtDate(r.requested_on)}</span><span>{route(r)}</span><span>{SERVICE_SHORT[r.service]}</span></span>
                      </span>
                      <span className="ap-prog small">{qs.filter((q) => q.state === "quoted").length} quoted{qs.some((q) => q.state !== "quoted") ? ` · ${qs.filter((q) => q.state !== "quoted").length} no` : ""}</span>
                      <span className="rq-best">{won ? won.supplier : ""}</span>
                      <span className="ap-end"><span className={`ap-st ${r.status === "awarded" ? "signed" : "rq-open"}`}>{r.status === "awarded" ? "Awarded" : "Open"}</span></span>
                    </Link>
                  );
                })}
                {!reqs.length && <p className="empty">No enquiries yet.</p>}
              </div>
            </section>
          )}
          {tab === "suppliers" && (
            <section className="panel" aria-label="Suppliers">
              <div className="panel-h">
                <h2>Supplier history</h2>
                {manage && <button type="button" className="btn btn-sm" onClick={() => setDlg({ sup: null })}><Icon name="plus" size={14} />Add supplier</button>}
              </div>
              <div className="list">
                {sups.map((s) => (
                  <div key={s.id} className="aprow vnrow rt-sup">
                    <span className="ap-main">
                      <span className="ap-title">{s.name}</span>
                      <span className="ap-sub">{s.contact && <span>{s.contact}</span>}{s.email && <span>{s.email}</span>}{s.phone && <span>{s.phone}</span>}</span>
                    </span>
                    <span className="ap-prog small">{s.quotes} quote{s.quotes === 1 ? "" : "s"}</span>
                    <span className="ap-prog small">{s.awarded} awarded · {s.declined} declined</span>
                    <span className="ap-prog small">{s.last_on ? `last ${fmtDate(s.last_on)}` : "no quotes yet"}</span>
                    <span className="ap-end">
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => (setSupplier(s.name), setTab("overview"))}>See rates</button>
                      {manage && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDlg({ sup: s })}>Edit</button>}
                    </span>
                  </div>
                ))}
                {!sups.length && <p className="empty">Suppliers are added by themselves when you save their first quote.</p>}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "documents" && !searching && <DocsTab docs={docs} manage={manage} />}
      {fb && <FeedbackBox notes={notes} canWrite={canNote} page="/rates" onClose={() => setFb(false)} />}
      {editor && <EnquiryEditor start={editor.start} hints={hints} today={today} last={last} onClose={() => setEditor(null)} />}
      {dlg === "import" && <ImportDialog onClose={() => (setDlg(null), router.refresh())} />}
      {dlg === "fx" && <FxDialog fx={fx} onClose={() => setDlg(null)} />}
      {dlg && typeof dlg === "object" && <SupplierDialog sup={dlg.sup} onClose={() => setDlg(null)} />}
    </>
  );
}

function LineTable({ lines, lowestKey, latestKey, usd }: { lines: Line[]; lowestKey?: string; latestKey?: string; usd: (aed: number) => string }) {
  return (
    <div className="rt-table-wrap">
      <table className="rt-table">
        <thead>
          <tr><th>Date</th><th>Supplier</th><th>Route</th><th>Commodity</th><th>Service</th><th>Type</th><th className="r">Rate</th><th className="r">All in (AED)</th><th>Transit</th><th>Validity</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className={l.key === lowestKey ? "best" : ""}>
              <td>{fmtDate(l.q.quoted_on)}</td>
              <td>
                <Link href={`/rates/${l.r.id}`}><b>{l.q.supplier}</b></Link>
                {l.key === lowestKey && <span className="rq-tag">Lowest</span>}
                {l.key === latestKey && <span className="rq-tag fast">Latest</span>}
                {l.awarded ? <span className="rq-tag">Awarded</span> : l.q.negotiated ? <span className="rq-tag fast">Negotiated</span> : null}
              </td>
              <td>{route(l.r)}</td>
              <td>{l.r.commodity}</td>
              <td title={SERVICES[l.r.service]}>{SERVICE_SHORT[l.r.service]}</td>
              <td>{l.type}</td>
              <td className="r"><b>{money(l.rate, l.q.currency)}</b></td>
              <td className="r" title={usd(l.allIn)}>{Math.round(l.allIn).toLocaleString("en-US")}</td>
              <td>{l.q.transit}</td>
              <td><span className={`ap-st ${l.active ? "signed" : "cancelled"}`}>{l.q.valid_until ? `${l.active ? "Until" : "Expired"} ${fmtDate(l.q.valid_until)}` : "No end date"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A small chart of the rate over time: one dot per quote, the line follows them, the lowest is marked. */
function History({ lines }: { lines: Line[] }) {
  if (lines.length < 2) return <p className="empty">The chart appears when there are two or more quotes to compare.</p>;
  const W = 520, H = 170, P = 26;
  const vals = lines.map((l) => l.allIn);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i: number) => P + (i * (W - 2 * P)) / (lines.length - 1);
  const y = (v: number) => (max === min ? H / 2 : H - P - ((v - min) * (H - 2 * P)) / (max - min));
  return (
    <div className="rt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rate history: from ${aedText(vals[0])} to ${aedText(vals[vals.length - 1])}, lowest ${aedText(min)}, highest ${aedText(max)}`}>
        <line x1={P} x2={W - P} y1={y(min)} y2={y(min)} className="rt-grid" />
        <line x1={P} x2={W - P} y1={y(max)} y2={y(max)} className="rt-grid" />
        <polyline points={lines.map((l, i) => `${x(i)},${y(l.allIn)}`).join(" ")} className="rt-line" />
        {lines.map((l, i) => (
          <circle key={l.key} cx={x(i)} cy={y(l.allIn)} r={l.allIn === min ? 5 : 3.5} className={l.allIn === min ? "rt-dot best" : "rt-dot"}>
            <title>{`${fmtDate(l.q.quoted_on)} · ${l.q.supplier} · ${aedText(l.allIn)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="rt-chart-f">
        <span>{fmtDate(lines[0].q.quoted_on)}</span>
        <span>Low {aedText(min)} · High {aedText(max)}</span>
        <span>{fmtDate(lines[lines.length - 1].q.quoted_on)}</span>
      </div>
    </div>
  );
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const upload = useUploader("rt");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const run = async (f: File) => {
    setBusy(true);
    try {
      const r = await importRates(await upload(f));
      if (!r.ok) toast(r.error);
      else setDone(`${r.quotes} quote${r.quotes === 1 ? "" : "s"} added in ${r.enquiries} enquir${r.enquiries === 1 ? "y" : "ies"}.${r.skipped ? ` ${r.skipped} row${r.skipped === 1 ? " was" : "s were"} skipped (no supplier, route or rate).` : ""}`);
    } catch {
      toast("That file didn't upload. Try again.");
    }
    setBusy(false);
  };
  return (
    <Dialog title="Import old rates from Excel" onClose={onClose}>
      <p className="hint">One row per quotation, with a header row. Columns it understands: Date, Supplier, From, To, Origin country, Origin port, Destination country, Destination port, Commodity, Mode, Container, Qty, Service, Incoterm, Rate, Currency, Additional charges, Transit, Validity, Remarks. Only Supplier, From or To, and Rate are needed. Nothing already in the rate book is changed.</p>
      <a className="btn btn-sm" href="/rates/template" download>
        <Icon name="download" size={14} />
        Download the template
      </a>
      {done ? <p className="form-ok">{done}</p> : <RateDropPlain busy={busy} onFile={run} />}
      <div className="form-f">
        <button type="button" className="btn btn-primary" onClick={onClose}>{done ? "Done" : "Close"}</button>
      </div>
    </Dialog>
  );
}
function RateDropPlain({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  return (
    <label className={`rt-drop compact${busy ? " busy" : ""}`}>
      {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="upload" size={18} />}
      <span><b>{busy ? "Importing…" : "Choose the Excel file"}</b><span>.xlsx, up to 50 MB</span></span>
      <input type="file" className="sr" accept=".xlsx" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}
function FxDialog({ fx, onClose }: { fx: Fx; onClose: () => void }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(CURRENCIES.map((c) => [c, String(fx[c] ?? 1)])));
  const { busy, act } = useAct();
  return (
    <Dialog title="Exchange rates" onClose={onClose}>
      <p className="hint">How many AED one unit is worth. Used to compare quotes in different currencies. The original amounts are never changed.</p>
      <div className="rt-fx">
        {CURRENCIES.filter((c) => c !== "AED").map((c) => (
          <label key={c}><span>1 {c} =</span><input className="inp" inputMode="decimal" value={v[c]} onChange={(e) => setV({ ...v, [c]: e.target.value })} /><span>AED</span></label>
        ))}
      </div>
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => saveFx(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x) || 0]))), "Exchange rates saved.", onClose)}>Save</button>
      </div>
    </Dialog>
  );
}
function SupplierDialog({ sup, onClose }: { sup: Sup | null; onClose: () => void }) {
  const [v, setV] = useState({ name: sup?.name ?? "", contact: sup?.contact ?? "", email: sup?.email ?? "", phone: sup?.phone ?? "", notes: sup?.notes ?? "" });
  const { busy, act } = useAct();
  return (
    <Dialog title={sup ? "Edit supplier" : "Add a supplier"} onClose={onClose}>
      <input className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Company name" maxLength={120} autoFocus />
      <input className="inp" value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} placeholder="Contact person" maxLength={120} />
      <div className="rt-two">
        <input className="inp" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} placeholder="Email" maxLength={160} />
        <input className="inp" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="Phone" maxLength={60} />
      </div>
      <textarea className="inp" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Notes" maxLength={1000} />
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || v.name.trim().length < 2} onClick={() => act(() => saveSupplier(sup?.id ?? null, v), "Supplier saved.", onClose)}>Save</button>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ one enquiry: comparison, quotes, award

export type FileV = { id: string; quote_id: string | null; name: string; size: string; view: boolean };
export function EnquiryView({ req, quotes, old, files, fx, charges, sups, allQuotes, allReqs, manage, today, leads, approvalStatus, notes, canNote }: {
  req: Req; quotes: Quo[]; old: (Quo & { replaced: string })[]; files: FileV[]; fx: Fx; charges: [string, "container" | "shipment"][]; sups: Sup[]; allQuotes: Quo[]; allReqs: Req[];
  manage: boolean; today: string; leads: { id: string; name: string }[]; approvalStatus: string | null; notes: NoteV[]; canNote: boolean;
}) {
  const [fb, setFb] = useState(false);
  const router = useRouter();
  const { busy, act } = useAct();
  const reader = useRateReader();
  const hints = useMemo(() => buildHints(allReqs, allQuotes, sups, charges), [allReqs, allQuotes, sups, charges]);
  const last = useMemo(() => lastBySupplier(allQuotes), [allQuotes]);
  const types = req.equipment.map((e) => normEquip(e.type));
  const [ed, setEd] = useState<null | { start: QuoteInput; replaceId?: string; file?: Uploaded | null }>(null);
  const [mode, setMode] = useState<null | "edit" | "award" | "approve">(null);
  const [reqEdit, setReqEdit] = useState<RequestInput>(toInput(req));
  const [pick, setPick] = useState<Quo | null>(null);
  const [reason, setReason] = useState(req.award_reason ?? "");
  const [pr, setPr] = useState(req.pr_number ?? "");
  const [buffer, setBuffer] = useState(String(req.po_buffer_pct));
  const [signers, setSigners] = useState<string[]>([]);

  const quoted = quotes.filter((q) => q.state === "quoted");
  const others = quotes.filter((q) => q.state !== "quoted");
  const totals = new Map(quoted.map((q) => [q.id, quoteTotalAED(q, req.equipment, fx)]));
  const ranked = [...quoted].sort((a, b) => totals.get(a.id)!.total - totals.get(b.id)!.total);
  const cheapest = ranked[0];
  const dearest = ranked[ranked.length - 1];
  const won = quotes.find((q) => q.id === req.awarded_quote_id) ?? null;
  const ckey = (c: Charge) => `${c.label.toLowerCase()}|${c.basis}|${chargeFor(c)}`;
  const labels = [...new Map(quoted.flatMap((q) => q.charges).map((c) => [ckey(c), c])).values()].sort((a, b) => (a.basis === b.basis ? 0 : a.basis === "container" ? -1 : 1));
  const cell = (q: Quo, c: Charge) => q.charges.find((x) => ckey(x) === ckey(c));
  // Sizes a supplier priced that are not part of this shipment: shown, but not counted in the total.
  const allTypes = [...new Set([...types, ...quoted.flatMap((q) => q.rates.map((u) => normEquip(u.type)))])];
  const extraTypes = allTypes.filter((t) => !types.includes(t));
  const qtyOf = (t: string) => req.equipment.find((e) => normEquip(e.type) === t)?.qty ?? 0;
  const minOf = (vals: (number | null)[]) => {
    const xs = vals.filter((v): v is number => v != null && v > 0);
    return xs.length > 1 ? Math.min(...xs) : null;
  };
  const usd = (aed: number) => `USD ${Math.round(fromAED(aed, "USD", fx)).toLocaleString("en-US")}`;
  const wonTotal = won ? (totals.get(won.id)?.total ?? 0) : 0;
  const onFile = async (f: File) => {
    const r = await reader.read(f);
    if (r) setEd({ start: { ...fromExtract(r.data, today).quote, rates: fromExtract(r.data, today).quote.rates }, file: r.file });
  };

  return (
    <>
      {won && (
        <div className="ap-decide rq-banner ok">
          <p className="ap-decide-t">
            <b>Awarded to {won.supplier}</b> · {aedText(wonTotal)} ({usd(wonTotal)}). PO value with {req.po_buffer_pct}% buffer: <b>{aedText(wonTotal * (1 + req.po_buffer_pct / 100))}</b>.
            {req.award_reason ? ` Reason: ${req.award_reason}.` : ""}{req.pr_number ? ` PR ${req.pr_number}.` : ""}
            {req.approval_id && <> Approval: <Link href={`/approvals/${req.approval_id}`}>{approvalStatus === "signed" ? "signed" : approvalStatus === "rejected" ? "rejected" : "waiting for signature"}</Link>.</>}
          </p>
          {manage && (
            <div className="ap-decide-b">
              {!req.approval_id && <button type="button" className="btn btn-primary" onClick={() => setMode("approve")}><Icon name="sign" size={15} />Send for approval</button>}
              <button type="button" className="btn" onClick={() => (setPick(won), setMode("award"))}>Edit award</button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => act(() => awardQuote(req.id, null, "", "", 5), "Award undone.")}>Undo</button>
            </div>
          )}
        </div>
      )}
      <div className="ap-tools no-print">
        {manage && (
          <>
            <button type="button" className="btn btn-primary" data-key="n" onClick={() => setEd({ start: blankQuote(today, types) })}>
              <Icon name="plus" size={15} />
              Add a quote
              <kbd className="kbd">N</kbd>
            </button>
            <button type="button" className="btn" data-key="e" onClick={() => (setReqEdit(toInput(req)), setMode("edit"))}>
              <Icon name="edit" size={15} />
              Edit shipment
              <kbd className="kbd">E</kbd>
            </button>
          </>
        )}
        <a className="btn" href={`/rates/compare/${req.id}`} download>
          <Icon name="download" size={15} />
          Export comparison
        </a>
        <span className="sp" />
        <button type="button" className="btn btn-ghost" onClick={() => setFb(true)}>
          <Icon name="chat" size={15} />
          {canNote ? "Something not right?" : "Feedback notes"}
        </button>
      </div>
      {manage && <RateDrop compact onFile={onFile} busy={reader.busy} label="Drop the next supplier's reply here" />}

      {extraTypes.length > 0 && (
        <div className="ap-decide rq-banner rt-extra">
          <p className="ap-decide-t">
            <b>{extraTypes.join(" and ")}</b> {extraTypes.length === 1 ? "was" : "were"} quoted, but this shipment is saved as {req.equipment.map((e) => `${e.qty} × ${normEquip(e.type)}`).join(" + ") || "no containers"}. The total counts only what is in the shipment.
          </p>
          {manage && (
            <div className="ap-decide-b">
              {extraTypes.map((t) => (
                <button key={t} type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => updateEnquiry(req.id, { ...toInput(req), equipment: [...req.equipment, { type: t, qty: 1 }] }), `1 × ${t} added to the shipment.`)}>
                  <Icon name="plus" size={14} />
                  Add 1 × {t} to the shipment
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <section className="panel" aria-label="Comparison">
        <div className="panel-h">
          <h2>Comparison <span className="count">{quoted.length} quoted</span></h2>
          {ranked.length > 1 && <span className="small muted">Saving against the highest quote: <b>{aedText(totals.get(dearest.id)!.total - totals.get(cheapest.id)!.total)}</b> ({usd(totals.get(dearest.id)!.total - totals.get(cheapest.id)!.total)})</span>}
        </div>
        {quotes.length ? (
          <div className="rt-table-wrap">
            <table className="rt-table rt-cmp">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Basis</th>
                  {ranked.map((q) => (
                    <th key={q.id} className={`r${q.id === cheapest?.id && ranked.length > 1 ? " best" : ""}${q.id === won?.id ? " won" : ""}`}>
                      {q.supplier}
                      {q.id === won?.id ? <span className="rq-tag">Awarded</span> : q.id === cheapest?.id && ranked.length > 1 ? <span className="rq-tag">Lowest</span> : null}
                    </th>
                  ))}
                  {others.map((q) => <th key={q.id} className="r off">{q.supplier}</th>)}
                </tr>
              </thead>
              <tbody>
                {allTypes.map((t) => {
                  const vals = ranked.map((q) => { const u = q.rates.find((x) => normEquip(x.type) === t); return u ? toAED(u.rate, q.currency, fx) : null; });
                  const m = minOf(vals);
                  const out = !types.includes(t);
                  return (
                    <tr key={t} className={out ? "rt-out" : ""}>
                      <td><b>Freight, {t}</b>{qtyOf(t) > 1 ? ` × ${qtyOf(t)}` : ""}{out && <span className="muted"> · not in this shipment</span>}</td>
                      <td>per {t}</td>
                      {ranked.map((q, i) => { const u = q.rates.find((x) => normEquip(x.type) === t); return <td key={q.id} className={`r${m != null && vals[i] === m ? " low" : ""}`}>{u ? money(u.rate, q.currency) : <span className="muted">not quoted</span>}</td>; })}
                      {others.map((q) => <td key={q.id} className="r off">{STATES[q.state]}</td>)}
                    </tr>
                  );
                })}
                {labels.map((c) => {
                  const vals = ranked.map((q) => { const x = cell(q, c); return x ? toAED(x.amount, x.currency, fx) : null; });
                  const m = minOf(vals);
                  const out = !!chargeFor(c) && !types.includes(chargeFor(c));
                  return (
                    <tr key={ckey(c)} className={out ? "rt-out" : ""}>
                      <td>{c.label}{out && <span className="muted"> · not in this shipment</span>}</td>
                      <td>{basisText(c)}</td>
                      {ranked.map((q, i) => { const x = cell(q, c); return <td key={q.id} className={`r${m != null && vals[i] === m ? " low" : ""}`}>{x ? money(x.amount, x.currency) : <span className="muted">–</span>}</td>; })}
                      {others.map((q) => <td key={q.id} className="r off" />)}
                    </tr>
                  );
                })}
                {ranked.length > 0 && allTypes.map((t) => {
                  const vals = ranked.map((q) => unitAllInAED(q, t, null, fx));
                  const m = minOf(vals);
                  return (
                    <tr key={`all-${t}`} className={`sum rt-allin-row${types.includes(t) ? "" : " rt-out"}`}>
                      <td>All in, one {t} (AED)</td>
                      <td>freight + its charges</td>
                      {ranked.map((q, i) => <td key={q.id} className={`r${m != null && vals[i] === m ? " low" : ""}`} title={vals[i] != null ? usd(vals[i]!) : undefined}>{vals[i] != null ? <b>{Math.round(vals[i]!).toLocaleString("en-US")}</b> : <span className="muted">–</span>}</td>)}
                      {others.map((q) => <td key={q.id} className="r off" />)}
                    </tr>
                  );
                })}
                {ranked.length > 0 && (
                  <>
                    <tr className="sum"><td>Total for this shipment (AED)</td><td>{req.equipment.map((e) => `${e.qty} × ${normEquip(e.type)}`).join(" + ") || "–"}</td>{ranked.map((q) => <td key={q.id} className={`r${q.id === cheapest.id && ranked.length > 1 ? " low" : ""}`}><b>{Math.round(totals.get(q.id)!.total).toLocaleString("en-US")}</b>{!totals.get(q.id)!.complete && <span className="muted" title="Not every container type was quoted"> *</span>}</td>)}{others.map((q) => <td key={q.id} className="r off" />)}</tr>
                    <tr className="sum"><td>Total for this shipment (USD)</td><td />{ranked.map((q) => <td key={q.id} className="r">{Math.round(fromAED(totals.get(q.id)!.total, "USD", fx)).toLocaleString("en-US")}</td>)}{others.map((q) => <td key={q.id} className="r off" />)}</tr>
                    {ranked.length > 1 && <tr><td>Above the lowest</td><td />{ranked.map((q) => { const d = totals.get(q.id)!.total - totals.get(cheapest.id)!.total; return <td key={q.id} className="r">{d > 0 ? `+${Math.round(d).toLocaleString("en-US")} (+${Math.round((d / (totals.get(cheapest.id)!.total || 1)) * 100)}%)` : "lowest"}</td>; })}{others.map((q) => <td key={q.id} className="r off" />)}</tr>}
                  </>
                )}
                <tr><td>Transit time</td><td />{ranked.map((q) => <td key={q.id} className="r">{q.transit || "–"}</td>)}{others.map((q) => <td key={q.id} className="r off" />)}</tr>
                <tr><td>Valid until</td><td />{ranked.map((q) => <td key={q.id} className="r">{q.valid_until ? <span className={q.valid_until < today ? "ap-late" : ""}>{fmtDate(q.valid_until)}</span> : "–"}</td>)}{others.map((q) => <td key={q.id} className="r off" />)}</tr>
                {manage && !won && ranked.length > 0 && (
                  <tr className="no-print"><td /><td />{ranked.map((q) => <td key={q.id} className="r"><button type="button" className="btn btn-sm btn-primary" onClick={() => (setPick(q), setReason(ranked.length === 1 ? "Single source: only one supplier quoted" : q.id === cheapest.id ? "Lowest total cost" : ""), setMode("award"))}>Award</button></td>)}{others.map((q) => <td key={q.id} className="off" />)}</tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{manage ? "No quotes yet. Drop a supplier's reply above, or press Add a quote." : "No quotes yet."}</p>
        )}
        <p className="rt-foot">All in = freight for one container plus the charges that belong to that size. Amounts are shown as quoted. Totals use 1 USD = {fx.USD} AED{[...new Set(quoted.flatMap((q) => [q.currency, ...q.charges.map((c) => c.currency)]))].filter((c) => c !== "USD" && c !== "AED").map((c) => `, 1 ${c} = ${fx[c] ?? 1} AED`).join("")}.</p>
      </section>

      <section className="panel" aria-label="Quotes">
        <div className="panel-h"><h2>Each supplier&apos;s answer <span className="count">{quotes.length}</span></h2></div>
        <div className="rq-quotes">
          {[...ranked, ...others].map((q) => (
            <div key={q.id} className={`rq-q ${q.state === "quoted" ? "quoted" : "declined"}${q.id === won?.id ? " won" : ""}`}>
              <div className="rq-q-main as-div">
                <span className="rq-q-h">
                  <b>{q.supplier}</b>
                  <span className="small muted">{fmtDate(q.quoted_on)}</span>
                  {q.id === won?.id && <span className="ap-st signed">Awarded</span>}
                  {q.negotiated && q.id !== won?.id && <span className="rq-tag fast">Negotiated</span>}
                  {q.state !== "quoted" && <span className="ap-st cancelled">{STATES[q.state]}</span>}
                </span>
                {q.state === "quoted" ? (
                  <>
                    <span className="rq-price">{q.rates.map((u) => `${u.type} ${money(u.rate, q.currency)}`).join("  ·  ")}</span>
                    {q.charges.length > 0 && <span className="rq-q-note rt-allin-line">All in: {q.rates.map((u) => `${normEquip(u.type)} ${aedText(unitAllInAED(q, u.type, null, fx) ?? 0)}`).join("  ·  ")}{shipmentChargesAED(q, fx) > 0 ? `  ·  plus ${aedText(shipmentChargesAED(q, fx))} once per shipment` : ""}</span>}
                    <span className="rq-q-meta">
                      {q.carrier && <span>Carrier {q.carrier}</span>}
                      {q.transit && <span>Transit {q.transit}</span>}
                      {q.free_time && <span>Free time {q.free_time}</span>}
                      {q.valid_until && <span className={q.valid_until < today ? "ap-late" : ""}>{q.valid_until < today ? "Expired" : "Valid until"} {fmtDate(q.valid_until)}</span>}
                      {q.charges.length > 0 && <span>{q.charges.length} extra charge{q.charges.length === 1 ? "" : "s"}</span>}
                    </span>
                    {q.routing && <span className="rq-q-note">Route: {q.routing}</span>}
                    {q.exclusions && <span className="rq-q-note">Not included: {q.exclusions}</span>}
                    {q.remarks && <span className="rq-q-note">{q.remarks}</span>}
                  </>
                ) : (
                  <span className="rq-q-note">{q.decline_reason || (q.state === "no_reply" ? "They did not reply." : "They declined.")}</span>
                )}
              </div>
              {files.some((f) => f.quote_id === q.id) && (
                <div className="files">
                  {files.filter((f) => f.quote_id === q.id).map((f) => (
                    <a key={f.id} className="file-chip" href={`/rates/file/${f.id}${f.view ? "" : "?download"}`} target={f.view ? "_blank" : undefined} rel="noopener noreferrer">
                      <Icon name="file" size={14} /><span className="file-n">{f.name}</span><span className="file-s">{f.size}</span>
                    </a>
                  ))}
                </div>
              )}
              {manage && (
                <div className="rq-q-f">
                  {q.state === "quoted" && q.id !== won?.id && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(() => setNegotiated(q.id, !q.negotiated), q.negotiated ? "Unmarked." : "Marked as negotiated.")}>{q.negotiated ? "Not negotiated" : "Mark negotiated"}</button>}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEd({ start: quoteInput(q), replaceId: q.id })}>Correct</button>
                  {q.id !== won?.id && <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => window.confirm(`Take ${q.supplier}'s quote out of the comparison? It stays in the history.`) && act(() => removeQuote(q.id), "Removed from the comparison.")}>Remove</button>}
                </div>
              )}
            </div>
          ))}
        </div>
        {old.length > 0 && (
          <details className="rt-old">
            <summary>Earlier versions and removed quotes ({old.length}). Nothing is ever overwritten.</summary>
            <ul>
              {old.map((q) => <li key={q.id}><b>{q.supplier}</b> · {fmtDate(q.quoted_on)} · {q.state === "quoted" ? q.rates.map((u) => `${u.type} ${money(u.rate, q.currency)}`).join(", ") : STATES[q.state]} <span className="muted">(replaced {q.replaced})</span></li>)}
            </ul>
          </details>
        )}
      </section>

      {fb && <FeedbackBox notes={notes} canWrite={canNote} page={`/rates/${req.id}`} onClose={() => setFb(false)} />}
      {ed && <QuoteEditor requestId={req.id} types={types} start={ed.start} replaceId={ed.replaceId} file={ed.file} hints={hints} last={last} onClose={() => (setEd(null), router.refresh())} />}
      {mode === "edit" && (
        <Dialog title="Edit the shipment" onClose={() => setMode(null)} wide>
          <RequestFields v={reqEdit} set={setReqEdit} hints={hints} />
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => updateEnquiry(req.id, reqEdit), "Saved.", () => setMode(null))}>Save</button>
          </div>
        </Dialog>
      )}
      {mode === "award" && pick && (
        <Dialog title={`Award to ${pick.supplier}`} onClose={() => setMode(null)}>
          <p className="hint">Total {aedText(totals.get(pick.id)?.total ?? 0)} ({usd(totals.get(pick.id)?.total ?? 0)}). This also marks the rate as the agreed rate for this route.</p>
          <input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. lowest total cost" maxLength={500} aria-label="Reason" />
          <div className="rt-two">
            <input className="inp" value={pr} onChange={(e) => setPr(e.target.value)} placeholder="PR number (optional)" maxLength={40} aria-label="PR number" />
            <label className="rt-pct"><span>PO buffer</span><input className="inp" inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} aria-label="PO buffer percent" /><span>%</span></label>
          </div>
          <p className="hint">PO value: <b>{aedText((totals.get(pick.id)?.total ?? 0) * (1 + (Number(buffer) || 0) / 100))}</b></p>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => awardQuote(req.id, pick.id, reason, pr, Number(buffer) || 0), `Awarded to ${pick.supplier}.`, () => setMode(null))}>Award</button>
          </div>
        </Dialog>
      )}
      {mode === "approve" && (
        <Dialog title="Send for approval" onClose={() => setMode(null)}>
          <p className="hint">Creates a request in Approvals with the comparison written out. The people you pick sign it there.</p>
          <div className="chips" role="group" aria-label="Who approves">
            {leads.map((p) => {
              const on = signers.includes(p.id);
              return <button key={p.id} type="button" className="chip" aria-pressed={on} onClick={() => setSigners(on ? signers.filter((x) => x !== p.id) : [...signers, p.id])}>{p.name}</button>;
            })}
          </div>
          <div className="form-f">
            <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={busy || !signers.length} onClick={() => act(async () => { const r = await sendRateForApproval(req.id, signers); return r.ok ? { ok: true } : r; }, "Sent for approval.", () => setMode(null))}>Send</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
