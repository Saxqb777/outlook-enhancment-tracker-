import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardsView, DocsTabs } from "@/components/XDocs";
import { getViewer } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { docsAccess, listCards, listCategories, listShipments, listTxns } from "@/lib/xdocs";
import { cardV, shipV, txnV } from "@/lib/xdocs-view";

export const metadata: Metadata = { title: "Card expenses" };
export const dynamic = "force-dynamic";

export default async function CardExpensesPage() {
  const { me, viewOnly } = await getViewer();
  const access = docsAccess(me);
  if (!access.view) notFound();
  const [cards, txns, cats, ships] = await Promise.all([listCards(), listTxns(), listCategories(), listShipments()]);
  const today = todayISO();
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Card expenses</h1>
          <p className="lede opt">Every time a card is used, it is entered here: what for, how much, which card. The balance and the monthly report follow from that.</p>
        </div>
      </header>
      <DocsTabs />
      <CardsView cards={cards.map((c) => cardV(c, today))} txns={txns.map(txnV)} cats={cats} ships={ships.map(shipV)} manage={access.manage && !viewOnly} today={today} />
    </div>
  );
}
