import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../services/api'
import './SuperAdmin.css'

export default function SuperAdminLogin() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/super-admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : `Login failed (${response.status}). Please try again.`,
        )
      }
      if (!data.access_token || !data.super_admin) {
        throw new Error('The server did not return a valid Super Admin session.')
      }

      sessionStorage.setItem('school_erp_token', data.access_token)
      sessionStorage.setItem('school_erp_role', 'super_admin')
      sessionStorage.setItem('school_erp_super_admin', JSON.stringify(data.super_admin))
      sessionStorage.removeItem('school_erp_admin')
      sessionStorage.removeItem('school_erp_teacher')
      sessionStorage.removeItem('school_erp_student')
      navigate('/super-admin', { replace: true })
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Backend se connection nahi ho raha. FastAPI server check karein.'
          : err instanceof Error
            ? err.message
            : 'Login nahi ho saka. Dobara try karein.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="sa-login-page">
      <section className="sa-login-art">
        <div className="sa-brand-mark">S</div>
        <p className="sa-eyebrow">SCHOOLERP ? PLATFORM CONTROL</p>
        <h1>One platform.<br />Every school.</h1>
        <p className="sa-art-description">
          Manage your school network from one secure platform.
          School-level access remains separate from platform administration.
        </p>
        <div className="sa-art-footer">
          <span className="sa-status-dot" /> Secure platform access
        </div>
      </section>

      <section className="sa-login-side">
        <form className="sa-login-card" onSubmit={handleSubmit}>
          <p className="sa-eyebrow sa-muted">SUPER ADMINISTRATION</p>
          <h2>Welcome back</h2>
          <p className="sa-subtitle">Sign in to your platform control panel.</p>

          <label htmlFor="sa-username">Username</label>
          <input
            id="sa-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Enter Super Admin username"
            maxLength={50}
            required
          />

          <label htmlFor="sa-password">Password</label>
          <div className="sa-password-field">
            <input
              id="sa-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              maxLength={128}
              required
            />
            <button
              className="sa-show-password"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>

          {error && <div className="sa-error" role="alert">{error}</div>}

          <button className="sa-primary-button" type="submit" disabled={loading}>
            {loading ? 'Signing in?' : 'Sign in securely'}
            {!loading && <span aria-hidden="true"> ?</span>}
          </button>
          <p className="sa-security-note">
            This sign-in is separate from school Admin and Teacher accounts.
          </p>
          <button className="sa-back-link" type="button" onClick={() => navigate('/login')}>
            ? Back to school login
          </button>
        </form>
      </section>
    </main>
  )
}
