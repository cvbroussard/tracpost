import type { ServiceTile } from "@/lib/tenant-site";

interface Props {
  headline: string;
  subheadline?: string;
  tiles: ServiceTile[];
}

/**
 * Work-slot variant: services_tiles
 * Grid of N service tiles (no pricing). For quote-based tenants who
 * offer custom-scope work — kitchen remodelers, contractors, agencies.
 */
export default function WorkServicesTiles({ headline, subheadline, tiles }: Props) {
  return (
    <>
      <section className="ws-work-hero">
        <div className="ws-container">
          <h1 className="ws-work-title">{headline}</h1>
          {subheadline && <p className="ws-work-subtitle">{subheadline}</p>}
        </div>
      </section>

      {tiles.length > 0 && (
        <section className="ws-section">
          <div className="ws-container">
            <div className="ws-tiles-grid">
              {tiles.map((tile, i) => (
                <div key={i} className="ws-tile">
                  {tile.image && <img src={tile.image} alt={tile.title} className="ws-tile-img" />}
                  {tile.icon && !tile.image && <div className="ws-tile-icon">{tile.icon}</div>}
                  <h3 className="ws-tile-title">{tile.title}</h3>
                  <p className="ws-tile-desc">{tile.description}</p>
                  {tile.cta && (
                    <a href={tile.cta.href} className="ws-tile-cta">
                      {tile.cta.label} →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <style dangerouslySetInnerHTML={{ __html: tilesStyles }} />
    </>
  );
}

const tilesStyles = `
  .ws-work-hero { padding: 80px 0 40px; border-bottom: 1px solid var(--ws-border); }
  .ws-work-title {
    font-family: var(--ws-heading-font);
    font-size: 48px;
    font-weight: 700;
    color: var(--ws-primary);
    letter-spacing: -0.03em;
    margin-bottom: 12px;
  }
  .ws-work-subtitle {
    font-size: 17px;
    color: var(--ws-muted);
    max-width: 600px;
    line-height: 1.6;
  }

  .ws-tiles-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 768px) { .ws-tiles-grid { grid-template-columns: 1fr; } }
  @media (min-width: 768px) and (max-width: 1024px) { .ws-tiles-grid { grid-template-columns: repeat(2, 1fr); } }

  .ws-tile {
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
    padding: 24px;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .ws-tile:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    transform: translateY(-2px);
  }
  .ws-tile-img {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: calc(var(--ws-radius) / 2);
    margin-bottom: 16px;
  }
  .ws-tile-icon {
    font-size: 28px;
    margin-bottom: 12px;
    color: var(--ws-accent);
  }
  .ws-tile-title {
    font-family: var(--ws-heading-font);
    font-size: 18px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 8px;
  }
  .ws-tile-desc {
    font-size: 14px;
    color: var(--ws-muted);
    line-height: 1.6;
    margin-bottom: 12px;
  }
  .ws-tile-cta {
    font-size: 13px;
    font-weight: 500;
    color: var(--ws-accent);
    text-decoration: none;
  }
  .ws-tile-cta:hover { text-decoration: underline; }
`;
