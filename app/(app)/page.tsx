import Link from "next/link";
import { Greeting, Today } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const me = await requireUser();

  if (me.role === "member") {
    return (
      <div className="page-in">
        <header className="ph">
          <div>
            <Today />
            <h1 className="h1">
              <Greeting name={me.name} />
            </h1>
            <p className="lede">You&apos;re all set up. This is where your work will show up.</p>
          </div>
        </header>
        <section className="panel">
          <div className="panel-h">
            <h2>What happens next</h2>
          </div>
          <ol className="steps">
            <li className="soon">
              <span className="step-n">1</span>
              <div>
                <b>Add an email</b>
                <p>Paste an email or drop the file. Each thing it asks for becomes a point you can track.</p>
              </div>
              <span className="tag-st">Coming next</span>
            </li>
            <li className="soon">
              <span className="step-n">2</span>
              <div>
                <b>Post updates as you go</b>
                <p>Move each point from To do to Done, and add a short update so your Lead knows where things stand.</p>
              </div>
              <span className="tag-st">Coming soon</span>
            </li>
          </ol>
        </section>
      </div>
    );
  }

  const counts = await one<{ members: number; invited: number }>(
    `select count(*) filter (where status = 'active')::int as members,
            count(*) filter (where status = 'invited')::int as invited
       from users where role = 'member'`,
  );
  const members = counts?.members ?? 0;
  const invited = counts?.invited ?? 0;
  const hasTeam = members + invited > 0;

  return (
    <div className="page-in">
      <header className="ph">
        <div>
          <Today />
          <h1 className="h1">
            <Greeting name={me.name} />
          </h1>
          <p className="lede">Welcome to Agthia Enhancements. Here&apos;s how to get your team going.</p>
        </div>
        <div className="ph-act">
          <Link className="btn" href="/team">
            <Icon name="team" size={15} />
            Open Team
          </Link>
        </div>
      </header>

      <section className="stats" aria-label="Your team">
        <Link className="stat" href="/team">
          <span className="lab">Team members</span>
          <span className="val">{members}</span>
          <span className="ctx">{members === 1 ? "person has joined" : "people have joined"}</span>
        </Link>
        <Link className="stat" href="/team">
          <span className="lab">Invites waiting</span>
          <span className="val">{invited}</span>
          <span className="ctx">{invited ? "not accepted yet" : "nobody is waiting"}</span>
        </Link>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2>Getting started</h2>
        </div>
        <ol className="steps">
          <li className={hasTeam ? "done" : ""}>
            <span className="step-n">{hasTeam ? <Icon name="check" size={14} /> : "1"}</span>
            <div>
              <b>Add your team</b>
              <p>Invite members from the Team page. Each person gets a link to choose their password.</p>
            </div>
            <Link className={`btn btn-sm${hasTeam ? "" : " btn-primary"}`} href="/team">
              {hasTeam ? "Manage team" : "Add a member"}
            </Link>
          </li>
          <li className="soon">
            <span className="step-n">2</span>
            <div>
              <b>Add your first email</b>
              <p>Paste an email or drop the file, and each thing it asks for becomes a point.</p>
            </div>
            <span className="tag-st">Coming next</span>
          </li>
          <li className="soon">
            <span className="step-n">3</span>
            <div>
              <b>Follow the work</b>
              <p>Members post updates on their points. You add remarks and approve finished work.</p>
            </div>
            <span className="tag-st">Coming soon</span>
          </li>
        </ol>
      </section>
    </div>
  );
}
