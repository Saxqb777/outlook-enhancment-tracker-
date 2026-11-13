// The update tour and the "?" help on each page. Bump NEWS_VERSION and edit tourFor() to announce the next update.
export const NEWS_VERSION = 5;
type R = "lead" | "member" | "admin";
export type TourStep = { target?: string; title: string; text: string };

export function tourFor(role: R): TourStep[] {
  const admin = role === "admin";
  const steps: TourStep[] = [
    { title: "Two big updates", text: "First the new Vendors section, then what changed in the look of the app. It takes about a minute, and you can replay it any time from the ? button." },
    // ---- Vendors
    {
      target: '[data-tour="vendors"]',
      title: "New: Vendors",
      text: admin
        ? "The team can now ask transporters for prices here. You can see every request, quote and chat, view only."
        : "Ask your transporters for a price, compare what they answer, and pick one. All in one place instead of calls and WhatsApp.",
    },
    {
      title: "1. Add your vendors",
      text: admin
        ? "Leads and Members add each vendor company and send it a join link. Each vendor gets a separate portal and never sees the team's cases."
        : "On the Vendors page press Vendors, then Add vendor. Open the vendor and press Get join link, and send it to your contact. They make their own login for the vendor portal. Several people from one company can join.",
    },
    {
      title: "2. Send a request",
      text: admin
        ? "A request is a form the team builds itself: from, to, cargo, dates, or any field they add. It goes to one or many vendors at once."
        : "Press New request. Build the form the way you need it: tap the suggested fields, add your own, and save it to reuse next time. Pick one or many vendors and send. On a case, the Ask vendors button starts a request linked to that case.",
    },
    {
      title: "3. Vendors reply in their portal",
      text: "Each vendor answers Can do with a price, date and notes, or Can't do with a reason. They only ever see their own request and price, never another vendor's. Tell new vendors to check the portal, since it does not send emails.",
    },
    {
      title: "4. Compare and chat",
      text: admin
        ? "Quotes sit side by side, with the cheapest and the soonest marked. Every vendor has a private chat on each request."
        : "Quotes sit side by side, with the cheapest and the soonest marked. Tap a vendor to chat with them about that request, for example to ask for a better price. Ask AI to compare, or to draft a counter-offer.",
    },
    {
      title: "5. Award the job",
      text:
        role === "lead"
          ? "Press Award on the quote you want. When a Member chooses a vendor, it comes to you first: Approve award or Send back. The winner confirms the job and the others are told politely."
          : role === "member"
            ? "Press Choose on the quote you want and say why. A Lead approves it, then the vendor is told and confirms the job. The others are told politely."
            : "A Lead awards directly. A Member's choice needs a Lead's approval first. The winner confirms the job and the others are told politely.",
    },
    {
      title: "6. Track the job with milestones",
      text: admin
        ? "Once the vendor confirms, the request becomes a Job with milestones (truck assigned, picked up, delivered, proof of delivery). The team and the vendor both tick them."
        : "When you choose a vendor you also set the milestones for the job: tap the suggested ones, add your own, and save the list to reuse. After the vendor confirms, it moves to the Jobs list. The vendor ticks each milestone, and you can too. Anyone can comment on a milestone or report a problem. The job can be closed once Proof of delivery is uploaded, with an optional rating.",
    },
    { title: "Everything about a vendor", text: "Open any vendor to see their people, every request and price they gave, how fast they reply and how often they win. Export to Excel gives you all requests and quotes in one file." },
    // ---- the look
    { title: "Now, the new look", text: "The app got a tidy-up to make it easier to read and tap, most of all on phones." },
    { target: '[data-tour="home"]', title: "Colours that mean something", text: "A number card turns green when work is waiting for a Lead and red when something is late. Otherwise it stays plain." },
    { target: '[data-tour="more"]', title: "Phones: the More button", text: "The bottom bar now has Home, Cases, Add, Vendors and More. Board, Approvals and the rest are under More. Buttons are bigger and case titles are shown in full." },
    { target: '[data-tour="approvals"]', title: "Approvals, polished", text: "Signed, waiting and rejected are colour-coded, and each approval shows a small bar of who has signed." },
  ];
  if (role === "lead") steps.push({ title: "Team moved", text: "Team is now in the menu under your name at the top right, to keep the bar short." });
  if (admin) steps.push({ title: "Change roles", text: "On the Admin page you can now make a Member a Lead, or a Lead a Member, at any time." }, { title: "See a vendor's portal, and a test area", text: "On the Admin page, See their portal shows what any vendor sees. The Test area is a sandbox with a request in every stage, where you can try every screen without touching real work." });
  steps.push({ target: '[data-tour="help"]', title: "Help on every page", text: "Press ? on any page for a short guide to that page, and to replay this tour." });
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
  if (path === "/account") return { title: "My account", items: [["Change my password", "Type your current password, then the new one twice. Your other devices are signed out."], ["Forgot it?", "Ask a Lead for a reset link. The Admin can reset with the setup code from the sign-in page."]] };
  if (path === "/vendors/new")
    return { title: "Ask vendors for a price", items: [["Build the form", "Fill in the suggested fields, remove the ones you don't need, or add your own. Fields with Date in the name get a date picker."], ["Save this form", "Saves the field names so anyone can reuse the form next time. Saving with the same name updates it."], ["Send to", "Pick one or many vendors, or filter by type and press Select all shown. Each vendor only sees their own quote."], ["Reply by", "Vendors see this date and get a reminder mark when it's close."]] };
  if (/^\/vendors\/rfq\/\d+/.test(path))
    return {
      title: "A vendor request",
      items: [
        ["Quotes", "One card per vendor with price, date and notes. Cheapest and Soonest are marked when there are several."],
        ["Chat", "Tap a vendor to open your private chat with them about this request. Yellow notes are for the team only; vendors never see them."],
        [lead ? "Award" : "Choose", lead ? "Awards the job. The vendor is asked to confirm and the others are told another quote was chosen. A Member's choice shows at the top for you to approve or send back." : "Pick the quote you want and say why. A Lead approves it before the vendor is told."],
        ["Edit request", "You can change the details while it's open. Vendors are told, so they can check their price."],
        ["Message all, Remind", "Send one message to every vendor at once, or nudge the ones who haven't replied."],
        ["Ask AI", "Compare the quotes in plain words, or draft a counter-offer to paste into the chat."],
        ["Job progress", "After the award, the milestones show here. They are ticked in order: Mark done shows on the next one only (the vendor can tick too), and only the last tick can be undone. Remove a milestone if it doesn't apply. The speech bubble opens comments, Report a problem, Undo and Remove. Add a milestone at the bottom."],
        ["Close job", "Needs Proof of delivery first. Rating and final cost are optional."],
      ],
    };
  if (/^\/vendors\/v\/\d+/.test(path))
    return { title: "A vendor", items: [["Get join link", "Send this link to your contact. Anyone at the vendor can use it to make their own login. It works for 14 days."], ["Scorecard", "How many requests they got, how many they quoted and won, and how fast they reply."], ["Requests and prices", "Every request sent to them and the price they gave, so you can see what a job cost last time."], ["People", "Everyone from this vendor with a login." + (role === "lead" ? " You can turn a person's access off." : "")]] };
  if (path === "/vendors")
    return {
      title: "Vendors",
      items: [
        ["Requests", "Price requests that are still open: how many vendors replied and the best price so far."],
        ["Jobs", "Requests that were awarded. Shows which milestone each job is at, what's late and any problem the vendor reported."],
        ["Vendors", "Your transporters. Add one, then open it to get their join link and see their history."],
        ["New request", "Ask one or many vendors for a price with a form you build yourself."],
        ["Blue dot", "A blue dot means a vendor replied or wrote in the chat."],
        ["Export", "One Excel file with all requests, quotes and vendors."],
      ],
    };
  if (path === "/approvals/new")
    return { title: "Ask for an approval", items: [["Say what it is", "Give it a title, then write the details or attach the document. You can do both."], ["Pick who signs", "One person or several. It is Signed only when all of them have signed."], ["Needed by", "Add a date if it's urgent. The signers see it."]] };
  if (/^\/approvals\/\d+/.test(path))
    return {
      title: "An approval",
      items: [
        ["Sign", "Draw your signature with a finger or the mouse. Your name, the date and the time are added for you."],
        ["Send back", "Not right yet? Say what needs to change. The request stays open and the person asking can reply or send a corrected version."],
        ["Final reject", "Closes the request for everyone. To try again, a new request has to be filed."],
        ["Corrected version", "The person asking can send a fixed text or document. Everyone signs the new version; earlier signatures stay in the record."],
        ["Record", "Every signature, reply and version, in order. It can't be edited. Print or save it as a PDF from the top."],
      ],
    };
  if (path === "/approvals")
    return {
      title: "Approvals",
      items: [
        ["For me to sign", "Requests waiting for your signature. The red number on the tab counts these."],
        ["I asked for", "Your open requests, and how many people have signed so far."],
        ["New request", "Ask one or more people to sign a document or a request."],
        [lead ? "History" : "My history", lead ? "Every finished request: signed, rejected or cancelled." : "Finished requests you asked for or were asked to sign."],
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
        ...(role === "lead" ? ([["Fix mistakes", "Open a point to Edit wording or Remove point. The small x on a file removes it. Archive hides the whole case from the lists without deleting it; find it again under Cases, Archived."]] as [string, string][]) : []),
      ],
    };
  if (path === "/cases") return { title: "Cases", items: [["One case per email", "Each row is an email being worked on, with its progress and next deadline."], ["Filters and search", "Switch between Open, Past due, Needs review and Closed, or search by ID, sender or reference number."], ["Blue dot", "A blue dot means there are new chat messages on that case."], ...(role === "lead" ? ([["Select", "Press Select to hand several cases to one person."]] as [string, string][]) : []), ["Export", "Export to Excel makes a clean spreadsheet of the cases you choose."]] };
  if (path === "/board") return { title: "Board", items: [["Cards", "Every point is a card, sorted by status."], ["Move a card", "Drag it to another column, or use the ⋯ menu. Moving to Done or Waiting lets you add a note and files."], ["Open", "Click a card to open its case."]] };
  if (path === "/add") return { title: "Add an email", items: [["Three ways", "Paste the email text, upload the file, or drag the email onto the page. Outlook .msg, .eml and PDF all work."], ["The AI reads it", "It finds the sender, deadlines and each thing being asked. This takes about 10 seconds."], ["You check it", "Change anything before saving. Under Working with, pick teammates to share the case."]] };
  if (path === "/team") return { title: "Team", items: [["Invite", "Create an invite link and send it. The person sets their own name, email and password."], ["Reset password", "If someone forgets their password, make a reset link for them."], ["Access", "Turn a member's access off or back on."]] };
  if (path === "/admin") return { title: "Admin", items: [["Health", "Whether the database and AI are working."], ["See their view", "Shows the app exactly as that person sees it. You can't change anything."], ["Make Lead / Make Member", "Switch a person between Lead and Member at any time. The team always keeps at least one Lead."], ["See their portal", "Under Vendors: opens the vendor portal exactly as that vendor sees it, view only."], ["Activity", "Sensitive actions with who did them: role changes, reset links, access changes, awards, removals and view-as. Download a backup saves one file with all records."], ["Test area", "A sandbox with test vendors and a test request in every stage. Only you see it, and there you can quote, chat, award and confirm to try every screen. Reset puts it back."], ["Logs", "Every AI read and every sign-in attempt."]] };
  return {
    title: "Home",
    items: lead
      ? [["Ready for your review", "Points marked Done. Approve them, or Reopen with a remark."], ["Coming up", "What's late or due in the next two days."], ["Add email", "Paste, upload or drop an email to create a case."]]
      : [["Your next steps", "Your open points, most urgent first. Change the status or deadline right here."], ["Remarks", "Notes from the Lead on your points."], ["Add email", "Paste, upload or drop an email to create a case."]],
  };
}
