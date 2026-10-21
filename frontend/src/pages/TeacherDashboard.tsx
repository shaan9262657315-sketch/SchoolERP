import { API_URL } from '../services/api';
﻿import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './TeacherDashboard.css'
import ResultsManagement from './ResultsManagement'


type Student = {
  id: number
  registration_number: string
  full_name: string
  class_name: string
  section: string
  date_of_birth?: string
  guardian_name?: string
}

type Teacher = {
  id: number
  username: string
  full_name: string
  class_name: string | null
  section: string | null
}

type AttendanceStatus = 'Present' | 'Absent' | 'Late'
type DailyRecord = {
  student_id: number
  registration_number: string
  full_name: string
  attendance_date: string
  status: AttendanceStatus
}
type MonthlyRecord = {
  student_id: number
  registration_number: string
  full_name: string
  present_days: number
  late_days: number
  absent_days: number
  total_recorded_days: number
  attendance_percentage: number
}

type Homework = {
  id: number
  title: string
  subject: string
  description: string
  class_name: string
  section: string
  assigned_date: string
  due_date: string
  created_at: string
  updated_at: string
}

type HomeworkForm = {
  title: string
  subject: string
  description: string
  assigned_date: string
  due_date: string
}

function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
function monthParts() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const token = sessionStorage.getItem('school_erp_token')
  const [teacher, setTeacher] = useState<Teacher | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [statuses, setStatuses] = useState<Record<number, AttendanceStatus>>({})
  const [tab, setTab] = useState<'students' | 'mark' | 'daily' | 'monthly' | 'homework' | 'results'>('students')
  const [attendanceDate, setAttendanceDate] = useState(localDate())
  const [dailyDate, setDailyDate] = useState(localDate())
  const [month, setMonth] = useState(monthParts())
  const [daily, setDaily] = useState<DailyRecord[]>([])
  const [monthly, setMonthly] = useState<MonthlyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [homework, setHomework] = useState<Homework[]>([])
  const [homeworkLoading, setHomeworkLoading] = useState(false)
  const [homeworkSaving, setHomeworkSaving] = useState(false)
  const [editingHomeworkId, setEditingHomeworkId] = useState<number | null>(null)
  const [homeworkForm, setHomeworkForm] = useState<HomeworkForm>({
    title: '',
    subject: '',
    description: '',
    assigned_date: localDate(),
    due_date: localDate(),
  })

  const logout = useCallback(() => {
    sessionStorage.removeItem('school_erp_token')
    sessionStorage.removeItem('school_erp_role')
    sessionStorage.removeItem('school_erp_teacher')
    navigate('/login', { replace: true })
  }, [navigate])

  const api = useCallback(async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401 || response.status === 403) {
      throw new Error(response.status === 401 ? 'Session expire ho gaya. Dobara login karein.' : (data.detail || 'Access denied.'))
    }
    if (!response.ok) throw new Error(data.detail || 'Request complete nahi ho saki.')
    return data
  }, [token])

  useEffect(() => {
    if (!token || sessionStorage.getItem('school_erp_role') !== 'teacher') {
      navigate('/login', { replace: true })
      return
    }
    let active = true
    async function load() {
      try {
        const [profile, list] = await Promise.all([
          api('/teacher/me'),
          api('/teacher/attendance/students'),
        ])
        if (!active) return
        setTeacher(profile)
        setStudents(list)
        setStatuses(Object.fromEntries(list.map((s: Student) => [s.id, 'Present'])))
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Dashboard load nahi hua.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [api, navigate, token])

  async function markAttendance() {
    setError('')
    setMessage('')
    if (attendanceDate > localDate()) {
      setError('Future date ki attendance mark nahi kar sakte.')
      return
    }
    if (!students.length) {
      setError('Assigned class mein koi student nahi mila.')
      return
    }
    setSaving(true)
    try {
      const result = await api('/teacher/attendance/mark', {
        method: 'POST',
        body: JSON.stringify({
          attendance_date: attendanceDate,
          records: students.map(student => ({
            student_id: student.id,
            status: statuses[student.id] || 'Present',
          })),
        }),
      })
      setMessage(`${result.message} Total records: ${result.records_saved}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Attendance save nahi hui.')
    } finally {
      setSaving(false)
    }
  }

  async function loadDaily() {
    setError('')
    setMessage('')
    try {
      const result = await api(`/teacher/attendance/daily?attendance_date=${dailyDate}`)
      setDaily(result)
      setMessage(`Daily report loaded: ${result.length} recorded students.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Daily report load nahi hui.')
    }
  }

  async function loadMonthly() {
    setError('')
    setMessage('')
    try {
      const result = await api(`/teacher/attendance/monthly?year=${month.year}&month=${month.month}`)
      setMonthly(result)
      setMessage('Monthly report loaded.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Monthly report load nahi hui.')
    }
  }

  if (loading) return <main className="td-page"><p>Loading teacher dashboard...</p></main>

  async function loadHomework() {
    setHomeworkLoading(true)
    setError('')
    try {
      const result = await api('/teacher/homework')
      setHomework(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Homework load nahi hua.')
    } finally {
      setHomeworkLoading(false)
    }
  }

  function resetHomeworkForm() {
    setEditingHomeworkId(null)
    setHomeworkForm({
      title: '',
      subject: '',
      description: '',
      assigned_date: localDate(),
      due_date: localDate(),
    })
  }

  async function saveHomework(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (homeworkForm.due_date < homeworkForm.assigned_date) {
      setError('Due date assigned date se pehle nahi ho sakti.')
      return
    }

    setHomeworkSaving(true)
    try {
      const isEditing = editingHomeworkId !== null
      await api(
        isEditing ? `/teacher/homework/${editingHomeworkId}` : '/teacher/homework',
        {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify(homeworkForm),
        }
      )
      setMessage(isEditing ? 'Homework successfully updated.' : 'Homework successfully created.')
      resetHomeworkForm()
      await loadHomework()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Homework save nahi hua.')
    } finally {
      setHomeworkSaving(false)
    }
  }

  function startHomeworkEdit(item: Homework) {
    setEditingHomeworkId(item.id)
    setHomeworkForm({
      title: item.title,
      subject: item.subject,
      description: item.description,
      assigned_date: item.assigned_date,
      due_date: item.due_date,
    })
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeHomework(item: Homework) {
    const confirmed = window.confirm(`Delete homework "${item.title}"?`)
    if (!confirmed) return

    setError('')
    setMessage('')
    try {
      await api(`/teacher/homework/${item.id}`, { method: 'DELETE' })
      setHomework(previous => previous.filter(row => row.id !== item.id))
      if (editingHomeworkId === item.id) resetHomeworkForm()
      setMessage('Homework deleted successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Homework delete nahi hua.')
    }
  }

  return (
    <main className="td-page">
      <header className="td-header">
        <div>
          <p className="td-eyebrow">SCHOOL ERP · TEACHER PORTAL</p>
          <h1>Welcome, {teacher?.full_name || 'Teacher'}</h1>
          <p className="td-subtitle">Assigned Class: <strong>{teacher?.class_name || 'Not assigned'}{teacher?.section ? ` - ${teacher.section}` : ''}</strong></p>
        </div>
        <button className="td-logout" onClick={logout}>Logout</button>
      </header>

      <nav className="td-tabs">
        <button className={tab === 'students' ? 'active' : ''} onClick={() => { setTab('students'); setError(''); setMessage('') }}>Students</button>
        <button className={tab === 'mark' ? 'active' : ''} onClick={() => { setTab('mark'); setError(''); setMessage('') }}>Mark Attendance</button>
        <button className={tab === 'daily' ? 'active' : ''} onClick={() => { setTab('daily'); setError(''); setMessage('') }}>Daily Report</button>
        <button className={tab === 'monthly' ? 'active' : ''} onClick={() => { setTab('monthly'); setError(''); setMessage('') }}>Monthly Report</button>
        <button className={tab === 'homework' ? 'active' : ''} onClick={() => { setTab('homework'); setError(''); setMessage(''); void loadHomework() }}>Homework</button>
        <button className={tab === 'results' ? 'active' : ''} onClick={() => { setTab('results'); setError(''); setMessage('');  }}>Results</button>
      </nav>

      {error && <div className="td-alert td-error" role="alert">{error}</div>}
      {message && <div className="td-alert td-success" role="status">{message}</div>}

      {tab === 'results' && <ResultsManagement />}
      {tab === 'students' && (
        <section className="td-card">
          <div className="td-section-heading">
            <div><h2>My Students</h2><p>Showing students assigned to your class only.</p></div>
          </div>
          <div className="td-table-wrap"><table className="td-table">
            <thead><tr><th>#</th><th>Student Name</th><th>Registration Number</th><th>Class</th><th>Section</th></tr></thead>
            <tbody>{students.map((student, index) => <tr key={student.id}>
              <td>{index + 1}</td><td>{student.full_name}</td><td>{student.registration_number}</td><td>{student.class_name}</td><td>{student.section}</td>
            </tr>)}
            {students.length === 0 && <tr><td colSpan={5} className="td-empty">No students found in your assigned class.</td></tr>}</tbody>
          </table></div>
        </section>
      )}

      {tab === 'mark' && (
        <section className="td-card">
          <div className="td-section-heading"><div><h2>Mark Attendance</h2><p>Set each student's status for the selected date.</p></div>
            <label className="td-date-label">Date<input type="date" value={attendanceDate} max={localDate()} onChange={e => setAttendanceDate(e.target.value)} /></label>
          </div>
          <div className="td-actions">
            <button className="td-light-btn" onClick={() => setStatuses(Object.fromEntries(students.map(s => [s.id, 'Present'])))}>All Present</button>
            <button className="td-light-btn" onClick={() => setStatuses(Object.fromEntries(students.map(s => [s.id, 'Absent'])))}>All Absent</button>
            <button className="td-light-btn" onClick={() => setStatuses(Object.fromEntries(students.map(s => [s.id, 'Late'])))}>All Late</button>
          </div>
          <div className="td-table-wrap"><table className="td-table">
            <thead><tr><th>#</th><th>Student</th><th>Registration No.</th><th>Status</th></tr></thead>
            <tbody>{students.map((student, index) => <tr key={student.id}>
              <td>{index + 1}</td><td>{student.full_name}</td><td>{student.registration_number}</td>
              <td><select value={statuses[student.id] || 'Present'} onChange={e => setStatuses(prev => ({ ...prev, [student.id]: e.target.value as AttendanceStatus }))}>
                <option value="Present">Present</option><option value="Absent">Absent</option><option value="Late">Late</option>
              </select></td>
            </tr>)}</tbody>
          </table></div>
          <button className="td-primary-btn" onClick={markAttendance} disabled={saving || students.length === 0}>{saving ? 'Saving...' : 'Save Attendance'}</button>
        </section>
      )}

      {tab === 'daily' && (
        <section className="td-card">
          <div className="td-section-heading"><div><h2>Daily Attendance Report</h2><p>Attendance records for the selected date.</p></div>
            <label className="td-date-label">Date<input type="date" value={dailyDate} max={localDate()} onChange={e => setDailyDate(e.target.value)} /></label>
          </div>
          <button className="td-primary-btn" onClick={loadDaily}>Load Daily Report</button>
          <div className="td-table-wrap"><table className="td-table">
            <thead><tr><th>#</th><th>Student</th><th>Registration No.</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>{daily.map((r, i) => <tr key={r.student_id}><td>{i + 1}</td><td>{r.full_name}</td><td>{r.registration_number}</td><td>{r.attendance_date}</td><td><span className={`td-status ${r.status.toLowerCase()}`}>{r.status}</span></td></tr>)}
            {daily.length === 0 && <tr><td colSpan={5} className="td-empty">No report loaded or no records for this date.</td></tr>}</tbody>
          </table></div>
        </section>
      )}

      {tab === 'homework' && (
        <section className="td-card">
          <div className="td-section-heading">
            <div>
              <h2>Homework Management</h2>
              <p>Create and manage homework for your assigned class.</p>
              {teacher?.class_name && (
                <p className="td-homework-class">Class {teacher.class_name}{teacher.section ? ` - Section ${teacher.section}` : ''}</p>
              )}
            </div>
          </div>

          <form className="td-homework-form" onSubmit={saveHomework}>
            <h3>{editingHomeworkId !== null ? 'Edit Homework' : 'Create Homework'}</h3>

            <div className="td-homework-grid">
              <label>
                Homework Title
                <input
                  required
                  maxLength={150}
                  value={homeworkForm.title}
                  onChange={e => setHomeworkForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Chapter 2 Exercises"
                />
              </label>
              <label>
                Subject
                <input
                  required
                  maxLength={80}
                  value={homeworkForm.subject}
                  onChange={e => setHomeworkForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g. Mathematics"
                />
              </label>
              <label>
                Assigned Date
                <input
                  type="date"
                  required
                  value={homeworkForm.assigned_date}
                  onChange={e => setHomeworkForm(prev => ({ ...prev, assigned_date: e.target.value }))}
                />
              </label>
              <label>
                Due Date
                <input
                  type="date"
                  required
                  min={homeworkForm.assigned_date}
                  value={homeworkForm.due_date}
                  onChange={e => setHomeworkForm(prev => ({ ...prev, due_date: e.target.value }))}
                />
              </label>
            </div>

            <label className="td-homework-description">
              Instructions / Description
              <textarea
                required
                maxLength={5000}
                rows={5}
                value={homeworkForm.description}
                onChange={e => setHomeworkForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Explain the homework and what students need to submit..."
              />
            </label>

            <div className="td-actions">
              <button className="td-primary-btn" type="submit" disabled={homeworkSaving}>
                {homeworkSaving ? 'Saving...' : editingHomeworkId !== null ? 'Update Homework' : 'Publish Homework'}
              </button>
              {editingHomeworkId !== null && (
                <button className="td-light-btn" type="button" onClick={resetHomeworkForm}>
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <div className="td-homework-list-heading">
            <h3>Published Homework</h3>
            <button className="td-light-btn" type="button" onClick={() => void loadHomework()} disabled={homeworkLoading}>
              {homeworkLoading ? 'Refreshing...' : 'Refresh List'}
            </button>
          </div>

          {homeworkLoading && <p className="td-homework-note">Loading homework...</p>}
          {!homeworkLoading && homework.length === 0 && (
            <p className="td-empty td-homework-note">No homework has been published for your assigned class yet.</p>
          )}

          <div className="td-homework-cards">
            {homework.map(item => (
              <article className="td-homework-item" key={item.id}>
                <div className="td-homework-item-top">
                  <span className="td-homework-subject">{item.subject}</span>
                  <span className="td-homework-due">Due: {item.due_date}</span>
                </div>
                <h4>{item.title}</h4>
                <p className="td-homework-description-text">{item.description}</p>
                <p className="td-homework-dates">Assigned: {item.assigned_date}</p>
                <div className="td-actions">
                  <button className="td-light-btn" type="button" onClick={() => startHomeworkEdit(item)}>Edit</button>
                  <button className="td-homework-delete" type="button" onClick={() => void removeHomework(item)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'monthly' && (
        <section className="td-card">
          <div className="td-section-heading"><div><h2>Monthly Attendance Report</h2><p>Summary for each assigned student.</p></div>
            <div className="td-month-controls">
              <label>Month<select value={month.month} onChange={e => setMonth(p => ({ ...p, month: Number(e.target.value) }))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>)}</select></label>
              <label>Year<input type="number" min="2000" max="2100" value={month.year} onChange={e => setMonth(p => ({ ...p, year: Number(e.target.value) }))} /></label>
            </div>
          </div>
          <button className="td-primary-btn" onClick={loadMonthly}>Load Monthly Report</button>
          <div className="td-table-wrap"><table className="td-table">
            <thead><tr><th>Student</th><th>Reg. No.</th><th>Present</th><th>Late</th><th>Absent</th><th>Recorded</th><th>Attendance %</th></tr></thead>
            <tbody>{monthly.map(r => <tr key={r.student_id}><td>{r.full_name}</td><td>{r.registration_number}</td><td>{r.present_days}</td><td>{r.late_days}</td><td>{r.absent_days}</td><td>{r.total_recorded_days}</td><td>{r.attendance_percentage}%</td></tr>)}
            {monthly.length === 0 && <tr><td colSpan={7} className="td-empty">Select a month and load the report.</td></tr>}</tbody>
          </table></div>
        </section>
      )}
      <footer className="td-footer">School ERP · Teacher access is restricted to your assigned class.</footer>
    </main>
  )
}
