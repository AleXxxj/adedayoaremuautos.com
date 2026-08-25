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
        <h2>1. Authorized Use</h2>
        <p>
          Renter may operate the {d.vehicle} only for lawful purposes during the
          rental period. Authorized use: {d.authorizedUse}. If used for DoorDash
          or other delivery work, Renter is responsible for maintaining all
          insurance, platform approvals, permits, and coverage required for that
          activity. No racing, towing, off-road use, illegal activity, or
          prohibited use.
        </p>

        <h2>2. Authorized Driver</h2>
        <p>
          Only the Renter and any additional driver approved in writing by Owner
          may operate the vehicle. Renter may not lend, sub-rent, or transfer
          possession.
        </p>

        <h2>3. Payment</h2>
        <p>
          Rental charges and the security deposit are due as agreed before or at
          pickup unless Owner gives written approval otherwise. The deposit may
          be applied to unpaid charges, cleaning, fuel, tolls, tickets, damage,
          or other amounts for which Renter is responsible.
        </p>

        <h2>4. Insurance and Licensing</h2>
        <p>
          Renter represents that Renter has a valid driver&rsquo;s license and
          legally required insurance for the vehicle and intended use. Renter
          understands that personal auto insurance may exclude delivery,
          rideshare, commercial, rental, or business use and must confirm
          coverage before operating the vehicle.
        </p>

        <h2>5. Vehicle Condition</h2>
        <p>
          Renter accepts the vehicle in its condition at pickup, subject to the
          inspection record and photographs. Renter must return it in
          substantially the same condition, ordinary wear and tear excepted.
        </p>

        <h2>6. Mileage, Fuel, Tolls and Tickets</h2>
        <p>
          Renter receives{" "}
          {d.mileageAllowancePerDay != null
            ? `${d.mileageAllowancePerDay} ${d.mileageUnit} per rental day`
            : "the mileage stated above"}
          . Additional mileage is charged at{" "}
          {d.excessMileRate ?? "the rate stated above"} per additional{" "}
          {d.mileageUnit.replace(/s$/, "")}. Renter is responsible for fuel,
          parking, tolls, citations, towing, impound fees, and other charges
          arising from Renter&rsquo;s use.
        </p>

        <h2>7. Maintenance and Mechanical Problems</h2>
        <p>
          Renter must promptly notify Owner of warning lights, mechanical
          problems, accidents, or unsafe conditions. Major repairs require
          Owner&rsquo;s prior approval except in an immediate safety emergency.
        </p>

        <h2>8. Accidents and Damage</h2>
        <p>
          Renter must immediately report accidents, theft, vandalism, or
          significant damage to Owner and law enforcement when required,
          cooperate with insurance claims, and provide truthful information.
          Renter is responsible for loss or damage caused by negligence, misuse,
          unauthorized drivers, prohibited use, or breach of this Agreement,
          subject to applicable law and insurance.
        </p>

        <h2>9. Return of Vehicle</h2>
        <p>
          The vehicle must be returned by the agreed date and time with the
          agreed fuel level and all keys, documents, and equipment. Unauthorized
          late return may result in additional charges.
        </p>

        <h2>10. No Guarantee of Earnings</h2>
        <p>
          Owner makes no guarantee regarding earnings from DoorDash, delivery
          services, rideshare, or other gig work.
        </p>

        <h2>11. Termination</h2>
        <p>
          Owner may terminate the rental and require return of the vehicle for
          material breach, nonpayment, loss of required licensing or insurance,
          false information, unlawful use, or unreasonable risk of loss or
          damage, subject to applicable law.
        </p>

        <h2>12. Governing Law</h2>
        <p>
          This Agreement is intended to be governed by applicable{" "}
          {d.governingLaw} law, except where another rule is required by law.
          Unenforceable provisions will be limited or severed as necessary.
        </p>
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
