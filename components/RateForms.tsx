"use client";

import { useRef, useState } from "react";
import { readRateSheet, readRateText, type QuoteInput, type RequestInput } from "@/app/actions/rates";
import { AttachPicker, useUploader, type AttachState } from "@/components/Attach";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/work";
import { checkFile, type Uploaded } from "@/lib/attach-rules";
import type { RateExtract } from "@/lib/extract";
import { readEmailFile } from "@/lib/mailfile";
import { CURRENCIES, EQUIPMENT, INCOTERMS, MODES, normEquip, SERVICES, type Charge, type Equip, type Mode, type Service, type UnitRate } from "@/lib/rate-calc";

export type Hints = { places: string[]; countries: string[]; ports: string[]; commodities: string[]; suppliers: string[]; carriers: string[]; charges: [string, "container" | "shipment"][] };
export const blankRequest = (today: string): RequestInput => ({ title: "", origin: "", origin_country: "", origin_port: "", destination: "", destination_country: "", destination_port: "", commodity: "", mode: "sea", service: "d2d", incoterm: "", equipment: [{ type: "40HC", qty: 1 }], notes: "", requested_on: today });
export const blankQuote = (today: string, types: string[] = []): QuoteInput => ({ supplier: "", state: "quoted", quoted_on: today, currency: "USD", rates: types.map((type) => ({ type, rate: 0 })), charges: [], carrier: "", routing: "", transit: "", free_time: "", valid_until: "", remarks: "", exclusions: "", decline_reason: "", negotiated: false });

/** What the AI read from a supplier's file, split into the enquiry part and the quote part. */
export function fromExtract(d: RateExtract, today: string): { request: RequestInput; quote: QuoteInput } {
  const equipment = d.equipment.length ? d.equipment.map((e) => ({ type: normEquip(e.type), qty: e.qty })) : d.rates.map((r) => ({ type: normEquip(r.type), qty: 1 }));
  return {
    request: { title: d.title, origin: d.origin, origin_country: d.origin_country, origin_port: d.origin_port, destination: d.destination, destination_country: d.destination_country, destination_port: d.destination_port, commodity: d.commodity, mode: d.mode, service: d.service, incoterm: d.incoterm, equipment: equipment.length ? equipment : [{ type: "40HC", qty: 1 }], notes: "", requested_on: d.quoted_on || today },
    quote: { supplier: d.supplier, state: d.declined ? "declined" : "quoted", quoted_on: d.quoted_on || today, currency: d.currency, rates: d.rates.map((r) => ({ type: normEquip(r.type), rate: r.rate })), charges: d.charges, carrier: d.carrier, routing: d.routing, transit: d.transit, free_time: d.free_time, valid_until: d.valid_until, remarks: d.remarks, exclusions: d.exclusions, decline_reason: d.decline_reason, negotiated: false, contact: d.contact, contact_email: d.contact_email },
  };
}

/**
 * Reads a supplier's file: emails and PDFs are turned into text in the browser, spreadsheets on the server,
 * and the AI fills the form. The file is uploaded too, so it stays attached to the quote.
 */
export function useRateReader() {
  const upload = useUploader("apv");
  const [busy, setBusy] = useState<string | null>(null);
  const read = async (file: File): Promise<{ data: RateExtract; file: Uploaded | null } | null> => {
    const bad = checkFile(file);
    if (bad) return toast(bad), null;
    setBusy(file.name);
    try {
      const sheet = /\.(xlsx|xls|csv)$/i.test(file.name);
      const up = upload(file).catch(() => null);
      let r;
      if (sheet) {
        const u = await up;
        if (!u) return toast("That file didn't upload. Check your connection and try again."), null;
        r = await readRateSheet(u);
      } else {
        const t = await readEmailFile(file, 10_000_000);
        if ("error" in t) return toast(t.error), null;
        r = await readRateText(t.text);
      }
      if (!r.ok) return toast(r.error), null;
      return { data: r.data, file: await up };
    } catch {
      toast("That file couldn't be read. You can type the quote in yourself.");
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { read, busy };
}

/** The big "drop a quotation here" box. */
export function RateDrop({ onFile, busy, label, compact = false }: { onFile: (f: File) => void; busy: string | null; label: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`rt-drop${over ? " over" : ""}${busy ? " busy" : ""}${compact ? " compact" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => !busy && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && input.current?.click()}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f && !busy) onFile(f);
      }}
    >
      {busy ? (
        <>
          <span className="spinner" aria-hidden="true" />
          <span>
            <b>Reading {busy}…</b>
            <span>The AI is pulling out the supplier, the rates and the conditions. About 10 seconds.</span>
          </span>
        </>
      ) : (
        <>
          <Icon name="upload" size={compact ? 18 : 22} />
          <span>
            <b>{label}</b>
            <span>Outlook email (.msg, .eml), PDF or Excel. The AI fills the form, you check it and save.</span>
          </span>
        </>
      )}
      <input ref={input} type="file" className="sr" tabIndex={-1} aria-hidden="true" accept=".msg,.eml,.pdf,.xlsx,.xls,.csv,.txt" onChange={(e) => (e.target.files?.[0] && onFile(e.target.files[0]), (e.target.value = ""))} />
    </div>
  );
}

function Lists({ h }: { h: Hints }) {
  return (
    <>
      <datalist id="rt-places">{h.places.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rt-countries">{h.countries.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rt-ports">{h.ports.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rt-commodities">{h.commodities.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rt-suppliers">{h.suppliers.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rt-carriers">{h.carriers.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="rt-charges">{h.charges.map(([x]) => <option key={x} value={x} />)}</datalist>
      <datalist id="rt-equip">{EQUIPMENT.map((x) => <option key={x} value={x} />)}</datalist>
    </>
  );
}
const Seg = <T extends string>({ value, set, options, label }: { value: T; set: (v: T) => void; options: [T, string][]; label: string }) => (
  <div className="seg" role="group" aria-label={label}>
    {options.map(([k, l]) => (
      <button key={k} type="button" aria-pressed={value === k} onClick={() => set(k)}>
        {l}
      </button>
    ))}
  </div>
);

/** The shipment part: where from, where to, what, how. */
export function RequestFields({ v, set, hints }: { v: RequestInput; set: (v: RequestInput) => void; hints: Hints }) {
  const up = (p: Partial<RequestInput>) => set({ ...v, ...p });
  const eq = (i: number, p: Partial<Equip>) => up({ equipment: v.equipment.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  return (
    <div className="rt-form">
      <Lists h={hints} />
      <div className="rt-route">
        <div className="field">
          <label htmlFor="rq-from">From</label>
          <input id="rq-from" className="inp inp-lg" list="rt-places" value={v.origin} onChange={(e) => up({ origin: e.target.value })} placeholder="City or place, e.g. Yangzhou" autoComplete="off" />
          <div className="rt-two">
            <input className="inp" list="rt-countries" value={v.origin_country} onChange={(e) => up({ origin_country: e.target.value })} placeholder="Country" aria-label="Origin country" autoComplete="off" />
            <input className="inp" list="rt-ports" value={v.origin_port} onChange={(e) => up({ origin_port: e.target.value })} placeholder="Port (if any)" aria-label="Origin port" autoComplete="off" />
          </div>
        </div>
        <span className="rt-arrow" aria-hidden="true">→</span>
        <div className="field">
          <label htmlFor="rq-to">To</label>
          <input id="rq-to" className="inp inp-lg" list="rt-places" value={v.destination} onChange={(e) => up({ destination: e.target.value })} placeholder="City or place, e.g. Al Ain" autoComplete="off" />
          <div className="rt-two">
            <input className="inp" list="rt-countries" value={v.destination_country} onChange={(e) => up({ destination_country: e.target.value })} placeholder="Country" aria-label="Destination country" autoComplete="off" />
            <input className="inp" list="rt-ports" value={v.destination_port} onChange={(e) => up({ destination_port: e.target.value })} placeholder="Port (if any)" aria-label="Destination port" autoComplete="off" />
          </div>
        </div>
      </div>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="rq-com">Commodity</label>
          <input id="rq-com" className="inp" list="rt-commodities" value={v.commodity} onChange={(e) => up({ commodity: e.target.value })} placeholder="e.g. Ethyl Formate (DG)" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="rq-date">Date asked</label>
          <input id="rq-date" type="date" className="inp inp-date" value={v.requested_on} onChange={(e) => up({ requested_on: e.target.value })} />
        </div>
      </div>
      <div className="rt-picks">
        <div className="field">
          <label>Mode</label>
          <Seg label="Transport mode" value={v.mode as Mode} set={(mode) => up({ mode })} options={Object.entries(MODES) as [Mode, string][]} />
        </div>
        <div className="field">
          <label>Service</label>
          <Seg label="Service type" value={v.service as Service} set={(service) => up({ service })} options={Object.entries(SERVICES) as [Service, string][]} />
        </div>
        <div className="field rt-inco">
          <label htmlFor="rq-inco">Incoterm</label>
          <select id="rq-inco" className="inp" value={v.incoterm} onChange={(e) => up({ incoterm: e.target.value })}>
            <option value="">Not set</option>
            {INCOTERMS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Container or truck, and how many</label>
        <div className="rt-eq">
          {v.equipment.map((e, i) => (
            <div className="rt-eq-row" key={i}>
              <input className="inp rt-qty" type="number" min={1} max={999} value={e.qty} onChange={(x) => eq(i, { qty: Number(x.target.value) || 1 })} aria-label="Quantity" />
              <span className="muted">×</span>
              <input className="inp" list="rt-equip" value={e.type} onChange={(x) => eq(i, { type: x.target.value })} placeholder="Type" aria-label="Container or truck type" autoComplete="off" />
              <button type="button" className="icon-btn sm" aria-label="Remove" disabled={v.equipment.length < 2} onClick={() => up({ equipment: v.equipment.filter((_, j) => j !== i) })}>
                <Icon name="x" size={13} />
              </button>
            </div>
          ))}
          <div className="rt-chips">
            {["20FT", "40FT", "40HC", "40FT Reefer", "Flatbed", "Reefer truck"].filter((x) => !v.equipment.some((e) => normEquip(e.type) === x)).map((x) => (
              <button key={x} type="button" className="chip fb-sug" onClick={() => up({ equipment: [...v.equipment.filter((e) => e.type), { type: x, qty: 1 }] })}>
                <Icon name="plus" size={12} />
                {x}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <label htmlFor="rq-note">Notes (optional)</label>
        <textarea id="rq-note" className="inp" rows={2} value={v.notes} onChange={(e) => up({ notes: e.target.value })} maxLength={3000} />
      </div>
    </div>
  );
}

/** One supplier's answer: a rate per container type, any extra charges, and the conditions. */
export function QuoteFields({ v, set, hints, types, att, last }: { v: QuoteInput; set: (v: QuoteInput) => void; hints: Hints; types: string[]; att: AttachState; last?: Record<string, Partial<QuoteInput>> }) {
  const up = (p: Partial<QuoteInput>) => set({ ...v, ...p });
  const [more, setMore] = useState(!!(v.carrier || v.routing || v.free_time || v.exclusions || v.charges.length));
  const [label, setLabel] = useState("");
  const rows: UnitRate[] = [...types.map((type) => ({ type, rate: v.rates.find((r) => normEquip(r.type) === normEquip(type))?.rate ?? 0 })), ...v.rates.filter((r) => !types.some((x) => normEquip(x) === normEquip(r.type)))];
  const setRate = (type: string, rate: number) => up({ rates: rows.map((r) => (r.type === type ? { ...r, rate } : r)) });
  const ch = (i: number, p: Partial<Charge>) => up({ charges: v.charges.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const addCharge = (l: string) => {
    const name = l.trim();
    if (!name) return;
    const known = hints.charges.find(([x]) => x.toLowerCase() === name.toLowerCase());
    up({ charges: [...v.charges, { label: known?.[0] ?? name, basis: known?.[1] ?? "container", amount: 0, currency: v.currency === "USD" ? "AED" : v.currency }] });
    setLabel("");
    setMore(true);
  };
  const prev = last?.[v.supplier.trim().toLowerCase()];
  return (
    <div className="rt-form">
      <Lists h={hints} />
      <div className="fields-row">
        <div className="field">
          <label htmlFor="qt-sup">Supplier</label>
          <input id="qt-sup" className="inp inp-lg" list="rt-suppliers" value={v.supplier} onChange={(e) => up({ supplier: e.target.value })} placeholder="Freight forwarder or transporter" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="qt-date">Date of quotation</label>
          <input id="qt-date" type="date" className="inp inp-date" value={v.quoted_on} onChange={(e) => up({ quoted_on: e.target.value })} />
        </div>
      </div>
      {prev && v.state === "quoted" && (
        <button type="button" className="btn btn-sm btn-ghost rt-copy" onClick={() => (up({ carrier: v.carrier || prev.carrier || "", transit: v.transit || prev.transit || "", free_time: v.free_time || prev.free_time || "", currency: prev.currency || v.currency, charges: v.charges.length ? v.charges : (prev.charges ?? []).map((c) => ({ ...c })), exclusions: v.exclusions || prev.exclusions || "" }), setMore(true))}>
          <Icon name="copy" size={13} />
          Copy carrier, transit and charges from {v.supplier.trim()}&apos;s last quote
        </button>
      )}
      <Seg label="Their answer" value={v.state as "quoted" | "declined" | "no_reply"} set={(state) => up({ state })} options={[["quoted", "They quoted"], ["declined", "They declined"], ["no_reply", "No reply"]]} />
      {v.state === "declined" && (
        <div className="field">
          <label htmlFor="qt-why">Why did they decline?</label>
          <input id="qt-why" className="inp" value={v.decline_reason} onChange={(e) => up({ decline_reason: e.target.value })} placeholder="e.g. Not accepting dangerous goods" maxLength={300} />
        </div>
      )}
      {v.state === "quoted" && (
        <>
          <div className="field">
            <label>Rate for one of each</label>
            <div className="rt-rates">
              <select className="inp rt-cur" value={v.currency} onChange={(e) => up({ currency: e.target.value })} aria-label="Currency">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              {rows.map((r) => (
                <label key={r.type} className="rt-rate">
                  <span>{r.type}</span>
                  <input className="inp inp-lg" inputMode="decimal" value={r.rate || ""} onChange={(e) => setRate(r.type, Number(e.target.value.replace(/[, ]/g, "")) || 0)} placeholder="0" aria-label={`Rate for ${r.type}`} autoComplete="off" />
                </label>
              ))}
            </div>
            <span className="hint">The freight rate, or the all-in price if they gave one. Extra charges go below.</span>
          </div>
          <div className="fields-row">
            <div className="field">
              <label htmlFor="qt-tr">Transit time</label>
              <input id="qt-tr" className="inp" value={v.transit} onChange={(e) => up({ transit: e.target.value })} placeholder="e.g. 30 to 35 days" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="qt-val">Rate valid until</label>
              <input id="qt-val" type="date" className="inp inp-date" value={v.valid_until} onChange={(e) => up({ valid_until: e.target.value })} />
            </div>
          </div>
          {v.charges.length > 0 && (
            <div className="field">
              <label>Additional charges</label>
              <div className="rt-charges">
                {v.charges.map((c, i) => (
                  <div className="rt-charge" key={i}>
                    <input className="inp" list="rt-charges" value={c.label} onChange={(e) => ch(i, { label: e.target.value })} aria-label="Charge" autoComplete="off" />
                    <select className="inp" value={c.basis} onChange={(e) => ch(i, { basis: e.target.value as Charge["basis"] })} aria-label="Per container or per shipment">
                      <option value="container">per container</option>
                      <option value="shipment">per shipment</option>
                    </select>
                    <input className="inp" inputMode="decimal" value={c.amount || ""} onChange={(e) => ch(i, { amount: Number(e.target.value.replace(/[, ]/g, "")) || 0 })} placeholder="0" aria-label="Amount" autoComplete="off" />
                    <select className="inp rt-cur" value={c.currency} onChange={(e) => ch(i, { currency: e.target.value })} aria-label="Currency">
                      {CURRENCIES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <button type="button" className="icon-btn sm" aria-label={`Remove ${c.label}`} onClick={() => up({ charges: v.charges.filter((_, j) => j !== i) })}>
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="fb-own">
            <input
              className="inp"
              list="rt-charges"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Add a charge: start typing, e.g. Origin THC"
              aria-label="Add a charge"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCharge(label);
                }
              }}
            />
            <button type="button" className="btn btn-sm" disabled={!label.trim()} onClick={() => addCharge(label)}>
              Add charge
            </button>
            {!more && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMore(true)}>
                More details
              </button>
            )}
          </div>
          {more && (
            <>
              <div className="fields-row">
                <div className="field">
                  <label htmlFor="qt-car">Carrier / shipping line</label>
                  <input id="qt-car" className="inp" list="rt-carriers" value={v.carrier} onChange={(e) => up({ carrier: e.target.value })} placeholder="e.g. MSC" autoComplete="off" />
                </div>
                <div className="field">
                  <label htmlFor="qt-free">Free time</label>
                  <input id="qt-free" className="inp" value={v.free_time} onChange={(e) => up({ free_time: e.target.value })} placeholder="e.g. 14 days" autoComplete="off" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="qt-rt">Routing</label>
                <input id="qt-rt" className="inp" value={v.routing} onChange={(e) => up({ routing: e.target.value })} placeholder="e.g. Shanghai > Khor Fakkan > Jebel Ali" autoComplete="off" />
              </div>
              <div className="field">
                <label htmlFor="qt-ex">Not included</label>
                <input id="qt-ex" className="inp" value={v.exclusions} onChange={(e) => up({ exclusions: e.target.value })} placeholder="e.g. Insurance, duty, VAT" maxLength={500} autoComplete="off" />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="qt-rem">Remarks / conditions</label>
            <textarea id="qt-rem" className="inp" rows={2} value={v.remarks} onChange={(e) => up({ remarks: e.target.value })} maxLength={2000} />
          </div>
          <label className="ap-check">
            <input type="checkbox" checked={v.negotiated} onChange={(e) => up({ negotiated: e.target.checked })} />
            This is a negotiated (agreed) rate
          </label>
        </>
      )}
      <div className="field">
        <label>The supplier&apos;s quotation file</label>
        <AttachPicker att={att} />
      </div>
    </div>
  );
}
