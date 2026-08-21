'use client'

import { useAuth } from '@payloadcms/ui'
import type { DefaultCellComponentProps } from 'payload'

export const DELETE_USER_EVENT = 'igg:delete-user'

export type DeleteUserEventDetail = {
  userId: number
  userName: string
}

/**
 * Delete action for a row in the users list, rendered as a real column.
 *
 * This replaces a MutationObserver that walked every <tr> on the page and
 * appended a button to `cells[cells.length - 1]`. Because the last column is
 * Status, the button landed inside the Status cell underneath "Approved".
 * Registering a custom cell puts it in its own column, and it survives
 * pagination and sorting without re-scanning the DOM.
 *
 * Clicking dispatches an event that AdminDeleteUsers listens for and opens its
 * transfer-then-delete modal.
 */
export default function UserRowActions({ rowData }: DefaultCellComponentProps) {
  const { user } = useAuth()
  const currentUser = user as { id?: string | number; role?: string } | null
  const row = rowData as { id?: number | string; name?: string; role?: string } | undefined

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'master-admin'
  if (!isAdmin || !row?.id) return null

  // Never offer to delete yourself here; that is what /delete-account is for.
  if (String(row.id) === String(currentUser?.id)) return null

  // Only a master-admin may remove another master-admin.
  if (row.role === 'master-admin' && currentUser?.role !== 'master-admin') return null

  const handleClick = () => {
    window.dispatchEvent(
      new CustomEvent<DeleteUserEventDetail>(DELETE_USER_EVENT, {
        detail: {
          userId: Number(row.id),
          userName: row.name || `User #${row.id}`,
        },
      }),
    )
  }

  return (
    <button type="button" className="igg-row-delete" onClick={handleClick}>
      Delete
    </button>
  )
}