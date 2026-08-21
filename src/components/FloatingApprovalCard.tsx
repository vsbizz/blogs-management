'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { useAuth } from '@payloadcms/ui'

type ApprovalRequest = {
  id: string | number
  userId: number
  name: string
  email: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export default function FloatingApprovalCard() {
  const [mounted, setMounted] = useState(false)
  const [request, setRequest] = useState<ApprovalRequest | null>(null)
  const [processing, setProcessing] = useState<'approved' | 'rejected' | null>(null)
  const [hiddenRequestId, setHiddenRequestId] = useState<string | number | null>(null)
  const pathname = usePathname()
  const { user } = useAuth()

  // Only admins can read user-approvals. Without this gate every author polled
  // the endpoint every 5 seconds and got a 403 each time, forever.
  const canReviewApprovals =
    (user as any)?.role === 'admin' || (user as any)?.role === 'master-admin'

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchLatestPendingRequest = async () => {
    try {
      const res = await fetch(
        '/api/user-approvals?where[status][equals]=pending&sort=-createdAt&limit=1&depth=0',
        {
          credentials: 'include',
          cache: 'no-store',
        },
      )

      const data = await res.json()

      const latestRequest = data?.docs?.[0] || null

      setRequest(latestRequest)
    } catch (error) {
      console.error('FLOATING CARD FETCH ERROR:', error)
      setRequest(null)
    }
  }

  useEffect(() => {
    if (!canReviewApprovals) return

    fetchLatestPendingRequest()

    const interval = setInterval(() => {
      fetchLatestPendingRequest()
    }, 30000)

    return () => clearInterval(interval)
  }, [canReviewApprovals])

  const handleAction = async (status: 'approved' | 'rejected') => {
    if (!request) return

    try {
      setProcessing(status)

      const res = await fetch(`/api/user-approvals/${request.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status,
        }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        console.error('FLOATING CARD ACTION ERROR:', data)
        alert(data?.errors?.[0]?.message || 'Action failed')
        return
      }

      setRequest(null)
      setHiddenRequestId(null)

      setTimeout(() => {
        fetchLatestPendingRequest()
      }, 700)
    } catch (error) {
      console.error('FLOATING CARD ACTION CATCH:', error)
      alert('Something went wrong')
    } finally {
      setProcessing(null)
    }
  }
  if (!mounted) return null
  if (!canReviewApprovals) return null

  // Hide floating card on User Approvals page
  if (
    pathname?.startsWith('/admin/collections/user-approvals') ||
    pathname?.startsWith('/admin/collections/user') ||
    pathname?.startsWith('/admin/collections/posts')
  ) {
    return null
  }

  if (!request) return null

  if (hiddenRequestId && String(hiddenRequestId) === String(request.id)) {
    return null
  }

  return createPortal(
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <button
          type="button"
          onClick={() => setHiddenRequestId(request.id)}
          style={styles.closeButton}
          aria-label="Close"
        >
          ×
        </button>

        <div style={styles.topRow}>
          <div style={styles.iconWrap}>
            <span style={styles.icon}>!</span>
          </div>

          <div>
            <h3 style={styles.title}>New user approval</h3>
            <p style={styles.subtitle}>A new user is waiting for access.</p>
          </div>
        </div>

        <div style={styles.userBox}>
          <div style={styles.avatar}>
            {(request.name || request.email || 'U').charAt(0).toUpperCase()}
          </div>

          <div style={styles.userInfo}>
            <div style={styles.name}>{request.name || 'New User'}</div>
            <div style={styles.email}>{request.email}</div>
          </div>
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            disabled={Boolean(processing)}
            onClick={() => handleAction('approved')}
            style={{
              ...styles.actionButton,
              ...styles.approveButton,
              opacity: processing ? 0.7 : 1,
            }}
          >
            {processing === 'approved' ? 'Approving...' : 'Approve'}
          </button>

          <button
            type="button"
            disabled={Boolean(processing)}
            onClick={() => handleAction('rejected')}
            style={{
              ...styles.actionButton,
              ...styles.rejectButton,
              opacity: processing ? 0.7 : 1,
            }}
          >
            {processing === 'rejected' ? 'Rejecting...' : 'Reject'}
          </button>
        </div>

        {/* <a href="/admin/collections/user-approvals" style={styles.link}>
          View all approval requests →
        </a> */}
      </div>
    </div>,
    document.body,
  )
}
const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: 'fixed',
    right: '18px',
    bottom: '18px',
    zIndex: 2147483647,
    width: '285px',
    maxWidth: 'calc(100vw - 24px)',
    pointerEvents: 'auto',
  },

  card: {
    position: 'relative',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '14px',
    boxShadow: '0 16px 45px rgba(15, 23, 42, 0.22)',
    padding: '14px',
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  closeButton: {
    position: 'absolute',
    right: '10px',
    top: '9px',
    width: '22px',
    height: '22px',
    borderRadius: '999px',
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: '15px',
    lineHeight: '16px',
  },

  topRow: {
    display: 'flex',
    gap: '9px',
    alignItems: 'center',
    paddingRight: '26px',
  },

  iconWrap: {
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    background: '#fef3c7',
    color: '#92400e',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },

  icon: {
    fontSize: '16px',
    fontWeight: 900,
  },

  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 800,
    color: '#111827',
  },

  subtitle: {
    margin: '2px 0 0',
    fontSize: '11px',
    color: '#6b7280',
  },

  userBox: {
    marginTop: '12px',
    padding: '10px',
    borderRadius: '11px',
    background: '#f9fafb',
    border: '1px solid #eef2f7',
    display: 'flex',
    gap: '9px',
    alignItems: 'center',
  },

  avatar: {
    width: '34px',
    height: '34px',
    borderRadius: '999px',
    background: '#111827',
    color: '#ffffff',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 900,
    fontSize: '13px',
    flexShrink: 0,
  },

  userInfo: {
    minWidth: 0,
  },

  name: {
    fontSize: '12px',
    fontWeight: 800,
    color: '#111827',
  },

  email: {
    marginTop: '2px',
    fontSize: '11px',
    color: '#374151',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  date: {
    marginTop: '2px',
    fontSize: '10px',
    color: '#9ca3af',
  },

  actions: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '12px',
  },

  actionButton: {
    border: 0,
    borderRadius: '999px',
    padding: '8px 10px',
    fontSize: '11px',
    fontWeight: 800,
    cursor: 'pointer',
  },

  approveButton: {
    background: '#16a34a',
    color: '#ffffff',
  },

  rejectButton: {
    background: '#fee2e2',
    color: '#991b1b',
  },

  link: {
    display: 'block',
    marginTop: '10px',
    textAlign: 'center',
    color: '#374151',
    textDecoration: 'none',
    fontSize: '11px',
    fontWeight: 700,
  },
}
