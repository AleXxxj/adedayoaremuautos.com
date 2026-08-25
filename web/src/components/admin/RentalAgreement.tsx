/**
 * The rental agreement, printed from the booking.
 *
 * The wording is the business's own, reproduced clause for clause. What
 * changes is where the facts come from: the version drawn up by hand left the
 * rate, the total and the deposit as blank lines while the booking that
 * produced it already knew all three, so they were being written in by pen and
 * could disagree with the record.
 *
 * A blank line still appears wherever a figure genuinely is not known yet —
 * the odometer readings, and the signatures. Those exist because somebody has
 * to physically look at the car, and printing a number there would defeat the
 * purpose of the line.
 */

import { numberedClauses } from "@/content/rentalTerms";

export interface AgreementData {
  renterName: string;
  phone: string | null;
  email: string | null;
  licenceNo: string | null;
  vehicle: string;
  vin: string | null;
  periodLabel: string;
  startLabel: string;
  endLabel: string;
  days: number;
  rateLines: { label: string; value: string }[];
  total: string;
  deposit: string | null;
  authorizedUse: string;
  mileageAllowancePerDay: number | null;
  excessMileRate: string | null;
  mileageUnit: string;
  pickupLocation: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  businessName: string;
  businessAddress: string;
  businessPhone: string | null;
  governingLaw: string;
  todayLabel: string;
  signedAt: string | null;
  /** Which wording the renter accepted online, and when. */
  termsAccepted: { version: string; at: string } | null;
}

function Blank({ value, width = "220px" }: { value?: string | null; width?: string }) {
  if (value) return <span className="ag-filled">{value}</span>;
  return <span className="ag-blank" style={{ minWidth: width }} />;
}

export function RentalAgreement({ d }: { d: AgreementData }) {
  const rows: [string, React.ReactNode][] = [
    ["Renter", d.renterName],
    ["Phone", <Blank key="p" value={d.phone} width="180px" />],
    ["Email", <Blank key="e" value={d.email} width="180px" />],
    ["Driving licence no.", <Blank key="l" value={d.licenceNo} width="180px" />],
    ["Vehicle", d.vehicle + (d.vin ? ` · VIN ${d.vin}` : "")],
    ["Rental period", d.periodLabel],
    ["Authorized use", d.authorizedUse],
    [
      "Mileage allowance",
      d.mileageAllowancePerDay != null
        ? `${d.mileageAllowancePerDay} ${d.mileageUnit} per rental day`
        : <Blank key="m" width="180px" />,
    ],
    [
      "Excess mileage",
      d.excessMileRate ? `${d.excessMileRate} per additional ${d.mileageUnit.replace(/s$/, "")}` : <Blank key="x" width="180px" />,
    ],
    // Filled from the booking rather than left blank — this is the whole point.
    [
      "Rental rate",
      <span key="r">
        {d.rateLines.map((l) => `${l.label} — ${l.value}`).join("; ")}
        {d.rateLines.length > 0 ? " · " : ""}
        <strong>{d.total} total for {d.days} day{d.days === 1 ? "" : "s"}</strong>
      </span>,
    ],
    ["Security deposit", <Blank key="d" value={d.deposit} width="140px" />],
    ["Pickup / return location", <Blank key="loc" value={d.pickupLocation} width="320px" />],
    [
      "Starting odometer",
      d.startOdometer != null
        ? `${d.startOdometer.toLocaleString()} ${d.mileageUnit} (recorded at pickup)`
        : <span key="so"><Blank width="160px" /> {d.mileageUnit} (record at pickup)</span>,
    ],
    [
      "Ending odometer",
      d.endOdometer != null
        ? `${d.endOdometer.toLocaleString()} ${d.mileageUnit} (recorded at return)`
        : <span key="eo"><Blank width="160px" /> {d.mileageUnit} (record at return)</span>,
    ],
  ];

  return (
    <article className="agreement">
      <header className="ag-head">
        <div className="ag-brand">{d.businessName.toUpperCase()}</div>
        <h1>Vehicle Rental Agreement</h1>
        <p className="ag-dates">Rental dates: {d.periodLabel}</p>
      </header>

      <p className="ag-intro">
        This Vehicle Rental Agreement (&ldquo;Agreement&rdquo;) is entered into
        between {d.businessName} (&ldquo;Owner&rdquo;) and the renter identified
        below (&ldquo;Renter&rdquo;). The parties agree to the following terms:
      </p>

      <table className="ag-table">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={i}>
              <th>{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="ag-clauses">
        {/* Rendered from src/content/rentalTerms.ts — the same list the
            customer accepted on the booking form. Two copies of a contract in
            two files is how a business ends up enforcing wording its customer
            never saw. */}
        {numberedClauses({
          vehicle: d.vehicle,
          use: d.authorizedUse,
          law: d.governingLaw,
        }).map((c) => (
          <div key={c.n}>
            <h2>
              {c.n}. {c.heading}
            </h2>
            <p>{c.body}</p>
          </div>
        ))}
      </section>

      <section className="ag-inspection">
        <h2>Pickup Inspection / Existing Damage Notes</h2>
        <div className="ag-notes-box" />
      </section>

      <section className="ag-sign">
        <p className="ag-sign-lead">
          By signing below, both parties acknowledge that they have read,
          understood, and agreed to this Agreement.
        </p>

        <div className="ag-sign-grid">
          <div>
            <div className="ag-sign-row">
              <span className="ag-sign-label">Renter</span>
              <span className="ag-filled">{d.renterName}</span>
            </div>
            <div className="ag-sign-row">
              <span className="ag-sign-label">Signature</span>
              <span className="ag-blank" />
            </div>
            <div className="ag-sign-row">
              <span className="ag-sign-label">Date</span>
              <span className="ag-blank" style={{ minWidth: "120px" }} />
            </div>
          </div>

          <div>
            <div className="ag-sign-row">
              <span className="ag-sign-label">Owner</span>
              <span className="ag-filled">{d.businessName}</span>
            </div>
            <div className="ag-sign-row">
              <span className="ag-sign-label">Signature</span>
              <span className="ag-blank" />
            </div>
            <div className="ag-sign-row">
              <span className="ag-sign-label">Date</span>
              <span className="ag-blank" style={{ minWidth: "120px" }} />
            </div>
          </div>
        </div>

        {/* Evidence, printed on the contract itself: the renter ticked these
            exact terms online before the vehicle was reserved. */}
        {d.termsAccepted && (
          <p className="ag-accepted">
            Renter accepted these terms online on {d.termsAccepted.at} (version{" "}
            {d.termsAccepted.version}).
          </p>
        )}

        <p className="ag-footnote">
          This document should be signed by both parties before vehicle handover.
        </p>
      </section>

      <footer className="ag-foot">
        {d.businessAddress}
        {d.businessPhone ? ` · ${d.businessPhone}` : ""}
      </footer>
    </article>
  );
}
