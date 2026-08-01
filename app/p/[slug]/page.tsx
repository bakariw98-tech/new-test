import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveRenderContext } from "../../../lib/core/context";
import { photoSrc, photoSrcSet } from "../../../lib/renderers/website/photo";
import type { RenderContext } from "../../../lib/core/types";
import "./listing.css";

// Rebuilt at most once a minute; a corrected listing appears without a deploy.
export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

/**
 * The theme, handed to CSS as custom properties. This is the whole mechanism by
 * which brand colours reach the site: page.tsx never names a colour, and
 * listing.css never hardcodes one.
 */
function themeVars(context: RenderContext): React.CSSProperties {
  const t = context.theme;
  return {
    "--bg": t.color.bg,
    "--surface": t.color.surface,
    "--ink": t.color.ink,
    "--ink-muted": t.color.inkMuted,
    "--accent": t.color.accent,
    "--on-accent": t.color.onAccent,
    "--line": t.color.line,
    "--font-heading": t.font.heading,
    "--font-body": t.font.body,
    "--weight-heading": String(t.font.headingWeight),
    "--size-display": `${t.size.display}px`,
    "--size-h1": `${t.size.h1}px`,
    "--size-h2": `${t.size.h2}px`,
    "--size-body": `${t.size.body}px`,
    "--size-caption": `${t.size.caption}px`,
    "--size-micro": `${t.size.micro}px`,
  } as React.CSSProperties;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const context = await resolveRenderContext(slug);
  if (!context) return { title: "Listing not found" };

  const { formatted, listing, photos, brand } = context;
  const title = `${formatted.address} — ${formatted.price}`;
  const description =
    listing.description.slice(0, 200) ||
    `${formatted.beds} bed, ${formatted.baths} bath in ${formatted.cityStateZip}. Presented by ${brand.agentName}, ${brand.brokerageName}.`;

  const hero = photos.find((p) => p.role === "hero") ?? photos[0];

  return {
    title,
    description,
    alternates: { canonical: context.urls.site },
    openGraph: {
      type: "website",
      title,
      description,
      url: context.urls.site,
      // The hero through the normaliser at OG dimensions — no second renderer.
      images: hero
        ? [{ url: photoSrc(hero.url, { width: 1200, height: 630 }), width: 1200, height: 630 }]
        : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ListingPage({ params }: Params) {
  const { slug } = await params;
  const context = await resolveRenderContext(slug);
  if (!context) notFound();

  const { listing, photos, brand, formatted } = context;
  const hero = photos.find((p) => p.role === "hero") ?? photos[0];
  const gallery = photos.filter((p) => p !== hero);

  const contactHref = brand.email
    ? `mailto:${brand.email}?subject=${encodeURIComponent(`${formatted.address} — showing request`)}`
    : brand.phone
      ? `tel:${brand.phone.replace(/[^\d+]/g, "")}`
      : null;

  const socials = [
    brand.instagram && {
      label: "Instagram",
      href: brand.instagram.startsWith("http")
        ? brand.instagram
        : `https://instagram.com/${brand.instagram.replace(/^@/, "")}`,
    },
    brand.facebook && { label: "Facebook", href: brand.facebook },
    brand.linkedin && { label: "LinkedIn", href: brand.linkedin },
    brand.website && { label: "Website", href: brand.website },
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  return (
    <main className="listing" style={themeVars(context)}>
      {hero && (
        <header className="hero">
          <img
            src={photoSrc(hero.url, { width: 1600, height: 900 })}
            srcSet={photoSrcSet(hero.url, 16 / 9)}
            sizes="100vw"
            alt={hero.alt ?? `${formatted.address}, ${formatted.cityStateZip}`}
            width={1600}
            height={900}
            fetchPriority="high"
          />
          <div className="hero-copy">
            <span className="badge">For sale</span>
            <div className="hero-price">{formatted.price}</div>
            <h1 className="hero-address">{formatted.address}</h1>
            <div className="hero-city">{formatted.cityStateZip}</div>
          </div>
        </header>
      )}

      <div className="stats">
        {formatted.stats.map((stat) => (
          <div key={stat.label}>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
        {listing.yearBuilt && (
          <div>
            <div className="stat-value">{listing.yearBuilt}</div>
            <div className="stat-label">Built</div>
          </div>
        )}
      </div>

      {listing.description && (
        <section className="section">
          <h2>About this home</h2>
          <p className="description">{listing.description}</p>
        </section>
      )}

      {listing.features.length > 0 && (
        <section className="section">
          <h2>Features</h2>
          <ul className="features">
            {listing.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="section">
          <h2>Gallery</h2>
          <div className="gallery">
            {gallery.map((photo, index) => (
              <img
                key={photo.id}
                src={photoSrc(photo.url, { width: 1024, height: 683 })}
                srcSet={photoSrcSet(photo.url, 3 / 2)}
                sizes="(min-width: 768px) 50vw, 100vw"
                alt={photo.alt ?? `${formatted.address} — photo ${index + 2}`}
                width={1024}
                height={683}
                loading="lazy"
              />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2>Presented by</h2>
        <div className="agent">
          <div className="agent-head">
            {brand.headshotUrl && (
              <img
                src={photoSrc(brand.headshotUrl, { width: 152, height: 152 })}
                alt={brand.agentName}
                width={76}
                height={76}
                loading="lazy"
              />
            )}
            <div>
              <div className="agent-name">{brand.agentName}</div>
              {brand.agentTitle && <div className="agent-title">{brand.agentTitle}</div>}
              <div className="agent-brokerage">{brand.brokerageName}</div>
            </div>
          </div>
          {(brand.phone || brand.email) && (
            <div className="agent-contact">
              {brand.phone && (
                <a href={`tel:${brand.phone.replace(/[^\d+]/g, "")}`}>{brand.phone}</a>
              )}
              {brand.email && <a href={`mailto:${brand.email}`}>{brand.email}</a>}
            </div>
          )}
        </div>
      </section>

      <section className="cta">
        <h2>{brand.ctaText}</h2>
        {contactHref && (
          <a className="cta-button" href={contactHref}>
            Contact {brand.agentName.split(" ")[0]}
          </a>
        )}
        {socials.length > 0 && (
          <div className="social">
            {socials.map((social) => (
              <a key={social.label} href={social.href} rel="noopener noreferrer" target="_blank">
                {social.label}
              </a>
            ))}
          </div>
        )}
      </section>

      <footer className="attribution">{formatted.attribution}</footer>
    </main>
  );
}
