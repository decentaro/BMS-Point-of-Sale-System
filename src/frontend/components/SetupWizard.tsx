import React, { useState } from 'react'
import { Database, ExternalLink, CheckCircle, XCircle, Loader2, RefreshCw, Monitor } from 'lucide-react'
import { ModalKeyboard } from './ModalKeyboard'
import ApiClient from '../utils/ApiClient'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Credentials {
  dbUser: string
  dbPassword: string
  dbHost: string
  dbPort: string
  dbName: string
}

type Step = 'instructions' | 'credentials' | 'testing' | 'saving' | 'terminal' | 'done' | 'error'

// ─── Connection string parser ─────────────────────────────────────────────────

function parseConnectionString(raw: string): Credentials | null {
  try {
    const normalized = raw.trim().replace(/^postgresql:\/\//, 'http://').replace(/^postgres:\/\//, 'http://')
    const url = new URL(normalized)
    return {
      dbUser:     decodeURIComponent(url.username) || 'postgres',
      dbPassword: decodeURIComponent(url.password),
      dbHost:     url.hostname,
      dbPort:     url.port || '5432',
      dbName:     url.pathname.replace(/^\//, '') || 'postgres',
    }
  } catch {
    return null
  }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const StepRow: React.FC<{ num: string; label: string; active: boolean; done: boolean }> = ({ num, label, active, done }) => (
  <div className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors ${active ? 'bg-white/20' : ''}`}>
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-colors ${
      done   ? 'bg-emerald-400 text-white' :
      active ? 'bg-white text-emerald-700' :
               'bg-white/20 text-white/50'
    }`}>
      {done ? '✓' : num}
    </div>
    <span className={`text-xs font-medium transition-colors ${active ? 'text-white' : done ? 'text-white/80' : 'text-white/40'}`}>
      {label}
    </span>
  </div>
)

// ─── Restart button (shows spinner while API boots) ───────────────────────────

const RestartButton: React.FC = () => {
  const [restarting, setRestarting] = useState(false)
  const [elapsed, setElapsed]       = useState(0)

  const handleRestart = () => {
    setRestarting(true)
    const t = setInterval(() => setElapsed(s => s + 1), 1000)
    window.electronAPI.relaunchApp().finally(() => clearInterval(t))
  }

  return (
    <>
      <button
        disabled={restarting}
        onClick={handleRestart}
        className="mt-3 h-10 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
      >
        {restarting
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting API… ({elapsed}s)</>
          : <><RefreshCw className="w-4 h-4" /> Restart & Launch</>}
      </button>
      {restarting && (
        <p className="text-[10px] text-slate-400 text-center mt-1">
          Compiling — this may take up to a minute on first run.
        </p>
      )}
    </>
  )
}

// ─── Main wizard ──────────────────────────────────────────────────────────────

const SetupWizard: React.FC = () => {
  const [step, setStep]             = useState<Step>('instructions')
  const [inputMode, setInputMode]   = useState<'uri' | 'manual'>('uri')
  const [connString, setConnString] = useState('')
  const [creds, setCreds]           = useState<Credentials>({ dbUser: 'postgres', dbPassword: '', dbHost: '', dbPort: '5432', dbName: 'postgres' })
  const [parseError, setParseError] = useState('')
  const [testError, setTestError]   = useState('')
  const [saveError, setSaveError]   = useState('')

  // Terminal identity
  const [terminalId, setTerminalId]     = useState('')
  const [terminalName, setTerminalName] = useState('')
  const [terminalError, setTerminalError] = useState('')
  const [terminalSaving, setTerminalSaving] = useState(false)

  // Touch keyboard
  const [kbOpen, setKbOpen]   = useState(false)
  const [kbField, setKbField] = useState<'uri' | 'dbHost' | 'dbUser' | 'dbPassword' | 'terminalId' | 'terminalName' | null>(null)
  const kbInitial = kbField === 'uri' ? connString
    : kbField === 'terminalId' ? terminalId
    : kbField === 'terminalName' ? terminalName
    : kbField ? creds[kbField as keyof Credentials] : ''
  const openKb = (field: typeof kbField) => { setKbField(field); setKbOpen(true) }
  const submitKb = (val: string) => {
    if (kbField === 'uri') setConnString(val)
    else if (kbField === 'terminalId') setTerminalId(val.toUpperCase())
    else if (kbField === 'terminalName') setTerminalName(val)
    else if (kbField) setCreds(prev => ({ ...prev, [kbField]: val }))
    setKbOpen(false)
  }

  const stepIndex = { instructions: 0, credentials: 1, testing: 2, saving: 2, error: 2, terminal: 3, done: 4 }[step]

  const handleCredentialsNext = async () => {
    setParseError('')
    let resolved: Credentials

    if (inputMode === 'uri') {
      const parsed = parseConnectionString(connString)
      if (!parsed)               { setParseError('Could not parse the connection string. Make sure you copied the full URI.'); return }
      if (!parsed.dbPassword)    { setParseError('The connection string does not include a password.'); return }
      resolved = parsed
    } else {
      if (!creds.dbHost.trim())     { setParseError('Host is required.'); return }
      if (!creds.dbPassword.trim()) { setParseError('Password is required.'); return }
      resolved = creds
    }

    setCreds(resolved)
    setStep('testing')
    runTest(resolved)
  }

  const runTest = async (resolved: Credentials) => {
    setTestError('')
    try {
      const result = await window.electronAPI.testDbConnection(resolved.dbHost, resolved.dbPort, resolved.dbUser, resolved.dbPassword, resolved.dbName)
      if (result.reachable) {
        await runSave(resolved)
      } else {
        setTestError(result.error || 'Could not reach the database host.')
        setStep('error')
      }
    } catch (err: any) {
      setTestError(err?.message || 'Unexpected error during connection test.')
      setStep('error')
    }
  }

  const runSave = async (resolved: Credentials) => {
    setStep('saving')
    setSaveError('')
    try {
      const result = await window.electronAPI.saveEnv(resolved)
      if (result.success) {
        setStep('terminal')
      } else {
        setSaveError(result.error || 'Failed to save configuration.')
        setStep('error')
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Unexpected error while saving.')
      setStep('error')
    }
  }

  const handleTerminalNext = async () => {
    const id = terminalId.trim()
    const name = terminalName.trim()
    setTerminalError('')

    if (!id) { setTerminalError('Terminal ID is required.'); return }
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) {
      setTerminalError('Use only letters, numbers, hyphens or underscores (max 20 characters).')
      return
    }

    if (!window.electronAPI?.setTerminalConfig) { setStep('done'); return }

    setTerminalSaving(true)
    try {
      await window.electronAPI.setTerminalConfig({ terminalId: id, terminalName: name || null })
      ApiClient.setTerminalId(id, name || null)
      setStep('done')
    } catch (err: any) {
      setTerminalError(err?.message ?? 'Failed to save terminal identity.')
    } finally {
      setTerminalSaving(false)
    }
  }

  const retry = () => { setTestError(''); setSaveError(''); setStep('credentials') }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">

      {/* ── Left panel — branding + steps ── */}
      <div className="flex flex-col justify-between p-5 bg-emerald-700 w-52 flex-shrink-0">
        <div>
          {/* Brand */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Database className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">BMS POS</p>
              <p className="text-white/60 text-[10px]">First-time setup</p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-0.5">
            <StepRow num="1" label="Introduction"     active={stepIndex === 0} done={stepIndex > 0} />
            <StepRow num="2" label="Credentials"      active={stepIndex === 1} done={stepIndex > 1} />
            <StepRow num="3" label="Connect & Save"   active={stepIndex === 2} done={stepIndex > 2} />
            <StepRow num="4" label="Terminal Identity" active={stepIndex === 3} done={stepIndex > 3} />
            <StepRow num="5" label="Done"             active={stepIndex === 4} done={false} />
          </div>
        </div>

        <p className="text-white/30 text-[10px] leading-relaxed">
          This setup only runs once. Your credentials are saved locally and never shared.
        </p>
      </div>

      {/* ── Right panel — content ── */}
      <div className="flex-1 flex flex-col p-5 overflow-y-auto">

        {/* ── STEP: Instructions ─────────────────────────────────────────── */}
        {step === 'instructions' && (
          <div className="flex flex-col h-full">
            <h2 className="text-base font-bold text-slate-800 mb-1">Before you begin</h2>
            <p className="text-xs text-slate-500 mb-3">
              BMS POS uses <strong className="text-slate-700">Supabase</strong> as its database — it's free and takes about 5 minutes to set up.
            </p>

            <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2 flex-1">
              {[
                'Go to supabase.com and create a free account',
                'Click "New Project", give it a name (e.g. "BMS POS"), and choose the region closest to your location',
                'Set a database password — save it somewhere safe!',
                'Wait ~2 min for the project to be ready',
                'Go to Settings → Database → Connection pooling',
                'Set the pool mode to "Session" and copy the connection string (URI)',
              ].map((text, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-xs text-slate-600">{text}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                <ExternalLink className="w-3 h-3" />
                Open supabase.com
              </a>
              <button
                onClick={() => setStep('credentials')}
                className="h-9 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                I'm ready →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: Credentials ──────────────────────────────────────────── */}
        {step === 'credentials' && (
          <div className="flex flex-col h-full">
            <h2 className="text-base font-bold text-slate-800 mb-1">Enter your credentials</h2>
            <p className="text-xs text-slate-500 mb-3">Paste your connection string or enter the details manually.</p>

            {/* Mode toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs mb-3">
              <button
                onClick={() => setInputMode('uri')}
                className={`flex-1 py-1.5 font-medium transition-colors ${inputMode === 'uri' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Connection String
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={`flex-1 py-1.5 font-medium transition-colors ${inputMode === 'manual' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                Manual Entry
              </button>
            </div>

            {inputMode === 'uri' ? (
              <div className="flex-1">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                  Connection String (URI)
                </label>
                <div className="relative">
                  <textarea
                    rows={4}
                    value={connString}
                    onChange={e => setConnString(e.target.value)}
                    onClick={() => openKb('uri')}
                    placeholder="postgresql://postgres.xxxx:password@aws-0-region.pooler.supabase.com:5432/postgres"
                    className="w-full px-3 py-2 text-xs font-mono border-2 border-slate-200 rounded-lg focus:border-emerald-500 focus:outline-none resize-none"
                  />
                  <button
                    type="button"
                    onClick={async () => { try { const t = await navigator.clipboard.readText(); setConnString(t) } catch {} }}
                    className="absolute bottom-2 right-2 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-medium transition-colors"
                  >
                    Paste
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Settings → Database → Connection pooling → Session mode → URI
                </p>
              </div>
            ) : (
              <div className="flex-1 space-y-2">
                {([
                  { label: 'Database Host', key: 'dbHost',     placeholder: 'aws-0-region.pooler.supabase.com', hint: 'Settings → Database → Connection pooling → Host' },
                  { label: 'Database User', key: 'dbUser',     placeholder: 'postgres.yourprojectref',          hint: 'Settings → Database → Connection pooling → User' },
                  { label: 'Password',      key: 'dbPassword', placeholder: '••••••••',                         hint: 'The password you set when creating the project' },
                ] as const).map(({ label, key, placeholder, hint }) => (
                  <div key={key}>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5 block">{label}</label>
                    <div className="relative">
                      <input
                        type={key === 'dbPassword' ? 'password' : 'text'}
                        value={creds[key]}
                        onChange={e => setCreds(prev => ({ ...prev, [key]: e.target.value }))}
                        onClick={() => openKb(key)}
                        placeholder={placeholder}
                        className="w-full h-8 px-3 pr-14 text-xs border-2 border-slate-200 rounded-lg focus:border-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={async () => { try { const t = await navigator.clipboard.readText(); setCreds(prev => ({ ...prev, [key]: t.trim() })) } catch {} }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-medium transition-colors"
                      >
                        Paste
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
                  </div>
                ))}
              </div>
            )}

            {parseError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{parseError}</p>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button onClick={() => setStep('instructions')} className="h-9 px-4 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors">
                ← Back
              </button>
              <button onClick={handleCredentialsNext} className="flex-1 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors">
                Test Connection →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: Testing ──────────────────────────────────────────────── */}
        {step === 'testing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
            <div>
              <p className="font-semibold text-slate-800 text-sm">Testing connection…</p>
              <p className="text-xs text-slate-500 mt-0.5">Reaching {creds.dbHost}</p>
            </div>
          </div>
        )}

        {/* ── STEP: Saving ───────────────────────────────────────────────── */}
        {step === 'saving' && (
          <div className="flex-1 flex flex-col justify-center space-y-3">
            <h2 className="text-sm font-bold text-slate-800">Setting up…</h2>
            {[
              { label: 'Connection verified', done: true,  active: false },
              { label: 'Saving configuration', done: false, active: true  },
            ].map(({ label, done, active }) => (
              <div key={label} className="flex items-center gap-3">
                {done   ? <CheckCircle className="w-5 h-5 text-emerald-500" /> :
                 active ? <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" /> :
                          <div className="w-5 h-5 rounded-full border-2 border-slate-200" />}
                <span className={`text-sm ${done ? 'text-emerald-700 font-medium' : active ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── STEP: Terminal Identity ─────────────────────────────────────── */}
        {step === 'terminal' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2.5 mb-1">
              <Monitor className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <h2 className="text-base font-bold text-slate-800">Identify this terminal</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              If you run multiple registers on this database, each one needs a unique ID so sales, cash sessions, and Z-reports stay separate.
            </p>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 flex-1">
              {/* Terminal ID */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                  Terminal ID <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={terminalId}
                    onChange={e => setTerminalId(e.target.value.toUpperCase())}
                    onClick={() => openKb('terminalId')}
                    placeholder="e.g. T01"
                    className="w-full h-9 px-3 text-sm font-mono border-2 border-slate-200 rounded-lg focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Short unique code for this register — letters, numbers, - or _ (max 20). Examples: T01, COUNTER-1, POS-MAIN
                </p>
              </div>

              {/* Terminal Name */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                  Terminal Name <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={terminalName}
                  onChange={e => setTerminalName(e.target.value)}
                  onClick={() => openKb('terminalName')}
                  placeholder="e.g. Front Counter"
                  className="w-full h-9 px-3 text-sm border-2 border-slate-200 rounded-lg focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">Human-readable label shown in reports</p>
              </div>

              {/* Preview */}
              {terminalId.trim() && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    Session codes will look like: <span className="font-mono font-semibold">CS-20260321-{terminalId.trim()}-0001</span>
                  </div>
                </div>
              )}

              {/* Only 1 terminal note */}
              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-3">
                Only one terminal? You still need an ID — use <span className="font-mono">T01</span> or <span className="font-mono">MAIN</span>.
              </div>
            </div>

            {terminalError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-2">
                <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{terminalError}</p>
              </div>
            )}

            <button
              onClick={handleTerminalNext}
              disabled={terminalSaving}
              className="mt-3 h-10 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {terminalSaving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : 'Save & Continue →'}
            </button>
          </div>
        )}

        {/* ── STEP: Done ─────────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle className="w-8 h-8 text-emerald-500 flex-shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-slate-800">Setup complete!</h2>
                <p className="text-xs text-slate-500">Configuration saved successfully.</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-xs text-slate-600 space-y-1 flex-1">
              <p className="font-medium text-slate-700">What happens next:</p>
              <ul className="space-y-1 text-slate-500">
                <li>• The app will restart and connect to your database</li>
                <li>• All tables will be created automatically</li>
                <li>• A default admin account will be created</li>
              </ul>
              {terminalId && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="font-medium text-slate-700">Terminal identity</p>
                  <p className="mt-0.5">
                    ID: <span className="font-mono font-bold text-slate-800">{terminalId}</span>
                    {terminalName && <> &nbsp;·&nbsp; Name: <span className="font-bold text-slate-800">{terminalName}</span></>}
                  </p>
                </div>
              )}
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="font-medium text-slate-700">Default admin credentials</p>
                <p className="mt-0.5">Employee ID: <span className="font-mono font-bold text-slate-800">0001</span> &nbsp;·&nbsp; PIN: <span className="font-mono font-bold text-slate-800">1234</span></p>
                <p className="text-[10px] text-slate-400 mt-0.5">Change the PIN immediately after first login.</p>
              </div>
            </div>

            <RestartButton />
          </div>
        )}

        {/* ── STEP: Error ────────────────────────────────────────────────── */}
        {step === 'error' && (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 mb-3">
              <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-slate-800">Connection failed</h2>
                <p className="text-xs text-red-600">{testError || saveError}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 text-xs space-y-1 flex-1">
              <p className="font-medium text-slate-700">Things to check:</p>
              <ul className="space-y-1 text-slate-500">
                <li>• The host is copied exactly from Supabase</li>
                <li>• The project is fully created (takes ~2 min)</li>
                <li>• Your internet connection is working</li>
                <li>• The password doesn't have special characters</li>
              </ul>
            </div>

            <button
              onClick={retry}
              className="mt-3 h-10 w-full bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              ← Try Again
            </button>
          </div>
        )}

      </div>

      <ModalKeyboard
        open={kbOpen}
        type="qwerty"
        title={
          kbField === 'uri'          ? 'Connection String' :
          kbField === 'dbPassword'   ? 'Password' :
          kbField === 'dbHost'       ? 'Database Host' :
          kbField === 'terminalId'   ? 'Terminal ID' :
          kbField === 'terminalName' ? 'Terminal Name' :
                                       'Database User'
        }
        initialValue={kbInitial as string}
        masked={kbField === 'dbPassword'}
        onSubmit={submitKb}
        onClose={() => setKbOpen(false)}
      />
    </div>
  )
}

export default SetupWizard
