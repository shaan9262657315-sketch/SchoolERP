import { API_URL } from '../services/api';
﻿import { useEffect, useState, type FormEvent } from 'react'


type Subject = {
  id: number
  subject_name: string
  max_marks: number
}

type Exam = {
  id: number
  exam_id?: number
  exam_name?: string
  name?: string
  academic_year: string
  exam_date: string
  class_name: string
  section: string
  status: string
  subjects?: Subject[]
}

type StudentSubjectMark = {
  subject_id: number
  subject_name: string
  max_marks: number
  obtained_marks: number | null
}

type StudentRow = {
  student_id: number
  registration_number?: string
  full_name: string
  subjects: StudentSubjectMark[]
}

type MarksResponse = {
  exam_class_id: number
  status: string
  students: StudentRow[]
}

export default function ResultsManagement() {
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [marksData, setMarksData] = useState<MarksResponse | null>(null)
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [examName, setExamName] = useState('Monthly Test')
  const [academicYear, setAcademicYear] = useState('2026-2027')
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10))
  const [subjectName, setSubjectName] = useState('')
  const [maxMarks, setMaxMarks] = useState('100')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedExam = exams.find(exam => exam.id === selectedId)
  const subjects = selectedExam?.subjects ?? []
  const isPublished = selectedExam?.status === 'published'

  async function api(path: string, options: RequestInit = {}) {
    const token = sessionStorage.getItem('school_erp_token')
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...((options.headers ?? {}) as Record<string, string>),
      },
    })

    let data: any = null
    try {
      data = await response.json()
    } catch {
      // Some successful responses, such as DELETE, have no JSON body.
    }

    if (!response.ok) {
      throw new Error(
        typeof data?.detail === 'string'
          ? data.detail
          : `Request failed (${response.status})`,
      )
    }
    return data
  }

  async function loadExams(preferredId?: number) {
    setLoading(true)
    setError('')
    try {
      const data = await api('/teacher/results/exams')
      const list: Exam[] = Array.isArray(data) ? data : []
      setExams(list)

      const nextId =
        (preferredId && list.some(item => item.id === preferredId) ? preferredId : null) ??
        (selectedId && list.some(item => item.id === selectedId) ? selectedId : null) ??
        list[0]?.id ??
        null

      setSelectedId(nextId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exams load nahi hue.')
    } finally {
      setLoading(false)
    }
  }

  async function loadMarks(examId: number) {
    try {
      const data: MarksResponse = await api(
        `/teacher/results/exams/${examId}/marks`,
      )
      setMarksData(data)

      const nextMarks: Record<string, string> = {}
      for (const student of data.students ?? []) {
        for (const subject of student.subjects ?? []) {
          if (subject.obtained_marks !== null && subject.obtained_marks !== undefined) {
            nextMarks[`${student.student_id}:${subject.subject_id}`] =
              String(subject.obtained_marks)
          }
        }
      }
      setMarks(nextMarks)
    } catch (err) {
      setMarksData(null)
      setError(err instanceof Error ? err.message : 'Student marks load nahi hue.')
    }
  }

  useEffect(() => {
    void loadExams()
  }, [])

  useEffect(() => {
    if (selectedId !== null) {
      void loadMarks(selectedId)
    } else {
      setMarksData(null)
      setMarks({})
    }
  }, [selectedId])

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const created = await api('/teacher/results/exams', {
        method: 'POST',
        body: JSON.stringify({
          name: examName.trim(),
          academic_year: academicYear.trim(),
          exam_date: examDate,
        }),
      })
      await loadExams(created?.id)
      setMessage('Exam create ho gaya.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exam create nahi hua.')
    } finally {
      setSaving(false)
    }
  }

  async function editExam() {
    if (!selectedExam) return
    const name = window.prompt(
      'Exam name:',
      selectedExam.exam_name ?? selectedExam.name ?? '',
    )
    if (name === null || !name.trim()) return

    const year = window.prompt('Academic year:', selectedExam.academic_year)
    if (year === null || !year.trim()) return

    const date = window.prompt('Exam date (YYYY-MM-DD):', selectedExam.exam_date)
    if (date === null || !date.trim()) return

    setError('')
    setMessage('')
    try {
      await api(`/teacher/results/exams/${selectedExam.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          academic_year: year.trim(),
          exam_date: date.trim(),
        }),
      })
      await loadExams(selectedExam.id)
      setMessage('Exam update ho gaya.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exam update nahi hua.')
    }
  }

  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedExam) return
    setError('')
    setMessage('')

    const maximum = Number(maxMarks)
    if (!subjectName.trim() || !Number.isFinite(maximum) || maximum <= 0) {
      setError('Subject name aur positive maximum marks enter karo.')
      return
    }

    setSaving(true)
    try {
      await api(`/teacher/results/exams/${selectedExam.id}/subjects`, {
        method: 'POST',
        body: JSON.stringify({
          subject_name: subjectName.trim(),
          max_marks: maximum,
        }),
      })
      setSubjectName('')
      await loadExams(selectedExam.id)
      await loadMarks(selectedExam.id)
      setMessage('Subject add ho gaya.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subject add nahi hua.')
    } finally {
      setSaving(false)
    }
  }

  async function editSubject(subject: Subject) {
    if (!selectedExam) return
    const name = window.prompt('Subject name:', subject.subject_name)
    if (name === null || !name.trim()) return

    const maximumText = window.prompt('Maximum marks:', String(subject.max_marks))
    if (maximumText === null) return
    const maximum = Number(maximumText)

    if (!Number.isFinite(maximum) || maximum <= 0) {
      setError('Maximum marks positive number hona chahiye.')
      return
    }

    setError('')
    setMessage('')
    try {
      await api(`/teacher/results/subjects/${subject.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          subject_name: name.trim(),
          max_marks: maximum,
        }),
      })
      await loadExams(selectedExam.id)
      await loadMarks(selectedExam.id)
      setMessage('Subject update ho gaya.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subject update nahi hua.')
    }
  }

  async function deleteSubject(subject: Subject) {
    if (!selectedExam) return
    if (!window.confirm(`Delete subject "${subject.subject_name}"?`)) return

    setError('')
    setMessage('')
    try {
      await api(`/teacher/results/subjects/${subject.id}`, {
        method: 'DELETE',
      })
      await loadExams(selectedExam.id)
      await loadMarks(selectedExam.id)
      setMessage('Subject delete ho gaya.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Subject delete nahi hua.')
    }
  }

  async function saveMarks() {
    if (!selectedExam || !marksData) return
    setError('')
    setMessage('')
    setSaving(true)

    try {
      for (const subject of subjects) {
        const entries = marksData.students
          .filter(student => {
            const value = marks[`${student.student_id}:${subject.id}`]
            return value !== undefined && value.trim() !== ''
          })
          .map(student => {
            const value = Number(marks[`${student.student_id}:${subject.id}`])
            if (!Number.isFinite(value) || value < 0 || value > subject.max_marks) {
              throw new Error(
                `${student.full_name}: ${subject.subject_name} ke marks 0 se ${subject.max_marks} ke beech hone chahiye.`,
              )
            }
            return { student_id: student.student_id, obtained_marks: value }
          })

        if (entries.length > 0) {
          await api(`/teacher/results/subjects/${subject.id}/marks`, {
            method: 'PUT',
            body: JSON.stringify({ marks: entries }),
          })
        }
      }

      await loadMarks(selectedExam.id)
      setMessage('Marks save ho gaye.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Marks save nahi hue.')
    } finally {
      setSaving(false)
    }
  }

  async function publishResults() {
    if (!selectedExam) return
    if (!window.confirm('Results publish karne hain? Students published results dekh sakenge.')) {
      return
    }

    setError('')
    setMessage('')
    setSaving(true)
    try {
      await api(`/teacher/results/exams/${selectedExam.id}/publish`, {
        method: 'POST',
      })
      await loadExams(selectedExam.id)
      await loadMarks(selectedExam.id)
      setMessage('Results publish ho gaye.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Results publish nahi hue.')
    } finally {
      setSaving(false)
    }
  }

  const buttonStyle = {
    padding: '9px 13px',
    border: '1px solid #d1d5db',
    borderRadius: 7,
    background: '#fff',
    cursor: 'pointer',
  } as const

  const inputStyle = {
    padding: 9,
    border: '1px solid #d1d5db',
    borderRadius: 7,
    width: '100%',
    boxSizing: 'border-box' as const,
  }

  return (
    <section className="td-card" style={{ display: 'grid', gap: 20 }}>
      <div className="td-section-heading">
        <div>
          <h2>Results Management</h2>
          <p>Create exams, manage subjects, enter marks and publish results.</p>
        </div>
        <button
          type="button"
          style={buttonStyle}
          disabled={loading}
          onClick={() => void loadExams(selectedId ?? undefined)}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: '#b91c1c', background: '#fef2f2', padding: 12, borderRadius: 7 }}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" style={{ color: '#166534', background: '#f0fdf4', padding: 12, borderRadius: 7 }}>
          {message}
        </p>
      )}

      <div>
        <h3>Create Exam</h3>
        <form onSubmit={createExam} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <label>
            Exam name
            <input style={inputStyle} value={examName} onChange={event => setExamName(event.target.value)} required maxLength={120} />
          </label>
          <label>
            Academic year
            <input style={inputStyle} value={academicYear} onChange={event => setAcademicYear(event.target.value)} required maxLength={20} />
          </label>
          <label>
            Exam date
            <input style={inputStyle} type="date" value={examDate} onChange={event => setExamDate(event.target.value)} required />
          </label>
          <button type="submit" style={{ ...buttonStyle, alignSelf: 'end' }} disabled={saving}>
            {saving ? 'Please wait...' : 'Create Exam'}
          </button>
        </form>
        <p style={{ color: '#6b7280', fontSize: 13 }}>
          Exam assigned teacher ke allocated class/section ke liye create hoga.
        </p>
      </div>

      <div>
        <h3>Select Exam</h3>
        {exams.length === 0 ? (
          <p>{loading ? 'Loading exams...' : 'No exams available. Upar se apna first exam create karo.'}</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <select
              style={{ ...inputStyle, maxWidth: 420 }}
              value={selectedId ?? ''}
              onChange={event => {
                setError('')
                setMessage('')
                setSelectedId(event.target.value ? Number(event.target.value) : null)
              }}
            >
              {exams.map(exam => (
                <option key={exam.id} value={exam.id}>
                  {exam.exam_name ?? exam.name ?? 'Exam'} — Class {exam.class_name} {exam.section} — {exam.academic_year} — {exam.status}
                </option>
              ))}
            </select>
            {selectedExam && (
              <>
                <button type="button" style={buttonStyle} disabled={isPublished} onClick={() => void editExam()}>
                  Edit Exam
                </button>
                <span style={{ padding: '6px 10px', borderRadius: 20, background: isPublished ? '#dcfce7' : '#fef3c7' }}>
                  {selectedExam.status}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {selectedExam && (
        <>
          <div>
            <h3>Manage Subjects</h3>
            {!isPublished && (
              <form onSubmit={addSubject} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 12 }}>
                <label>
                  Subject name
                  <input style={inputStyle} value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="e.g. Mathematics" required maxLength={100} />
                </label>
                <label>
                  Maximum marks
                  <input style={inputStyle} type="number" min="0.01" step="0.01" value={maxMarks} onChange={event => setMaxMarks(event.target.value)} required />
                </label>
                <button type="submit" style={{ ...buttonStyle, alignSelf: 'end' }} disabled={saving}>
                  Add Subject
                </button>
              </form>
            )}

            {subjects.length === 0 ? (
              <p>No subjects added yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb' }}>Subject</th>
                      <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb' }}>Maximum marks</th>
                      {!isPublished && <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb' }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map(subject => (
                      <tr key={subject.id}>
                        <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>{subject.subject_name}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>{subject.max_marks}</td>
                        {!isPublished && (
                          <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button type="button" style={buttonStyle} onClick={() => void editSubject(subject)}>Edit</button>
                              <button type="button" style={buttonStyle} onClick={() => void deleteSubject(subject)}>Delete</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <div className="td-section-heading">
              <div>
                <h3>Student-wise Marks</h3>
                <p>Marks 0 se maximum marks ke beech enter karo. Blank fields save nahi honge.</p>
              </div>
              <button type="button" style={buttonStyle} onClick={() => void loadMarks(selectedExam.id)}>
                Reload Students
              </button>
            </div>

            {!marksData ? (
              <p>Student marks load ho rahe hain ya API response available nahi hai.</p>
            ) : marksData.students.length === 0 ? (
              <p>Is assigned class/section ke students nahi mile.</p>
            ) : subjects.length === 0 ? (
              <p>Pehle kam se kam ek subject add karo.</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 650 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb' }}>Student</th>
                        {subjects.map(subject => (
                          <th key={subject.id} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid #e5e7eb' }}>
                            {subject.subject_name}
                            <div style={{ fontWeight: 'normal', fontSize: 12 }}>Max: {subject.max_marks}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {marksData.students.map(student => (
                        <tr key={student.student_id}>
                          <td style={{ padding: 10, borderBottom: '1px solid #e5e7eb' }}>
                            <strong>{student.full_name}</strong>
                            {student.registration_number && <div style={{ fontSize: 12, color: '#6b7280' }}>{student.registration_number}</div>}
                          </td>
                          {subjects.map(subject => (
                            <td key={subject.id} style={{ padding: 10, borderBottom: '1px solid #e5e7eb', minWidth: 115 }}>
                              <input
                                aria-label={`${student.full_name} ${subject.subject_name} marks`}
                                style={inputStyle}
                                type="number"
                                min="0"
                                max={subject.max_marks}
                                step="0.01"
                                disabled={isPublished}
                                value={marks[`${student.student_id}:${subject.id}`] ?? ''}
                                onChange={event => setMarks(previous => ({
                                  ...previous,
                                  [`${student.student_id}:${subject.id}`]: event.target.value,
                                }))}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {!isPublished && (
                    <>
                      <button type="button" style={buttonStyle} disabled={saving} onClick={() => void saveMarks()}>
                        {saving ? 'Saving...' : 'Save Marks'}
                      </button>
                      <button type="button" style={{ ...buttonStyle, background: '#166534', color: 'white' }} disabled={saving} onClick={() => void publishResults()}>
                        Publish Results
                      </button>
                    </>
                  )}
                  {isPublished && <strong>Published — marks editing disabled.</strong>}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
