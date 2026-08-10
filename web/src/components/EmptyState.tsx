import Link from "next/link";

export interface EmptyAction {
  href: string;
  label: string;
  icon: string;
  primary?: boolean;
}

/**
 * The panel shown where a grid would be.
 *
 * A dealership that has not loaded its stock yet and a filter that matched
 * nothing are different situations, and running one message for both is why
 * empty pages read as broken. The caller decides which it is; this only has to
 * look like a decision rather than an accident.
 *
 * Deliberately confident rather than apologetic: on a site whose stock is
 * uploaded by the owner, "nothing here" is a stage, not a fault.
 */
export function EmptyState({
  icon,
  eyebrow,
  title,
  body,
  points,
  actions,
}: {
  icon: string;
  eyebrow?: string;
  title: string;
  body: string;
  /** Optional reassurance — what happens next, or what is on the way. */
  points?: string[];
  actions: EmptyAction[];
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true">
        <i className={icon} />
      </div>

      {eyebrow && <span className="empty-state-eyebrow">{eyebrow}</span>}
      <h3>{title}</h3>
      <p>{body}</p>

      {points && points.length > 0 && (
        <ul className="empty-state-points">
          {points.map((p) => (
            <li key={p}>
              <i className="fas fa-check" aria-hidden="true" /> {p}
            </li>
          ))}
        </ul>
      )}

      <div className="empty-state-actions">
        {actions.map((a) => (
          <Link
            key={a.href + a.label}
            href={a.href}
            className={`btn ${a.primary ? "btn-primary" : "btn-outline"}`}
          >
            <i className={a.icon} /> {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
