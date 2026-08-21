'use client'

import { useAuth } from '@payloadcms/ui'

/**
 * Self-service account deletion, shown in the admin nav for any signed-in user
 * regardless of role. Styling lives in (payload)/custom.scss instead of the
 * inline styles and JS hover handlers this used to carry.
 */
export default function DeleteAccountLink() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <div className="igg-nav-danger">
      <a href="/delete-account" className="igg-nav-danger__link">
        Delete my account
      </a>
    </div>
  )
}