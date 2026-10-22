import { API_URL } from '../services/api';
﻿import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './AdminDashboard.css'

const CLASSES = ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => String(i + 1))]
const SECTIONS = ['A', 'B', 'C']

type AdminTeacher = {
  id: number
  username: string
  full_name: string
  is_active: boolean
  class_name: string | null
  section: string | null
}
type AdminAssignment = {
  id: number
  teacher_id: number
  teacher_name: string
  username: string
  class_name: string
  section: string
}
type Student = {
  id: number
  registration_number: string
  full_name: string
  date_of_birth: string
  class_name: string
  section: string
  guardian_name: string
}

type DailyRecord = {
  id: number
  student_id: number
  attendance_date: string
  status: 'Present' | 'Absent' | 'Late'
}

type MonthlyRecord = {
  student_id: number
  registration_number: string
  full_name: string
  class_name: string
  section: string
  month: number
  year: number
  present_days: number
  late_days: number
  absent_days: number
  total_recorded_days: number
  attendance_percentage: number
}

const emptyForm = {
  registration_number: '',
  full_name: '',
  date_of_birth: '',
  class_name: '1',
  section: 'A',
  guardian_name: '',
}

function localDateString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type AdminAnnouncement = {
  id: number
  title: string
  message: string
  created_at: string
  display_date: string | null
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('All')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [teachers, setTeachers] = useState<AdminTeacher[]>([])
  const [assignments, setAssignments] = useState<AdminAssignment[]>([])
  const [adminAnnouncements, setAdminAnnouncements] = useState<AdminAnnouncement[]>([])
  const [announcementTitle, setAnnouncementTitle] = useState('')
  const [announcementMessage, setAnnouncementMessage] = useState('')
  const [announcementDate, setAnnouncementDate] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null)
  const [editAnnouncementTitle, setEditAnnouncementTitle] = useState('')
  const [editAnnouncementMessage, setEditAnnouncementMessage] = useState('')
  const [editAnnouncementDate, setEditAnnouncementDate] = useState('')
  const [announcementLoading, setAnnouncementLoading] = useState(false)
  const [announcementSaving, setAnnouncementSaving] = useState(false)

  const [teacherUsername, setTeacherUsername] = useState('')
  const [teacherName, setTeacherName] = useState('')
  const [teacherPassword, setTeacherPassword] = useState('')
  const [showTeacherPassword, setShowTeacherPassword] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState('')
  const [assignmentClass, setAssignmentClass] = useState('1')
  const [assignmentSection, setAssignmentSection] = useState('A')
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null)
  const [teacherBusy, setTeacherBusy] = useState(false)
  const [teacherError, setTeacherError] = useState('')
  const [teacherMessage, setTeacherMessage] = useState('')

  const [dailyDate, setDailyDate] = useState(localDateString())
  const [dailyClass, setDailyClass] = useState('1')
  const [dailySection, setDailySection] = useState('A')
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([])
  const [dailyLoading, setDailyLoading] = useState(false)
  const [dailyError, setDailyError] = useState('')

  const now = new Date()
  const [monthlyMonth, setMonthlyMonth] = useState(String(now.getMonth() + 1))
  const [monthlyYear, setMonthlyYear] = useState(String(now.getFullYear()))
  const [monthlyClass, setMonthlyClass] = useState('1')
  const [monthlySection, setMonthlySection] = useState('A')
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyRecord[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [monthlyError, setMonthlyError] = useState('')

  const token = sessionStorage.getItem('school_erp_token')
  let admin: { username?: string } = {}

  try {
    admin = JSON.parse(sessionStorage.getItem('school_erp_admin') || '{}')
  } catch {
    admin = {}
  }

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const currentToken = sessionStorage.getItem('school_erp_token')
    if (!currentToken) {
      navigate('/login', { replace: true })
      throw new Error('Session expire ho gaya. Dobara login karein.')
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${currentToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })

    const data = await response.json().catch(() => ({}))

    if (response.status === 401) {
      sessionStorage.removeItem('school_erp_token')
      sessionStorage.removeItem('school_erp_admin')
      navigate('/login', { replace: true })
      throw new Error('Session expire ho gaya. Dobara login karein.')
    }

    if (response.status === 403) {
      throw new Error(
        typeof data.detail === 'string'
          ? data.detail
          : 'You do not have permission to access this feature.'
      )
    }

    if (!response.ok) {
      throw new Error(
        typeof data.detail === 'string'
          ? data.detail
          : `Request failed (${response.status})`,
      )
    }

    return data
  }, [navigate])

  const loadStudents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiRequest('/admin/students')
      setStudents(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load students.')
    } finally {
      setLoading(false)
    }
  }, [apiRequest])

  const loadTeacherManagement = useCallback(async () => {
    try {
      const [teacherData, assignmentData] = await Promise.all([
        apiRequest('/admin/teachers'),
        apiRequest('/admin/class-assignments'),
      ])
      setTeachers(Array.isArray(teacherData) ? teacherData : [])
      setAssignments(Array.isArray(assignmentData) ? assignmentData : [])
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'Unable to load the teacher list.')
    }
  }, [apiRequest])

  async function createTeacher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTeacherBusy(true)
    setTeacherError('')
    setTeacherMessage('')
    try {
      await apiRequest('/admin/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: teacherUsername.trim(),
          full_name: teacherName.trim(),
          password: teacherPassword,
        }),
      })
      setTeacherUsername('')
      setTeacherName('')
      setTeacherPassword('')
      setTeacherMessage('Teacher created successfully.')
      await loadTeacherManagement()
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'Unable to create the teacher.')
    } finally {
      setTeacherBusy(false)
    }
  }

  async function saveAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedTeacher) {
      setTeacherError('Pehle teacher select karein.')
      return
    }
    setTeacherBusy(true)
    setTeacherError('')
    setTeacherMessage('')
    try {
      const payload = {
        teacher_id: Number(selectedTeacher),
        class_name: assignmentClass,
        section: assignmentSection,
      }
      const endpoint = editingAssignmentId === null
        ? '/admin/class-assignments'
        : `/admin/class-assignments/${editingAssignmentId}`
      await apiRequest(endpoint, {
        method: editingAssignmentId === null ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setEditingAssignmentId(null)
      setSelectedTeacher('')
      setAssignmentClass('1')
      setAssignmentSection('A')
      setTeacherMessage('Class assignment saved successfully.')
      await loadTeacherManagement()
    } catch (err) {
      setTeacherError(err instanceof Error ? err.message : 'Unable to save the assignment.')
    } finally {
      setTeacherBusy(false)
    }
  }

  function editAssignment(item: AdminAssignment) {
    setEditingAssignmentId(item.id)
    setSelectedTeacher(String(item.teacher_id))
    setAssignmentClass(item.class_name)
    setAssignmentSection(item.section)
    setTeacherError('')
    setTeacherMessage('')
  }
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    void loadStudents()
    void loadTeacherManagement()
  }, [token, navigate, loadStudents, loadTeacherManagement])

  useEffect(() => {
    let cancelled = false

    async function loadDailyAttendance() {
      setDailyLoading(true)
      setDailyError('')
      setDailyRecords([])

      try {
        const params = new URLSearchParams({
          attendance_date: dailyDate,
          class_name: dailyClass,
          section: dailySection,
        })
        const data = await apiRequest(`/attendance/daily?${params.toString()}`)
        if (!cancelled) setDailyRecords(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) {
          setDailyError(err instanceof Error ? err.message : 'Unable to load the daily report.')
        }
      } finally {
        if (!cancelled) setDailyLoading(false)
      }
    }

    if (token && dailyDate) void loadDailyAttendance()
    return () => { cancelled = true }
  }, [token, dailyDate, dailyClass, dailySection, apiRequest])

  useEffect(() => {
    let cancelled = false

    async function loadMonthlyAttendance() {
      setMonthlyLoading(true)
      setMonthlyError('')
      setMonthlyRecords([])

      try {
        const params = new URLSearchParams({
          year: monthlyYear,
          month: monthlyMonth,
          class_name: monthlyClass,
          section: monthlySection,
        })
        const data = await apiRequest(`/attendance/monthly?${params.toString()}`)
        if (!cancelled) setMonthlyRecords(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) {
          setMonthlyError(err instanceof Error ? err.message : 'Unable to load the monthly report.')
        }
      } finally {
        if (!cancelled) setMonthlyLoading(false)
      }
    }

    if (token) void loadMonthlyAttendance()
    return () => { cancelled = true }
  }, [token, monthlyYear, monthlyMonth, monthlyClass, monthlySection, apiRequest])

  async function saveStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const payload = {
        ...form,
        registration_number: form.registration_number.trim(),
        full_name: form.full_name.trim(),
        guardian_name: form.guardian_name.trim(),
      }

      if (editingStudent) {
        await apiRequest(`/admin/students/${editingStudent.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
        setMessage('Student details successfully update ho gayi.')
        setEditingStudent(null)
      } else {
        await apiRequest('/admin/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        setMessage('Student successfully add ho gaya.')
      }

      setForm(emptyForm)
      await loadStudents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the student.')
    } finally {
      setSaving(false)
    }
  }

  function startEditing(student: Student) {
    setEditingStudent(student)
    setForm({
      registration_number: student.registration_number,
      full_name: student.full_name,
      date_of_birth: student.date_of_birth,
      class_name: student.class_name,
      section: student.section,
      guardian_name: student.guardian_name,
    })
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEditing() {
    setEditingStudent(null)
    setForm(emptyForm)
    setError('')
    setMessage('')
  }

  function logout() {
    sessionStorage.removeItem('school_erp_token')
    sessionStorage.removeItem('school_erp_admin')
    navigate('/login', { replace: true })
  }

  const availableClasses = [...new Set(students.map((student) => student.class_name))]
    .sort((a, b) => a.localeCompare(b))

  const filteredStudents = students.filter((student) => {
    const query = search.trim().toLowerCase()
    const matchesClass = classFilter === 'All' || student.class_name === classFilter
    const matchesSearch =
      student.full_name.toLowerCase().includes(query) ||
      student.registration_number.toLowerCase().includes(query) ||
      student.class_name.toLowerCase().includes(query)

    return matchesClass && matchesSearch
  })

  const selectedDailyStudents = useMemo(
    () => students.filter((s) => s.class_name === dailyClass && s.section === dailySection),
    [students, dailyClass, dailySection],
  )

  const dailySummary = useMemo(() => {
    const statuses = new Map<number, string>()
    dailyRecords.forEach((record) => statuses.set(record.student_id, record.status))
    const present = dailyRecords.filter((r) => r.status === 'Present').length
    const absent = dailyRecords.filter((r) => r.status === 'Absent').length
    const late = dailyRecords.filter((r) => r.status === 'Late').length
    const recorded = new Set(dailyRecords.map((r) => r.student_id)).size
    const pending = Math.max(0, selectedDailyStudents.length - recorded)
    const percentage = recorded ? Math.round(((present + late) / recorded) * 10000) / 100 : 0
    return { present, absent, late, pending, recorded, percentage, statuses }
  }, [dailyRecords, selectedDailyStudents])

  const monthlySummary = useMemo(() => {
    const present = monthlyRecords.reduce((sum, r) => sum + r.present_days, 0)
    const late = monthlyRecords.reduce((sum, r) => sum + r.late_days, 0)
    const absent = monthlyRecords.reduce((sum, r) => sum + r.absent_days, 0)
    const recorded = monthlyRecords.reduce((sum, r) => sum + r.total_recorded_days, 0)
    const percentage = recorded ? Math.round(((present + late) / recorded) * 10000) / 100 : 0
    return { present, late, absent, recorded, percentage }
  }, [monthlyRecords])

  const loadAnnouncements = useCallback(async () => {
    setAnnouncementLoading(true)
    try {
      const data = await apiRequest('/announcements/admin')
      setAdminAnnouncements(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load announcements.')
    } finally {
      setAnnouncementLoading(false)
    }
  }, [apiRequest])

  useEffect(() => {
    if (token) void loadAnnouncements()
  }, [token, loadAnnouncements])

  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAnnouncementSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/announcements/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: announcementTitle.trim(),
          message: announcementMessage.trim(),
          display_date: announcementDate,
        }),
      })
      setAnnouncementTitle('')
      setAnnouncementMessage('')
      const now = new Date()
      setAnnouncementDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
      setMessage('Announcement published successfully.')
      await loadAnnouncements()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish the announcement.')
    } finally {
      setAnnouncementSaving(false)
    }
  }


  function startEditingAnnouncement(item: AdminAnnouncement) {
    setEditingAnnouncementId(item.id)
    setEditAnnouncementTitle(item.title)
    setEditAnnouncementMessage(item.message)
    setEditAnnouncementDate(item.display_date || (item.created_at ? item.created_at.slice(0, 10) : announcementDate))
    setError('')
    setMessage('')
  }

  async function updateAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingAnnouncementId === null) return
    setAnnouncementSaving(true)
    setError('')
    setMessage('')
    try {
      await apiRequest(`/announcements/${editingAnnouncementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editAnnouncementTitle.trim(),
          message: editAnnouncementMessage.trim(),
          display_date: editAnnouncementDate || null,
        }),
      })
      setEditingAnnouncementId(null)
      setMessage('Announcement updated successfully.')
      await loadAnnouncements()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update the announcement.')
    } finally {
      setAnnouncementSaving(false)
    }
  }

  async function removeAnnouncement(id: number) {
    if (!window.confirm('Delete this announcement?')) return
    setError('')
    setMessage('')
    try {
      await apiRequest(`/announcements/${id}`, { method: 'DELETE' })
      setAdminAnnouncements(current => current.filter(item => item.id !== id))
      setMessage('Announcement deleted successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete the announcement.')
    }
  }

  if (!token) return null

  return (
    <main className="erp-dashboard">
      <header className="erp-topbar">
        <a className="erp-brand" href="/">SCHOOL ERP</a>
        <div className="erp-user">
          <span>Admin{admin.username ? ` · ${admin.username}` : ''}</span>
          <button className="erp-logout" onClick={logout}>Log out</button>
        </div>
      </header>

      <section className="erp-content">
        <div className="erp-heading">
          <div>
            <p className="erp-eyebrow">ADMINISTRATION</p>
            <h1>School Dashboard</h1>
            <p className="erp-subtitle">Student management and attendance overview.</p>
          </div>
          <button className="erp-primary" onClick={() => navigate('/admin/finance')}>Finance Management</button>
          <button className="erp-primary" onClick={() => navigate('/admin/school-profile')}>School Profile & Gallery</button>
          <button className="erp-refresh" onClick={() => { void loadStudents() }}>
            Refresh students
          </button>
        </div>

        <div className="erp-stats">
          <div className="erp-stat">
            <span>Total students</span>
            <strong>{students.length}</strong>
          </div>
          <div className="erp-stat">
            <span>Matching records</span>
            <strong>{filteredStudents.length}</strong>
          </div>
        </div>

        <section className="erp-card announcements-panel">
          <div className="announcements-hero">
            <div className="announcements-hero-icon" aria-hidden="true">??</div>
            <div className="announcements-hero-copy">
              <span className="announcements-kicker">SCHOOL COMMUNICATION</span>
              <h2>Announcements</h2>
              <p>Share important updates, reminders and school notices with your students.</p>
            </div>
            <button className="announcements-refresh" type="button" onClick={() => void loadAnnouncements()} disabled={announcementLoading}>
              <span aria-hidden="true">?</span> {announcementLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="announcements-layout">
            <form className="announcement-compose" onSubmit={publishAnnouncement}>
              <div className="announcement-compose-heading">
                <span className="announcement-compose-icon" aria-hidden="true">??</span>
                <div>
                  <h3>Create announcement</h3>
                  <p>Write a clear message for your students.</p>
                </div>
              </div>

              <label className="announcement-field">
                <span>Announcement title <span className="announcement-required">*</span></span>
                <input
                  required
                  minLength={3}
                  maxLength={150}
                  value={announcementTitle}
                  onChange={e => setAnnouncementTitle(e.target.value)}
                  placeholder="e.g. Holiday notice for students"
                />
                <small>{announcementTitle.length}/150 characters</small>
              </label>

              <label className="announcement-field">
                <span>Message <span className="announcement-required">*</span></span>
                <textarea
                  required
                  maxLength={5000}
                  rows={6}
                  value={announcementMessage}
                  onChange={e => setAnnouncementMessage(e.target.value)}
                  placeholder="Tell students what they need to know..."
                />
                <small>{announcementMessage.length}/5000 characters</small>
              </label>

              <label className="announcement-field">
                <span>Display date <span className="announcement-required">*</span></span>
                <input type="date" required value={announcementDate} onChange={e => setAnnouncementDate(e.target.value)} />
                <small>This date will appear on the public school website.</small>
              </label>

              <div className="announcement-compose-footer">
                <span className="announcement-private-note"><span aria-hidden="true">??</span> Visible in the student portal</span>
                <button className="announcement-publish-btn" type="submit" disabled={announcementSaving}>
                  <span aria-hidden="true">?</span> {announcementSaving ? 'Publishing...' : 'Publish announcement'}
                </button>
              </div>
            </form>

            <div className="announcement-list-panel">
              <div className="announcement-list-heading">
                <div>
                  <span className="announcements-kicker">YOUR UPDATES</span>
                  <h3>Published announcements</h3>
                </div>
                <span className="announcement-count">{adminAnnouncements.length}</span>
              </div>

              {announcementLoading && <div className="announcement-state"><span className="announcement-spinner" /> Loading announcements...</div>}

              {!announcementLoading && adminAnnouncements.length === 0 && (
                <div className="announcement-empty">
                  <div className="announcement-empty-icon" aria-hidden="true">??</div>
                  <h4>No announcements yet</h4>
                  <p>Your published notices will appear here. Create your first announcement using the form.</p>
                </div>
              )}

              <div className="announcement-items">
                {adminAnnouncements.map(item => (
                  <article className="announcement-item" key={item.id}>
                    <div className="announcement-item-accent" />
                    <div className="announcement-item-content">
                      <div className="announcement-item-top">
                        <span className="announcement-published-tag"><span /> Published</span>
                        <button className="announcement-delete-btn" type="button" onClick={() => startEditingAnnouncement(item)} aria-label={`Edit ${item.title}`}>Edit</button>
                        <button className="announcement-delete-btn" type="button" onClick={() => void removeAnnouncement(item.id)} aria-label={`Delete ${item.title}`}>
                          <span aria-hidden="true">?</span> Delete
                        </button>
                      </div>
                      <h4>{item.title}</h4>
                      <p className="announcement-item-message">{item.message}</p>
                      {editingAnnouncementId === item.id && (
                        <form className="announcement-compose" onSubmit={updateAnnouncement}>
                          <label className="announcement-field">Title
                            <input required minLength={3} maxLength={150} value={editAnnouncementTitle} onChange={e => setEditAnnouncementTitle(e.target.value)} />
                          </label>
                          <label className="announcement-field">Message
                            <textarea required maxLength={5000} rows={4} value={editAnnouncementMessage} onChange={e => setEditAnnouncementMessage(e.target.value)} />
                          </label>
                          <label className="announcement-field">Display date
                            <input type="date" required value={editAnnouncementDate} onChange={e => setEditAnnouncementDate(e.target.value)} />
                          </label>
                          <button className="announcement-publish-btn" type="submit" disabled={announcementSaving}>{announcementSaving ? 'Saving...' : 'Save changes'}</button>
                          <button className="announcement-delete-btn" type="button" onClick={() => setEditingAnnouncementId(null)}>Cancel</button>
                        </form>
                      )}
                      <div className="announcement-item-date">
                        <span>Display date: </span>{item.display_date || (item.created_at ? item.created_at.slice(0, 10) : 'Date unavailable')}
                      </div>
                      <div className="announcement-item-date">
                        <span>Created: </span>{item.created_at ? new Date(item.created_at).toLocaleString() : 'Date unavailable'}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        {error && <p className="erp-alert erp-alert-error" role="alert">{error}</p>}
        {message && <p className="erp-alert erp-alert-success" role="status">{message}</p>}

        <section className="erp-card erp-attendance-card">
          <div className="erp-section-heading">
            <div>
              <p className="erp-eyebrow">ATTENDANCE OVERVIEW</p>
              <h2>Daily Attendance</h2>
              <p className="erp-help">Select a date, class, and section to view the daily summary.</p>
            </div>
            <span className="erp-report-tag">Daily report</span>
          </div>

          <div className="erp-report-filters">
            <label>
              Attendance date
              <input type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
            </label>
            <label>
              Class
              <select value={dailyClass} onChange={(e) => setDailyClass(e.target.value)}>
                {CLASSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Section
              <select value={dailySection} onChange={(e) => setDailySection(e.target.value)}>
                {SECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          {dailyError && <p className="erp-alert erp-alert-error" role="alert">{dailyError}</p>}
          {dailyLoading ? <p className="erp-empty">Loading daily attendance...</p> : (
            <>
              <div className="erp-attendance-stats">
                <div className="erp-attendance-stat">
                  <span>Students in class</span>
                  <strong>{selectedDailyStudents.length}</strong>
                </div>
                <div className="erp-attendance-stat is-present">
                  <span>Present</span><strong>{dailySummary.present}</strong>
                </div>
                <div className="erp-attendance-stat is-absent">
                  <span>Absent</span><strong>{dailySummary.absent}</strong>
                </div>
                <div className="erp-attendance-stat is-late">
                  <span>Late</span><strong>{dailySummary.late}</strong>
                </div>
                <div className="erp-attendance-stat is-pending">
                  <span>Pending</span><strong>{dailySummary.pending}</strong>
                </div>
              </div>
              <p className="erp-report-note">
                Recorded attendance: {dailySummary.recorded} of {selectedDailyStudents.length} students.
                Attendance percentage among recorded students: {dailySummary.percentage.toFixed(2)}%.
                Pending students are not counted as absent.
              </p>

              <div className="erp-table-wrap">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Registration no.</th>
                      <th>Student name</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDailyStudents.length === 0 ? (
                      <tr><td colSpan={3}>No students found for this class and section.</td></tr>
                    ) : selectedDailyStudents
                      .slice()
                      .sort((a, b) => a.full_name.localeCompare(b.full_name))
                      .map((student) => {
                        const status = dailySummary.statuses.get(student.id)
                        return (
                          <tr key={student.id}>
                            <td>{student.registration_number}</td>
                            <td>{student.full_name}</td>
                            <td>
                              <span className={`erp-status ${status ? `status-${status.toLowerCase()}` : 'status-pending'}`}>
                                {status || 'Pending'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="erp-card erp-attendance-card">
          <div className="erp-section-heading">
            <div>
              <p className="erp-eyebrow">MONTHLY SUMMARY</p>
              <h2>Monthly Attendance</h2>
              <p className="erp-help">Selected month aur class ke student-wise attendance records.</p>
            </div>
            <span className="erp-report-tag">Monthly report</span>
          </div>

          <div className="erp-report-filters">
            <label>
              Month
              <select value={monthlyMonth} onChange={(e) => setMonthlyMonth(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => {
                  const value = String(i + 1)
                  return <option key={value} value={value}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>
                })}
              </select>
            </label>
            <label>
              Year
              <select value={monthlyYear} onChange={(e) => setMonthlyYear(e.target.value)}>
                {Array.from({ length: 7 }, (_, i) => String(now.getFullYear() - 3 + i)).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label>
              Class
              <select value={monthlyClass} onChange={(e) => setMonthlyClass(e.target.value)}>
                {CLASSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Section
              <select value={monthlySection} onChange={(e) => setMonthlySection(e.target.value)}>
                {SECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          {monthlyError && <p className="erp-alert erp-alert-error" role="alert">{monthlyError}</p>}
          {monthlyLoading ? <p className="erp-empty">Loading monthly attendance...</p> : (
            <>
              <div className="erp-attendance-stats erp-monthly-stats">
                <div className="erp-attendance-stat is-present">
                  <span>Present days</span><strong>{monthlySummary.present}</strong>
                </div>
                <div className="erp-attendance-stat is-late">
                  <span>Late days</span><strong>{monthlySummary.late}</strong>
                </div>
                <div className="erp-attendance-stat is-absent">
                  <span>Absent days</span><strong>{monthlySummary.absent}</strong>
                </div>
                <div className="erp-attendance-stat">
                  <span>Recorded days</span><strong>{monthlySummary.recorded}</strong>
                </div>
                <div className="erp-attendance-stat is-percentage">
                  <span>Overall attendance</span><strong>{monthlySummary.percentage.toFixed(2)}%</strong>
                </div>
              </div>
              <p className="erp-report-note">
                Overall percentage = (Present days + Late days) ÷ Total recorded days × 100.
                Students without records have 0 recorded days and are not treated as absent.
              </p>

              <div className="erp-table-wrap">
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Registration no.</th>
                      <th>Student name</th>
                      <th>Present</th>
                      <th>Late</th>
                      <th>Absent</th>
                      <th>Recorded days</th>
                      <th>Attendance %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRecords.length === 0 ? (
                      <tr><td colSpan={7}>No students found for this class and section.</td></tr>
                    ) : monthlyRecords.map((record) => (
                      <tr key={record.student_id}>
                        <td>{record.registration_number}</td>
                        <td>{record.full_name}</td>
                        <td>{record.present_days}</td>
                        <td>{record.late_days}</td>
                        <td>{record.absent_days}</td>
                        <td>{record.total_recorded_days}</td>
                        <td>
                          <span className="erp-percentage">
                            {Number(record.attendance_percentage).toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <section className="erp-card admin-management-card">
          <div className="erp-section-heading">
            <div>
              <p className="erp-eyebrow">STAFF MANAGEMENT</p>
              <h2>Teacher & Class Assignments</h2>
              <p className="erp-help">Teachers create karein aur unki class/section assignment manage karein.</p>
            </div>
            <button className="erp-refresh" type="button" onClick={() => { void loadTeacherManagement() }}>
              Refresh teachers
            </button>
          </div>

          {teacherError && <p className="erp-alert erp-alert-error" role="alert">{teacherError}</p>}
          {teacherMessage && <p className="erp-alert erp-alert-success" role="status">{teacherMessage}</p>}

          <div className="admin-management-grid">
            <form className="admin-management-panel" onSubmit={createTeacher}>
              <h3>Add teacher</h3>
              <label>Full name
                <input required maxLength={100} value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
              </label>
              <label>Username
                <input required maxLength={50} value={teacherUsername} onChange={(e) => setTeacherUsername(e.target.value)} />
              </label>
              <label>Initial password (minimum 8 characters)
                <div className="admin-password-field">
                  <input required minLength={8} maxLength={128} type={showTeacherPassword ? 'text' : 'password'} value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} autoComplete="new-password" />
                  <button className="admin-password-toggle" type="button" onClick={() => setShowTeacherPassword((current) => !current)} aria-label={showTeacherPassword ? 'Hide password' : 'Show password'}>
                    {showTeacherPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <button className="erp-primary" type="submit" disabled={teacherBusy}>
                {teacherBusy ? 'Please wait...' : 'Create teacher'}
              </button>
            </form>

            <form className="admin-management-panel" onSubmit={saveAssignment}>
              <h3>{editingAssignmentId === null ? 'Assign class' : 'Edit / reassign class'}</h3>
              <label>Teacher
                <select required value={selectedTeacher} onChange={(e) => setSelectedTeacher(e.target.value)}>
                  <option value="">Select teacher</option>
                  {teachers.filter((t) => t.is_active).map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name} ({t.username})</option>
                  ))}
                </select>
              </label>
              <label>Class
                <select value={assignmentClass} onChange={(e) => setAssignmentClass(e.target.value)}>
                  {CLASSES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Section
                <select value={assignmentSection} onChange={(e) => setAssignmentSection(e.target.value)}>
                  {SECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <div className="admin-management-actions">
                <button className="erp-primary" type="submit" disabled={teacherBusy || teachers.length === 0}>
                  {teacherBusy ? 'Saving...' : editingAssignmentId === null ? 'Assign class' : 'Save reassignment'}
                </button>
                {editingAssignmentId !== null && (
                  <button className="erp-refresh" type="button" onClick={() => {
                    setEditingAssignmentId(null)
                    setSelectedTeacher('')
                    setAssignmentClass('1')
                    setAssignmentSection('A')
                  }}>Cancel edit</button>
                )}
              </div>
            </form>
          </div>

          <h3 className="admin-list-title">Teachers</h3>
          {teachers.length === 0 ? <p className="erp-empty">No teachers found yet.</p> : (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead><tr><th>Name</th><th>Username</th><th>Assigned class</th><th>Section</th></tr></thead>
                <tbody>{teachers.map((t) => (
                  <tr key={t.id}>
                    <td>{t.full_name}</td><td>{t.username}</td>
                    <td>{t.class_name ?? 'Not assigned'}</td><td>{t.section ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <h3 className="admin-list-title">Current assignments</h3>
          {assignments.length === 0 ? <p className="erp-empty">No class assignments found yet.</p> : (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead><tr><th>Teacher</th><th>Class</th><th>Section</th><th>Action</th></tr></thead>
                <tbody>{assignments.map((item) => (
                  <tr key={item.id}>
                    <td>{item.teacher_name} ({item.username})</td>
                    <td>{item.class_name}</td><td>{item.section}</td>
                    <td><button className="erp-edit" type="button" onClick={() => editAssignment(item)}>Edit / reassign</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
        <section className="erp-card">
          <h2>{editingStudent ? 'Edit student' : 'Add a student'}</h2>
          <p className="erp-help">
            {editingStudent
              ? 'Update student details. The existing password will remain unchanged.'
              : 'Date of birth se initial password DDMMYYYY format mein set hoga.'}
          </p>

          <form className="erp-form" onSubmit={saveStudent}>
            <label>
              Registration number
              <input
                required maxLength={30}
                value={form.registration_number}
                onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
                placeholder="e.g. STU-001"
              />
            </label>
            <label>
              Full name
              <input
                required maxLength={100}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Student full name"
              />
            </label>
            <label>
              Date of birth
              <input
                required type="date" max={localDateString()}
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              />
            </label>
            <label>
              Class
              <select value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })}>
                {CLASSES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Section
              <select value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
                {SECTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Guardian name
              <input
                required maxLength={100}
                value={form.guardian_name}
                onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                placeholder="Parent or guardian name"
              />
            </label>
            <button className="erp-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : editingStudent ? 'Save changes' : 'Add student'}
            </button>
            {editingStudent && (
              <button className="erp-secondary" type="button" onClick={cancelEditing} disabled={saving}>
                Cancel
              </button>
            )}
          </form>
        </section>

        <section className="erp-card">
          <div className="erp-list-heading">
            <div>
              <h2>Student records</h2>
              <p className="erp-help">Records are loaded from the existing backend database.</p>
            </div>
            <select
              className="erp-search"
              aria-label="Filter students by class"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="All">All Classes</option>
              {availableClasses.map((className) => (
                <option key={className} value={className}>{className}</option>
              ))}
            </select>
            <input
              className="erp-search"
              aria-label="Search students"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <p className="erp-empty">Loading students...</p>
          ) : filteredStudents.length === 0 ? (
            <p className="erp-empty">
              {students.length === 0 ? 'No student records found.' : 'No matching students.'}
            </p>
          ) : (
            <div className="erp-table-wrap">
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>Registration no.</th>
                    <th>Student name</th>
                    <th>Class</th>
                    <th>Section</th>
                    <th>Date of birth</th>
                    <th>Guardian</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td>{student.registration_number}</td>
                      <td>{student.full_name}</td>
                      <td>{student.class_name}</td>
                      <td>{student.section}</td>
                      <td>{student.date_of_birth}</td>
                      <td>{student.guardian_name}</td>
                      <td>
                        <button className="erp-edit" type="button" onClick={() => startEditing(student)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
