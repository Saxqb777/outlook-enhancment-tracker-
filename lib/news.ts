// The "What's new" note. Bump NEWS_VERSION and change the items to announce the next update.
export const NEWS_VERSION = 1;
export type NewsItem = { icon: "clip" | "team" | "shield" | "link"; title: string; text: string };

export function newsFor(role: "lead" | "member" | "admin"): NewsItem[] {
  const files: NewsItem = {
    icon: "clip",
    title: "Attach files",
    text:
      role === "member"
        ? "When you mark a point Done or Waiting, or post an update, you can attach photos, PDFs, Excel or Outlook files as proof. Up to 5 files, 10 MB each."
        : role === "lead"
          ? "Members can attach photos, PDFs and other files when they mark a point Done or post an update. You'll see the files right above Approve. You can attach files too."
          : "Members and Leads can now attach photos, PDFs and other files to points. You can open every file from any case.",
  };
  const shared: NewsItem = {
    icon: "team",
    title: "Shared cases",
    text:
      role === "member"
        ? "A case can now have more than one person. When you add an email, pick who you're working with under “Working with”. Shared cases show a “Shared” tag."
        : role === "lead"
          ? "Put two or more people on a case with “Add people” on the case page, or pick them when adding an email. Everyone on the case can update it."
          : "Cases can now be shared by several people. The case page shows everyone on it.",
  };
  const extra: NewsItem[] =
    role === "lead"
      ? [{ icon: "shield", title: "More than one Lead", text: "The team can now have several Leads. Every Lead sees every case and can approve finished work." }]
      : role === "admin"
        ? [{ icon: "link", title: "Invite links from Admin", text: "You can now make invite links for Members and Leads on the Team page. Everything else stays view only." }]
        : [];
  return [files, shared, ...extra];
}
