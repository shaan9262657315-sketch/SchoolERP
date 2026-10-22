import { API_URL } from '../services/api';
﻿import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'


export default function Login() {
  const navigate = useNavigate()
  const [role, setRole] = useState<'admin' | 'teacher' | 'student'>('admin')
  const [username, setUsername] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint = role === 'admin' ? '/auth/admin/login' : role === 'teacher' ? '/auth/teacher/login' : '/auth/student/login'
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role === 'student' ? { registration_number: registrationNumber.trim(), date_of_birth: dateOfBirth, password } : { username: username.trim(), password }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : `Login failed (${response.status}). Please try again.`
        )
      }

      if (!data.access_token) throw new Error('The login token was not received from the backend.')

      sessionStorage.setItem('school_erp_token', data.access_token)
      sessionStorage.setItem('school_erp_role', role)

      if (role === 'student') {
        sessionStorage.setItem('school_erp_student', JSON.stringify(data.student ?? {}))
        sessionStorage.removeItem('school_erp_admin')
        sessionStorage.removeItem('school_erp_teacher')
        navigate('/student', { replace: true })
        return
      }

      if (role === 'admin') {
        sessionStorage.setItem('school_erp_admin', JSON.stringify(data.admin ?? {}))
        sessionStorage.removeItem('school_erp_teacher')
        navigate('/admin', { replace: true })
      } else {
        sessionStorage.setItem('school_erp_teacher', JSON.stringify(data.teacher ?? {}))
        sessionStorage.removeItem('school_erp_admin')
        navigate('/teacher', { replace: true })
      }
    } catch (err) {
      setError(
        err instanceof TypeError
          ? 'Unable to connect to the backend. Please check that the FastAPI server is running.'
          : err instanceof Error
            ? err.message
            : 'Login failed. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <a className="login-back" href="/">← Back to homepage</a>
        <div className="login-brand">
          <div className="login-logo">S</div>
          <span>School ERP</span>
        </div>
        <p className="login-eyebrow">{role === 'student' ? 'STUDENT PORTAL' : 'STAFF PORTAL'}</p>
        <h1>Welcome back</h1>
        <p className="login-description">Choose your account type to continue.</p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setRole('admin'); setError('') }}
            aria-pressed={role === 'admin'}
            style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #bbb', cursor: 'pointer', background: role === 'admin' ? '#1d4ed8' : '#fff', color: role === 'admin' ? '#fff' : '#222' }}>
            Admin
          </button>
          <button type="button" onClick={() => { setRole('teacher'); setError('') }}
            aria-pressed={role === 'teacher'}
            style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #bbb', cursor: 'pointer', background: role === 'teacher' ? '#1d4ed8' : '#fff', color: role === 'teacher' ? '#fff' : '#222' }}>
            Teacher
          </button>
          <button type="button" onClick={() => { setRole('student'); setError('') }}
            aria-pressed={role === 'student'}
            style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid #bbb', cursor: 'pointer', background: role === 'student' ? '#1d4ed8' : '#fff', color: role === 'student' ? '#fff' : '#222' }}>
            Student
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {role === 'student' ? (
            <>
              <label htmlFor="registrationNumber">Registration Number</label>
              <input id="registrationNumber" type="text" autoComplete="username" placeholder="Enter registration number" value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} required maxLength={30} />
              <label htmlFor="dateOfBirth">Date of Birth</label>
              <input id="dateOfBirth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required />
            </>
          ) : (
            <>
              <label htmlFor="username">Username</label>
          <input id="username" type="text" autoComplete="username"
            placeholder="Enter your username" value={username}
            onChange={(event) => setUsername(event.target.value)}
            required maxLength={50} />
            </>
          )}

          <label htmlFor="password">Password</label>
          <div className="password-field-wrap">
            <input
              id="password"
              className="password-field-input"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={128}
            />
            <button
              type="button"
              className="password-visibility-toggle"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              title={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword(value => !value)}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                  <path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.8 4.3 10 7-0.5 1.2-1.4 2.5-2.7 3.6M6.2 6.2C3.9 7.7 2.5 10 2 12c1.2 2.7 4.8 7 10 7 1.5 0 2.8-.4 4-1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
              <span className="password-toggle-tooltip">
                {showPassword ? "Hide password" : "Show password"}
              </span>
            </button>
          </div>

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : `Sign in as ${role === 'admin' ? 'Admin' : role === 'teacher' ? 'Teacher' : 'Student'}`}
          </button>
        </form>

        <p className="login-note">
          Authorized staff only. Credentials are verified by the School ERP backend.
        </p>
      </section>
    </main>
  )
}
