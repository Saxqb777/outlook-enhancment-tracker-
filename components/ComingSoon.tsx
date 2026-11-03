import { Icon, type IconName } from "@/components/Icon";

export default function ComingSoon({ title, lede, icon, heading, body }: { title: string; lede: string; icon: IconName; heading: string; body: string }) {
  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <h1 className="h1">{title}</h1>
          <p className="lede">{lede}</p>
        </div>
      </header>
      <section className="panel empty-state">
        <span className="es-i">
          <Icon name={icon} size={26} />
        </span>
        <h2>{heading}</h2>
        <p>{body}</p>
      </section>
    </div>
  );
}
