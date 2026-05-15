const sourceLabels = {
  facebook: { icon: '📘', label: 'FB Marketplace', className: 'source-facebook' },
  offerup: { icon: '🛒', label: 'OfferUp', className: 'source-offerup' },
};

export default function ListingCard({ listing }) {
  const hasImage = listing.image && listing.image.length > 0 && !listing.image.includes('data:image/gif');
  const source = sourceLabels[listing.source] || sourceLabels.offerup;
  return (
    <article className="listing-card">
      <span className={`source-badge ${source.className}`} title={source.label}>
        {source.icon} {source.label}
      </span>
      <div className={`card-image${!hasImage ? ' no-image' : ''}`}>
        {hasImage ? (
          <img src={listing.image} alt={listing.title} loading="lazy" />
        ) : (
          <div className="no-image-placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
            <span>No Image</span>
          </div>
        )}
      </div>
      <div className="card-body">
        <h3 className="card-title">{listing.title}</h3>
        {listing.price && <div className="card-price">{listing.price}</div>}
        {listing.location && (
          <div className="card-meta">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {listing.location}
          </div>
        )}
        {listing.description && <p className="card-desc">{listing.description}</p>}
        {listing.url && (
          <a href={listing.url} target="_blank" rel="noopener noreferrer" className="card-link">
            View Listing
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>
    </article>
  );
}
