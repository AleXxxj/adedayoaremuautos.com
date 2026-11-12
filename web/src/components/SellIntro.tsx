/**
 * The top of "Sell us your car": what happens, in three steps, and the one
 * warning an owner selling a car needs. No price and no estimate: there is
 * no market-data feed behind this page. And no promise of an offer: the
 * business makes one only for a car it wants to buy, so every line here says
 * "if".
 */
const HOW = [
  { icon: "fa-pen-to-square", text: "Tell us about the car" },
  { icon: "fa-magnifying-glass", text: "We look at the details" },
  { icon: "fa-phone", text: "If we want it, we call you with an offer" },
];

export function SellIntro() {
  return (
    <div className="sell-intro">
      <p className="sell-eyebrow">Sell or trade in</p>
      <h1 className="sell-title">
        Sell us <span>your car</span>
      </h1>
      <p className="sell-lead">
        Tell us about it in 2 minutes. If it&rsquo;s a car we want, we&rsquo;ll call you with an offer.
      </p>

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
