// The partner pages use the same icon set as the rest of the site, but sit
// outside the market layout that loads it, so every icon here (WhatsApp,
// Text, Copy on each car) rendered as nothing. Loaded here for all of them,
// as the admin layout does for its own pages.
import "@fortawesome/fontawesome-free/css/all.min.css";

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
