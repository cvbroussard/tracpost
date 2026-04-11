import React from "react";

export interface ContactPageData {
  headline: string;
  subtitle: string;
  location?: string;
  phone?: string;
  email?: string;
  hours?: string;
  mapEmbed?: string;
}

export default function ContactPage({ data }: { data: ContactPageData }) {
  return (
    <>
      <section className="ws-section">
        <div className="ws-container">
          <div className="ws-contact-grid">
            <div>
              <h1 className="ws-section-title">{data.headline}</h1>
              <p className="ws-section-subtitle" style={{ marginBottom: 32 }}>{data.subtitle}</p>

              <div className="ws-contact-details">
                {data.location && (
                  <div className="ws-contact-item">
                    <span className="ws-contact-label">Location</span>
                    <span className="ws-contact-value">{data.location}</span>
                  </div>
                )}
                {data.phone && (
                  <div className="ws-contact-item">
                    <span className="ws-contact-label">Phone</span>
                    <a href={`tel:${data.phone.replace(/[^+\d]/g, "")}`} className="ws-contact-value ws-contact-link">
                      {data.phone}
                    </a>
                  </div>
                )}
                {data.email && (
                  <div className="ws-contact-item">
                    <span className="ws-contact-label">Email</span>
                    <a href={`mailto:${data.email}`} className="ws-contact-value ws-contact-link">
                      {data.email}
                    </a>
                  </div>
                )}
                {data.hours && (
                  <div className="ws-contact-item">
                    <span className="ws-contact-label">Hours</span>
                    <span className="ws-contact-value">{data.hours}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Contact form placeholder */}
            <div className="ws-contact-form">
              <h2 className="ws-form-title">Send a Message</h2>
              <form action="#" method="POST" className="ws-form">
                <div className="ws-form-row">
                  <div className="ws-form-field">
                    <label className="ws-form-label">Name</label>
                    <input type="text" name="name" className="ws-form-input" placeholder="Your name" />
                  </div>
                  <div className="ws-form-field">
                    <label className="ws-form-label">Phone</label>
                    <input type="tel" name="phone" className="ws-form-input" placeholder="Your phone" />
                  </div>
                </div>
                <div className="ws-form-field">
                  <label className="ws-form-label">Email</label>
                  <input type="email" name="email" className="ws-form-input" placeholder="Your email" />
                </div>
                <div className="ws-form-field">
                  <label className="ws-form-label">Message</label>
                  <textarea name="message" rows={5} className="ws-form-input ws-form-textarea" placeholder="Tell us about your project" />
                </div>
                <button type="submit" className="ws-btn ws-btn-primary" style={{ width: "100%" }}>
                  Send Message
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: contactStyles }} />
    </>
  );
}

const contactStyles = `
  .ws-contact-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 64px;
    align-items: start;
  }

  @media (max-width: 768px) {
    .ws-contact-grid { grid-template-columns: 1fr; gap: 40px; }
  }

  .ws-contact-details {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ws-contact-item {
    padding: 12px 0;
    border-bottom: 1px solid var(--ws-border);
  }

  .ws-contact-label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ws-muted);
    margin-bottom: 4px;
  }

  .ws-contact-value {
    font-size: 16px;
    font-weight: 500;
    color: var(--ws-primary);
  }

  .ws-contact-link {
    text-decoration: none;
    color: var(--ws-accent);
  }

  .ws-contact-link:hover { text-decoration: underline; }

  /* Form */
  .ws-contact-form {
    background: color-mix(in srgb, var(--ws-primary) 3%, var(--ws-bg));
    border: 1px solid var(--ws-border);
    border-radius: var(--ws-radius);
    padding: 32px;
  }

  .ws-form-title {
    font-family: var(--ws-heading-font);
    font-size: 20px;
    font-weight: 600;
    color: var(--ws-primary);
    margin-bottom: 24px;
  }

  .ws-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ws-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 480px) {
    .ws-form-row { grid-template-columns: 1fr; }
  }

  .ws-form-field {
    display: flex;
    flex-direction: column;
  }

  .ws-form-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--ws-primary);
    margin-bottom: 6px;
  }

  .ws-form-input {
    padding: 10px 14px;
    border: 1px solid var(--ws-border);
    border-radius: calc(var(--ws-radius) / 2);
    font-size: 15px;
    font-family: var(--ws-font);
    color: var(--ws-text);
    background: var(--ws-bg);
    transition: border-color 0.15s;
  }

  .ws-form-input:focus {
    outline: none;
    border-color: var(--ws-accent);
  }

  .ws-form-textarea {
    resize: vertical;
    min-height: 100px;
  }
`;
