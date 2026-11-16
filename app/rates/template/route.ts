import { getCurrentUser } from "@/lib/auth";
import { templateWorkbook, xlsxResponse } from "@/lib/rate-excel";

export const dynamic = "force-dynamic";

/** The layout the Excel import understands. */
export async function GET() {
  if (!(await getCurrentUser())) return new Response("Sign in first.", { status: 401 });
  return xlsxResponse(templateWorkbook(), "Rates import template.xlsx");
}
