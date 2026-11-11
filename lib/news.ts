// The update tour and the "?" help on each page. Bump NEWS_VERSION and edit tourFor() to announce the next update.
export const NEWS_VERSION = 2;
type R = "lead" | "member" | "admin";
export type TourStep = { target?: string; title: string; text: string };

export function tourFor(role: R): TourStep[] {
  const steps: TourStep[] = [
    { title: "A few new things", text: "Here's a one-minute look at what changed. You can replay this any time from the ? button." },
    {
      title: "Chat on every case",
      text: "Open a case and choose Chat. Talk with the people on that case, and see every status change, reply and file in one place. Press Ask AI to ask about the case or draft a reply email.",
    },
  ];
  if (role === "lead") {
    steps.push(
      { target: '[data-tour="dashboard"]', title: "Your dashboard", text: "Who has what, what's late, what's blocked and what's waiting for your approval. Approve straight from here." },
      { target: '[data-tour="home"]', title: "Approvals need you", text: "The red number is how many points are Done and waiting for you to approve." },
      { title: "Hand over and assign", text: "On a case, press People to hand it to someone else or add teammates. On shared cases, give each point to a person. In Cases, press Select to move several at once." },
    );
  } else if (role === "member") {
    steps.push({ title: "Shared cases, clear owners", text: "On a shared case each point can be given to a person, so it's clear who does what. Your Home shows only your points." });
  } else {
    steps.push({ target: '[data-tour="dashboard"]', title: "Dashboard", text: "The same live view the Leads get: workload, late points, approvals and trends." });
  }
  if (role !== "admin") {
    steps.push({ target: '[data-tour="add"]', title: "Drop an email anywhere", text: "Drag an email file (.msg, .eml or PDF) onto any page. On a case it's added as a reply; anywhere else it starts a new case." });
  }
  steps.push(
    { target: '[data-tour="search"]', title: "Search everything", text: "Find a case by its ID, sender, booking, B/L or container number." },
    { target: '[data-tour="help"]', title: "Help on every page", text: "Press ? on any page for a short guide to that page, and to replay this tour." },
  );
  return steps;
}

export type HelpPage = { title: string; items: [string, string][] };

export function helpFor(path: string, role: R): HelpPage {
  const lead = role !== "member";
  if (path === "/dashboard")
    return {
      title: "Dashboard",
      items: [
        ["Key numbers", "Open cases, what's waiting for approval, what's past due, and how often work is finished on time."],
        ["Waiting for your approval", "Points people marked Done. Approve, or Reopen if it isn't finished."],
        ["Workload by person", "Each bar is one person's open points, coloured by status."],
        ["Blocked", "Points set to Waiting, with what they're waiting on and for how long."],
      ],
    };
  if (path === "/cases/export") return { title: "Export to Excel", items: [["Pick cases", "Tick the cases you want, or Select all shown. Use the filters to narrow the list."], ["Options", "Include the history of updates, and the email text if you need it."], ["Download", "You get one Excel file with a Summary, Cases, Points and Change log tab."]] };
  if (/^\/cases\/\d+\/reply/.test(path)) return { title: "Add a reply", items: [["Paste or upload", "Paste the reply, or drop the file. The whole thread is fine; only what's new is used."], ["Check the changes", "The AI suggests new points, moved deadlines and points that look done. Untick anything you don't want."], ["Save", "Nothing changes on the case until you press Save reply."]] };
  if (/^\/cases\/\d+/.test(path))
    return {
      title: "A case",
      items: [
        ["Email and points", "The email is on the left. Each numbered point is one thing to get done; click a number to see the sentence it came from."],
        ["Status", "Click a point's status to change it. Done and Waiting let you add a note and attach files."],
        ["Updates", "Open a point to post an update or attach a file. " + (lead ? "Leads add remarks and approve finished points." : "A Lead approves points you mark Done.")],
        ["Chat", "Press Chat at the top to talk with the people on this case. They get a pop-up when you write. Press Ask AI to ask about the case or draft a reply email."],
        ["Assign people", "Add teammates to the case" + (lead ? ", hand it to a new owner," : "") + " and give each point to a person."],
        ["Add a reply", "When a new email arrives on this subject, add it here so everything stays together."],
      ],
    };
  if (path === "/cases") return { title: "Cases", items: [["One case per email", "Each row is an email being worked on, with its progress and next deadline."], ["Filters and search", "Switch between Open, Past due, Needs review and Closed, or search by ID, sender or reference number."], ["Blue dot", "A blue dot means there are new chat messages on that case."], ...(role === "lead" ? ([["Select", "Press Select to hand several cases to one person."]] as [string, string][]) : []), ["Export", "Export to Excel makes a clean spreadsheet of the cases you choose."]] };
  if (path === "/board") return { title: "Board", items: [["Cards", "Every point is a card, sorted by status."], ["Move a card", "Drag it to another column, or use the ⋯ menu. Moving to Done or Waiting lets you add a note and files."], ["Open", "Click a card to open its case."]] };
  if (path === "/add") return { title: "Add an email", items: [["Three ways", "Paste the email text, upload the file, or drag the email onto the page. Outlook .msg, .eml and PDF all work."], ["The AI reads it", "It finds the sender, deadlines and each thing being asked. This takes about 10 seconds."], ["You check it", "Change anything before saving. Under Working with, pick teammates to share the case."]] };
  if (path === "/team") return { title: "Team", items: [["Invite", "Create an invite link and send it. The person sets their own name, email and password."], ["Reset password", "If someone forgets their password, make a reset link for them."], ["Access", "Turn a member's access off or back on."]] };
  if (path === "/admin") return { title: "Admin", items: [["Health", "Whether the database and AI are working."], ["See their view", "Shows the app exactly as that person sees it. You can't change anything."], ["Logs", "Every AI read and every sign-in attempt."]] };
  return {
    title: "Home",
    items: lead
      ? [["Ready for your review", "Points marked Done. Approve them, or Reopen with a remark."], ["Coming up", "What's late or due in the next two days."], ["Add email", "Paste, upload or drop an email to create a case."]]
      : [["Your next steps", "Your open points, most urgent first. Change the status or deadline right here."], ["Remarks", "Notes from the Lead on your points."], ["Add email", "Paste, upload or drop an email to create a case."]],
  };
}
