import Link from 'next/link'

/**
 * Secondary actions below the login form. Styling comes from
 * (payload)/custom.scss rather than inline style objects so the links pick up
 * the shared palette.
 */
export default function AfterLogin() {
  return (
    <div className="login__secondary">
      <Link href="/forgot-password" className="login__secondary-link">
        Forgot your password?
      </Link>

      <p className="login__secondary-note">
        New here? <Link href="/signup">Request an account</Link>
      </p>
    </div>
  )
}