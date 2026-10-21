import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../services/api'
import './SchoolProfile.css'

type Profile = {
  id: number | null
  school_name: string
  tagline: string
  description: string
  address: string
  phone: string
  email: string
  website: string
  logo_url: string
  updated_at: string | null
}

type GalleryItem = {
  id: number
  image_url: string
  caption: string
  created_at: string
}

const emptyProfile: Profile = {
  id: null,
  school_name: '',
  tagline: '',
  description: '',
  address: '',
  phone: '',
  email: '',
  website: '',
  logo_url: '',
  updated_at: null,
}

export default function SchoolProfile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [gallery, setGallery] = useState<GalleryItem[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem('school_erp_token')
    if (!token) {
      navigate('/login', { replace: true })
      throw new Error('Please log in again.')
    }

    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${token}`)

    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    })
    const data = await response.json().catch(() => ({}))

    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem('school_erp_token')
      sessionStorage.removeItem('school_erp_admin')
      navigate('/login', { replace: true })
      throw new Error('Session expired. Please log in again.')
    }

    if (!response.ok) {
      throw new Error(
        typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`,
      )
    }
    return data
  }, [navigate])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [profileData, galleryData] = await Promise.all([
        request('/school-profile/me'),
        request('/school-profile/gallery'),
      ])
      setProfile({ ...emptyProfile, ...profileData })
      setGallery(Array.isArray(galleryData) ? galleryData : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load school profile.')
    } finally {
      setLoading(false)
    }
  }, [request])

  useEffect(() => {
    if (!sessionStorage.getItem('school_erp_token')) {
      navigate('/login', { replace: true })
      return
    }
    void loadData()
  }, [loadData, navigate])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await request('/school-profile/me', {
        method: 'PUT',
        body: JSON.stringify(profile),
      })
      setProfile({ ...emptyProfile, ...result })
      setMessage('School profile saved successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      setError('Please select an image first.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be 5 MB or smaller.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('caption', caption)

    setUploading(true)
    setError('')
    setMessage('')
    try {
      const item = await request('/school-profile/gallery', {
        method: 'POST',
        body: formData,
      })
      setGallery(current => [item, ...current])
      setFile(null)
      setCaption('')
      const input = document.getElementById('gallery-file') as HTMLInputElement | null
      if (input) input.value = ''
      setMessage('Gallery image uploaded successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function deleteImage(id: number) {
    if (!window.confirm('Delete this gallery image?')) return
    setError('')
    setMessage('')
    try {
      await request(`/school-profile/gallery/${id}`, { method: 'DELETE' })
      setGallery(current => current.filter(item => item.id !== id))
      setMessage('Gallery image deleted.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete image.')
    }
  }

  function updateField(field: keyof Profile, value: string) {
    setProfile(current => ({ ...current, [field]: value }))
  }

  if (loading) {
    return <main className="school-profile-page"><p>Loading school profile...</p></main>
  }

  return (
    <main className="school-profile-page">
      <header className="sp-topbar">
        <a href="/admin" className="sp-brand">SCHOOL ERP</a>
        <button type="button" className="sp-secondary" onClick={() => navigate('/admin')}>
          Back to dashboard
        </button>
      </header>

      <div className="sp-container">
        <section className="sp-heading">
          <div>
            <p className="sp-eyebrow">SCHOOL SETTINGS</p>
            <h1>School Profile</h1>
            <p>Manage your school's public information and photo gallery.</p>
          </div>
        </section>

        {error && <div className="sp-alert sp-error" role="alert">{error}</div>}
        {message && <div className="sp-alert sp-success" role="status">{message}</div>}

        <section className="sp-card">
          <div className="sp-section-heading">
            <div>
              <h2>School information</h2>
              <p>These details belong to your logged-in school account.</p>
            </div>
          </div>

          {profile.logo_url.trim() && (
            <div className="sp-logo-preview">
              <img src={profile.logo_url} alt="School logo preview" />
              <span>Logo preview</span>
            </div>
          )}

          <form onSubmit={saveProfile} className="sp-form">
            <label className="sp-field">
              School name *
              <input required maxLength={150} value={profile.school_name}
                onChange={e => updateField('school_name', e.target.value)}
                placeholder="e.g. Sunrise Public School" />
            </label>

            <label className="sp-field">
              Tagline
              <input maxLength={250} value={profile.tagline}
                onChange={e => updateField('tagline', e.target.value)}
                placeholder="A short line about your school" />
            </label>

            <label className="sp-field sp-full">
              Description
              <textarea rows={4} maxLength={5000} value={profile.description}
                onChange={e => updateField('description', e.target.value)}
                placeholder="Tell visitors about your school..." />
            </label>

            <label className="sp-field sp-full">
              Address
              <textarea rows={2} maxLength={2000} value={profile.address}
                onChange={e => updateField('address', e.target.value)}
                placeholder="School address" />
            </label>

            <label className="sp-field">
              Phone
              <input type="tel" maxLength={40} value={profile.phone}
                onChange={e => updateField('phone', e.target.value)}
                placeholder="Contact number" />
            </label>

            <label className="sp-field">
              Email
              <input type="email" maxLength={254} value={profile.email}
                onChange={e => updateField('email', e.target.value)}
                placeholder="school@example.com" />
            </label>

            <label className="sp-field">
              Website URL
              <input type="url" maxLength={300} value={profile.website}
                onChange={e => updateField('website', e.target.value)}
                placeholder="https://example.com" />
            </label>

            <label className="sp-field">
              Logo image URL
              <input type="url" maxLength={500} value={profile.logo_url}
                onChange={e => updateField('logo_url', e.target.value)}
                placeholder="https://example.com/logo.png" />
            </label>

            <div className="sp-full sp-actions">
              <button className="sp-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save school profile'}
              </button>
            </div>
          </form>
        </section>

        <section className="sp-card">
          <div className="sp-section-heading">
            <div>
              <h2>School gallery</h2>
              <p>JPEG, PNG, WEBP or GIF. Maximum file size: 5 MB.</p>
            </div>
            <span className="sp-count">{gallery.length} images</span>
          </div>

          <form className="sp-upload-form" onSubmit={uploadImage}>
            <label className="sp-field">
              Choose image *
              <input id="gallery-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif"
                required onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <label className="sp-field">
              Caption
              <input maxLength={300} value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Annual function, school building..." />
            </label>
            <button className="sp-primary" type="submit" disabled={uploading || !file}>
              {uploading ? 'Uploading...' : 'Upload image'}
            </button>
          </form>

          {gallery.length === 0 ? (
            <div className="sp-empty">
              <strong>Your gallery is empty</strong>
              <p>Upload your first school photo using the form above.</p>
            </div>
          ) : (
            <div className="sp-gallery">
              {gallery.map(item => (
                <article className="sp-gallery-item" key={item.id}>
                  <img src={`${API_URL}${item.image_url}`} alt={item.caption || 'School gallery image'} />
                  <div className="sp-gallery-caption">
                    <p>{item.caption || 'School photo'}</p>
                    <button type="button" className="sp-delete"
                      onClick={() => void deleteImage(item.id)}>
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}