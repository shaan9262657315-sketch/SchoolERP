import { API_URL } from '../services/api';
﻿import { useCallback, useEffect, useState } from 'react';
import './Attendance.css';


type Student = {
  id: number;
  registration_number: string;
  full_name: string;
  class_name: string;
  section: string;
};

type AttendanceStatus = 'Present' | 'Absent' | 'Late';
type Tab = 'mark' | 'daily' | 'monthly';

type AttendanceRecord = {
  id: number;
  student_id: number;
  attendance_date: string;
  status: AttendanceStatus;
};

type MonthlyRecord = {
  student_id: number;
  registration_number: string;
  full_name: string;
  class_name: string;
  section: string;
  month: number;
  year: number;
  present_days: number;
  late_days: number;
  absent_days: number;
  total_recorded_days: number;
  attendance_percentage: number;
};

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function Attendance() {
  const [activeTab, setActiveTab] = useState<Tab>('mark');
  const [className, setClassName] = useState('10');
  const [section, setSection] = useState('A');
  const [attendanceDate, setAttendanceDate] = useState(today());
  const [reportDate, setReportDate] = useState(today());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);

  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<Record<number, AttendanceStatus>>({});
  const [dailyRecords, setDailyRecords] = useState<AttendanceRecord[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<MonthlyRecord[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const apiRequest = useCallback(
    async (path: string, options: RequestInit = {}) => {
      const token = sessionStorage.getItem('school_erp_token');

      if (!token) {
        throw new Error('Admin session not found. Please log in again.');
      }

      const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof data?.detail === 'string'
            ? data.detail
            : `Request failed (${response.status})`
        );
      }

      return data;
    },
    []
  );

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const query = new URLSearchParams({ class_name: className, section });
      const data = await apiRequest(`/attendance/students?${query}`);
      const list: Student[] = Array.isArray(data) ? data : [];

      setStudents(list);

      const initialRecords: Record<number, AttendanceStatus> = {};
      list.forEach((student) => {
        initialRecords[student.id] = 'Present';
      });
      setRecords(initialRecords);

      if (list.length === 0) {
        setMessage('No students were found in this class and section.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load students.'));
    } finally {
      setLoading(false);
    }
  }, [apiRequest, className, section]);

  const loadDailyReport = useCallback(async () => {
    setReportLoading(true);
    setError('');
    setMessage('');

    try {
      const query = new URLSearchParams({
        attendance_date: reportDate,
        class_name: className,
        section,
      });
      const data = await apiRequest(`/attendance/daily?${query}`);
      setDailyRecords(Array.isArray(data) ? data : []);

      if (Array.isArray(data) && data.length === 0) {
        setMessage('No saved attendance records were found for this date.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load the daily report.'));
    } finally {
      setReportLoading(false);
    }
  }, [apiRequest, reportDate, className, section]);

  const loadMonthlyReport = useCallback(async () => {
    setReportLoading(true);
    setError('');
    setMessage('');

    try {
      const query = new URLSearchParams({
        year: String(reportYear),
        month: String(reportMonth),
        class_name: className,
        section,
      });
      const data = await apiRequest(`/attendance/monthly?${query}`);
      setMonthlyRecords(Array.isArray(data) ? data : []);

      if (Array.isArray(data) && data.length === 0) {
        setMessage('No students were found in this class and section.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load the monthly report.'));
    } finally {
      setReportLoading(false);
    }
  }, [apiRequest, reportYear, reportMonth, className, section]);

  useEffect(() => {
    if (activeTab === 'mark') void loadStudents();
  }, [activeTab, loadStudents]);

  useEffect(() => {
    if (activeTab === 'daily') void loadDailyReport();
  }, [activeTab, loadDailyReport]);

  useEffect(() => {
    if (activeTab === 'monthly') void loadMonthlyReport();
  }, [activeTab, loadMonthlyReport]);

  const updateStatus = (studentId: number, status: AttendanceStatus) => {
    setRecords((previous) => ({ ...previous, [studentId]: status }));
  };

  const markAll = (status: AttendanceStatus) => {
    const updated: Record<number, AttendanceStatus> = {};
    students.forEach((student) => {
      updated[student.id] = status;
    });
    setRecords(updated);
  };

  const saveAttendance = async () => {
    if (students.length === 0) {
      setError('There are no students available to save attendance for.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const payload = {
        attendance_date: attendanceDate,
        records: students.map((student) => ({
          student_id: student.id,
          status: records[student.id] || 'Present',
        })),
      };

      await apiRequest('/attendance/mark', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setMessage('Attendance successfully save ho gayi!');

      if (attendanceDate === reportDate) {
        setDailyRecords(
          students.map((student, index) => ({
            id: 0 - index,
            student_id: student.id,
            attendance_date: attendanceDate,
            status: records[student.id] || 'Present',
          }))
        );
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to save attendance.'));
    } finally {
      setSaving(false);
    }
  };

  const countStatus = (status: AttendanceStatus) =>
    students.filter((student) => records[student.id] === status).length;

  const classOptions = [
    'Nursery',
    'LKG',
    'UKG',
    ...Array.from({ length: 12 }, (_, index) => String(index + 1)),
  ];

  return (
    <main className="attendance-page">
      <header className="attendance-header">
        <div>
          <p className="attendance-eyebrow">ADMINISTRATION</p>
          <h1>Attendance Management</h1>
          <p className="attendance-subtitle">
            Mark attendance and view saved daily and monthly reports.
          </p>
        </div>
        <button
          className="attendance-button secondary"
          onClick={() => {
            if (activeTab === 'mark') void loadStudents();
            else if (activeTab === 'daily') void loadDailyReport();
            else void loadMonthlyReport();
          }}
          disabled={loading || saving || reportLoading}
        >
          Refresh report
        </button>
      </header>

      <nav className="attendance-tabs" aria-label="Attendance sections">
        <button
          className={activeTab === 'mark' ? 'active' : ''}
          onClick={() => { setActiveTab('mark'); setError(''); setMessage(''); }}
        >
          Mark Attendance
        </button>
        <button
          className={activeTab === 'daily' ? 'active' : ''}
          onClick={() => { setActiveTab('daily'); setError(''); setMessage(''); }}
        >
          Daily Report
        </button>
        <button
          className={activeTab === 'monthly' ? 'active' : ''}
          onClick={() => { setActiveTab('monthly'); setError(''); setMessage(''); }}
        >
          Monthly Report
        </button>
      </nav>

      <section className="attendance-filters">
        <label>
          Class
          <select value={className} onChange={(event) => setClassName(event.target.value)}>
            {classOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label>
          Section
          <select value={section} onChange={(event) => setSection(event.target.value)}>
            {['A', 'B', 'C'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        {activeTab === 'mark' && (
          <label>
            Attendance date
            <input
              type="date"
              value={attendanceDate}
              onChange={(event) => setAttendanceDate(event.target.value)}
              required
            />
          </label>
        )}

        {activeTab === 'daily' && (
          <label>
            Report date
            <input
              type="date"
              value={reportDate}
              onChange={(event) => setReportDate(event.target.value)}
              required
            />
          </label>
        )}

        {activeTab === 'monthly' && (
          <>
            <label>
              Month
              <select
                value={reportMonth}
                onChange={(event) => setReportMonth(Number(event.target.value))}
              >
                {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                  <option key={month} value={month}>
                    {new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' })}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input
                type="number"
                min="2000"
                max="2100"
                value={reportYear}
                onChange={(event) => setReportYear(Number(event.target.value))}
              />
            </label>
          </>
        )}

        <button
          className="attendance-button primary"
          onClick={() => {
            if (activeTab === 'mark') void loadStudents();
            else if (activeTab === 'daily') void loadDailyReport();
            else void loadMonthlyReport();
          }}
          disabled={loading || saving || reportLoading}
        >
          {loading || reportLoading ? 'Loading...' : 'Load data'}
        </button>
      </section>

      {error && <div className="attendance-alert error">{error}</div>}
      {message && <div className="attendance-alert success" role="status">{message}</div>}

      {activeTab === 'mark' && (
        <>
          <section className="attendance-summary">
            <div className="attendance-stat"><span>Total students</span><strong>{students.length}</strong></div>
            <div className="attendance-stat"><span>Present</span><strong>{countStatus('Present')}</strong></div>
            <div className="attendance-stat"><span>Absent</span><strong>{countStatus('Absent')}</strong></div>
            <div className="attendance-stat"><span>Late</span><strong>{countStatus('Late')}</strong></div>
          </section>

          <section className="attendance-records">
            <div className="attendance-records-header">
              <h2>Student attendance</h2>
              <div className="attendance-shortcuts">
                <button onClick={() => markAll('Present')} disabled={!students.length}>All present</button>
                <button onClick={() => markAll('Absent')} disabled={!students.length}>All absent</button>
              </div>
            </div>

            {loading ? (
              <p className="attendance-empty">Loading students...</p>
            ) : students.length === 0 ? (
              <p className="attendance-empty">No students found. Check the class and section.</p>
            ) : (
              <div className="attendance-table-wrap">
                <table className="attendance-table">
                  <thead><tr><th>Registration no.</th><th>Student name</th><th>Class</th><th>Section</th><th>Attendance status</th></tr></thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td>{student.registration_number}</td>
                        <td>{student.full_name}</td>
                        <td>{student.class_name}</td>
                        <td>{student.section}</td>
                        <td>
                          <select
                            aria-label={`Attendance for ${student.full_name}`}
                            className={`attendance-status ${(records[student.id] || 'Present').toLowerCase()}`}
                            value={records[student.id] || 'Present'}
                            onChange={(event) => updateStatus(student.id, event.target.value as AttendanceStatus)}
                          >
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                            <option value="Late">Late</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="attendance-footer">
              <span>Save karne se pehle har student ka status check kar lo.</span>
              <button className="attendance-button primary" onClick={() => void saveAttendance()} disabled={saving || loading || students.length === 0}>
                {saving ? 'Saving...' : 'Save attendance'}
              </button>
            </div>
          </section>
        </>
      )}

      {activeTab === 'daily' && (
        <section className="attendance-records">
          <div className="attendance-records-header">
            <h2>Daily Attendance Report</h2>
            <span>{reportDate}</span>
          </div>
          {reportLoading ? (
            <p className="attendance-empty">Loading daily report...</p>
          ) : dailyRecords.length === 0 ? (
            <p className="attendance-empty">There are no saved attendance records for this date.</p>
          ) : (
            <>
              <section className="attendance-summary">
                <div className="attendance-stat"><span>Records</span><strong>{dailyRecords.length}</strong></div>
                <div className="attendance-stat"><span>Present</span><strong>{dailyRecords.filter((r) => r.status === 'Present').length}</strong></div>
                <div className="attendance-stat"><span>Absent</span><strong>{dailyRecords.filter((r) => r.status === 'Absent').length}</strong></div>
                <div className="attendance-stat"><span>Late</span><strong>{dailyRecords.filter((r) => r.status === 'Late').length}</strong></div>
              </section>
              <div className="attendance-table-wrap">
                <table className="attendance-table">
                  <thead><tr><th>Student name</th><th>Registration no.</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>
                    {dailyRecords.map((record) => {
                      const student = students.find((item) => item.id === record.student_id);
                      return (
                        <tr key={`${record.student_id}-${record.attendance_date}`}>
                          <td>{student?.full_name || `Student ID ${record.student_id}`}</td>
                          <td>{student?.registration_number || '—'}</td>
                          <td>{record.attendance_date}</td>
                          <td><span className={`attendance-badge ${record.status.toLowerCase()}`}>{record.status}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {activeTab === 'monthly' && (
        <section className="attendance-records">
          <div className="attendance-records-header">
            <h2>Monthly Attendance Report</h2>
            <span>{reportMonth}/{reportYear}</span>
          </div>
          {reportLoading ? (
            <p className="attendance-empty">Loading monthly report...</p>
          ) : monthlyRecords.length === 0 ? (
            <p className="attendance-empty">No students were found for this class and section.</p>
          ) : (
            <div className="attendance-table-wrap">
              <table className="attendance-table">
                <thead><tr><th>Student</th><th>Registration no.</th><th>Present</th><th>Late</th><th>Absent</th><th>Recorded days</th><th>Attendance %</th></tr></thead>
                <tbody>
                  {monthlyRecords.map((record) => (
                    <tr key={record.student_id}>
                      <td>{record.full_name}</td>
                      <td>{record.registration_number}</td>
                      <td>{record.present_days}</td>
                      <td>{record.late_days}</td>
                      <td>{record.absent_days}</td>
                      <td>{record.total_recorded_days}</td>
                      <td><strong>{record.attendance_percentage.toFixed(2)}%</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="attendance-note">
            Percentage = (Present days + Late days) ÷ Recorded days × 100.
            Days without an attendance record are excluded from the total.
          </p>
        </section>
      )}
    </main>
  );
}
