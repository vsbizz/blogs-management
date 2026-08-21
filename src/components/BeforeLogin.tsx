/**
 * Brand header above the login form.
 *
 * This used to render nothing but a <style> block that hid the theme selector
 * and the forgot-password link with wildcard selectors like [class*="theme"].
 * That styling now lives in (payload)/custom.scss with targeted selectors, so
 * this component can do its actual job: identify the product being logged into.
 */
export default function BeforeLogin() {
  return (
    <div className="login__brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="IGG Axion" className="login__brand-logo" />
      <h1 className="login__brand-title">Blog CMS</h1>
      <p className="login__brand-subtitle">Sign in to write and publish articles.</p>
    </div>
  )
}