import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { landingFor } from "@/lib/adminNav";

/**
 * The admin has no dashboard of its own; it sends you to the screen your role
 * actually starts the day on. Sales go to the enquiries, because an unanswered
 * message is the most time-sensitive thing in the building.
 */
export default async function AdminIndex() {
  const user = await requireStaff();
  redirect(landingFor(user.role));
}
