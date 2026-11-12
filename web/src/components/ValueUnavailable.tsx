import Link from "next/link";

/**
 * "What's my car worth?" while there is no estimate to give: the estimate is
 * switched off, or switched on for staff only and this visitor isn't staff.
 *
 * It says so in one line and offers the two things that do work today: a
 * real offer from us, and the free car check. No date and no "coming soon":
 * nobody has promised one.
 */
export function ValueUnavailable({ sellHref, checkHref }: { sellHref: string; checkHref: string }) {
  return (
    <section className="val-panel val-off" aria-labelledby="val-off-title">
      <span className="val-badge" aria-hidden="true">
        <i className="fas fa-hourglass-half" />
      </span>
      <h2 className="val-h" id="val-off-title">
        Price estimates aren&rsquo;t available yet
      </h2>
      <p className="val-text">2 things you can do today:</p>

      <div className="val-choice">
        <Link href={sellHref} className="val-btn val-btn--primary val-btn--wide">
          Get an offer on your car
        </Link>
        <p className="val-fine">Tell us about it. We look at the car and call you.</p>
      </div>
      <div className="val-choice">
        <Link href={checkHref} className="val-btn val-btn--outline val-btn--wide">
          Check any car, free
        </Link>
        <p className="val-fine">Recalls, owner complaints and crash-test stars, by VIN.</p>
      </div>
    </section>
  );
}
