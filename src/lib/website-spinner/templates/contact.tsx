import React from "react";

export interface ContactPageData {
  headline: string;
  subtitle: string;
  location?: string;
  phone?: string;
  email?: string;
  hours?: string;
  mapEmbed?: string;
  formAction?: string;  // POST endpoint for the contact form
  siteId?: string;      // included as hidden field
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

            {/* Contact form */}
            <div className="ws-contact-form">
              <h2 className="ws-form-title">Send a Message</h2>
              <form id="ws-contact-form" className="ws-form" data-site-id={data.siteId || ""} data-action={data.formAction || ""}>
                <div className="ws-form-row">
                  <div className="ws-form-field">
                    <label className="ws-form-label">Name</label>
                    <input type="text" name="name" required className="ws-form-input" placeholder="Your name" />
                  </div>
                  <div className="ws-form-field">
                    <label className="ws-form-label">Phone</label>
                    <input type="tel" name="phone" className="ws-form-input" placeholder="Your phone" />
                  </div>
                </div>
                <div className="ws-form-field">
                  <label className="ws-form-label">Email</label>
                  <input type="email" name="email" required className="ws-form-input" placeholder="Your email" />
                </div>
                <div className="ws-form-field">
                  <label className="ws-form-label">Message</label>
                  <textarea name="message" rows={5} required className="ws-form-input ws-form-textarea" placeholder="Tell us about your project" />
                </div>
                {/* Honeypot — hidden from real users, bots fill it in */}
                <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }} aria-hidden="true">
                  <label>Website</label>
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" />
                </div>
                <button type="submit" className="ws-btn ws-btn-primary" style={{ width: "100%" }}>
                  Send Message
                </button>
                <div id="ws-form-status" className="ws-form-status" />
              </form>
              <script dangerouslySetInnerHTML={{ __html: contactFormScript }} />
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

  .ws-form-status {
    margin-top: 12px;
    padding: 0;
    font-size: 14px;
  }

  .ws-form-status.success {
    padding: 12px;
    background: color-mix(in srgb, var(--ws-accent) 12%, var(--ws-bg));
    color: var(--ws-primary);
    border-radius: calc(var(--ws-radius) / 2);
  }

  .ws-form-status.error {
    padding: 12px;
    background: #fef2f2;
    color: #991b1b;
    border-radius: calc(var(--ws-radius) / 2);
  }
`;

const contactFormScript = `
  document.getElementById('ws-contact-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    var form = e.target;
    var siteId = form.dataset.siteId;
    var action = form.dataset.action;
    var status = document.getElementById('ws-form-status');
    var btn = form.querySelector('button[type="submit"]');

    if (!siteId || !action) {
      status.className = 'ws-form-status error';
      status.textContent = 'Form not configured. Please call or email us directly.';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Sending...';
    status.className = 'ws-form-status';
    status.textContent = '';

    try {
      var data = new FormData(form);
      var res = await fetch(action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: siteId,
          name: data.get('name'),
          email: data.get('email'),
          phone: data.get('phone'),
          message: data.get('message'),
          website: data.get('website'),
        }),
      });
      var result = await res.json();
      if (result.success) {
        status.className = 'ws-form-status success';
        status.textContent = 'Thanks! We\\'ll be in touch shortly.';
        form.reset();
      } else {
        status.className = 'ws-form-status error';
        status.textContent = result.error || 'Something went wrong. Please try again.';
      }
    } catch (err) {
      status.className = 'ws-form-status error';
      status.textContent = 'Network error. Please try again.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Message';
    }
  });
`;
