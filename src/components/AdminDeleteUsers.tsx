'use client'

// Renders above the users table (admin.components.beforeListTable) and owns the
// transfer-then-delete modal. The Delete button itself is a real table column,
// UserRowActions, which dispatches DELETE_USER_EVENT for this component to catch.

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@payloadcms/ui'
import { DELETE_USER_EVENT, type DeleteUserEventDetail } from './UserRowActions'

type TransferUser = { id: number; email: string; name?: string | null }

export default function AdminDeleteUsers() {
  const { user: currentUser } = useAuth()
  const cu = currentUser as any

  const [targetUserId, setTargetUserId] = useState<number | null>(null)
  const [targetUserName, setTargetUserName] = useState<string>('')
  const [allUsers, setAllUsers] = useState<TransferUser[]>([])
  const [transferMode, setTransferMode] = useState<'self' | 'other' | 'none'>('self')
  const [selectedId, setSelectedId] = useState<string>('')
  const [postCount, setPostCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Listen for the delete request dispatched by the UserRowActions cell.
  // This used to be a MutationObserver that scanned every <tr> on the page and
  // appended a button into the last table cell, which put it inside the Status
  // column.
  useEffect(() => {
    if (!mounted) return
    if (!cu || (cu.role !== 'admin' && cu.role !== 'master-admin')) return

    const handler = (event: Event) => {
      const { userId, userName } = (event as CustomEvent<DeleteUserEventDetail>).detail
      openModal(userId, userName)
    }

    window.addEventListener(DELETE_USER_EVENT, handler)
    return () => window.removeEventListener(DELETE_USER_EVENT, handler)
  }, [mounted, cu])

  const openModal = async (userId: number, userName: string) => {
    setTargetUserId(userId)
    setTargetUserName(userName)
    setTransferMode('self')
    setSubmitting(false)

    try {
      const r = await fetch(`/api/posts?where[author][equals]=${userId}&limit=0&depth=0`, {
        credentials: 'include',
      })
      const d = await r.json()
      setPostCount(d?.totalDocs || 0)
    } catch {
      setPostCount(0)
    }

    try {
      const r = await fetch('/api/users/transfer-list', { credentials: 'include' })
      const d = await r.json()
      const list = (d?.users || []).filter((u: TransferUser) => u.id !== userId)
      setAllUsers(list)
      if (list.length > 0) setSelectedId(String(list[0].id))
    } catch {
      setAllUsers([])
    }
  }

  const handleConfirm = useCallback(async () => {
    if (!targetUserId) return
    setSubmitting(true)

    try {
      // Determine transfer target
      let transferToId: number | null = null
      if (transferMode === 'self') transferToId = cu?.id ?? null
      else if (transferMode === 'other') transferToId = selectedId ? Number(selectedId) : null
      // 'none' stays null

      // Step 1: Transfer posts
      if (postCount > 0) {
        const postsRes = await fetch(
          `/api/posts?where[author][equals]=${targetUserId}&limit=500&depth=0`,
          { credentials: 'include' },
        )
        const postsData = await postsRes.json()
        for (const post of postsData?.docs || []) {
          await fetch(`/api/posts/${post.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ author: transferToId }),
          })
        }
      }

      // Step 2: Delete user
      const delRes = await fetch(`/api/users/${targetUserId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!delRes.ok) {
        const err = await delRes.json().catch(() => null)
        throw new Error(err?.message || 'Failed to delete user')
      }

      setTargetUserId(null)
      window.location.reload()
    } catch (err: any) {
      alert(err?.message || 'Something went wrong')
      setSubmitting(false)
    }
  }, [targetUserId, transferMode, selectedId, cu, postCount])

  if (!mounted || targetUserId === null) return null

  const otherOptions = allUsers.filter((u) => u.id !== targetUserId)

  return createPortal(
    <div style={S.overlay}>
      <div style={S.modal}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 22 }}>🗑️</span>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#111' }}>Delete User</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>{targetUserName}</p>
          </div>
        </div>

        {postCount > 0 ? (
          <div style={S.banner}>
            📝 This user has{' '}
            <strong>
              {postCount} post{postCount !== 1 ? 's' : ''}
            </strong>
            . Choose what happens to {postCount !== 1 ? 'them' : 'it'}:
          </div>
        ) : (
          <div
            style={{ ...S.banner, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#065f46' }}
          >
            ✅ This user has no posts. Safe to delete.
          </div>
        )}

        {postCount > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>
              Transfer posts to:
            </p>

            <label style={S.radioRow}>
              <input
                type="radio"
                name="atd"
                checked={transferMode === 'self'}
                onChange={() => setTransferMode('self')}
              />
              <div>
                <div style={{ fontSize: 14 }}>Transfer to myself</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{cu?.name || cu?.email}</div>
              </div>
            </label>

            {otherOptions.length > 0 && (
              <>
                <label style={S.radioRow}>
                  <input
                    type="radio"
                    name="atd"
                    checked={transferMode === 'other'}
                    onChange={() => setTransferMode('other')}
                  />
                  <div style={{ fontSize: 14 }}>Transfer to another user</div>
                </label>
                {transferMode === 'other' && (
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    style={S.select}
                  >
                    {otherOptions.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name ? `${u.name} (${u.email})` : u.email}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            <label style={S.radioRow}>
              <input
                type="radio"
                name="atd"
                checked={transferMode === 'none'}
                onChange={() => setTransferMode('none')}
              />
              <div>
                <div style={{ fontSize: 14 }}>No one</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Posts become authorless</div>
              </div>
            </label>
          </div>
        )}

        <div style={S.warning}>
          ⚠️ Deletion is <strong>permanent</strong> and cannot be undone.
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={() => setTargetUserId(null)} disabled={submitting} style={S.cancelBtn}>
            Cancel
          </button>
          <button onClick={handleConfirm} disabled={submitting} style={S.deleteBtn}>
            {submitting ? 'Deleting…' : 'Delete User'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  banner: {
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 13,
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
  },
  radioRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '8px 0',
    fontSize: 14,
    color: '#111',
    cursor: 'pointer',
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    marginTop: 4,
    marginBottom: 4,
    marginLeft: 22,
    maxWidth: 'calc(100% - 22px)',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    fontSize: 14,
    color: '#111',
    background: '#fff',
  },
  warning: {
    marginTop: 16,
    padding: '10px 14px',
    borderRadius: 8,
    fontSize: 13,
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
  },
  cancelBtn: {
    padding: '8px 18px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    background: '#fff',
    color: '#374151',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  deleteBtn: {
    padding: '8px 18px',
    borderRadius: 6,
    border: 'none',
    background: '#dc2626',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
}
