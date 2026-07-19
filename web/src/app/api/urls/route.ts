// Known URLs (already run / stored in the DB), for the input's search-and-pick autocomplete.
import { getKnownUrls } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ urls: getKnownUrls() });
  } catch {
    return Response.json({ urls: [] });
  }
}
