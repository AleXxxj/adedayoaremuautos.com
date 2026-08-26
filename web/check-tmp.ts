import { db } from "./src/db";
import { rentalBookings } from "./src/db/schema";
import { bookingTiming, timingLabel, urgencyOf } from "./src/lib/bookingTiming";
(async () => {
  const rows = await db.select().from(rentalBookings);
  const out = rows.map(b => ({
    who: b.customerName,
    status: b.status,
    urgency: urgencyOf(b.period as unknown as string, b.status),
    says: timingLabel(bookingTiming(b.period as unknown as string, b.status))?.text ?? "—",
  })).sort((a, z) => a.urgency - z.urgency);
  console.table(out);
  process.exit(0);
})();
