/**
 * Shown while the inventory query runs.
 *
 * Skeletons in the shape of the real cards, not a spinner: the page keeps its
 * layout, nothing jumps when the data lands, and the wait reads as the grid
 * filling in rather than as the site having stalled.
 */
export default function Loading() {
  return (
    <>
      <div className="page-header page-header--inventory">
        <h1>
          Cars for <span>Sale</span>
        </h1>
        <p>Loading the latest stock…</p>
      </div>

      <div className="featured">
        <div className="featured-container">
          <div className="cars-grid" aria-busy="true" aria-label="Loading vehicles">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="car-card skeleton-card" key={i}>
                <div className="car-image skeleton-block" />
                <div className="car-details">
                  <div className="skeleton-line skeleton-line--title" />
                  <div className="skeleton-line skeleton-line--specs" />
                  <div className="skeleton-line skeleton-line--price" />
                  <div className="skeleton-line skeleton-line--button" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
