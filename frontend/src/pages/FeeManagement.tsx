import { useCallback, useEffect, useState } from 'react'
import './FeeManagement.css'

type Student = {
  id: number
  registration_number: string
  full_name: string
  class_name: string
  section: string
}
type FeeStructure = {
  id: number
  academic_year: string
  class_name: string
  section: string
  fee_type: string
  amount: string | number
  frequency: string
  description: string | null
  is_active: boolean
}
type Ledger = {
  id: number
  student_id: number
  fee_structure_id: number | null
  academic_year: string
  fee_type: string
  period: string
  amount_due: string | number
  amount_paid: string | number
  due_date: string | null
}
type Payment = {
  payment_id: number
  student_id: number
  ledger_id: number
  amount: string | number
  payment_method: string
  receipt_number: string
  paid_at: string | null
  status: string
}
type Props = {
  students: Student[]
  apiRequest: (path: string, options?: RequestInit) => Promise<any>
}

const BASE = '/fees/structures'
const money = (value: string | number) =>
  '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function FeeManagement({ students, apiRequest }: Props) {
  const [structures, setStructures] = useState<FeeStructure[]>([])
  const [ledger, setLedger] = useState<Ledger[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('overview')

  const [year, setYear] = useState('2026-2027')
  const [className, setClassName] = useState('Nursery')
  const [section, setSection] = useState('A')
  const [feeType, setFeeType] = useState('monthly_tuition')
  const [amount, setAmount] = useState('500')
  const [frequency, setFrequency] = useState('monthly')
  const [description, setDescription] = useState('')

  const [assignmentMode, setAssignmentMode] = useState('individual')
  const [studentId, setStudentId] = useState('')
  const [structureId, setStructureId] = useState('')
  const [periodYear, setPeriodYear] = useState('2026')
  const [periodMonth, setPeriodMonth] = useState('10')
  const selectedPeriod = `${periodYear}-${periodMonth}`
  const [dueDate, setDueDate] = useState('')
  const [paymentLedgerId, setPaymentLedgerId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [receipt, setReceipt] = useState<any>(null)

  const loadData = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const [s, l, p] = await Promise.all([
        apiRequest(`${BASE}`),
        apiRequest(`${BASE}/ledger`),
        apiRequest(`${BASE}/payments/history`),
      ])
      setStructures(Array.isArray(s) ? s : [])
      setLedger(Array.isArray(l) ? l : [])
      setPayments(Array.isArray(p) ? p : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load fee data.')
    } finally {
      setBusy(false)
    }
  }, [apiRequest])

  useEffect(() => { void loadData() }, [loadData])

  const selectedStructure = structures.find(x => String(x.id) === structureId)
  const selectedLedger = ledger.find(x => String(x.id) === paymentLedgerId)
  const pending = (item: Ledger) => Math.max(0, Number(item.amount_due) - Number(item.amount_paid))
  const studentName = (id: number) =>
    students.find(s => s.id === id)?.full_name || `Student #${id}`

  async function createStructure(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await apiRequest(BASE, {
        method: 'POST',
        body: JSON.stringify({
          academic_year: year, class_name: className, section, fee_type: feeType,
          amount: Number(amount), frequency, description: description || null,
        }),
      })
      setMessage('Fee structure successfully create ho gaya.')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create the fee structure.')
    } finally {
      setBusy(false)
    }
  }

  async function assignFee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!studentId) { setError('Please select a student.'); return }
    if (!selectedStructure) { setError('Please select an active fee structure.'); return }
    const student = students.find(s => String(s.id) === studentId)
    if (!student) { setError('The selected student could not be found.'); return }
    if (student.class_name !== selectedStructure.class_name || student.section !== selectedStructure.section) {
      setError("The fee structure does not match the student's class and section.")
      return
    }
    setBusy(true)
    try {
      await apiRequest(`${BASE}/ledger`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: Number(studentId),
          academic_year: selectedStructure.academic_year,
          fee_type: selectedStructure.fee_type,
          period: selectedPeriod,
          amount_due: Number(selectedStructure.amount),
          due_date: dueDate || null,
          fee_structure_id: selectedStructure.id,
        }),
      })
      setMessage('Student fee ledger mein add ho gayi.')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to assign the student fee.')
    } finally {
      setBusy(false)
    }
  }

  async function assignBulkFee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!selectedStructure) {
      setError('Please select an active fee structure.')
      return
    }
    if (selectedStructure.class_name !== className || selectedStructure.section !== section) {
      setError("The selected fee structure's class and section do not match.")
      return
    }
    if (!window.confirm(`Assign ${selectedStructure.fee_type.replaceAll('_', ' ')} fee to all students in ${className}-${section} for ${selectedPeriod}? Existing entries will be skipped.`)) return
    setBusy(true)
    try {
      const result = await apiRequest(`${BASE}/ledger/bulk`, {
        method: 'POST',
        body: JSON.stringify({
          fee_structure_id: selectedStructure.id,
          period: selectedPeriod,
          due_date: dueDate || null,
        }),
      })
      setMessage(`Class assignment complete. Matched: ${result.students_matched}, created: ${result.created}, skipped existing: ${result.skipped_existing}.`)
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to assign the class fee.')
    } finally {
      setBusy(false)
    }
  }

  async function collectPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (!selectedLedger) { setError('Please select a pending fee.'); return }
    const value = Number(paymentAmount)
    if (!(value > 0) || value > pending(selectedLedger)) {
      setError(`Amount must be positive and cannot exceed the pending balance of ${money(pending(selectedLedger))}.`)
      return
    }
    setBusy(true)
    try {
      const result = await apiRequest(`${BASE}/payments/offline`, {
        method: 'POST',
        body: JSON.stringify({
          ledger_id: selectedLedger.id,
          amount: value,
          payment_method: paymentMethod,
        }),
      })
      setReceipt(result)
      setMessage('Payment recorded successfully. The receipt number is shown below.')
      setPaymentAmount('')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record the payment.')
    } finally {
      setBusy(false)
    }
  }

  async function viewReceipt(paymentId: number) {
    setError('')
    try {
      const data = await apiRequest(`${BASE}/payments/${paymentId}/receipt`)
      setReceipt(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load the receipt.')
    }
  }

  return (
    <section className="erp-card fee-management">
      <div className="fee-heading">
        <div>
          <p className="erp-eyebrow">FINANCE</p>
          <h2>Fee Management</h2>
          <p className="erp-help">Fee structures, student dues, offline collection aur receipts.</p>
        </div>
        <button className="erp-refresh" type="button" onClick={() => void loadData()} disabled={busy}>
          {busy ? 'Loading...' : 'Refresh fees'}
        </button>
      </div>

      <nav className="fee-tabs" aria-label="Fee management sections">
        {[
          ['overview', 'Overview'],
          ['structures', 'Fee structures'],
          ['assign', 'Assign fee'],
          ['collect', 'Collect payment'],
          ['history', 'Payment history'],
        ].map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="erp-alert erp-alert-error" role="alert">{error}</p>}
      {message && <p className="erp-alert erp-alert-success" role="status">{message}</p>}

      {tab === 'overview' && <>
        <div className="fee-stats">
          <div><span>Fee structures</span><strong>{structures.length}</strong></div>
          <div><span>Student fee entries</span><strong>{ledger.length}</strong></div>
          <div><span>Payments recorded</span><strong>{payments.length}</strong></div>
          <div><span>Total pending</span><strong>{money(ledger.reduce((sum, item) => sum + pending(item), 0))}</strong></div>
        </div>
        <h3>Student fee balances</h3>
        <div className="erp-table-wrap">
          <table className="erp-table">
            <thead><tr><th>Student</th><th>Year / Period</th><th>Fee type</th><th>Due</th><th>Paid</th><th>Pending</th><th>Status</th></tr></thead>
            <tbody>{ledger.length === 0 ? <tr><td colSpan={7}>No student fee entries found.</td></tr> : ledger.map(item => {
              const left = pending(item)
              return <tr key={item.id}>
                <td>{studentName(item.student_id)}</td>
                <td>{item.academic_year} / {item.period}</td>
                <td>{item.fee_type.replaceAll('_', ' ')}</td>
                <td>{money(item.amount_due)}</td><td>{money(item.amount_paid)}</td><td>{money(left)}</td>
                <td><span className={`fee-status ${left === 0 ? 'paid' : Number(item.amount_paid) > 0 ? 'partial' : 'pending'}`}>{left === 0 ? 'Paid' : Number(item.amount_paid) > 0 ? 'Partial' : 'Pending'}</span></td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </>}

      {tab === 'structures' && <>
        <h3>Create fee structure</h3>
        <form className="fee-form" onSubmit={createStructure}>
          <label>Academic year<input required value={year} onChange={e => setYear(e.target.value)} /></label>
          <label>Class<select value={className} onChange={e => setClassName(e.target.value)}>{['Nursery','LKG','UKG',...Array.from({length:12},(_,i)=>String(i+1))].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Section<select value={section} onChange={e => setSection(e.target.value)}>{['A','B','C'].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Fee type<select value={feeType} onChange={e => setFeeType(e.target.value)}>{[['monthly_tuition','Tuition'],['annual','Annual'],['exam','Examination'],['admission','Admission'],['extra','Other Charges'],['transport','Transport'],['hostel','Hostel'],['library','Library']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>Frequency<select value={frequency} onChange={e => setFrequency(e.target.value)}>{['monthly','quarterly','half_yearly','yearly','one_time'].map(x => <option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label>
          <label className="fee-wide">Description<input maxLength={255} value={description} onChange={e => setDescription(e.target.value)} /></label>
          <button className="erp-primary" disabled={busy}>{busy ? 'Saving...' : 'Create fee structure'}</button>
        </form>
        <h3>Existing structures</h3>
        <div className="erp-table-wrap"><table className="erp-table">
          <thead><tr><th>Year</th><th>Class / Section</th><th>Fee type</th><th>Amount</th><th>Frequency</th><th>Status</th></tr></thead>
          <tbody>{structures.map(s => <tr key={s.id}><td>{s.academic_year}</td><td>{s.class_name} - {s.section}</td><td>{s.fee_type.replaceAll('_',' ')}</td><td>{money(s.amount)}</td><td>{s.frequency}</td><td>{s.is_active ? 'Active' : 'Inactive'}</td></tr>)}
          {structures.length === 0 && <tr><td colSpan={6}>No fee structures found.</td></tr>}</tbody>
        </table></div>
      </>}

      {tab === 'assign' && <>
        <h3>Assign fee</h3>
        <form className="fee-form" onSubmit={assignmentMode === 'individual' ? assignFee : assignBulkFee}>
          <label className="fee-wide">Assignment type<select value={assignmentMode} onChange={e => setAssignmentMode(e.target.value)}><option value="individual">Individual student</option><option value="class">Entire class / section</option></select></label>
          {assignmentMode === 'individual' ? (
            <label className="fee-wide">Student<select required value={studentId} onChange={e => setStudentId(e.target.value)}><option value="">Select student</option>{students.map(s => <option key={s.id} value={s.id}>{s.full_name} · {s.registration_number} · {s.class_name}-{s.section}</option>)}</select></label>
          ) : (
            <>
              <label>Class<select value={className} onChange={e => setClassName(e.target.value)}>{['Nursery','LKG','UKG',...Array.from({length:12},(_,i)=>String(i+1))].map(x => <option key={x}>{x}</option>)}</select></label>
              <label>Section<select value={section} onChange={e => setSection(e.target.value)}>{['A','B','C'].map(x => <option key={x}>{x}</option>)}</select></label>
              <p className="fee-wide">This assigns the fee to all students in the selected class and section. Existing entries for the same period are skipped.</p>
            </>
          )}
          <label className="fee-wide">Active fee structure<select required value={structureId} onChange={e => setStructureId(e.target.value)}><option value="">Select fee structure</option>{structures.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.academic_year} · {s.class_name}-{s.section} · {s.fee_type} · {money(s.amount)}</option>)}</select></label>
          <label>Billing year<select value={periodYear} onChange={e => setPeriodYear(e.target.value)}>{['2026','2027','2028','2029','2030'].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
          <label>Billing month<select value={periodMonth} onChange={e => setPeriodMonth(e.target.value)}>{[['01','January'],['02','February'],['03','March'],['04','April'],['05','May'],['06','June'],['07','July'],['08','August'],['09','September'],['10','October'],['11','November'],['12','December']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <p className="fee-wide">Billing period: <strong>{selectedPeriod}</strong></p>
          <label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
          {selectedStructure && <p className="fee-wide">Amount per student: <strong>{money(selectedStructure.amount)}</strong>. Structure class: {selectedStructure.class_name}-{selectedStructure.section} · Academic year: {selectedStructure.academic_year}.</p>}
          <button className="erp-primary" disabled={busy}>{busy ? 'Saving...' : assignmentMode === 'individual' ? 'Assign fee to student' : 'Assign fee to entire class'}</button>
        </form>
      </>}
      {tab === 'collect' && <>
        <h3>Collect offline payment</h3>
        <p className="erp-help">Submit only after receiving the actual payment. The payment amount cannot exceed the pending balance.</p>
        <form className="fee-form" onSubmit={collectPayment}>
          <label className="fee-wide">Pending fee entry<select required value={paymentLedgerId} onChange={e => setPaymentLedgerId(e.target.value)}><option value="">Select student fee</option>{ledger.filter(x => pending(x) > 0).map(x => <option key={x.id} value={x.id}>{studentName(x.student_id)} · {x.period} · Pending {money(pending(x))}</option>)}</select></label>
          {selectedLedger && <p className="fee-wide">Due {money(selectedLedger.amount_due)} · Paid {money(selectedLedger.amount_paid)} · Pending <strong>{money(pending(selectedLedger))}</strong></p>}
          <label>Amount received (₹)<input required type="number" min="0.01" max={selectedLedger ? pending(selectedLedger) : undefined} step="0.01" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} /></label>
          <label>Payment method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option></select></label>
          <button className="erp-primary" disabled={busy || !selectedLedger}>{busy ? 'Recording...' : 'Record payment'}</button>
        </form>
        {receipt && <div className="fee-receipt"><div className="receipt-header"><div><p className="receipt-kicker">SCHOOL FEE RECEIPT</p><h3>Payment receipt</h3><p className="receipt-muted">Official payment record</p></div><span className="receipt-paid">PAID</span></div><div className="receipt-grid"><div><span>Receipt number</span><strong>{receipt.receipt_number || "—"}</strong></div><div><span>Payment ID</span><strong>{receipt.payment_id ?? "—"}</strong></div><div><span>Student name</span><strong>{receipt.student_name || students.find(s => s.id === receipt.student_id)?.full_name || "—"}</strong></div><div><span>Registration number</span><strong>{receipt.registration_number || students.find(s => s.id === receipt.student_id)?.registration_number || "—"}</strong></div><div><span>Class & section</span><strong>{[receipt.class_name || students.find(s => s.id === receipt.student_id)?.class_name, receipt.section || students.find(s => s.id === receipt.student_id)?.section].filter(Boolean).join(" - ") || "—"}</strong></div><div><span>Payment date</span><strong>{receipt.paid_at ? new Date(receipt.paid_at).toLocaleString() : "—"}</strong></div><div><span>Payment method</span><strong>{String(receipt.payment_method || "—").replaceAll("_", " ")}</strong></div><div className="receipt-amount"><span>Amount received</span><strong>{money(receipt.amount_paid_now ?? receipt.amount)}</strong></div></div>{receipt.pending_balance !== undefined && <p>Remaining balance: <strong>{money(receipt.pending_balance)}</strong></p>}<div className="receipt-actions"><button className="erp-secondary" type="button" onClick={() => window.print()}>Print receipt</button><button className="erp-secondary" type="button" onClick={() => setReceipt(null)}>Close</button></div></div>}
      </>}

      {tab === 'history' && <>
        <h3>Payment history</h3>
        <div className="erp-table-wrap"><table className="erp-table">
          <thead><tr><th>Receipt</th><th>Student</th><th>Ledger ID</th><th>Amount</th><th>Method</th><th>Paid at</th><th>Receipt</th></tr></thead>
          <tbody>{payments.map(p => <tr key={p.payment_id}><td>{p.receipt_number || '—'}</td><td>{studentName(p.student_id)}</td><td>{p.ledger_id}</td><td>{money(p.amount)}</td><td>{p.payment_method.replaceAll('_',' ')}</td><td>{p.paid_at ? new Date(p.paid_at).toLocaleString() : '—'}</td><td><button className="erp-edit" type="button" onClick={() => void viewReceipt(p.payment_id)}>View</button></td></tr>)}
          {payments.length === 0 && <tr><td colSpan={7}>No completed payments found.</td></tr>}</tbody>
        </table></div>
        {receipt && tab === 'history' && <div className="fee-receipt"><div className="receipt-header"><div><p className="receipt-kicker">SCHOOL FEE RECEIPT</p><h3>Payment receipt</h3><p className="receipt-muted">Official payment record</p></div><span className="receipt-paid">PAID</span></div><div className="receipt-grid"><div><span>Receipt number</span><strong>{receipt.receipt_number || "—"}</strong></div><div><span>Payment ID</span><strong>{receipt.payment_id ?? "—"}</strong></div><div><span>Student name</span><strong>{receipt.student_name || students.find(s => s.id === receipt.student_id)?.full_name || "—"}</strong></div><div><span>Registration number</span><strong>{receipt.registration_number || students.find(s => s.id === receipt.student_id)?.registration_number || "—"}</strong></div><div><span>Class & section</span><strong>{[receipt.class_name || students.find(s => s.id === receipt.student_id)?.class_name, receipt.section || students.find(s => s.id === receipt.student_id)?.section].filter(Boolean).join(" - ") || "—"}</strong></div><div><span>Payment date</span><strong>{receipt.paid_at ? new Date(receipt.paid_at).toLocaleString() : "—"}</strong></div><div><span>Payment method</span><strong>{String(receipt.payment_method || "—").replaceAll("_", " ")}</strong></div><div><span>Ledger ID</span><strong>{receipt.ledger_id ?? "—"}</strong></div><div className="receipt-amount"><span>Amount received</span><strong>{money(receipt.amount)}</strong></div></div><div className="receipt-actions"><button className="erp-secondary" type="button" onClick={() => window.print()}>Print receipt</button><button className="erp-secondary" type="button" onClick={() => setReceipt(null)}>Close</button></div></div>}
      </>}
    </section>
  )
}
