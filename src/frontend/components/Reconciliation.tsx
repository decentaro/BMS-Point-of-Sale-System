import React from 'react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { formatCurrency } from '../utils/formatCurrency'
import { useToast } from '../contexts/ToastContext'
import ApiClient from '../utils/ApiClient'
import SessionManager from '../utils/SessionManager'
import { generateZReportReceipt } from '../utils/receiptFormatter'
import HybridInput from './HybridInput'
import ModalKeyboard, { KeyboardType } from './ModalKeyboard'
import { SectionLoader } from './ui/LoadingSpinner'
import {
  CalendarDays, CheckCircle2, Clock, AlertTriangle, ChevronRight,
  Banknote, CreditCard, TrendingUp, Loader2, Download, Printer
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ZReportPaymentBreakdown {
  paymentMethod: string
  transactionCount: number
  totalAmount: number
}

interface ZReport {
  date: string
  sessionId: number | null
  sessionCode: string
  sessionStatus: string
  openedByEmployeeName: string | null
  closedByEmployeeName: string | null
  openedAt: string | null
  closedAt: string | null
  openingCash: number
  closingCash: number | null
  totalTransactions: number
  grossSales: number
  totalDiscounts: number
  netSales: number
  totalTax: number
  totalReturns: number
  totalRefunds: number
  cashSales: number
  cardSales: number
  paymentBreakdown: ZReportPaymentBreakdown[]
  expectedClosingCash: number
  cashVariance: number | null
  notes: string | null
}

interface ZReportSummaryRow {
  date: string
  sessionCode: string
  sessionStatus: string
  totalTransactions: number
  grossSales: number
  totalDiscounts: number
  netSales: number
  totalTax: number
  totalReturns: number
  totalRefunds: number
  cashSales: number
  cardSales: number
  openingCash: number
  closingCash: number | null
  expectedClosingCash: number
  cashVariance: number | null
}

interface CashSession {
  id: number
  sessionCode: string
  sessionDate: string
  openedByEmployeeName: string
  closedByEmployeeName: string | null
  openedAt: string
  closedAt: string | null
  openingCash: number
  closingCash: number | null
  status: string
  notes: string | null
}

type ViewMode = 'single' | 'range'

// ─── Helpers ───────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Parse a date string using local noon to avoid UTC-midnight timezone shifts */
function parseDateLocal(iso: string): Date {
  return new Date(iso.slice(0, 10) + 'T12:00:00')
}

function fmtDate(iso: string): string {
  return parseDateLocal(iso).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const StatusBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, { cls: string; icon: React.ElementType }> = {
    'Open':       { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Clock },
    'Closed':     { cls: 'bg-slate-100 text-slate-600 border-slate-200',     icon: CheckCircle2 },
    'No Session': { cls: 'bg-amber-50 text-amber-700 border-amber-200',      icon: AlertTriangle },
  }
  const { cls, icon: Icon } = cfg[status] ?? cfg['No Session']
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  )
}

// ─── Variance colour helper ────────────────────────────────────────────────
function varianceColour(variance: number | null): string {
  if (variance === null) return 'text-slate-400'
  if (Math.abs(variance) < 0.01) return 'text-emerald-600'
  if (variance > 0) return 'text-blue-600'
  return 'text-red-600'
}

// ─── Component ─────────────────────────────────────────────────────────────

const Reconciliation: React.FC = () => {
  const { showToast } = useToast()

  const [viewMode, setViewMode] = React.useState<ViewMode>('single')
  const [selectedDate, setSelectedDate] = React.useState<string>(todayIso())
  const [rangeStart, setRangeStart] = React.useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 6)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [rangeEnd, setRangeEnd] = React.useState<string>(todayIso())

  const [loadingReport, setLoadingReport] = React.useState(false)
  const [loadingRange, setLoadingRange] = React.useState(false)
  const [zReport, setZReport] = React.useState<ZReport | null>(null)
  const [rangeRows, setRangeRows] = React.useState<ZReportSummaryRow[]>([])
  const [printing, setPrinting] = React.useState(false)

  // ── Keyboard state (top-level so ModalKeyboard renders outside nested cards) ──
  type KbTarget = 'openingCash' | 'openNotes' | 'closingCash' | 'closeNotes'
  const [kbOpen, setKbOpen] = React.useState(false)
  const [kbType, setKbType] = React.useState<KeyboardType>('decimal')
  const [kbTitle, setKbTitle] = React.useState('')
  const [kbTarget, setKbTarget] = React.useState<KbTarget>('openingCash')

  const openKb = (target: KbTarget, type: KeyboardType, title: string) => {
    setKbTarget(target); setKbType(type); setKbTitle(title); setKbOpen(true)
  }

  const applyKb = (value: string) => {
    if (kbTarget === 'openingCash') setOpeningCash(value)
    else if (kbTarget === 'openNotes') setOpenNotes(value)
    else if (kbTarget === 'closingCash') setClosingCash(value)
    else if (kbTarget === 'closeNotes') setCloseNotes(value)
    setKbOpen(false)
  }

  const kbInitialValue = () => {
    if (kbTarget === 'openingCash') return openingCash
    if (kbTarget === 'openNotes') return openNotes
    if (kbTarget === 'closingCash') return closingCash
    if (kbTarget === 'closeNotes') return closeNotes
    return ''
  }

  // Open session form
  const [showOpenForm, setShowOpenForm] = React.useState(false)
  const [openingCash, setOpeningCash] = React.useState('0')
  const [openNotes, setOpenNotes] = React.useState('')
  const [savingOpen, setSavingOpen] = React.useState(false)

  // Close session form
  const [showCloseForm, setShowCloseForm] = React.useState(false)
  const [closingCash, setClosingCash] = React.useState('')
  const [closeNotes, setCloseNotes] = React.useState('')
  const [savingClose, setSavingClose] = React.useState(false)

  // ── Fetch Z-report for selected date ──────────────────────────────────────
  const fetchZReport = React.useCallback(async (date: string) => {
    setLoadingReport(true)
    setZReport(null)
    try {
      const data = await ApiClient.getJson<ZReport>(`/reports/z-report?date=${date}`)
      setZReport(data)
    } catch (err) {
      showToast('Failed to load Z-Report', 'error')
    } finally {
      setLoadingReport(false)
    }
  }, [showToast])

  // ── Fetch range summary ────────────────────────────────────────────────────
  const fetchRange = React.useCallback(async () => {
    setLoadingRange(true)
    setRangeRows([])
    try {
      const data = await ApiClient.getJson<ZReportSummaryRow[]>(
        `/reports/z-report-range?startDate=${rangeStart}&endDate=${rangeEnd}`
      )
      setRangeRows(data)
    } catch (err) {
      showToast('Failed to load date range report', 'error')
    } finally {
      setLoadingRange(false)
    }
  }, [rangeStart, rangeEnd, showToast])

  React.useEffect(() => {
    if (viewMode === 'single') fetchZReport(selectedDate)
  }, [viewMode, selectedDate, fetchZReport])

  React.useEffect(() => {
    if (viewMode === 'range') fetchRange()
  }, [viewMode, fetchRange])

  // ── Open session ───────────────────────────────────────────────────────────
  const handleOpenSession = async () => {
    const session = SessionManager.getCurrentSession()
    if (!session) return
    setSavingOpen(true)
    try {
      await ApiClient.postJson<CashSession>('/cash-sessions/open', {
        employeeId: session.id,
        openingCash: parseFloat(openingCash) || 0,
        notes: openNotes || null
      })
      showToast('Cash session opened', 'success')
      setShowOpenForm(false)
      setOpeningCash('0')
      setOpenNotes('')
      fetchZReport(selectedDate)
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      if (msg.includes('already exists')) showToast('A session already exists for today', 'warning')
      else showToast('Failed to open session', 'error')
    } finally {
      setSavingOpen(false)
    }
  }

  // ── Close session ──────────────────────────────────────────────────────────
  const handleCloseSession = async () => {
    if (!zReport?.sessionId) return
    const session = SessionManager.getCurrentSession()
    if (!session) return
    setSavingClose(true)
    try {
      await ApiClient.putJson<CashSession>(`/cash-sessions/${zReport.sessionId}/close`, {
        closedByEmployeeId: session.id,
        closingCash: parseFloat(closingCash) || 0,
        notes: closeNotes || null
      })
      showToast('Session closed successfully', 'success')
      setShowCloseForm(false)
      setClosingCash('')
      setCloseNotes('')
      fetchZReport(selectedDate)
    } catch (err) {
      showToast('Failed to close session', 'error')
    } finally {
      setSavingClose(false)
    }
  }

  // ── Print Z-report ─────────────────────────────────────────────────────────
  const handlePrint = async () => {
    if (!zReport || !window.electronAPI) return
    setPrinting(true)
    try {
      const settings = await ApiClient.getJson<unknown>('/system-settings', false)
      const receipt = generateZReportReceipt(zReport, settings as Parameters<typeof generateZReportReceipt>[1])
      const result = await window.electronAPI.printReceipt(receipt)
      if (!result.success) showToast(result.message || 'Print failed', 'error')
      else showToast('Z-Report printed', 'success')
    } catch {
      showToast('Print failed', 'error')
    } finally {
      setPrinting(false)
    }
  }

  // ── Export range CSV ───────────────────────────────────────────────────────
  const exportRangeCSV = () => {
    if (rangeRows.length === 0) return
    const header = 'Date,Session,Status,Transactions,Gross Sales,Discounts,Net Sales,Tax,Returns,Refunds,Cash Sales,Card Sales,Opening Cash,Expected Closing,Actual Closing,Variance'
    const rows = rangeRows.map(r => [
      r.date.slice(0, 10),
      r.sessionCode || 'N/A',
      r.sessionStatus,
      r.totalTransactions,
      r.grossSales.toFixed(2),
      r.totalDiscounts.toFixed(2),
      r.netSales.toFixed(2),
      r.totalTax.toFixed(2),
      r.totalReturns,
      r.totalRefunds.toFixed(2),
      r.cashSales.toFixed(2),
      r.cardSales.toFixed(2),
      r.openingCash.toFixed(2),
      r.expectedClosingCash.toFixed(2),
      r.closingCash != null ? r.closingCash.toFixed(2) : '',
      r.cashVariance != null ? r.cashVariance.toFixed(2) : ''
    ].join(','))
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `z-report-${rangeStart}-to-${rangeEnd}.csv`
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Mode toggle + date controls ─────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">

            {/* Toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['single', 'range'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {mode === 'single' ? 'Single Day' : 'Date Range'}
                </button>
              ))}
            </div>

            {viewMode === 'single' ? (
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={selectedDate}
                  max={todayIso()}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <input
                  type="date"
                  value={rangeStart}
                  max={rangeEnd}
                  onChange={e => setRangeStart(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="text-slate-400 text-sm">to</span>
                <input
                  type="date"
                  value={rangeEnd}
                  max={todayIso()}
                  min={rangeStart}
                  onChange={e => setRangeEnd(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <Button size="sm" variant="outline" onClick={fetchRange} disabled={loadingRange}
                  className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50">
                  {loadingRange ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  Apply
                </Button>
                {rangeRows.length > 0 && (
                  <Button size="sm" variant="outline" onClick={exportRangeCSV}
                    className="gap-1.5 text-slate-600 border-slate-300 hover:bg-slate-50">
                    <Download className="w-3.5 h-3.5" /> CSV
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Single-day Z-Report ─────────────────────────────────────────── */}
      {viewMode === 'single' && (
        <>
          {loadingReport ? (
            <SectionLoader message="Loading Z-Report…" />
          ) : zReport ? (
            <ZReportPanel
              report={zReport}
              showOpenForm={showOpenForm}
              setShowOpenForm={setShowOpenForm}
              openingCash={openingCash}
              setOpeningCash={setOpeningCash}
              openNotes={openNotes}
              setOpenNotes={setOpenNotes}
              savingOpen={savingOpen}
              onOpenSession={handleOpenSession}
              showCloseForm={showCloseForm}
              setShowCloseForm={setShowCloseForm}
              closingCash={closingCash}
              setClosingCash={setClosingCash}
              closeNotes={closeNotes}
              setCloseNotes={setCloseNotes}
              savingClose={savingClose}
              onCloseSession={handleCloseSession}
              onPrint={handlePrint}
              printing={printing}
              onOpenKb={openKb}
            />
          ) : null}
        </>
      )}

      {/* ── Date range table ────────────────────────────────────────────── */}
      {viewMode === 'range' && (
        <>
          {loadingRange ? (
            <SectionLoader message="Loading range report…" />
          ) : rangeRows.length > 0 ? (
            <RangeTable rows={rangeRows} />
          ) : (
            <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
              <CalendarDays className="w-8 h-8 opacity-40" />
              <p className="text-sm">Select a date range and click Apply</p>
            </div>
          )}
        </>
      )}

      <ModalKeyboard
        open={kbOpen}
        type={kbType}
        title={kbTitle}
        initialValue={kbInitialValue()}
        onSubmit={applyKb}
        onClose={() => setKbOpen(false)}
      />
    </div>
  )
}

// ─── Z-Report Panel ────────────────────────────────────────────────────────

interface ZReportPanelProps {
  report: ZReport
  showOpenForm: boolean; setShowOpenForm: (v: boolean) => void
  openingCash: string; setOpeningCash: (v: string) => void
  openNotes: string; setOpenNotes: (v: string) => void
  savingOpen: boolean; onOpenSession: () => void
  showCloseForm: boolean; setShowCloseForm: (v: boolean) => void
  closingCash: string; setClosingCash: (v: string) => void
  closeNotes: string; setCloseNotes: (v: string) => void
  savingClose: boolean; onCloseSession: () => void
  onPrint: () => void; printing: boolean
  onOpenKb: (target: 'openingCash' | 'openNotes' | 'closingCash' | 'closeNotes', type: KeyboardType, title: string) => void
}

const ZReportPanel: React.FC<ZReportPanelProps> = ({
  report, showOpenForm, setShowOpenForm, openingCash, setOpeningCash,
  openNotes, setOpenNotes, savingOpen, onOpenSession,
  showCloseForm, setShowCloseForm, closingCash, setClosingCash,
  closeNotes, setCloseNotes, savingClose, onCloseSession,
  onPrint, printing, onOpenKb
}) => {
  const isToday = report.date.slice(0, 10) === todayIso()

  // Live variance preview while typing
  const previewVariance = closingCash !== ''
    ? parseFloat(closingCash) - report.expectedClosingCash
    : null

  return (
    <div className="space-y-4">

      {/* ── Session status card ─────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-semibold text-slate-800">
                  {fmtDate(report.date)}
                </h3>
                <StatusBadge status={report.sessionStatus} />
              </div>
              {report.sessionCode ? (
                <p className="text-xs text-slate-400 font-mono">{report.sessionCode}</p>
              ) : null}
              {report.openedAt && (
                <p className="text-xs text-slate-500 mt-1">
                  Opened {fmtDateTime(report.openedAt)}
                  {report.openedByEmployeeName ? ` by ${report.openedByEmployeeName}` : ''}
                </p>
              )}
              {report.closedAt && (
                <p className="text-xs text-slate-500">
                  Closed {fmtDateTime(report.closedAt)}
                  {report.closedByEmployeeName ? ` by ${report.closedByEmployeeName}` : ''}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-shrink-0">
              {report.sessionStatus === 'No Session' && isToday && (
                <Button
                  size="sm"
                  onClick={() => setShowOpenForm(!showOpenForm)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <Banknote className="w-3.5 h-3.5" />
                  Open Session
                </Button>
              )}
              {report.sessionStatus === 'Open' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCloseForm(!showCloseForm)}
                  className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Close Session
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onPrint}
                disabled={printing || !window.electronAPI}
                className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
                title={!window.electronAPI ? 'Printer only available in desktop app' : 'Print Z-Report'}
              >
                {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                Print
              </Button>
            </div>
          </div>

          {/* Open session form */}
          {showOpenForm && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Open New Session</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Opening Cash</label>
                  <HybridInput
                    value={openingCash}
                    onChange={setOpeningCash}
                    onTouchKeyboard={() => onOpenKb('openingCash', 'decimal', 'Opening Cash')}
                    type="decimal"
                    placeholder="0.00"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Notes (optional)</label>
                  <HybridInput
                    value={openNotes}
                    onChange={setOpenNotes}
                    onTouchKeyboard={() => onOpenKb('openNotes', 'qwerty', 'Notes')}
                    type="text"
                    placeholder="Any notes…"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={onOpenSession}
                  disabled={savingOpen}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  {savingOpen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />}
                  Confirm Open
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowOpenForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Sales summary ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <SectionLabel icon={TrendingUp} label="Sales Summary" />
            <div className="space-y-2 mt-3">
              <InfoRow label="Total Transactions" value={String(report.totalTransactions)} />
              <InfoRow label="Gross Sales" value={formatCurrency(report.grossSales)} />
              <InfoRow label="Discounts" value={`-${formatCurrency(report.totalDiscounts)}`} valueClass="text-amber-600" />
              <div className="border-t border-slate-100 pt-2 mt-2">
                <InfoRow label="Net Sales" value={formatCurrency(report.netSales)} valueClass="font-semibold text-slate-800" />
                <InfoRow label="Tax Collected" value={formatCurrency(report.totalTax)} />
              </div>
              {(report.totalReturns > 0 || report.totalRefunds > 0) && (
                <div className="border-t border-slate-100 pt-2 mt-2">
                  <InfoRow label="Returns" value={String(report.totalReturns)} />
                  <InfoRow label="Total Refunds" value={`-${formatCurrency(report.totalRefunds)}`} valueClass="text-red-500" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <SectionLabel icon={CreditCard} label="Payment Breakdown" />
            {report.paymentBreakdown.length > 0 ? (
              <div className="space-y-2 mt-3">
                {report.paymentBreakdown.map(p => (
                  <div key={p.paymentMethod} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {p.paymentMethod === 'Cash'
                        ? <Banknote className="w-4 h-4 text-emerald-500" />
                        : <CreditCard className="w-4 h-4 text-blue-500" />
                      }
                      <span className="text-sm text-slate-700">{p.paymentMethod}</span>
                      <span className="text-xs text-slate-400">{p.transactionCount} txn</span>
                    </div>
                    <span className="text-sm font-medium text-slate-800">{formatCurrency(p.totalAmount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-3">No sales for this date</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Cash reconciliation ─────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <SectionLabel icon={Banknote} label="Cash Reconciliation" />
          <div className="grid grid-cols-2 gap-8 mt-4">

            {/* Calculation side */}
            <div className="space-y-2">
              <InfoRow label="Opening Cash" value={formatCurrency(report.openingCash)} />
              <InfoRow label="+ Cash Sales" value={formatCurrency(report.cashSales)} valueClass="text-emerald-600" />
              {report.totalRefunds > 0 && (
                <InfoRow label="− Cash Refunds" value={formatCurrency(report.totalRefunds)} valueClass="text-red-500" />
              )}
              <div className="border-t border-slate-200 pt-2 mt-2">
                <InfoRow
                  label="Expected Closing Cash"
                  value={formatCurrency(report.expectedClosingCash)}
                  valueClass="font-semibold text-slate-800"
                />
              </div>
              {report.closingCash != null && (
                <>
                  <InfoRow label="Actual Closing Cash" value={formatCurrency(report.closingCash)} valueClass="font-semibold text-slate-800" />
                  <InfoRow
                    label="Variance"
                    value={(report.cashVariance !== null && report.cashVariance !== 0)
                      ? `${report.cashVariance > 0 ? '+' : ''}${formatCurrency(report.cashVariance)}`
                      : '✓ Balanced'
                    }
                    valueClass={varianceColour(report.cashVariance)}
                  />
                </>
              )}
            </div>

            {/* Close session form side */}
            <div>
              {report.sessionStatus === 'Open' && showCloseForm ? (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Close Session</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Actual Cash Count</label>
                      <HybridInput
                        value={closingCash}
                        onChange={setClosingCash}
                        onTouchKeyboard={() => onOpenKb('closingCash', 'decimal', 'Actual Cash Count')}
                        type="decimal"
                        placeholder="0.00"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      {previewVariance !== null && (
                        <p className={`text-xs mt-1 ${varianceColour(previewVariance)}`}>
                          Variance: {previewVariance >= 0 ? '+' : ''}{formatCurrency(previewVariance)}
                          {Math.abs(previewVariance) < 0.01 ? ' (balanced)' : previewVariance > 0 ? ' (over)' : ' (short)'}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Notes (optional)</label>
                      <HybridInput
                        value={closeNotes}
                        onChange={setCloseNotes}
                        onTouchKeyboard={() => onOpenKb('closeNotes', 'qwerty', 'Notes')}
                        type="text"
                        placeholder="Any notes or explanation for variance…"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={onCloseSession}
                        disabled={savingClose || closingCash === ''}
                        className="bg-slate-700 hover:bg-slate-800 text-white gap-1.5"
                      >
                        {savingClose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Confirm Close
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowCloseForm(false)}>Cancel</Button>
                    </div>
                  </div>
                </div>
              ) : report.sessionStatus === 'Open' ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-4">
                  <p className="text-sm text-slate-500 text-center">Ready to close the day?</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCloseForm(true)}
                    className="border-slate-300 text-slate-700 hover:bg-slate-50 gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Enter Cash Count
                  </Button>
                </div>
              ) : report.sessionStatus === 'No Session' ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                  <p className="text-sm text-slate-400 text-center">No session recorded for this date</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <p className="text-sm text-slate-500 text-center">Session closed</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Range Table ───────────────────────────────────────────────────────────

const RangeTable: React.FC<{ rows: ZReportSummaryRow[] }> = ({ rows }) => {
  const totals = rows.reduce(
    (acc, r) => ({
      totalTransactions: acc.totalTransactions + r.totalTransactions,
      netSales: acc.netSales + r.netSales,
      totalTax: acc.totalTax + r.totalTax,
      totalDiscounts: acc.totalDiscounts + r.totalDiscounts,
      totalReturns: acc.totalReturns + r.totalReturns,
      totalRefunds: acc.totalRefunds + r.totalRefunds,
      cashSales: acc.cashSales + r.cashSales,
      cardSales: acc.cardSales + r.cardSales,
    }),
    { totalTransactions: 0, netSales: 0, totalTax: 0, totalDiscounts: 0, totalReturns: 0, totalRefunds: 0, cashSales: 0, cardSales: 0 }
  )

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Session</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Txns</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Net Sales</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Tax</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Cash</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Card</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Refunds</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.date} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">
                    {parseDateLocal(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={r.sessionStatus} />
                  </td>
                  <td className="px-3 py-3 text-right text-slate-700">{r.totalTransactions}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-800">{formatCurrency(r.netSales)}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{formatCurrency(r.totalTax)}</td>
                  <td className="px-3 py-3 text-right text-emerald-700">{formatCurrency(r.cashSales)}</td>
                  <td className="px-3 py-3 text-right text-blue-700">{formatCurrency(r.cardSales)}</td>
                  <td className="px-3 py-3 text-right text-red-500">
                    {r.totalRefunds > 0 ? `-${formatCurrency(r.totalRefunds)}` : '—'}
                  </td>
                  <td className={`px-3 py-3 text-right font-medium ${varianceColour(r.cashVariance)}`}>
                    {r.cashVariance != null
                      ? `${r.cashVariance >= 0 ? '+' : ''}${formatCurrency(r.cashVariance)}`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="px-4 py-3 text-xs font-bold text-slate-500 uppercase" colSpan={2}>Totals</td>
                <td className="px-3 py-3 text-right font-bold text-slate-800">{totals.totalTransactions}</td>
                <td className="px-3 py-3 text-right font-bold text-slate-800">{formatCurrency(totals.netSales)}</td>
                <td className="px-3 py-3 text-right font-bold text-slate-700">{formatCurrency(totals.totalTax)}</td>
                <td className="px-3 py-3 text-right font-bold text-emerald-700">{formatCurrency(totals.cashSales)}</td>
                <td className="px-3 py-3 text-right font-bold text-blue-700">{formatCurrency(totals.cardSales)}</td>
                <td className="px-3 py-3 text-right font-bold text-red-500">
                  {totals.totalRefunds > 0 ? `-${formatCurrency(totals.totalRefunds)}` : '—'}
                </td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Micro helpers ─────────────────────────────────────────────────────────

const SectionLabel = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <div className="flex items-center gap-2 text-slate-600 mb-1">
    <Icon className="w-4 h-4" />
    <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
  </div>
)

const InfoRow = ({ label, value, valueClass = 'text-slate-700' }: {
  label: string; value: string; valueClass?: string
}) => (
  <div className="flex justify-between items-center py-0.5">
    <span className="text-sm text-slate-500">{label}</span>
    <span className={`text-sm ${valueClass}`}>{value}</span>
  </div>
)

export default Reconciliation
