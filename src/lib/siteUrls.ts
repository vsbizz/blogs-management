/**
 * Links from the admin to the public marketing site.
 *
 * The CMS also serves its own bare-bones `/blog` route, which is only an
 * internal preview of the data. Admin links labelled "live" must point at the
 * real site instead, so they go through PUBLIC_SITE_URL.
 */

/** Absolute base URL of the public site, without a trailing slash. */
export function getPublicSiteUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL

  if (!url) return null

  return url.replace(/\/$/, '')
}

/**
 * Where a "view the blog" link should go, and whether it is the real site.
 * Falls back to the in-CMS preview when the public URL is not configured, so
 * the link still works but can be labelled honestly.
 */
export function getBlogLink(slug?: string): { href: string; isLive: boolean } {
  const base = getPublicSiteUrl()
  const path = slug ? `/blog/${slug}` : '/blog'

  if (!base) return { href: path, isLive: false }

  return { href: `${base}${path}`, isLive: true }
}