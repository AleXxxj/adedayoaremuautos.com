/**
 * Gray blocks in the shape of the page that is on its way, shown by the
 * loading.tsx files the moment a link is tapped. Styles: app-shell.css.
 *
 * They hold no words and no numbers: nothing here can be wrong or out of
 * date. A screen reader hears one word, "Loading".
 */

function Sk({ className }: { className: string }) {
  return <span className={`sk ${className}`} />;
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div className="sk-page" role="status">
      <span className="sk-sr">Loading</span>
      <div className="sk-wrap" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function Head() {
  return (
    <>
      <Sk className="sk-eyebrow" />
      <Sk className="sk-title" />
      <Sk className="sk-line" />
    </>
  );
}

function Cards({ count }: { count: number }) {
  return (
    <div className="sk-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sk-card">
          <Sk className="sk-photo" />
          <div className="sk-card-body">
            <Sk className="sk-line" />
            <Sk className="sk-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A list of cars: title, chips, the filter bar, cards. */
export function ListSkeleton() {
  return (
    <Page>
      <Head />
      <div className="sk-chips">
        {Array.from({ length: 5 }, (_, i) => (
          <Sk key={i} className="sk-chip" />
        ))}
      </div>
      <Sk className="sk-bar" />
      <Cards count={6} />
    </Page>
  );
}

/** One car: name, facts, price, the photo, then rows of details. */
export function CarSkeleton() {
  return (
    <Page>
      <Sk className="sk-eyebrow" />
      <div className="sk-car">
        <div>
          <Sk className="sk-title" />
          <div className="sk-facts">
            <Sk className="sk-fact" />
            <Sk className="sk-fact" />
            <Sk className="sk-fact" />
          </div>
          <Sk className="sk-price" />
          <Sk className="sk-button" />
        </div>
        <Sk className="sk-photo" />
      </div>
      <div className="sk-rows">
        <Sk className="sk-line" />
        <Sk className="sk-line" />
        <Sk className="sk-line" />
      </div>
    </Page>
  );
}

/** Guides: a title, a line of text, cards. */
export function GuidesSkeleton() {
  return (
    <Page>
      <Head />
      <Sk className="sk-line sk-line--wide" />
      <Cards count={3} />
    </Page>
  );
}
