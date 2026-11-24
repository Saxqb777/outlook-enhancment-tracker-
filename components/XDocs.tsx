"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addDocType, addExpenseCategory, removeDoc, removeShipment, removeTxn, saveBankBalance, saveCard, saveDoc, saveShipment, saveTxn, type CardInput, type DocInput, type ShipmentInput, type TxnInput } from "@/app/actions/xdocs";
import { Dialog, useAct } from "@/components/Approvals";
import { AttachPicker, useAttach } from "@/components/Attach";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/work";

export type NamedV = { id: string; name: string; active: boolean };
export type CardV = { id: string; name: string; credit_limit: number; alert_at: number; statement_day: number; opening_used: number; active: boolean; used: number; bank: number | null; bank_on: string | null; bank_used_then: number | null; days: number };
export type ShipV = { id: string; ref: string; customer: string; country: string; invoice_no: string; incoterm: string; shipped_on: string | null; notes: string; docs: number; cost: number; added: string };
export type DocV = { id: string; shipment_id: string; type_id: string; type: string; doc_number: string; notes: string; name: string | null; size: string; view: boolean; cost: number | null; card_id: string | null; card: string | null; paid_on: string | null; category_id: string | null; charge_customer: boolean };
export type TxnV = { id: string; card_id: string; card: string; kind: "spend" | "topup"; amount: number; on_date: string; category_id: string | null; category: string | null; description: string; shipment_id: string | null; doc_id: string | null; doc: string | null; charge_customer: boolean; customer: string; by: string | null };

export const aed = (n: number) => `AED ${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`)) : "");
const INCOTERMS = ["EXW", "FOB", "CNF", "CFR", "CIF", "FCA", "DAP", "DDP"];

/** Shipments · Card expenses · Reports */
export function DocsTabs() {
  const path = usePathname();
  const tabs: [string, string][] = [["/docs", "Shipments"], ["/docs/cards", "Card expenses"], ["/docs/reports", "Reports"]];
  const on = (href: string) => (href === "/docs" ? path === "/docs" || /^\/docs\/\d+$/.test(path) : path.startsWith(href));
  return (
    <nav className="seg xd-tabs no-print" aria-label="Export Docs sections">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href} aria-current={on(href) ? "page" : undefined} data-on={on(href) ? "1" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** A select that can grow: the last choice adds a new name to the shared list. */
function GrowSelect({ value, set, items, add, label, placeholder }: { value: string; set: (v: string) => void; items: NamedV[]; add: (name: string) => Promise<{ ok: true; id: string } | { ok: false; error: string }>; label: string; placeholder: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, go] = useTransition();
  const save = () =>
    go(async () => {
      const r = await add(name);
      if (!r.ok) return void toast(r.error);
      setAdding(false);
      setName("");
      router.refresh();
      set(r.id);
    });
  if (adding)
    return (
      <div className="xd-grow">
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} autoFocus aria-label={`New ${label}`} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())} />
        <button type="button" className="btn btn-sm btn-primary" disabled={busy || name.trim().length < 2} onClick={save}>
          Add
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </div>
    );
  return (
    <select className="inp" value={value} onChange={(e) => (e.target.value === "+" ? setAdding(true) : set(e.target.value))} aria-label={label}>
      <option value="">Choose…</option>
      {items.filter((x) => x.active || x.id === value).map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
      <option value="+">+ Add a new one…</option>
    </select>
  );
}

// ------------------------------------------------------------------ shipments list and search

function ShipmentDialog({ ship, countries, customers, onClose }: { ship?: ShipV; countries: string[]; customers: string[]; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<ShipmentInput>({ customer: ship?.customer ?? "", country: ship?.country ?? "", invoice_no: ship?.invoice_no ?? "", incoterm: ship?.incoterm ?? "", shipped_on: ship?.shipped_on ?? "", notes: ship?.notes ?? "" });
  const [busy, go] = useTransition();
  const save = () =>
    go(async () => {
      const r = await saveShipment(ship?.id ?? null, v);
      if (!r.ok) return void toast(r.error);
      toast(ship ? "Saved." : "Shipment created. Add its documents now.");
      onClose();
      if (!ship) router.push(`/docs/${r.id}`);
      else router.refresh();
    });
  return (
    <Dialog title={ship ? "Edit shipment" : "New shipment"} onClose={onClose}>
      <datalist id="xd-customers">{customers.map((x) => <option key={x} value={x} />)}</datalist>
      <datalist id="xd-countries">{countries.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="field">
        <label htmlFor="xs-cust">Customer</label>
        <input id="xs-cust" className="inp inp-lg" list="xd-customers" value={v.customer} onChange={(e) => setV({ ...v, customer: e.target.value })} maxLength={160} autoFocus autoComplete="off" />
      </div>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="xs-country">Country</label>
          <input id="xs-country" className="inp" list="xd-countries" value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} maxLength={80} autoComplete="off" placeholder="e.g. Indonesia" />
        </div>
        <div className="field">
          <label htmlFor="xs-inv">Invoice number</label>
          <input id="xs-inv" className="inp" value={v.invoice_no} onChange={(e) => setV({ ...v, invoice_no: e.target.value })} maxLength={80} autoComplete="off" />
        </div>
      </div>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="xs-inco">Incoterm</label>
          <select id="xs-inco" className="inp" value={v.incoterm} onChange={(e) => setV({ ...v, incoterm: e.target.value })}>
            <option value="">Not set</option>
            {INCOTERMS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="xs-date">Shipment date (optional)</label>
          <input id="xs-date" type="date" className="inp inp-date" value={v.shipped_on} onChange={(e) => setV({ ...v, shipped_on: e.target.value })} />
        </div>
      </div>
      {v.incoterm === "EXW" && <p className="hint">Ex-Works: documentation costs are charged back to the customer, so &ldquo;charge to customer&rdquo; starts ticked on each cost.</p>}
      <div className="field">
        <label htmlFor="xs-note">Notes (optional)</label>
        <textarea id="xs-note" className="inp" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={2000} />
      </div>
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || v.customer.trim().length < 2} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Dialog>
  );
}

const FileLink = ({ d }: { d: DocV }) =>
  d.name ? (
    <a className="file-chip" href={`/docs/file/${d.id}${d.view ? "" : "?download"}`} target={d.view ? "_blank" : undefined} rel="noopener noreferrer">
      <Icon name="file" size={14} />
      <span className="file-n">{d.name}</span>
      <span className="file-s">{d.size}</span>
    </a>
  ) : (
    <span className="small muted">no file yet</span>
  );

export function DocsHome({ ships, docs, manage }: { ships: ShipV[]; docs: DocV[]; manage: boolean }) {
  const [find, setFind] = useState("");
  const [dlg, setDlg] = useState(false);
  const byId = useMemo(() => new Map(ships.map((s) => [s.id, s])), [ships]);
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const words = find.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (text: string) => words.every((w) => text.toLowerCase().includes(w));
  const docHits = words.length ? docs.filter((d) => { const s = byId.get(d.shipment_id); return hit(`${d.doc_number} ${d.type} ${d.name ?? ""} ${d.notes} ${s?.customer ?? ""} ${s?.invoice_no ?? ""} ${s?.country ?? ""} ${s?.ref ?? ""}`); }) : [];
  const numberHits = words.length ? docHits.filter((d) => words.some((w) => d.doc_number.toLowerCase().includes(w))) : [];
  const shipHits = words.length ? ships.filter((s) => hit(`${s.ref} ${s.customer} ${s.country} ${s.invoice_no} ${s.incoterm} ${s.notes}`) || docHits.some((d) => d.shipment_id === s.id)) : ships;
  return (
    <>
      <section className="panel xd-search" aria-label="Find a document">
        <label className="rt-big">
          <span>Find</span>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Document number, customer, invoice number or country" autoFocus autoComplete="off" data-tour="xd-find" />
        </label>
      </section>
      {numberHits.length > 0 && (
        <section className="panel" aria-label="Documents found">
          <div className="panel-h">
            <h2>
              Documents with that number <span className="count">{numberHits.length}</span>
            </h2>
          </div>
          <div className="list">
            {numberHits.slice(0, 30).map((d) => {
              const s = byId.get(d.shipment_id);
              return (
                <div key={d.id} className="aprow xd-docrow">
                  <span className="ap-main">
                    <span className="ap-title">
                      {d.type} <b>{d.doc_number}</b>
                    </span>
                    <span className="ap-sub">
                      {s && <span>{s.customer}</span>}
                      {s?.country && <span>{s.country}</span>}
                      {s?.invoice_no && <span>Invoice {s.invoice_no}</span>}
                    </span>
                  </span>
                  <FileLink d={d} />
                  <span className="ap-end">
                    <Link className="btn btn-sm btn-ghost" href={`/docs/${d.shipment_id}`}>
                      Open shipment
                    </Link>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="panel" aria-label="Shipments">
        <div className="panel-h">
          <h2>
            {words.length ? "Shipments found" : "Shipments"} <span className="count">{shipHits.length}</span>
          </h2>
          {manage && (
            <button type="button" className="btn btn-sm btn-primary" data-key="n" onClick={() => setDlg(true)}>
              <Icon name="plus" size={14} />
              New shipment
              <kbd className="kbd">N</kbd>
            </button>
          )}
        </div>
        <div className="list">
          {shipHits.slice(0, 300).map((s) => (
            <Link key={s.id} className="aprow rqrow" href={`/docs/${s.id}`}>
              <span className="cid">{s.ref}</span>
              <span className="ap-main">
                <span className="ap-title">{s.customer}</span>
                <span className="ap-sub">
                  {s.country && <span>{s.country}</span>}
                  {s.invoice_no && <span>Invoice {s.invoice_no}</span>}
                  {s.incoterm && <span>{s.incoterm}</span>}
                  <span>{s.shipped_on ? day(s.shipped_on) : `added ${s.added}`}</span>
                </span>
              </span>
              <span className="ap-prog small">
                {s.docs} document{s.docs === 1 ? "" : "s"}
              </span>
              <span className="rq-best">{s.cost ? aed(s.cost) : ""}</span>
            </Link>
          ))}
          {!ships.length && <p className="empty">{manage ? "No shipments yet. Press New shipment, then add its documents and what each one cost." : "No shipments yet."}</p>}
          {ships.length > 0 && !shipHits.length && <p className="empty">Nothing matches that.</p>}
        </div>
      </section>
      {dlg && <ShipmentDialog countries={uniq(ships.map((s) => s.country))} customers={uniq(ships.map((s) => s.customer))} onClose={() => setDlg(false)} />}
    </>
  );
}

// ------------------------------------------------------------------ one shipment

function DocDialog({ ship, doc, types, cards, cats, today, onClose }: { ship: ShipV; doc?: DocV; types: NamedV[]; cards: CardV[]; cats: NamedV[]; today: string; onClose: () => void }) {
  const catFor = (typeId: string) => {
    const name = types.find((x) => x.id === typeId)?.name ?? "";
    return (cats.find((c) => (/duty/i.test(name) ? /duty/i.test(c.name) : /document/i.test(c.name))) ?? cats[0])?.id ?? "";
  };
  const [v, setV] = useState<DocInput>({ type_id: doc?.type_id ?? "", doc_number: doc?.doc_number ?? "", notes: doc?.notes ?? "", cost: doc?.cost ?? "", card_id: doc?.card_id ?? (cards.filter((c) => c.active).length === 1 ? cards.filter((c) => c.active)[0].id : ""), paid_on: doc?.paid_on ?? today, category_id: doc?.category_id ?? "", charge_customer: doc ? doc.charge_customer : ship.incoterm === "EXW" });
  const att = useAttach("xd");
  const { busy, act } = useAct();
  const hasCost = Number(String(v.cost).replace(/[, ]/g, "")) > 0;
  return (
    <Dialog title={doc ? `Edit ${doc.type}` : "Add a document"} onClose={onClose} wide>
      <div className="fields-row">
        <div className="field">
          <label>Document</label>
          <GrowSelect label="document name" placeholder="e.g. Fumigation Certificate" value={v.type_id} set={(type_id) => setV({ ...v, type_id, category_id: v.category_id || catFor(type_id) })} items={types} add={addDocType} />
        </div>
        <div className="field">
          <label htmlFor="xd-num">Document number</label>
          <input id="xd-num" className="inp" value={v.doc_number} onChange={(e) => setV({ ...v, doc_number: e.target.value })} maxLength={80} autoComplete="off" placeholder="e.g. 2650567" />
        </div>
      </div>
      <div className="field">
        <label>The file {doc?.name ? `(now: ${doc.name}; choosing a new one replaces it)` : "(you can add it later)"}</label>
        <AttachPicker att={att} />
      </div>
      <h3 className="rt-h">What it cost (leave empty if nothing was paid)</h3>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="xd-cost">Actual cost, AED</label>
          <input id="xd-cost" className="inp inp-lg" inputMode="decimal" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} placeholder="0" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="xd-card">Paid with</label>
          <select id="xd-card" className="inp" value={v.card_id} onChange={(e) => setV({ ...v, card_id: e.target.value })}>
            <option value="">Choose the card…</option>
            {cards.filter((c) => c.active || c.id === v.card_id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {hasCost && (
        <>
          <div className="fields-row">
            <div className="field">
              <label htmlFor="xd-paid">Paid on</label>
              <input id="xd-paid" type="date" className="inp inp-date" value={v.paid_on} onChange={(e) => setV({ ...v, paid_on: e.target.value })} />
            </div>
            <div className="field">
              <label>Counted as</label>
              <GrowSelect label="expense category" placeholder="e.g. Courier" value={v.category_id || catFor(v.type_id)} set={(category_id) => setV({ ...v, category_id })} items={cats} add={addExpenseCategory} />
            </div>
          </div>
          <label className="ap-check">
            <input type="checkbox" checked={v.charge_customer} onChange={(e) => setV({ ...v, charge_customer: e.target.checked })} />
            Charge this cost to the customer ({ship.customer}). It goes on Finance&apos;s monthly list.
          </label>
        </>
      )}
      <div className="field">
        <label htmlFor="xd-note">Notes (optional)</label>
        <input id="xd-note" className="inp" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={1000} autoComplete="off" />
      </div>
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || att.busy || !v.type_id} onClick={() => act(() => saveDoc(ship.id, doc?.id ?? null, { ...v, category_id: v.category_id || catFor(v.type_id) }, att.uploaded[0] ?? null), doc ? "Saved." : "Document added.", onClose)}>
          {att.busy ? "Uploading…" : "Save"}
        </button>
      </div>
    </Dialog>
  );
}

export function ShipmentView({ ship, docs, other, types, cards, cats, manage, today }: { ship: ShipV; docs: DocV[]; other: TxnV[]; types: NamedV[]; cards: CardV[]; cats: NamedV[]; manage: boolean; today: string }) {
  const router = useRouter();
  const { busy, act } = useAct();
  const [dlg, setDlg] = useState<null | "edit" | "cost" | { doc?: DocV } | { txn: TxnV }>(null);
  const total = docs.reduce((n, d) => n + (d.cost ?? 0), 0) + other.reduce((n, t) => n + t.amount, 0);
  const charge = docs.reduce((n, d) => n + (d.charge_customer ? (d.cost ?? 0) : 0), 0) + other.reduce((n, t) => n + (t.charge_customer ? t.amount : 0), 0);
  const have = new Set(docs.map((d) => d.type_id));
  const missing = types.filter((t) => t.active && !have.has(t.id));
  return (
    <>
      <section className="stats" aria-label="Shipment totals">
        <div className="stat">
          <span className="lab">Documents</span>
          <span className="val">{docs.length}</span>
          <span className="ctx">{docs.filter((d) => !d.name).length ? `${docs.filter((d) => !d.name).length} still without a file` : "all have their file"}</span>
        </div>
        <div className="stat">
          <span className="lab">Total cost</span>
          <span className="val">{aed(total)}</span>
          <span className="ctx">documents and other costs on this shipment</span>
        </div>
        <div className={`stat${charge ? " attn" : ""}`}>
          <span className="lab">Charge to customer</span>
          <span className="val">{aed(charge)}</span>
          <span className="ctx">{ship.incoterm ? `${ship.incoterm}: ` : ""}{charge ? "goes on Finance's monthly list" : "nothing to charge back"}</span>
        </div>
      </section>
      {manage && (
        <div className="ap-tools no-print">
          <button type="button" className="btn btn-primary" data-key="n" onClick={() => setDlg({})}>
            <Icon name="plus" size={15} />
            Add a document
            <kbd className="kbd">N</kbd>
          </button>
          <button type="button" className="btn" onClick={() => setDlg("cost")}>
            <Icon name="plus" size={15} />
            Other cost
          </button>
          <button type="button" className="btn" data-key="e" onClick={() => setDlg("edit")}>
            <Icon name="edit" size={15} />
            Edit shipment
            <kbd className="kbd">E</kbd>
          </button>
          {!docs.length && !other.length && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => window.confirm("Remove this empty shipment?") && act(() => removeShipment(ship.id), "Shipment removed.", () => router.push("/docs"))}>
              Remove
            </button>
          )}
        </div>
      )}
      <section className="panel" aria-label="Documents">
        <div className="panel-h">
          <h2>
            Documents <span className="count">{docs.length}</span>
          </h2>
          {missing.length > 0 && docs.length > 0 && <span className="small muted">Not added: {missing.map((m) => m.name).join(", ")}</span>}
        </div>
        {docs.length ? (
          <div className="rt-table-wrap">
            <table className="rt-table xd-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Number</th>
                  <th>File</th>
                  <th className="r">Cost</th>
                  <th>Paid with</th>
                  <th>Charge to customer</th>
                  {manage && <th />}
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <b>{d.type}</b>
                      {d.notes && <div className="small muted">{d.notes}</div>}
                    </td>
                    <td>{d.doc_number || <span className="muted">–</span>}</td>
                    <td>
                      <FileLink d={d} />
                    </td>
                    <td className="r">{d.cost ? <b>{aed(d.cost)}</b> : <span className="muted">–</span>}</td>
                    <td>{d.cost ? `${d.card}${d.paid_on ? ` · ${day(d.paid_on)}` : ""}` : ""}</td>
                    <td>{d.cost ? d.charge_customer ? <span className="ap-st rq-open">Charge</span> : <span className="small muted">No, our cost</span> : ""}</td>
                    {manage && (
                      <td className="r xd-acts">
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDlg({ doc: d })}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => window.confirm(`Remove ${d.type}${d.doc_number ? ` ${d.doc_number}` : ""}? Its file and its cost are deleted for good.`) && act(() => removeDoc(d.id), "Document removed.")}>
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{manage ? "No documents yet. Press Add a document: choose which one, type its number, attach the file, and enter what it cost." : "No documents yet."}</p>
        )}
      </section>
      {other.length > 0 && (
        <section className="panel" aria-label="Other costs">
          <div className="panel-h">
            <h2>
              Other costs on this shipment <span className="count">{other.length}</span>
            </h2>
          </div>
          <TxnTable txns={other} manage={manage} onEdit={(t) => setDlg({ txn: t })} />
        </section>
      )}
      {dlg === "edit" && <ShipmentDialog ship={ship} countries={[]} customers={[]} onClose={() => setDlg(null)} />}
      {dlg === "cost" && <TxnDialog cards={cards} cats={cats} ships={[ship]} today={today} fixedShip={ship} onClose={() => setDlg(null)} />}
      {dlg && typeof dlg === "object" && "txn" in dlg && <TxnDialog txn={dlg.txn} cards={cards} cats={cats} ships={[ship]} today={today} fixedShip={ship} onClose={() => setDlg(null)} />}
      {dlg && typeof dlg === "object" && !("txn" in dlg) && <DocDialog ship={ship} doc={dlg.doc} types={types} cards={cards} cats={cats} today={today} onClose={() => setDlg(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ card expenses

export function TxnTable({ txns, manage, onEdit }: { txns: TxnV[]; manage: boolean; onEdit: (t: TxnV) => void }) {
  const { busy, act } = useAct();
  return (
    <div className="rt-table-wrap">
      <table className="rt-table xd-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>For</th>
            <th>Details</th>
            <th>Card</th>
            <th className="r">Amount</th>
            <th>Charge to customer</th>
            {manage && <th />}
          </tr>
        </thead>
        <tbody>
          {txns.map((t) => (
            <tr key={t.id} className={t.kind === "topup" ? "xd-topup" : ""}>
              <td>{day(t.on_date)}</td>
              <td>{t.kind === "topup" ? <span className="ap-st signed">Top-up</span> : (t.category ?? "–")}</td>
              <td>
                {t.doc && <b>{t.doc} </b>}
                {t.description}
                {t.shipment_id && (
                  <>
                    {" "}
                    <Link href={`/docs/${t.shipment_id}`}>{t.customer || "shipment"}</Link>
                  </>
                )}
              </td>
              <td>{t.card}</td>
              <td className="r">
                <b>{t.kind === "topup" ? `+ ${aed(t.amount)}` : aed(t.amount)}</b>
              </td>
              <td>{t.kind === "spend" && t.charge_customer ? <span className="ap-st rq-open">{t.customer || "Charge"}</span> : ""}</td>
              {manage && (
                <td className="r xd-acts">
                  {t.doc_id ? (
                    <Link className="btn btn-sm btn-ghost" href={`/docs/${t.shipment_id}`}>
                      On shipment
                    </Link>
                  ) : (
                    <>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onEdit(t)}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={() => window.confirm(`Remove this ${t.kind === "topup" ? "top-up" : "expense"} of ${aed(t.amount)}?`) && act(() => removeTxn(t.id), "Removed.")}>
                        Remove
                      </button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TxnDialog({ txn, topup, cardId, cards, cats, ships, today, fixedShip, onClose }: { txn?: TxnV; topup?: boolean; cardId?: string; cards: CardV[]; cats: NamedV[]; ships: ShipV[]; today: string; fixedShip?: ShipV; onClose: () => void }) {
  const live = cards.filter((c) => c.active);
  const [v, setV] = useState<TxnInput>({
    card_id: txn?.card_id ?? cardId ?? (live.length === 1 ? live[0].id : ""), kind: txn?.kind ?? (topup ? "topup" : "spend"), amount: txn?.amount ?? "", on_date: txn?.on_date ?? today, category_id: txn?.category_id ?? "",
    description: txn?.description ?? "", shipment_id: txn?.shipment_id ?? fixedShip?.id ?? "", charge_customer: txn ? txn.charge_customer : fixedShip?.incoterm === "EXW", customer: txn?.customer ?? "",
  });
  const { busy, act } = useAct();
  const up = v.kind === "topup";
  const ship = ships.find((s) => s.id === v.shipment_id);
  return (
    <Dialog title={txn ? (up ? "Edit top-up" : "Edit expense") : up ? "Record a top-up" : "Add an expense"} onClose={onClose}>
      {up && <p className="hint">Money Finance paid onto the card. It lowers what is used on the card.</p>}
      <div className="fields-row">
        <div className="field">
          <label htmlFor="xt-amt">Amount, AED</label>
          <input id="xt-amt" className="inp inp-lg" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} placeholder="0" autoFocus autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="xt-date">Date</label>
          <input id="xt-date" type="date" className="inp inp-date" value={v.on_date} onChange={(e) => setV({ ...v, on_date: e.target.value })} />
        </div>
      </div>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="xt-card">Card</label>
          <select id="xt-card" className="inp" value={v.card_id} onChange={(e) => setV({ ...v, card_id: e.target.value })}>
            <option value="">Choose the card…</option>
            {cards.filter((c) => c.active || c.id === v.card_id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {!up && (
          <div className="field">
            <label>What for</label>
            <GrowSelect label="expense category" placeholder="e.g. Courier" value={v.category_id} set={(category_id) => setV({ ...v, category_id })} items={cats} add={addExpenseCategory} />
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="xt-desc">Details</label>
        <input id="xt-desc" className="inp" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={300} autoComplete="off" placeholder={up ? "e.g. Finance top-up, November" : "e.g. Lunch with visitors from Brazil"} />
      </div>
      {!up && (
        <>
          {!fixedShip && (
            <div className="field">
              <label htmlFor="xt-ship">For a shipment? (optional)</label>
              <select id="xt-ship" className="inp" value={v.shipment_id} onChange={(e) => setV({ ...v, shipment_id: e.target.value, charge_customer: e.target.value ? ships.find((s) => s.id === e.target.value)?.incoterm === "EXW" : v.charge_customer })}>
                <option value="">No shipment</option>
                {ships.slice(0, 400).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ref} · {s.customer}{s.invoice_no ? ` · ${s.invoice_no}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <label className="ap-check">
            <input type="checkbox" checked={v.charge_customer} onChange={(e) => setV({ ...v, charge_customer: e.target.checked })} />
            Charge this to a customer
          </label>
          {v.charge_customer && !ship && <input className="inp" value={v.customer} onChange={(e) => setV({ ...v, customer: e.target.value })} placeholder="Which customer?" maxLength={160} aria-label="Customer to charge" />}
        </>
      )}
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !v.card_id || !(Number(String(v.amount).replace(/[, ]/g, "")) > 0)} onClick={() => act(() => saveTxn(txn?.id ?? null, v), up ? "Top-up recorded." : "Saved.", onClose)}>
          Save
        </button>
      </div>
    </Dialog>
  );
}

function CardDialog({ card, onClose }: { card?: CardV; onClose: () => void }) {
  const [v, setV] = useState<CardInput>({ name: card?.name ?? "", credit_limit: card?.credit_limit ?? 25000, alert_at: card?.alert_at ?? 20000, statement_day: card?.statement_day ?? 18, opening_used: card?.opening_used ?? 0, active: card?.active ?? true });
  const { busy, act } = useAct();
  const n = (k: keyof CardInput, label: string, hint?: string) => (
    <div className="field">
      <label>{label}</label>
      <input className="inp" inputMode="decimal" value={String(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.value })} autoComplete="off" />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
  return (
    <Dialog title={card ? `Card: ${card.name}` : "Add a card"} onClose={onClose}>
      <div className="field">
        <label>Name</label>
        <input className="inp" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} placeholder="e.g. Ayoob's card" autoFocus />
      </div>
      <div className="fields-row">
        {n("credit_limit", "Card limit, AED")}
        {n("alert_at", "Warn when used reaches, AED", "Ayoob and the Leads get a notification to ask Finance for a top-up.")}
      </div>
      <div className="fields-row">
        {n("statement_day", "Statement day of the month")}
        {n("opening_used", "Already used when you started here, AED", "What was owed on the card before the first entry. Leave 0 if it was clear.")}
      </div>
      {card && (
        <label className="ap-check">
          <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
          In use (untick to hide a card that is no longer used; its history stays)
        </label>
      )}
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => saveCard(card?.id ?? null, v), "Card saved.", onClose)}>
          Save
        </button>
      </div>
    </Dialog>
  );
}

function BankDialog({ card, today, onClose }: { card: CardV; today: string; onClose: () => void }) {
  const [bal, setBal] = useState("");
  const [on, setOn] = useState(today);
  const { busy, act } = useAct();
  const ours = card.credit_limit - card.used;
  return (
    <Dialog title={`Bank balance: ${card.name}`} onClose={onClose}>
      <p className="hint">Type the available balance from the bank&apos;s message. The page then shows whether it matches what was entered here. By the entries, {aed(ours)} should be free today.</p>
      <div className="fields-row">
        <div className="field">
          <label htmlFor="xb-bal">Available balance, AED</label>
          <input id="xb-bal" className="inp inp-lg" inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} autoFocus autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="xb-on">Date of the message</label>
          <input id="xb-on" type="date" className="inp inp-date" value={on} onChange={(e) => setOn(e.target.value)} />
        </div>
      </div>
      <div className="form-f">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !bal.trim()} onClick={() => act(() => saveBankBalance(card.id, on, bal), "Balance saved.", onClose)}>
          Save
        </button>
      </div>
    </Dialog>
  );
}

export function CardsView({ cards, txns, cats, ships, manage, today }: { cards: CardV[]; txns: TxnV[]; cats: NamedV[]; ships: ShipV[]; manage: boolean; today: string }) {
  const [dlg, setDlg] = useState<null | { kind: "spend" | "topup"; card?: string; txn?: TxnV } | { card: CardV | null } | { bank: CardV }>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [card, setCard] = useState("");
  const [cat, setCat] = useState("");
  const shown = txns.filter((t) => (!month || t.on_date.startsWith(month)) && (!card || t.card_id === card) && (!cat || (cat === "topup" ? t.kind === "topup" : t.category_id === cat)));
  const spent = shown.filter((t) => t.kind === "spend").reduce((n, t) => n + t.amount, 0);
  return (
    <>
      <div className="xd-cards" data-tour="xd-cards">
        {cards.filter((c) => c.active).map((c) => {
          const left = c.credit_limit - c.used;
          const pct = Math.max(0, Math.min(100, (c.used / (c.credit_limit || 1)) * 100));
          const low = c.used >= c.alert_at;
          const bankDiff = c.bank != null && c.bank_used_then != null ? c.bank - (c.credit_limit - c.bank_used_then) : null;
          return (
            <section key={c.id} className={`panel xd-card${low ? " low" : ""}`} aria-label={c.name}>
              <div className="panel-h">
                <h2>{c.name}</h2>
                {low ? <span className="ap-st rejected">Running low</span> : <span className="ap-st signed">OK</span>}
              </div>
              <p className="xd-left">
                <b>{aed(left)}</b>
                <span>left of {aed(c.credit_limit)}</span>
              </p>
              <span className="rt-bar xd-bar">
                <i style={{ width: `${pct}%` }} className={low ? "" : "best"} />
              </span>
              <p className="small muted">
                Used {aed(c.used)} · warns at {aed(c.alert_at)} · statement in {c.days} day{c.days === 1 ? "" : "s"} (the {c.statement_day}
                {c.statement_day === 1 ? "st" : c.statement_day === 2 ? "nd" : c.statement_day === 3 ? "rd" : "th"})
              </p>
              {low && <p className="xd-warn">Ask Finance for a top-up. With {c.days} day{c.days === 1 ? "" : "s"} to the statement, {aed(Math.max(0, left))} may not be enough.</p>}
              <p className={`small ${bankDiff == null ? "muted" : Math.abs(bankDiff) < 1 ? "xd-match" : "xd-off"}`}>
                {bankDiff == null
                  ? "No bank balance typed in yet."
                  : Math.abs(bankDiff) < 1
                    ? `Matches the bank: ${aed(c.bank!)} on ${day(c.bank_on)}.`
                    : `Bank said ${aed(c.bank!)} on ${day(c.bank_on)}; the entries give ${aed(c.credit_limit - c.bank_used_then!)}. ${bankDiff < 0 ? `${aed(Math.abs(bankDiff))} of spending is not entered yet.` : `${aed(bankDiff)} more is entered than the bank shows.`}`}
              </p>
              {manage && (
                <div className="xd-card-b">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setDlg({ kind: "spend", card: c.id })}>
                    <Icon name="plus" size={13} />
                    Expense
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setDlg({ kind: "topup", card: c.id })}>
                    Top-up
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setDlg({ bank: c })}>
                    Bank balance
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDlg({ card: c })}>
                    Settings
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      <section className="panel" aria-label="Transactions">
        <div className="panel-h">
          <h2>
            Transactions <span className="count">{shown.length}</span>
          </h2>
          <span className="small muted">Spent in this view: <b>{aed(spent)}</b></span>
        </div>
        <div className="rt-filter-row xd-filter no-print">
          <label className="rt-since">
            <span>Month</span>
            <input type="month" className="inp inp-date" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
          </label>
          <select className="inp" value={card} onChange={(e) => setCard(e.target.value)} aria-label="Card">
            <option value="">Every card</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="inp" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">Everything</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="topup">Top-ups</option>
          </select>
          {month && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setMonth("")}>
              All months
            </button>
          )}
          <span className="sp" />
          {manage && (
            <>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDlg({ card: null })}>
                Add a card
              </button>
              <button type="button" className="btn btn-sm btn-primary" data-key="n" onClick={() => setDlg({ kind: "spend" })}>
                <Icon name="plus" size={14} />
                Add an expense
                <kbd className="kbd">N</kbd>
              </button>
            </>
          )}
        </div>
        {shown.length ? <TxnTable txns={shown} manage={manage} onEdit={(t) => setDlg({ kind: t.kind, txn: t })} /> : <p className="empty">{txns.length ? "Nothing in this view." : manage ? "Nothing entered yet. Every time a card is used, press Add an expense. Costs typed on a document appear here by themselves." : "Nothing entered yet."}</p>}
      </section>
      {dlg && "kind" in dlg && <TxnDialog txn={dlg.txn} topup={dlg.kind === "topup"} cardId={dlg.card} cards={cards} cats={cats} ships={ships} today={today} onClose={() => setDlg(null)} />}
      {dlg && "bank" in dlg && <BankDialog card={dlg.bank} today={today} onClose={() => setDlg(null)} />}
      {dlg && "card" in dlg && !("kind" in dlg) && <CardDialog card={dlg.card ?? undefined} onClose={() => setDlg(null)} />}
    </>
  );
}
