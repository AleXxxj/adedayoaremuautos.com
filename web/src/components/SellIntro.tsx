/**
 * The top of "Sell your car": what happens, in three steps, and the one
 * warning an owner selling a car needs. No price and no estimate: there is
 * no market-data feed behind this page, so the honest promise is a call and
 * an offer once someone has seen the car.
 */
const HOW = [
  { icon: "fa-pen-to-square", text: "Tell us about the car" },
  { icon: "fa-phone", text: "We call you" },
  { icon: "fa-handshake", text: "We see the car and make an offer" },
];

export function SellIntro() {
  return (
    <div className="sell-intro">
      <p className="sell-eyebrow">Sell your car</p>
      <h1 className="sell-title">
        Get <span>an offer</span> on your car
      </h1>
      <p className="sell-lead">Tell us about it in 2 minutes. We&rsquo;ll look at it and call you.</p>

      <ol className="sell-how" aria-label="How it works">
        {HOW.map((s, i) => (
          <li key={s.text}>
            <span className="sell-how-icon" aria-hidden="true">
              <i className={`fas ${s.icon}`} />
            </span>
            <span className="sell-how-text">
              <span className="sell-sr">Step {i + 1}: </span>
              {s.text}
            </span>
          </li>
        ))}
      </ol>

      {/* Scams that use a dealer's name to ask sellers for an "inspection"
          fee are common. Said before the form, where it is read. */}
      <div className="sell-notice" role="note">
        <i className="fas fa-triangle-exclamation" aria-hidden="true" />
        <p>
          <strong>We never charge you to look at your car.</strong> Nobody from Adedayo Aremu
          Autos will ask for a fee or a deposit to buy your car.
        </p>
      </div>
    </div>
  );
}
