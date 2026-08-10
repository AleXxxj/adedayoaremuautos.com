/**
 * Headline markup and publication dates, exactly as the article pages carry
 * them.
 *
 * The title is stored with its `<span>` because the design highlights part of
 * every headline in green, and which part differs per article — it is an
 * editorial decision the author made, not something to derive.
 */
export const ARTICLE_HEADS: Record<string, { titleHtml: string; publishedOn: string }> = {
  "suv-guide": { titleHtml: "Top 5 SUVs for <span>Nigerian Roads</span>", publishedOn: "2024-03-05" },
  "finance-guide": { titleHtml: "How to Finance Your <span>First Car in Nigeria</span>", publishedOn: "2024-02-20" },
  "foreign-used": { titleHtml: "A Complete Guide to <span>Foreign Used Cars</span> (Tokunbo)", publishedOn: "2024-02-10" },
  "maintenance-tips": { titleHtml: "5 Essential Car <span>Maintenance Tips</span> Every Owner Should Know", publishedOn: "2024-01-25" },
  "luxury-guide": { titleHtml: "Luxury Cars vs Regular Cars: <span>Is the Premium Worth It?</span>", publishedOn: "2024-01-15" },
  "rental-guide": { titleHtml: "Car Rental Guide: <span>What to Look for Before Signing</span>", publishedOn: "2024-01-05" },
  "inspection-guide": { titleHtml: "Pre-Purchase Car Inspection: <span>A 20-Point Checklist</span>", publishedOn: "2024-12-18" },
};
