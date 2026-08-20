import { redirect } from "next/navigation";
import type { Staff } from "@/lib/auth";
import type { AdminNavItem } from "@/components/admin/AdminNav";

/**
 * What each role can reach.
 *
 * Sales handle customers: enquiries, appointments, the cars themselves. They
 * do not see the finance ledger or set the prices the business publishes —
 * not because they are untrusted, but because a screen you cannot act on is
 * noise, and money screens invite accidents.
 *
 * This drives the navigation and the landing page. It is not the security
 * boundary: every page calls requireStaff() and checks for itself, so hiding a
 * link never has to be load-bearing.
 */
const ALL: (AdminNavItem & { roles: Staff["role"][] })[] = [
  { href: "/admin/vehicles", label: "Inventory", icon: "fas fa-car", roles: ["owner", "manager", "sales"] },
  { href: "/admin/leads", label: "Leads", icon: "fas fa-inbox", roles: ["owner", "manager", "sales"] },
  { href: "/admin/deals", label: "Deals", icon: "fas fa-handshake", roles: ["owner", "manager", "sales"] },
  { href: "/admin/rentals", label: "Rentals", icon: "fas fa-calendar-check", roles: ["owner", "manager", "sales"] },
  { href: "/admin/finance", label: "Finance", icon: "fas fa-file-invoice-dollar", roles: ["owner", "manager"] },
  { href: "/admin/tiers", label: "Rent to Own", icon: "fas fa-key", roles: ["owner", "manager"] },
  { href: "/admin/referrals", label: "Referrals", icon: "fas fa-hand-holding-usd", roles: ["owner", "manager"] },
  { href: "/admin/subscribers", label: "Mailing list", icon: "fas fa-envelope-open-text", roles: ["owner", "manager"] },
  { href: "/admin/comments", label: "Comments", icon: "fas fa-comments", roles: ["owner", "manager"] },
  { href: "/admin/staff", label: "Staff", icon: "fas fa-user-shield", roles: ["owner"] },
];

export function navFor(role: Staff["role"]): AdminNavItem[] {
  return ALL.filter((i) => i.roles.includes(role)).map(({ href, label, icon }) => ({
    href,
    label,
    icon,
  }));
}

/**
 * Enforces what the navigation only implies.
 *
 * Hiding a link stops it being clicked; it does not stop the URL being typed,
 * bookmarked from a previous role, or followed from an old email. Pages that
 * are not for everyone call this, so the rule is applied where the data is
 * read rather than where the menu is drawn.
 */
export function canReach(role: Staff["role"], href: string): boolean {
  const item = ALL.find((i) => href === i.href || href.startsWith(`${i.href}/`));
  return item ? item.roles.includes(role) : true;
}

/**
 * Where a role lands after signing in.
 *
 * Sales start on the enquiry list, because a new message is the thing that
 * needs answering fastest. Everyone else starts on inventory.
 */
export function landingFor(role: Staff["role"]): string {
  return role === "sales" ? "/admin/leads" : "/admin/vehicles";
}

/**
 * Sends a member of staff back to their own landing page if they reach for a
 * section their role does not cover. A redirect rather than an error: they
 * have done nothing wrong, and there is a screen that is theirs.
 */
export function assertSection(role: Staff["role"], href: string): void {
  if (!canReach(role, href)) {
    redirect(landingFor(role));
  }
}
