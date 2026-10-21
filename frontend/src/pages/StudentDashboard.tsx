import { API_URL } from '../services/api';
﻿import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'


type Fee = {
  id: number
  academic_year: string
  fee_type: string
  period: string
  amount_due: number | string
  amount_paid: number | string
  pending_amount: number | string
  due_date: string | null
}

type Announcement = {
  id: number
  title: string
  message: string
  created_at: string
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

type StudentResultSubject = {
  subject_id: number
  subject_name: string
  obtained_marks: number | null
  max_marks: number
}

type StudentResult = {
  exam_id: number
  exam_name: string
  academic_year: string
  exam_date: string
  published_at: string | null
  subjects: StudentResultSubject[]
  total_obtained: number
  total_maximum: number
  percentage: number
  class_rank: number | null
  school_rank: number | null
  school_rank_status: string
}
export default function StudentDashboard() {
  const navigate = useNavigate()
  const [fees, setFees] = useState<Fee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [section, setSection] = useState('Overview')
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(false)
  const [announcementsError, setAnnouncementsError] = useState('')
  const [homework, setHomework] = useState<Homework[]>([])
  const [homeworkLoading, setHomeworkLoading] = useState(false)
  const [homeworkError, setHomeworkError] = useState('')
  const [results, setResults] = useState<StudentResult[]>([])
  const [resultsLoading, setResultsLoading] = useState(false)
  const [resultsError, setResultsError] = useState('')

  const token = sessionStorage.getItem('school_erp_token')
  const role = sessionStorage.getItem('school_erp_role')
  const student = JSON.parse(sessionStorage.getItem('school_erp_student') || '{}')

  useEffect(() => {
    if (!token || role !== 'student') {
      navigate('/login', { replace: true })
      return
    }

    fetch(`${API_URL}/student/my-fees`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.detail || 'Fees load nahi ho sakin.')
        return data
      })
      .then(data => setFees(Array.isArray(data.fees) ? data.fees : []))
      .catch(err => setError(err instanceof Error ? err.message : 'Kuch galat hua.'))
      .finally(() => setLoading(false))
  }, [navigate, token, role])

  useEffect(() => {
    if (section !== 'Announcements' || !token || role !== 'student') return

    let cancelled = false
    setAnnouncementsLoading(true)
    setAnnouncementsError('')

    fetch(`${API_URL}/announcements/student`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.detail || 'Announcements load nahi ho sakin.')
        return data
      })
      .then(data => {
        if (!cancelled) setAnnouncements(Array.isArray(data) ? data : [])
      })
      .catch(err => {
        if (!cancelled) setAnnouncementsError(err instanceof Error ? err.message : 'Kuch galat hua.')
      })
      .finally(() => {
        if (!cancelled) setAnnouncementsLoading(false)
      })

    return () => { cancelled = true }
  }, [section, token, role])

  useEffect(() => {
    if (section !== 'Homework' || !token || role !== 'student') return

    let cancelled = false
    setHomeworkLoading(true)
    setHomeworkError('')

    fetch(`${API_URL}/student/homework`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.detail || 'Homework load nahi ho saka.')
        }
        return data
      })
      .then(data => {
        if (!cancelled) {
          setHomework(Array.isArray(data) ? data : [])
        }
      })
      .catch(err => {
        if (!cancelled) {
          setHomeworkError(err instanceof Error ? err.message : 'Homework load nahi ho saka.')
        }
      })
      .finally(() => {
        if (!cancelled) setHomeworkLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [section, token, role])

  function logout() {
    sessionStorage.removeItem('school_erp_token')
    sessionStorage.removeItem('school_erp_role')
    sessionStorage.removeItem('school_erp_student')
    navigate('/login', { replace: true })
  }

  useEffect(() => {
    if (section !== 'Results' || !token || role !== 'student') return

    let cancelled = false
    setResultsLoading(true)
    setResultsError('')

    fetch(`${API_URL}/student/results`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async response => {
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.detail || 'Results load nahi ho sake.')
        }
        return data
      })
      .then(data => {
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : [])
        }
      })
      .catch(err => {
        if (!cancelled) {
          setResultsError(err instanceof Error ? err.message : 'Results load nahi ho sake.')
        }
      })
      .finally(() => {
        if (!cancelled) setResultsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [section, token, role])
  const totalDue = fees.reduce((sum, fee) => sum + Number(fee.amount_due || 0), 0)
  const totalPaid = fees.reduce((sum, fee) => sum + Number(fee.amount_paid || 0), 0)
  const pending = fees.reduce((sum, fee) => sum + Number(fee.pending_amount || 0), 0)
  const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#f4f7fb', color: '#172033', fontFamily: 'Arial, sans-serif' }}>
      <aside style={{ width: 235, background: '#14284b', color: 'white', padding: 22, boxSizing: 'border-box' }}>
        <h2 style={{ marginTop: 4 }}>School ERP</h2>
        <p style={{ color: '#b9c8e4', fontSize: 13 }}>STUDENT PORTAL</p>
        <div style={{ margin: '28px 0', padding: 12, background: '#20385f', borderRadius: 10 }}>
          <strong>{student.full_name || 'Student'}</strong>
          <p style={{ marginBottom: 0, fontSize: 13, color: '#d1def4' }}>Class {student.class_name || '—'}</p>
          <p style={{ marginBottom: 0, fontSize: 12, color: '#d1def4' }}>{student.registration_number || ''}</p>
        </div>
        {['Overview', 'My Fees', 'Results', 'Homework', 'Announcements'].map(item => (
          <button key={item} onClick={() => setSection(item)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 7, border: 0, borderRadius: 8, cursor: 'pointer', background: section === item ? '#315a99' : 'transparent', color: 'white' }}>
            {item === 'Overview' ? '▦' : item === 'My Fees' ? '₹' : item === 'Results' ? '▤' : item === 'Homework' ? '✓' : '◉'} &nbsp; {item}
          </button>
        ))}
        <button onClick={logout} style={{ marginTop: 30, width: '100%', padding: 12, border: '1px solid #8194b5', borderRadius: 8, background: 'transparent', color: 'white', cursor: 'pointer' }}>Log out</button>
      </aside>

      <main style={{ flex: 1, padding: '32px clamp(16px, 4vw, 44px)', minWidth: 0 }}>
        <p style={{ color: '#64748b', margin: 0 }}>STUDENT WORKSPACE</p>
        <h1 style={{ marginTop: 8 }}>{section === 'Overview' ? `Welcome, ${student.full_name || 'Student'}!` : section}</h1>
        <p style={{ color: '#64748b' }}>Your school information, all in one place.</p>

        {section === 'Overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, margin: '26px 0' }}>
              {[
                { title: 'Total Fees', value: money(totalDue), color: '#315a99' },
                { title: 'Paid Amount', value: money(totalPaid), color: '#15803d' },
                { title: 'Pending Amount', value: money(pending), color: '#b45309' },
              ].map(card => (
                <div key={card.title} style={{ background: 'white', borderRadius: 14, padding: 22, boxShadow: '0 3px 14px #1720330a', borderTop: `4px solid ${card.color}` }}>
                  <p style={{ color: '#64748b', marginTop: 0 }}>{card.title}</p>
                  <h2 style={{ marginBottom: 0 }}>{loading ? 'Loading…' : card.value}</h2>
                </div>
              ))}
            </div>
            <div style={{ background: 'white', padding: 22, borderRadius: 14 }}>
              <h3>Quick access</h3>
              <p>View your assigned fees, academic results, homework and school announcements here.</p>
              <button onClick={() => setSection('My Fees')} style={{ padding: '10px 16px', border: 0, borderRadius: 8, background: '#2457a7', color: 'white', cursor: 'pointer' }}>View My Fees</button>
            </div>
          </>
        )}

        {section === 'My Fees' && (
          <div style={{ background: 'white', borderRadius: 14, padding: 22, overflowX: 'auto' }}>
            <h3>Fee details</h3>
            {loading && <p>Loading your fees…</p>}
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
            {!loading && !error && fees.length === 0 && <p>No fee ledger entries found for your account.</p>}
            {!loading && !error && fees.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
                <thead><tr>{['Academic Year', 'Fee Type', 'Period', 'Amount Due', 'Paid', 'Pending', 'Due Date'].map(label => <th key={label} style={{ padding: 12, textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>{label}</th>)}</tr></thead>
                <tbody>{fees.map(fee => <tr key={fee.id}>
                  <td style={{ padding: 12, borderBottom: '1px solid #edf0f5' }}>{fee.academic_year}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #edf0f5' }}>{fee.fee_type}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #edf0f5' }}>{fee.period}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #edf0f5' }}>{money(Number(fee.amount_due))}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #edf0f5' }}>{money(Number(fee.amount_paid))}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #edf0f5', color: Number(fee.pending_amount) > 0 ? '#b45309' : '#15803d' }}>{money(Number(fee.pending_amount))}</td>
                  <td style={{ padding: 12, borderBottom: '1px solid #edf0f5' }}>{fee.due_date || '—'}</td>
                </tr>)}</tbody>
              </table>
            )}
          </div>
        )}

        {section === 'Results' && (
          <div style={{ background: 'white', borderRadius: 14, padding: 24, boxShadow: '0 3px 14px #1720330a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>My Academic Results</h2>
                <p style={{ color: '#64748b', marginTop: 0 }}>
                  Class {student.class_name || '?'}{student.section ? ` - Section ${student.section}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSection('Overview')}
                style={{ padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: 8, background: 'white', cursor: 'pointer' }}
              >
                Back to Overview
              </button>
            </div>

            {resultsLoading && <p style={{ padding: 20, color: '#64748b' }}>Loading your results...</p>}

            {resultsError && (
              <div role="alert" style={{ padding: 14, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', margin: '16px 0' }}>
                {resultsError}
                <button type="button" onClick={() => setSection('Overview')} style={{ display: 'block', marginTop: 8 }}>
                  Close
                </button>
              </div>
            )}

            {!resultsLoading && !resultsError && results.length === 0 && (
              <div style={{ textAlign: 'center', padding: '38px 12px', background: '#f8fafc', borderRadius: 12, marginTop: 18 }}>
                <div style={{ fontSize: 34 }}>▤</div>
                <h3>No published results yet</h3>
                <p style={{ color: '#64748b', marginBottom: 0 }}>
                  Your teacher's published and complete results will appear here.
                </p>
              </div>
            )}

            {!resultsLoading && !resultsError && results.length > 0 && (
              <div style={{ display: 'grid', gap: 20, marginTop: 20 }}>
                {results.map((result, index) => (
                  <article key={`${result.exam_id}-${result.published_at ?? index}`} className="student-result-card" style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 18px 0' }}>
                      <button
                        type="button"
                        onClick={(event) => { const card = event.currentTarget.closest(".student-result-card"); if (!card) return; document.body.classList.add("printing-report-card"); card.classList.add("printing-this-report-card"); window.print(); window.setTimeout(() => { document.body.classList.remove("printing-report-card"); card.classList.remove("printing-this-report-card"); }, 500); }}
                        style={{ padding: '10px 15px', border: 'none', borderRadius: 8, background: '#1d4ed8', color: 'white', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Print / Save Report Card
                      </button>
                    </div>
                    <div className="report-card-heading" style={{ display: 'none', textAlign: 'center', padding: '20px 18px 10px' }}>
                      <h1 style={{ margin: 0, fontSize: 24 }}>STUDENT REPORT CARD</h1>
                      <p style={{ margin: '6px 0', fontSize: 14 }}>Academic Year: {result.academic_year}</p>
                      <div style={{ borderBottom: '2px solid #111827', marginTop: 12 }} />
                    </div>
                    <div className="report-student-details" style={{ display: 'none', padding: '12px 18px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr><td style={{ padding: 6 }}><strong>Student Name:</strong> {student.full_name || '—'}</td><td style={{ padding: 6 }}><strong>Registration No.:</strong> {student.registration_number || '—'}</td></tr>
                          <tr><td style={{ padding: 6 }}><strong>Class:</strong> {student.class_name || '—'} - {student.section || '—'}</td><td style={{ padding: 6 }}><strong>Examination:</strong> {result.exam_name}</td></tr>
                          <tr><td style={{ padding: 6 }}><strong>Exam Date:</strong> {String(result.exam_date).slice(0, 10)}</td><td style={{ padding: 6 }}><strong>Result Published:</strong> {result.published_at ? String(result.published_at).slice(0, 10) : '—'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: 18, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <h3 style={{ margin: '0 0 6px' }}>{result.exam_name}</h3>
                      <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                        Academic year: {result.academic_year} · Exam date: {String(result.exam_date).slice(0, 10)}
                      </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: 12, padding: 18 }}>
                      {[
                        { label: 'Total Marks', value: `${result.total_obtained} / ${result.total_maximum}` },
                        { label: 'Percentage', value: `${Number(result.percentage).toFixed(2)}%` },
                        { label: 'Class Rank', value: result.class_rank == null ? '—' : `#${result.class_rank}` },
                        { label: 'School Rank', value: result.school_rank != null ? `#${result.school_rank}${result.school_rank_status === 'final' ? '' : ' (Provisional)'}` : '—' },
                      ].map(card => (
                        <div key={card.label} style={{ padding: 14, borderRadius: 9, background: '#f1f5f9' }}>
                          <p style={{ margin: '0 0 6px', fontSize: 12, color: '#64748b' }}>{card.label}</p>
                          <strong style={{ fontSize: 19 }}>{card.value}</strong>
                          {card.label === 'School Rank' && result.school_rank_status !== 'final' && (
                            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#92400e' }}>
                              Final rank is not available yet.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: '0 18px 18px', overflowX: 'auto' }}>
                      <h4>Subject-wise Marks</h4>
                      <table className="report-marks-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
                        <thead>
                          <tr>
                            {['Subject', 'Obtained', 'Maximum', 'Percentage'].map(label => (
                              <th key={label} style={{ textAlign: 'left', padding: 11, borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12 }}>{label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.subjects.map(subject => (
                            <tr key={subject.subject_id}>
                              <td style={{ padding: 11, borderBottom: '1px solid #edf0f5' }}>{subject.subject_name}</td>
                              <td style={{ padding: 11, borderBottom: '1px solid #edf0f5' }}>{subject.obtained_marks ?? '—'}</td>
                              <td style={{ padding: 11, borderBottom: '1px solid #edf0f5' }}>{subject.max_marks}</td>
                              <td style={{ padding: 11, borderBottom: '1px solid #edf0f5' }}>
                                {subject.obtained_marks == null ? '—' : `${(subject.obtained_marks * 100 / subject.max_marks).toFixed(2)}%`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="report-summary" style={{ display: 'none', padding: '8px 18px 18px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr><td style={{ padding: 8, border: '1px solid #cbd5e1' }}><strong>Total Marks</strong></td><td style={{ padding: 8, border: '1px solid #cbd5e1' }}>{result.total_obtained} / {result.total_maximum}</td></tr>
                          <tr><td style={{ padding: 8, border: '1px solid #cbd5e1' }}><strong>Percentage</strong></td><td style={{ padding: 8, border: '1px solid #cbd5e1' }}>{Number(result.percentage).toFixed(2)}%</td></tr>
                          <tr><td style={{ padding: 8, border: '1px solid #cbd5e1' }}><strong>Class Rank</strong></td><td style={{ padding: 8, border: '1px solid #cbd5e1' }}>{result.class_rank == null ? 'Not available' : `#${result.class_rank}`}</td></tr>
                          <tr><td style={{ padding: 8, border: '1px solid #cbd5e1' }}><strong>School Rank</strong></td><td style={{ padding: 8, border: '1px solid #cbd5e1' }}>{result.school_rank == null ? 'Not available' : `#${result.school_rank}${result.school_rank_status === 'final' ? '' : ' (Provisional)'}`}</td></tr>
                        </tbody>
                      </table>
                      {result.school_rank_status !== 'final' && <p style={{ fontSize: 12 }}>School rank is provisional and may change when all assigned classes publish their results.</p>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, gap: 24 }}>
                        <span>Class Teacher Signature: __________________</span>
                        <span>Principal Signature: __________________</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          body { background: white !important; }
          body * { visibility: hidden !important; }
          body.printing-report-card .student-result-card:not(.printing-this-report-card) { display: none !important; }
          .student-result-card, .student-result-card * { visibility: visible !important; }
          .student-result-card {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            border: none !important;
            border-radius: 0 !important;
            overflow: visible !important;
            color: #111827 !important;
            font-size: 11px !important;
          }
          .no-print { display: none !important; }
          .report-card-heading, .report-student-details, .report-summary { display: block !important; }
          .student-result-card > div { break-inside: avoid; }
          .student-result-card table { min-width: 0 !important; font-size: 11px !important; }
          .student-result-card th, .student-result-card td { padding: 7px !important; color: #111827 !important; }
          .student-result-card h3 { font-size: 16px !important; }
          .student-result-card article { box-shadow: none !important; }
        }
      `}</style>
        {section === 'Homework' && (
          <div style={{ background: 'white', borderRadius: 14, padding: 24, boxShadow: '0 3px 14px #1720330a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ marginTop: 0, marginBottom: 6 }}>My Homework</h2>
                <p style={{ color: '#64748b', marginTop: 0 }}>
                  Class {student.class_name || '?'}{student.section ? ` ? Section ${student.section}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSection('Overview')}
                style={{ padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: 8, background: 'white', cursor: 'pointer' }}
              >
                Back to Overview
              </button>
            </div>

            {homeworkLoading && (
              <p style={{ color: '#64748b', padding: '18px 0' }}>Loading your homework...</p>
            )}

            {homeworkError && (
              <div role="alert" style={{ margin: '16px 0', padding: 14, borderRadius: 8, background: '#fef2f2', color: '#b91c1c' }}>
                {homeworkError}
                <button
                  type="button"
                  onClick={() => setSection('Overview')}
                  style={{ display: 'block', marginTop: 10, padding: '8px 12px', border: '1px solid #fecaca', borderRadius: 7, background: 'white', cursor: 'pointer' }}
                >
                  Return to Overview
                </button>
              </div>
            )}

            {!homeworkLoading && !homeworkError && homework.length === 0 && (
              <div style={{ marginTop: 16, padding: 24, borderRadius: 10, background: '#f8fafc', textAlign: 'center' }}>
                <div style={{ fontSize: 30, marginBottom: 8 }}>?</div>
                <h3 style={{ margin: '8px 0' }}>No homework yet</h3>
                <p style={{ color: '#64748b', marginBottom: 0 }}>Your teacher has not published homework for your class yet.</p>
              </div>
            )}

            {!homeworkLoading && !homeworkError && homework.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, marginTop: 18 }}>
                {homework.map(item => (
                  <article
                    key={item.id}
                    style={{ minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, background: '#fff' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ padding: '5px 10px', borderRadius: 20, background: '#dbeafe', color: '#1d4ed8', fontSize: 12, fontWeight: 700 }}>
                        {item.subject}
                      </span>
                      <span style={{ color: '#b45309', fontSize: 12, fontWeight: 700 }}>
                        Due: {item.due_date}
                      </span>
                    </div>
                    <h3 style={{ margin: '16px 0 8px', overflowWrap: 'anywhere' }}>{item.title}</h3>
                    <p style={{ color: '#475569', lineHeight: 1.65, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {item.description}
                    </p>
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 16, color: '#64748b', fontSize: 13 }}>
                      Assigned: {item.assigned_date}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'Announcements' && (
          <div style={{ background: 'white', borderRadius: 14, padding: 24 }}>
            <h3 style={{ marginTop: 0 }}>School Announcements</h3>
            {announcementsLoading && <p>Loading announcements...</p>}
            {announcementsError && <p role="alert" style={{ color: '#b91c1c' }}>{announcementsError}</p>}
            {!announcementsLoading && !announcementsError && announcements.length === 0 && (
              <p style={{ color: '#64748b' }}>No announcements have been published yet.</p>
            )}
            <div style={{ display: 'grid', gap: 16 }}>
              {announcements.map(item => (
                <article key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
                  <h4 style={{ margin: '0 0 8px', color: '#1e3a8a' }}>{item.title}</h4>
                  <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: '0 0 12px' }}>{item.message}</p>
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                    Published: {item.created_at ? new Date(item.created_at).toLocaleString() : 'Date unavailable'}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
        {error && section === 'Overview' && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      </main>
    </div>
  )
}
