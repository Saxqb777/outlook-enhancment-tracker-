// The Rates guide. The page at /rates/guide and docs/RATES_GUIDE.md are both written from this.
export type GuidePart = { title: string; kind: "p" | "ul" | "ol" | "eg"; lines: string[] };
export const RATES_GUIDE: GuidePart[] = [
  {
    "title": "What Rates is for",
    "kind": "p",
    "lines": [
      "Rates is your freight rate book. Every quotation you receive from a supplier goes in once, and stays there. Later you can look up what any route cost, in any month, from any supplier, and compare it with what you are paying now.",
      "It is a record and a comparison tool. It does not book or track shipments."
    ]
  },
  {
    "title": "The two words to know",
    "kind": "ul",
    "lines": [
      "Enquiry: one shipment you asked prices for. It holds the route, the cargo and the containers. Each one gets a number like RT-0002.",
      "Quote: one supplier's answer to that enquiry. It holds the freight rate for each container size, the extra charges, transit time, validity and the supplier's file."
    ]
  },
  {
    "title": "Add a quote the fast way (about one minute)",
    "kind": "ol",
    "lines": [
      "Open Rates.",
      "Drop the supplier's email, PDF or Excel on the big box that says \"Drop a supplier's quotation here\".",
      "Wait about 10 seconds. The AI fills in the supplier, route, containers, rates and charges.",
      "Check it. Fix anything that is wrong. Nothing is saved until you press Save.",
      "Press Save. The file stays attached to the quote."
    ]
  },
  {
    "title": "Add a quote by typing",
    "kind": "ol",
    "lines": [
      "Press New enquiry (or the N key).",
      "Fill From, To, commodity, and the containers with how many of each.",
      "Press \"Add the first quote now\" and type the supplier and the rate for each container size.",
      "Add each extra charge. For every charge choose what it is for: \"per container, every size\", \"per 40HC only\", \"per 20FT only\", or \"once per shipment\".",
      "Press Save."
    ]
  },
  {
    "title": "How the numbers are worked out",
    "kind": "ul",
    "lines": [
      "All in, one container = the freight for that size + the per-container charges that belong to that size.",
      "A charge marked for one size (for example \"Origin charges (40HC)\") is counted only for that size. It is never added to another size.",
      "A charge made once per shipment (telex release, documents) is not spread into the all-in rate. It is added once to the shipment total.",
      "Total for this shipment = (all in for each size x how many of that size) + the once-per-shipment charges.",
      "Other currencies are turned into AED with the rates under \"Exchange rates\". The original amount is always kept and shown."
    ]
  },
  {
    "title": "Example: Noatum, Al Ain to Auckland",
    "kind": "eg",
    "lines": [
      "40HC: freight 19,500 + origin charges (40HC) 10,350 = 29,850 all in",
      "20FT: freight 15,400 + origin charges (20GP) 9,550 = 24,950 all in",
      "Telex release: 250, once per shipment",
      "Shipment of 1 x 20FT: 24,950 + 250 = 25,200",
      "Shipment of 1 x 40HC + 1 x 20FT: 29,850 + 24,950 + 250 = 55,050"
    ]
  },
  {
    "title": "If a supplier quotes a size that is not in your shipment",
    "kind": "ul",
    "lines": [
      "The comparison shows a yellow line, for example \"40HC was quoted, but this shipment is saved as 1 x 20FT\".",
      "Press \"Add 1 x 40HC to the shipment\" if the shipment really has it. The total then includes it.",
      "If it does not, leave it. The 40HC rate is still kept in the rate book for later."
    ]
  },
  {
    "title": "Find a rate",
    "kind": "ol",
    "lines": [
      "Type the place in From and To. A city, a port or a country all work. One box is enough.",
      "The four cards show: lowest all-in rate, latest, last agreed, and the gap between suppliers.",
      "If there is more than one container size, pick the size with the chips above the cards.",
      "Use the filters for service, mode, supplier, commodity, or \"Only the month\"."
    ]
  },
  {
    "title": "What was the rate in January? (Rate by month)",
    "kind": "ol",
    "lines": [
      "Search the route.",
      "Look at the panel \"Rate by month\". Each month has its lowest all-in rate, the supplier, the average and how it moved against the month before.",
      "At the top of that panel, pick a month under \"Then\" and a month under \"Now\". It shows the difference in AED and in percent, and whether you pay more or less now.",
      "Press a month's name to see only that month's quotes."
    ]
  },
  {
    "title": "Compare suppliers on one enquiry",
    "kind": "ul",
    "lines": [
      "Open the enquiry. The table has suppliers across and the price lines down. The lowest in each row is marked.",
      "The rows \"All in, one 20FT\" and \"All in, one 40HC\" are the numbers to compare.",
      "Press Award under the supplier you choose, give the reason, PR number and PO buffer, then \"Send for approval\" to a Lead.",
      "\"Export comparison\" gives the Excel sheet in your usual layout."
    ]
  },
  {
    "title": "Correct a mistake",
    "kind": "ul",
    "lines": [
      "Press Correct on the quote, change it, save. The old version is kept under \"Earlier versions\". Nothing is overwritten.",
      "Press \"Edit shipment\" to change the route, cargo or containers."
    ]
  },
  {
    "title": "Keep your files (Documents)",
    "kind": "ul",
    "lines": [
      "Rates > Documents. Drop any files: old rate sheets, contracts, emails, photos.",
      "Up to 50 MB each, 20 files at a time.",
      "Press Details to add the route, supplier and date, so you can find it later with the search box."
    ]
  },
  {
    "title": "Load old rates from Excel",
    "kind": "ol",
    "lines": [
      "Rates > Import from Excel > Download the template.",
      "One row per rate: date, supplier, from, to, container, rate, currency. The other columns are optional.",
      "Choose the file. Rows for the same route and date become one enquiry. Nothing already saved is changed."
    ]
  },
  {
    "title": "If something is not right",
    "kind": "ul",
    "lines": [
      "Press \"Something not right? Tell us\" at the top of Rates.",
      "Write it in your own words, with the route or the quote and what you expected to see.",
      "Your note is saved with its status: Sent, Being fixed, Fixed, and a reply when it is done."
    ]
  },
  {
    "title": "Who can see what",
    "kind": "ul",
    "lines": [
      "You: everything, and you are the only one who can add or change.",
      "Leads and the Admin: can look, search and export. They cannot change anything.",
      "Other team members and vendors: cannot see Rates at all."
    ]
  }
];
