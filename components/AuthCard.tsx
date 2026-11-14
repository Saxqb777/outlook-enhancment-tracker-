import { Logo } from "@/components/Icon";

export default function AuthCard({ title, lede, children }: { title: string; lede?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <Logo size={34} />
        <span>
          <b>Shipping Tickets</b>
        </span>
      </div>
      <section className="auth-card">
        <h1 className="auth-h">{title}</h1>
        {lede && <p className="auth-lede">{lede}</p>}
        {children}
      </section>
    </div>
  );
}
