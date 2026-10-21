import { API_URL } from '../services/api';
﻿import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FeeManagement from './FeeManagement'
import './FinancePage.css'

type Student = {
  id: number
  registration_number: string
  full_name: string
  class_name: string
  section: string
}


export default function FinancePage() {
  const navigate = useNavigate()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const apiRequest = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem('school_erp_token')
    if (!token) {
      navigate('/login', { replace: true })
      throw new Error('Session expire ho gaya. Dobara login karein.')
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })

    const data = await response.json().catch(() => ({}))
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem('school_erp_token')
      navigate('/login', { replace: true })
      throw new Error('Session expire ho gaya. Dobara login karein.')
    }
    if (!response.ok) {
      const detail = data.detail
      const message = Array.isArray(detail)
        ? detail.map((item: any) => `${Array.isArray(item.loc) ? item.loc.join(".") : "field"}: ${item.msg ?? "Invalid value"}`).join("; ")
        : typeof detail === "string" ? detail : `Request failed (${response.status})`
      throw new Error(message)
    }
    return data
  }, [navigate])

  useEffect(() => {
    let cancelled = false

    const loadStudents = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await apiRequest('/admin/students')
        if (!cancelled) setStudents(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Students load nahi ho sake.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadStudents()
    return () => { cancelled = true }
  }, [apiRequest])

  return (
    <main className="erp-dashboard">
      <header className="erp-topbar">
        <a className="erp-brand" href="/admin">SCHOOL ERP</a>
        <button className="erp-logout" onClick={() => navigate('/admin')}>Back to Dashboard</button>
      </header>

      <section className="erp-content finance-page">
        <div className="erp-heading">
          <div>
            <p className="erp-eyebrow">SCHOOL ADMINISTRATION</p>
            <h1>Finance Management</h1>
            <p className="erp-subtitle">Manage fee structures, student dues, collections and receipts.</p>
          </div>
          <button className="erp-refresh" onClick={() => navigate('/admin')}>Dashboard</button>
        </div>

        {loading && <p>Loading students...</p>}
        {error && <div className="finance-error" role="alert">{error}</div>}
        {!loading && !error && (
          <FeeManagement students={students} apiRequest={apiRequest} />
        )}
      </section>
    </main>
  )
}
