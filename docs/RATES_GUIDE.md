# Rates: how it works

A short guide for the person who runs the freight rate book in Shipping Tickets. The same guide is inside the site: Rates > How Rates works.

## What Rates is for

Rates is your freight rate book. Every quotation you receive from a supplier goes in once, and stays there. Later you can look up what any route cost, in any month, from any supplier, and compare it with what you are paying now.

It is a record and a comparison tool. It does not book or track shipments.

## The two words to know

- Enquiry: one shipment you asked prices for. It holds the route, the cargo and the containers. Each one gets a number like RT-0002.
- Quote: one supplier's answer to that enquiry. It holds the freight rate for each container size, the extra charges, transit time, validity and the supplier's file.

## Add a quote the fast way (about one minute)

1. Open Rates.
2. Drop the supplier's email, PDF or Excel on the big box that says "Drop a supplier's quotation here".
3. Wait about 10 seconds. The AI fills in the supplier, route, containers, rates and charges.
4. Check it. Fix anything that is wrong. Nothing is saved until you press Save.
5. Press Save. The file stays attached to the quote.

## Add a quote by typing

1. Press New enquiry (or the N key).
2. Fill From, To, commodity, and the containers with how many of each.
3. Press "Add the first quote now" and type the supplier and the rate for each container size.
4. Add each extra charge. For every charge choose what it is for: "per container, every size", "per 40HC only", "per 20FT only", or "once per shipment".
5. Press Save.

## How the numbers are worked out

- All in, one container = the freight for that size + the per-container charges that belong to that size.
- A charge marked for one size (for example "Origin charges (40HC)") is counted only for that size. It is never added to another size.
- A charge made once per shipment (telex release, documents) is not spread into the all-in rate. It is added once to the shipment total.
- Total for this shipment = (all in for each size x how many of that size) + the once-per-shipment charges.
- Other currencies are turned into AED with the rates under "Exchange rates". The original amount is always kept and shown.

## Example: Noatum, Al Ain to Auckland

```
40HC: freight 19,500 + origin charges (40HC) 10,350 = 29,850 all in
20FT: freight 15,400 + origin charges (20GP) 9,550 = 24,950 all in
Telex release: 250, once per shipment
Shipment of 1 x 20FT: 24,950 + 250 = 25,200
Shipment of 1 x 40HC + 1 x 20FT: 29,850 + 24,950 + 250 = 55,050
```

## If a supplier quotes a size that is not in your shipment

- The comparison shows a yellow line, for example "40HC was quoted, but this shipment is saved as 1 x 20FT".
- Press "Add 1 x 40HC to the shipment" if the shipment really has it. The total then includes it.
- If it does not, leave it. The 40HC rate is still kept in the rate book for later.

## Find a rate

1. Type the place in From and To. A city, a port or a country all work. One box is enough.
2. The four cards show: lowest all-in rate, latest, last agreed, and the gap between suppliers.
3. If there is more than one container size, pick the size with the chips above the cards.
4. Use the filters for service, mode, supplier, commodity, or "Only the month".

## What was the rate in January? (Rate by month)

1. Search the route.
2. Look at the panel "Rate by month". Each month has its lowest all-in rate, the supplier, the average and how it moved against the month before.
3. At the top of that panel, pick a month under "Then" and a month under "Now". It shows the difference in AED and in percent, and whether you pay more or less now.
4. Press a month's name to see only that month's quotes.

## Compare suppliers on one enquiry

- Open the enquiry. The table has suppliers across and the price lines down. The lowest in each row is marked.
- The rows "All in, one 20FT" and "All in, one 40HC" are the numbers to compare.
- Press Award under the supplier you choose, give the reason, PR number and PO buffer, then "Send for approval" to a Lead.
- "Export comparison" gives the Excel sheet in your usual layout.

## Correct a mistake

- Press Correct on the quote, change it, save. The old version is kept under "Earlier versions". Nothing is overwritten.
- Press "Edit shipment" to change the route, cargo or containers.

## Keep your files (Documents)

- Rates > Documents. Drop any files: old rate sheets, contracts, emails, photos.
- Up to 50 MB each, 20 files at a time.
- Press Details to add the route, supplier and date, so you can find it later with the search box.

## Load old rates from Excel

1. Rates > Import from Excel > Download the template.
2. One row per rate: date, supplier, from, to, container, rate, currency. The other columns are optional.
3. Choose the file. Rows for the same route and date become one enquiry. Nothing already saved is changed.

## If something is not right

- Press "Something not right? Tell us" at the top of Rates.
- Write it in your own words, with the route or the quote and what you expected to see.
- Your note is saved with its status: Sent, Being fixed, Fixed, and a reply when it is done.

## Who can see what

- You: everything, and you are the only one who can add or change.
- Leads and the Admin: can look, search and export. They cannot change anything.
- Other team members and vendors: cannot see Rates at all.
