import ListingCard from './ListingCard';

export default function ListingsGrid({ listings, emptyMessage = 'No listings found.' }) {
  if (!listings || listings.length === 0) {
    return (
      <div className="empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </svg>
        <h3>Nothing here</h3>
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="listings-grid">
      {listings.map((item, i) => (
        <ListingCard key={item.id || i} listing={item} />
      ))}
    </div>
  );
}
