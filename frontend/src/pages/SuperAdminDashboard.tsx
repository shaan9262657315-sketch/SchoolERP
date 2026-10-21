import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../services/api'
import './SuperAdmin.css'

type SchoolDirectoryItem = {
  id: number
  school_name: string
  slug: string | null
  address: string
  admin_username: string
  admin_active: boolean
  student_count: number
  teacher_count: number
  public_website: string | null
  tagline?: string
  description?: string
  phone?: string
  email?: string
  website?: string
}

type SchoolEditForm = {
  school_name: string
  address: string
  tagline: string
  description: string
  phone: string
  email: string
  website: string
}

type SuperAdminProfile = {
  id: number
  username: string
  role: 'super_admin'
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<SuperAdminProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [schools, setSchools] = useState<SchoolDirectoryItem[]>([])
  const [schoolsLoading, setSchoolsLoading] = useState(true)
  const [schoolsError, setSchoolsError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createSchoolLoading, setCreateSchoolLoading] = useState(false)
  const [createSchoolError, setCreateSchoolError] = useState('')
  const [createSchoolSuccess, setCreateSchoolSuccess] = useState('')
  const [newSchoolName, setNewSchoolName] = useState('')
  const [newAdminUsername, setNewAdminUsername] = useState('')
  const [newAdminPassword, setNewAdminPassword] = useState('')
  const [newSchoolAddress, setNewSchoolAddress] = useState('')
  const [editingSchoolId, setEditingSchoolId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<SchoolEditForm>({
    school_name: '', address: '', tagline: '', description: '',
    phone: '', email: '', website: '',
  })
  const [managementMessage, setManagementMessage] = useState('')
  const [managementError, setManagementError] = useState('')
  const [managementBusyId, setManagementBusyId] = useState<number | null>(null)


  const logout = useCallback(() => {
    sessionStorage.removeItem('school_erp_token')
    sessionStorage.removeItem('school_erp_role')
    sessionStorage.removeItem('school_erp_super_admin')
    navigate('/super-admin/login', { replace: true })
  }, [navigate])


  async function handleCreateSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreateSchoolError('')
    setCreateSchoolSuccess('')
    setCreateSchoolLoading(true)

    const token = sessionStorage.getItem('school_erp_token')
    if (!token || sessionStorage.getItem('school_erp_role') !== 'super_admin') {
      logout()
      return
    }

    try {
      const response = await fetch(`${API_URL}/super-admin/schools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          school_name: newSchoolName.trim(),
          admin_username: newAdminUsername.trim(),
          admin_password: newAdminPassword,
          address: newSchoolAddress.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401 || response.status === 403) {
        logout()
        return
      }
      if (!response.ok) {
        throw new Error(
          typeof data.detail === 'string'
            ? data.detail
            : `School creation failed (${response.status}).`,
        )
      }

      const listResponse = await fetch(`${API_URL}/super-admin/schools`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const listData = await listResponse.json().catch(() => ({}))
      if (!listResponse.ok) {
        throw new Error('School created, but the directory could not refresh. Reload the dashboard.')
      }
      setSchools(Array.isArray(listData.schools) ? listData.schools : [])
      setCreateSchoolSuccess('School created. Save the Admin credentials securely; the password will not be shown again.')
      setNewSchoolName('')
      setNewAdminUsername('')
      setNewAdminPassword('')
      setNewSchoolAddress('')
      setShowCreateForm(false)
    } catch (err) {
      setCreateSchoolError(err instanceof Error ? err.message : 'School create nahi ho saka.')
    } finally {
      setCreateSchoolLoading(false)
    }
  }


  async function refreshSchoolDirectory(token: string) {
    const response = await fetch(`${API_URL}/super-admin/schools`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(
        typeof data.detail === 'string'
          ? data.detail
          : `School directory refresh failed (${response.status}).`,
      )
    }
    setSchools(Array.isArray(data.schools) ? data.schools : [])
  }

  function startSchoolEdit(school: SchoolDirectoryItem) {
    setManagementMessage('')
    setManagementError('')
    setEditingSchoolId(school.id)
    setEditForm({
      school_name: school.school_name || '',
      address: school.address || '',
      tagline: school.tagline || '',
      description: school.description || '',
      phone: school.phone || '',
      email: school.email || '',
      website: school.website || '',
    })
  }

  async function handleSaveSchoolDetails(
    event: FormEvent<HTMLFormElement>,
    schoolId: number,
  ) {
    event.preventDefault()
    setManagementMessage('')
    setManagementError('')
    setManagementBusyId(schoolId)

    try {
      const token = sessionStorage.getItem('school_erp_token')
      if (!token || sessionStorage.getItem('school_erp_role') !== 'super_admin') {
        logout()
        return
      }

      const response = await fetch(`${API_URL}/super-admin/schools/${schoolId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...editForm,
          school_name: editForm.school_name.trim(),
          address: editForm.address.trim(),
          tagline: editForm.tagline.trim(),
          description: editForm.description.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
          website: editForm.website.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401 || response.status === 403) {
        logout()
        return
      }
      if (!response.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : `Update failed (${response.status}).`)
      }

      await refreshSchoolDirectory(token)
      setEditingSchoolId(null)
      setManagementMessage(data.message || 'School details updated successfully.')
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : 'School details update nahi ho sake.')
    } finally {
      setManagementBusyId(null)
    }
  }

  async function runAdminAction(
    school: SchoolDirectoryItem,
    path: string,
    body: Record<string, unknown>,
    successFallback: string,
  ) {
    setManagementMessage('')
    setManagementError('')
    setManagementBusyId(school.id)

    try {
      const token = sessionStorage.getItem('school_erp_token')
      if (!token || sessionStorage.getItem('school_erp_role') !== 'super_admin') {
        logout()
        return
      }

      const response = await fetch(`${API_URL}/super-admin/schools/${school.id}/${path}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 401 || response.status === 403) {
        logout()
        return
      }
      if (!response.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : `Action failed (${response.status}).`)
      }

      await refreshSchoolDirectory(token)
      setManagementMessage(data.message || successFallback)
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : 'Admin action complete nahi hua.')
    } finally {
      setManagementBusyId(null)
    }
  }

  function handleToggleSchoolStatus(school: SchoolDirectoryItem) {
    const nextActive = !school.admin_active

    const warning = nextActive
      ? `Reactivate ${school.school_name}? Its linked Admin will be able to log in again.`
      : `Deactivate ${school.school_name}? Its linked Admin will lose access to protected endpoints. School records will NOT be deleted.`
    if (!window.confirm(warning)) return

    void runAdminAction(
      school,
      'status',
      { is_active: nextActive },
      `School Admin ${nextActive ? 'reactivated' : 'deactivated'}.`,
    )
  }

  function handleChangeAdminUsername(school: SchoolDirectoryItem) {
    const username = window.prompt(
      `Enter a new username for ${school.school_name} (3-50 letters, numbers, dot, underscore or hyphen):`,
      school.admin_username,
    )
    if (username === null) return
    if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username.trim())) {
      setManagementError('Username must be 3-50 characters: letters, numbers, dot, underscore or hyphen.')
      setManagementMessage('')
      return
    }
    void runAdminAction(
      school,
      'admin/username',
      { username: username.trim() },
      'Admin username updated.',
    )
  }

  function handleResetAdminPassword(school: SchoolDirectoryItem) {
    const password = window.prompt(
      `Enter a new password for ${school.admin_username} (minimum 8 characters).`,
    )
    if (password === null) return
    if (password.length < 8 || password.length > 128) {
      setManagementError('Password must contain 8-128 characters.')
      setManagementMessage('')
      return
    }
    if (!window.confirm(`Reset the password for ${school.admin_username}? The old password will stop working.`)) return

    void runAdminAction(
      school,
      'admin/password',
      { new_password: password },
      'Admin password reset successfully. Save the new password securely.',
    )
  }

  useEffect(() => {
    const token = sessionStorage.getItem('school_erp_token')
    const role = sessionStorage.getItem('school_erp_role')

    if (!token || role !== 'super_admin') {
      navigate('/super-admin/login', { replace: true })
      return
    }

    let cancelled = false

    async function loadProfile() {
      try {
        const response = await fetch(`${API_URL}/super-admin/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json().catch(() => ({}))

        if (response.status === 401 || response.status === 403) {
          if (!cancelled) logout()
          return
        }
        if (!response.ok) {
          throw new Error(
            typeof data.detail === 'string'
              ? data.detail
              : `Could not verify session (${response.status}).`,
          )
        }
        if (!cancelled) setProfile(data as SuperAdminProfile)

        try {
          const schoolResponse = await fetch(`${API_URL}/super-admin/schools`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const schoolData = await schoolResponse.json().catch(() => ({}))

          if (schoolResponse.status === 401 || schoolResponse.status === 403) {
            if (!cancelled) logout()
            return
          }
          if (!schoolResponse.ok) {
            throw new Error(
              typeof schoolData.detail === 'string'
                ? schoolData.detail
                : `School directory failed (${schoolResponse.status}).`,
            )
          }
          if (!cancelled) {
            setSchools(Array.isArray(schoolData.schools) ? schoolData.schools : [])
          }
        } catch (schoolErr) {
          if (!cancelled) {
            setSchoolsError(
              schoolErr instanceof Error
                ? schoolErr.message
                : 'School directory load nahi ho saka.',
            )
          }
        } finally {
          if (!cancelled) setSchoolsLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof TypeError
              ? 'Backend se connection nahi ho raha. FastAPI server check karein.'
              : err instanceof Error
                ? err.message
                : 'Profile load nahi ho saka.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadProfile()
    return () => { cancelled = true }
  }, [navigate, logout])

  if (loading) {
    return <main className="sa-dashboard-page"><div className="sa-loading">Verifying secure session?</div></main>
  }

  if (error) {
    return (
      <main className="sa-dashboard-page">
        <div className="sa-error-panel">
          <h2>Could not verify your session</h2>
          <p>{error}</p>
          <button className="sa-primary-button" onClick={logout}>Return to login</button>
        </div>
      </main>
    )
  }

  if (!profile) return null

  return (
    <main className="sa-dashboard-page">
      <header className="sa-topbar">
        <div className="sa-topbar-brand">
          <div className="sa-brand-mark sa-brand-small">S</div>
          <div>
            <strong>SchoolERP</strong>
            <span>Platform console</span>
          </div>
        </div>
        <div className="sa-topbar-actions">
          <span className="sa-role-pill">Super Admin</span>
          <button className="sa-logout-button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <div className="sa-dashboard-content">
        <section className="sa-welcome">
          <div>
            <p className="sa-eyebrow sa-muted">PLATFORM OVERVIEW</p>
            <h1>Good to see you, {profile.username}.</h1>
            <p>Manage the school network from one central place.</p>
          </div>
          <div className="sa-welcome-icon" aria-hidden="true">?</div>
        </section>

        <section className="sa-section-heading">
          <div>
            <h2>Platform management</h2>
            <p>Your control centre for the next phase of SchoolERP.</p>
          </div>
          <span className="sa-role-pill">Account verified</span>
        </section>

        <section className="sa-management-grid">
          <article className="sa-management-card sa-featured-card">
            <div className="sa-card-icon">?</div>
            <span className="sa-card-status">NEXT PHASE</span>
            <h3>School directory</h3>
            <p>Create and manage school accounts, school profiles and their independent access.</p>
            <div className="sa-card-footer">School Directory API connected</div>
          </article>
          <article className="sa-management-card">
            <div className="sa-card-icon">?</div>
            <span className="sa-card-status">AVAILABLE</span>
            <h3>Platform accounts</h3>
<p><a href="/super-admin/platform" style={{ display: "inline-block", marginTop: 10, fontWeight: 700, color: "#2563eb" }}>Open Platform Management →</a></p>
            <p>Manage platform-level administrators without changing school Admin accounts.</p>
            <div className="sa-card-footer">Separate role and permissions</div>
          </article>
          <article className="sa-management-card">
            <div className="sa-card-icon">?</div>
            <span className="sa-card-status">AVAILABLE</span>
            <h3>Plans and subscriptions</h3>
<p><a href="/super-admin/platform" style={{ display: "inline-block", marginTop: 10, fontWeight: 700, color: "#2563eb" }}>Manage Plans &amp; Subscriptions →</a></p>
            <p>Prepare school-wise plans, feature access and subscription status.</p>
            <div className="sa-card-footer">No subscription data has been created</div>
          </article>
        </section>


        <section className="sa-create-school-section">
          <div className="sa-section-heading">
            <div>
              <h2>Add a School</h2>
              <p>Create a separate school Admin login and public profile.</p>
            </div>
            <button
              className="sa-primary-button"
              type="button"
              onClick={() => {
                setShowCreateForm((value) => !value)
                setCreateSchoolError('')
                setCreateSchoolSuccess('')
              }}
            >
              {showCreateForm ? 'Cancel' : '+ Add School'}
            </button>
          </div>

          {createSchoolSuccess && <div className="sa-success-panel" role="status">{createSchoolSuccess}</div>}
          {createSchoolError && <div className="sa-error-panel" role="alert"><p>{createSchoolError}</p></div>}

          {showCreateForm && (
            <form className="sa-create-school-form" onSubmit={handleCreateSchool}>
              <label>
                School name *
                <input
                  required minLength={2} maxLength={150}
                  value={newSchoolName}
                  onChange={(event) => setNewSchoolName(event.target.value)}
                  placeholder="e.g. Sunrise Public School"
                />
              </label>
              <label>
                New Admin username *
                <input
                  required minLength={3} maxLength={50}
                  pattern="[A-Za-z0-9_.-]+"
                  title="Use letters, numbers, dot, underscore or hyphen."
                  autoComplete="off"
                  value={newAdminUsername}
                  onChange={(event) => setNewAdminUsername(event.target.value)}
                  placeholder="e.g. sunrise_admin"
                />
              </label>
              <label>
                Initial Admin password *
                <input
                  required minLength={8} maxLength={128}
                  type="password" autoComplete="new-password"
                  value={newAdminPassword}
                  onChange={(event) => setNewAdminPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </label>
              <label>
                School address (optional)
                <textarea
                  maxLength={2000}
                  value={newSchoolAddress}
                  onChange={(event) => setNewSchoolAddress(event.target.value)}
                  placeholder="School address"
                  rows={3}
                />
              </label>
              <p className="sa-dashboard-footnote">The Admin password is stored as a secure hash. Keep the initial password safe before creating the account.</p>
              <button className="sa-primary-button" type="submit" disabled={createSchoolLoading}>
                {createSchoolLoading ? 'Creating school...' : 'Create School & Admin'}
              </button>
            </form>
          )}
        </section>

        <section className="sa-directory-section">
          <div className="sa-section-heading">
            <div>
              <h2>School Directory</h2>
              <p>Configured school profiles and their linked Admin accounts.</p>
            </div>
            <span className="sa-role-pill">{schools.length} schools</span>
          </div>

          {managementMessage && <div className="sa-success-panel" role="status">{managementMessage}</div>}
          {managementError && <div className="sa-error-panel sa-management-error" role="alert"><p>{managementError}</p></div>}

          {schoolsLoading ? (
            <p className="sa-dashboard-footnote">Loading school records...</p>
          ) : schoolsError ? (
            <div className="sa-error-panel">
              <p>{schoolsError}</p>
            </div>
          ) : schools.length === 0 ? (
            <div className="sa-management-card">
              <h3>No school profiles found</h3>
              <p>Create or configure a school profile through the existing school Admin workflow.</p>
            </div>
          ) : (
            <div className="sa-school-list">
              {schools.map((school) => (
                <article className="sa-management-card" key={school.id}>
                  <span className="sa-card-status">
                    {school.admin_active ? 'ADMIN ACTIVE' : 'ADMIN INACTIVE'}
                  </span>
                  <h3>{school.school_name}</h3>
                  <p>{school.address || 'Address not added yet'}</p>
                  <p>Admin username: <strong>{school.admin_username}</strong></p>
                  <p>Students: <strong>{school.student_count}</strong> Â· Teachers: <strong>{school.teacher_count}</strong></p>
                  {school.slug && (
                    <p>
                      Public website: <a href={`/schools/${school.slug}`} target="_blank" rel="noreferrer">
                        /schools/{school.slug}
                      </a>
                    </p>
                  )}

                  <div className="sa-school-actions">
                    <button
                      type="button"
                      className="sa-secondary-button"
                      onClick={() => {
                        if (editingSchoolId === school.id) {
                          setEditingSchoolId(null)
                        } else {
                          startSchoolEdit(school)
                        }
                      }}
                    >
                      {editingSchoolId === school.id ? 'Cancel edit' : 'Edit details'}
                    </button>
                    <button
                      type="button"
                      className="sa-secondary-button"
                      disabled={managementBusyId === school.id}
                      onClick={() => handleToggleSchoolStatus(school)}
                    >
                      {school.admin_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      className="sa-secondary-button"
                      disabled={managementBusyId === school.id}
                      onClick={() => handleChangeAdminUsername(school)}
                    >
                      Change username
                    </button>
                    <button
                      type="button"
                      className="sa-secondary-button"
                      disabled={managementBusyId === school.id}
                      onClick={() => handleResetAdminPassword(school)}
                    >
                      Reset password
                    </button>
                  </div>

                  {editingSchoolId === school.id && (
                    <form className="sa-school-edit-form" onSubmit={(event) => void handleSaveSchoolDetails(event, school.id)}>
                      <h4>Edit school details</h4>
                      <label>School name *
                        <input required minLength={2} maxLength={150} value={editForm.school_name}
                          onChange={(event) => setEditForm({ ...editForm, school_name: event.target.value })} />
                      </label>
                      <label>Address
                        <textarea maxLength={2000} rows={2} value={editForm.address}
                          onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} />
                      </label>
                      <label>Tagline
                        <input maxLength={250} value={editForm.tagline}
                          onChange={(event) => setEditForm({ ...editForm, tagline: event.target.value })} />
                      </label>
                      <label>Description
                        <textarea maxLength={5000} rows={3} value={editForm.description}
                          onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} />
                      </label>
                      <label>Phone
                        <input maxLength={40} value={editForm.phone}
                          onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} />
                      </label>
                      <label>Email
                        <input type="email" maxLength={254} value={editForm.email}
                          onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} />
                      </label>
                      <label>Website
                        <input maxLength={300} value={editForm.website}
                          onChange={(event) => setEditForm({ ...editForm, website: event.target.value })} />
                      </label>
                      <p className="sa-dashboard-footnote">Public website slug is kept unchanged, so existing links remain valid.</p>
                      <button className="sa-primary-button" type="submit" disabled={managementBusyId === school.id}>
                        {managementBusyId === school.id ? 'Saving...' : 'Save school details'}
                      </button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="sa-security-panel">
          <div className="sa-security-icon">?</div>
          <div>
            <h3>Secure session verified</h3>
            <p>
              The backend confirmed your Super Admin identity. A normal school Admin
              token cannot access the Super Admin endpoint.
            </p>
          </div>
          <span className="sa-verified-label">Verified</span>
        </section>

        <p className="sa-dashboard-footnote">
          This dashboard currently shows the verified account only. School counts,
          subscription figures and school records will appear after their backend
          management endpoints are implemented.
        </p>
      </div>
    </main>
  )
}
