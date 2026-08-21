/**
 * Slug generation for posts.
 *
 * The previous inline implementation stripped every non-ASCII character, which
 * produced an empty slug for non-Latin titles (Hindi, Arabic, Chinese) and
 * mangled accented Latin ones ("Café" -> "caf"). It also regenerated the slug on
 * every save, so renaming a published post silently changed its public URL, and
 * it never checked the `unique` constraint, so two titles that normalise to the
 * same slug crashed on insert.
 */

const MAX_SLUG_LENGTH = 96

/**
 * Transliterate accented Latin characters to their ASCII equivalent so that
 * "Café Résumé" becomes "cafe-resume" rather than "caf-rsum". NFD splits a
 * character into its base letter plus combining marks, which we then strip.
 */
function transliterate(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/** Convert a title into a URL-safe slug. Returns '' when nothing usable remains. */
export function slugify(title: string): string {
  return transliterate(String(title ?? ''))
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, '')
}

/**
 * Fallback for titles that contain no Latin characters at all (e.g. a fully
 * Hindi or Chinese title). Without this the slug would be empty and fail the
 * `required` validation, making such posts impossible to save.
 */
export function fallbackSlug(prefix = 'post'): string {
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${random}`
}

type FindDuplicate = (candidate: string) => Promise<boolean>

/**
 * Append -2, -3, ... until the slug is unused. `isTaken` is injected so this
 * stays testable and free of a Payload dependency.
 */
export async function uniqueSlug(base: string, isTaken: FindDuplicate): Promise<string> {
  const seed = base || fallbackSlug()

  if (!(await isTaken(seed))) return seed

  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${seed}-${suffix}`
    if (!(await isTaken(candidate))) return candidate
  }

  // Pathological case: fall back to a random slug rather than looping forever.
  return fallbackSlug(seed.slice(0, 40) || 'post')
}