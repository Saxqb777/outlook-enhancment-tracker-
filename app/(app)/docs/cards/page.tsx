import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardsView, DocsTabs } from "@/components/XDocs";
import { getViewer } from "@/lib/auth";
import { todayISO } from "@/lib/time";
import { docsAccess, getBudget, listCards, listCategories, listShipments, listTxns } from "@/lib/xdocs";
import { budgetV, cardV, shipV, txnV } from "@/lib/xdocs-view";

export const metadata: Metadata = { title: "Card expenses" };
export const dynamic = "force-dynamic";

export default async function CardExpensesPage() {
  const { me, viewOnly } = await getViewer();
  const access = docsAccess(me);
  if (!access.view) notFound();
  const [cards, txns, cats, ships, budget] = await Promise.all([listCards(), listTxns(), listCategories(), listShipments(), getBudget()]);
  const today = todayISO();
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">Card expenses</h1>
          <p className="lede opt">Every time a card is used, it is entered here: what for, how much, and which card paid. One limit covers all the cards together.</p>
        </div>
      </header>
      <DocsTabs />
      <CardsView budget={budgetV(budget, today)} cards={cards.map(cardV)} txns={txns.map(txnV)} cats={cats} ships={ships.map(shipV)} manage={access.manage && !viewOnly} today={today} />
    </div>
  );
}
