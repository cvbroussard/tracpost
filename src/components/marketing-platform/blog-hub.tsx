"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface Article {
  slug: string;
  title: string;
  excerpt: string | null;
  image: string | null;
  date: string | null;
  category: string;
}

interface Props {
  articles: Article[];
  categories: string[];
}

const INITIAL_SHOW = 9;
const LOAD_MORE = 9;

export function BlogHub({ articles, categories }: Props) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [showCount, setShowCount] = useState(INITIAL_SHOW);

  const filtered = useMemo(() => {
    let result = articles;
    if (activeCategory !== "All") {
      result = result.filter((a) => a.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.excerpt && a.excerpt.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [articles, activeCategory, search]);

  // Featured: top 3 with images (from full list, not filtered)
  const featured = articles.filter((a) => a.image).slice(0, 3);
  const featuredSlugs = new Set(featured.map((a) => a.slug));

  // Grid: filtered minus featured, paginated
  const gridArticles = filtered.filter((a) => !featuredSlugs.has(a.slug));
  const visible = gridArticles.slice(0, showCount);
  const hasMore = showCount < gridArticles.length;

  return (
    <div className="mp-blog-hub">
      {/* Header */}
      <div className="mp-blog-header">
        <h1 className="mp-blog-title">Blog</h1>
        <div className="mp-blog-search-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowCount(INITIAL_SHOW); }}
            placeholder="Search articles..."
            className="mp-blog-search"
          />
        </div>
      </div>

      {/* Category pills */}
      <div className="mp-blog-categories">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => { setActiveCategory(cat); setShowCount(INITIAL_SHOW); }}
            className={`mp-blog-cat-pill ${activeCategory === cat ? "mp-blog-cat-active" : ""}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Featured strip — only when showing "All" with no search */}
      {activeCategory === "All" && !search.trim() && featured.length > 0 && (
        <>
          <div className="mp-blog-featured">
            {featured.map((a) => (
              <Link key={a.slug} href={`/blog/${a.slug}`} className="mp-blog-featured-card">
                {a.image && <img src={a.image} alt={a.title} className="mp-blog-featured-img" />}
                <div className="mp-blog-featured-body">
                  <span className="mp-blog-card-cat">{a.category}</span>
                  <h2 className="mp-blog-featured-title">{a.title}</h2>
                  {a.date && <span className="mp-blog-card-date">{a.date}</span>}
                </div>
              </Link>
            ))}
          </div>
          <h2 className="mp-blog-latest-divider">Latest</h2>
        </>
      )}

      {/* 3-column card grid */}
      {visible.length > 0 ? (
        <div className="mp-blog-grid">
          {visible.map((a) => (
            <Link key={a.slug} href={`/blog/${a.slug}`} className="mp-blog-card">
              {a.image && <img src={a.image} alt={a.title} className="mp-blog-card-img" />}
              <div className="mp-blog-card-body">
                <span className="mp-blog-card-cat">{a.category}</span>
                <h3 className="mp-blog-card-title">{a.title}</h3>
                {a.excerpt && <p className="mp-blog-card-excerpt">{a.excerpt}</p>}
                {a.date && <span className="mp-blog-card-date">{a.date}</span>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mp-blog-empty">No articles match your search.</p>
      )}

      {/* Show more */}
      {hasMore && (
        <div className="mp-blog-more-wrap">
          <button
            onClick={() => setShowCount((c) => c + LOAD_MORE)}
            className="mp-btn-outline mp-btn-lg"
          >
            Show more
          </button>
        </div>
      )}

      {/* CTA */}
      <div className="mp-blog-cta">
        <h2 className="mp-section-title">We take care of marketing. You take care of business.</h2>
        <p className="mp-section-subtitle" style={{ margin: "0 auto 24px" }}>
          Start publishing across 8 platforms in minutes.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <Link href="/pricing" className="mp-btn-primary mp-btn-lg">
            Start 14-day trial
          </Link>
          <Link href="/contact" className="mp-btn-outline mp-btn-lg">
            Talk to us
          </Link>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: hubStyles }} />
    </div>
  );
}

const hubStyles = `
  .mp-blog-hub { padding-bottom: 32px; }

  .mp-blog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .mp-blog-title {
    font-size: 36px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: -0.02em;
  }
  .mp-blog-search {
    padding: 8px 16px;
    font-size: 14px;
    color: #1a1a1a;
    background: #fff;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    width: 240px;
    outline: none;
    transition: border-color 0.15s;
  }
  .mp-blog-search:focus { border-color: #1a1a1a; }

  .mp-blog-categories {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 40px;
  }
  .mp-blog-cat-pill {
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    background: none;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .mp-blog-cat-pill:hover { border-color: #1a1a1a; color: #1a1a1a; }
  .mp-blog-cat-active {
    background: #1a1a1a;
    color: #fff;
    border-color: #1a1a1a;
  }
  .mp-blog-cat-active:hover { background: #333; }

  /* Featured strip */
  .mp-blog-featured {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-bottom: 48px;
  }
  @media (max-width: 768px) { .mp-blog-featured { grid-template-columns: 1fr; } }
  .mp-blog-featured-card {
    display: block;
    text-decoration: none;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .mp-blog-featured-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    transform: translateY(-2px);
  }
  .mp-blog-featured-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .mp-blog-featured-body { padding: 20px; }
  .mp-blog-featured-title {
    font-size: 18px;
    font-weight: 600;
    color: #1a1a1a;
    line-height: 1.3;
    margin-bottom: 8px;
  }

  .mp-blog-latest-divider {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
  }

  /* Card grid */
  .mp-blog-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 768px) { .mp-blog-grid { grid-template-columns: 1fr; } }

  .mp-blog-card {
    display: block;
    text-decoration: none;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    transition: box-shadow 0.2s, transform 0.2s;
  }
  .mp-blog-card:hover {
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    transform: translateY(-2px);
  }
  .mp-blog-card-img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .mp-blog-card-body { padding: 16px; }
  .mp-blog-card-cat {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b7280;
    margin-bottom: 8px;
  }
  .mp-blog-card-title {
    font-size: 16px;
    font-weight: 600;
    color: #1a1a1a;
    line-height: 1.3;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .mp-blog-card-excerpt {
    font-size: 13px;
    color: #6b7280;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .mp-blog-card-date { font-size: 12px; color: #9ca3af; }

  .mp-blog-empty {
    text-align: center;
    padding: 48px;
    color: #9ca3af;
    font-size: 15px;
  }

  .mp-blog-more-wrap {
    text-align: center;
    margin-top: 40px;
  }

  .mp-blog-cta {
    text-align: center;
    margin-top: 80px;
    padding-top: 64px;
    border-top: 1px solid #e5e7eb;
  }
`;
