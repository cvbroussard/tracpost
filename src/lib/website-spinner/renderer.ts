/**
 * Render website pages to static HTML strings using React renderToString.
 * Note: renderToString is imported dynamically to avoid Turbopack bundling issues.
 */
import React from "react";
import Layout, { type SiteTheme, type SiteNav } from "./templates/layout";
import HomePage, { type HomePageData } from "./templates/home";
import AboutPage, { type AboutPageData } from "./templates/about";
import WorkPage, { type WorkPageData } from "./templates/work";
import ContactPage, { type ContactPageData } from "./templates/contact";
import type { WebsiteCopy } from "./copy-generator";
import type { SelectedAssets } from "./asset-picker";

interface RenderContext {
  siteName: string;
  tagline: string;
  location: string;
  phone?: string;
  logoUrl?: string;
  theme: SiteTheme;
  blogUrl: string;
  projectsUrl: string;
  brandsUrl: string;
  copy: WebsiteCopy;
  assets: SelectedAssets;
  projects: Array<{ name: string; description?: string; coverImage?: string; assetCount: number; slug: string }>;
  articles: Array<{ title: string; excerpt?: string; image?: string; slug: string; date: string }>;
  brands: Array<{ name: string; slug: string }>;
  personas: Array<{ name: string; type: string }>;
}

interface RenderedPage {
  file: string;
  html: string;
  title: string;
  description: string;
}

function renderPage(
  renderToString: (element: React.ReactElement) => string,
  ctx: RenderContext,
  activePage: string,
  title: string,
  description: string,
  fileName: string,
  children: React.ReactElement
): RenderedPage {
  const nav: SiteNav[] = [
    { label: "Home", href: "/", active: activePage === "home" },
    { label: "About", href: "/about.html", active: activePage === "about" },
    { label: "Our Work", href: "/work.html", active: activePage === "work" },
    { label: "Contact", href: "/contact.html", active: activePage === "contact" },
  ];

  const layout = React.createElement(Layout, {
    siteName: ctx.siteName,
    tagline: ctx.tagline,
    location: ctx.location,
    phone: ctx.phone,
    logoUrl: ctx.logoUrl,
    theme: ctx.theme,
    nav,
    blogUrl: ctx.blogUrl,
    projectsUrl: ctx.projectsUrl,
    children,
  });

  const bodyHtml = renderToString(layout);

  // Inject title + meta into the <head>
  const html = bodyHtml.replace(
    "</head>",
    `<title>${title}</title>
    <meta name="description" content="${description.replace(/"/g, "&quot;")}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description.replace(/"/g, "&quot;")}" />
    <meta property="og:type" content="website" />
    </head>`
  );

  return { file: fileName, html: `<!DOCTYPE html>${html}`, title, description };
}

export async function renderWebsite(ctx: RenderContext): Promise<RenderedPage[]> {
  const { renderToString } = await import("react-dom/server");
  const pages: RenderedPage[] = [];

  // Home
  const homeData: HomePageData = {
    heroImage: ctx.assets.hero,
    heroTitle: ctx.copy.home.heroTitle,
    heroSubtitle: ctx.copy.home.heroSubtitle,
    ctaText: ctx.copy.home.ctaText,
    ctaHref: "/contact.html",
    servicesTitle: ctx.copy.home.servicesTitle,
    servicesSubtitle: ctx.copy.home.servicesSubtitle,
    services: ctx.copy.home.services.map((s, i) => ({
      ...s,
      image: ctx.assets.serviceImages[i] || undefined,
    })),
    galleryTitle: ctx.copy.home.galleryTitle,
    gallerySubtitle: ctx.copy.home.gallerySubtitle,
    galleryImages: ctx.assets.gallery,
    projectsUrl: ctx.projectsUrl,
    contactHref: "/contact.html",
  };
  pages.push(renderPage(
    renderToString, ctx, "home",
    ctx.copy.meta.homeTitle, ctx.copy.meta.homeDescription,
    "index.html",
    React.createElement(HomePage, { data: homeData })
  ));

  // About
  const aboutData: AboutPageData = {
    heroImage: ctx.assets.aboutHero || undefined,
    headline: ctx.copy.about.headline,
    story: ctx.copy.about.story,
    values: ctx.copy.about.values,
    stats: ctx.copy.about.stats,
    teamTitle: "Our Team",
    team: ctx.personas.length > 0
      ? ctx.personas.map((p) => ({ name: p.name, role: p.type }))
      : undefined,
    brandsTitle: ctx.copy.about.brandsTitle,
    brands: ctx.brands,
    brandsUrl: ctx.brandsUrl,
  };
  pages.push(renderPage(
    renderToString, ctx, "about",
    ctx.copy.meta.aboutTitle, ctx.copy.meta.aboutDescription,
    "about.html",
    React.createElement(AboutPage, { data: aboutData })
  ));

  // Work
  const workData: WorkPageData = {
    headline: ctx.copy.work.headline,
    subtitle: ctx.copy.work.subtitle,
    projects: ctx.projects.map((p) => ({
      name: p.name,
      description: p.description,
      coverImage: p.coverImage,
      assetCount: p.assetCount,
      href: `${ctx.projectsUrl}/${p.slug}`,
    })),
    blogTitle: ctx.copy.work.blogTitle,
    blogSubtitle: ctx.copy.work.blogSubtitle,
    articles: ctx.articles.map((a) => ({
      title: a.title,
      excerpt: a.excerpt,
      image: a.image,
      href: `${ctx.blogUrl}/${a.slug}`,
      date: a.date,
    })),
  };
  pages.push(renderPage(
    renderToString, ctx, "work",
    ctx.copy.meta.workTitle, ctx.copy.meta.workDescription,
    "work.html",
    React.createElement(WorkPage, { data: workData })
  ));

  // Contact
  const contactData: ContactPageData = {
    headline: ctx.copy.contact.headline,
    subtitle: ctx.copy.contact.subtitle,
    location: ctx.location,
    phone: ctx.phone,
  };
  pages.push(renderPage(
    renderToString, ctx, "contact",
    ctx.copy.meta.contactTitle, ctx.copy.meta.contactDescription,
    "contact.html",
    React.createElement(ContactPage, { data: contactData })
  ));

  return pages;
}
