import React, { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Cell,
} from 'recharts'
import { api, getToken, setToken } from './api'
import AuthScreen from './AuthScreen'

// ─────────────────────────────────────────────────────────────────────────
// UI Primitives
// ─────────────────────────────────────────────────────────────────────────
function Card({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-brand-sky/30 p-6 ${className}`}>
      {children}
    </div>
  )
}

function Badge({ status }) {
  const map = {
    PASS:              'bg-green-100 text-green-700',
    WARN:              'bg-amber-100 text-amber-700',
    HIGH:              'bg-red-100 text-red-700',
    MED:               'bg-amber-100 text-amber-700',
    LOW:               'bg-blue-100 text-blue-700',
    RELIABLE:          'bg-green-100 text-green-700',
    UNRELIABLE:        'bg-amber-100 text-amber-700',
    CANNIBALIZATION:   'bg-red-100 text-red-700',
    KOMPLEMEN:         'bg-green-100 text-green-700',
    'Tidak Signifikan':'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}

function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className={`rounded-2xl p-5 ${accent ? 'bg-brand-blue text-white' : 'bg-white border border-gray-100'}`}
         style={!accent ? { boxShadow: '0 1px 4px rgba(0,0,0,0.04)' } : {}}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-sm ${accent ? 'text-brand-sky' : 'text-gray-400'}`}>{label}</p>
        {icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            accent ? 'bg-white/15' : 'bg-blue-50 border border-blue-100'
          }`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`text-3xl font-bold ${accent ? 'text-white' : 'text-brand-blue'}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${accent ? 'text-brand-sky/80' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

function Spinner({ label = 'Memproses...' }) {
  return (
    <div className="flex items-center gap-3 text-brand-blue py-10 justify-center">
      <div className="w-5 h-5 border-2 border-brand-sky border-t-brand-blue rounded-full animate-spin" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// InsightCard — AI insight kontekstual kecil, dipakai per-halaman
// (Dashboard / Analisis / Simulator). Berbeda dari halaman "AI Insights"
// yang menggabungkan semua hasil analisis jadi rekomendasi besar.
// ─────────────────────────────────────────────────────────────────────────
function InsightCard({ title = 'AI Insight', hint, context, datasetId, data, cachedText, ready = true }) {
  const [text, setText]       = useState(cachedText || null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => { setText(cachedText || null) }, [cachedText])

  async function run() {
    setLoading(true); setError(null)
    try {
      const res = await api.aiInsight(datasetId, context, data)
      setText(res.insight)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const sparkIcon = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 20 L10.5 12.5 L3 11 L10.5 9.5 Z"/>
    </svg>
  )

  return (
    <div
      className="rounded-2xl border border-brand-sky/40 p-4"
      style={{ background: 'linear-gradient(135deg, rgba(148,207,229,0.12), rgba(255,255,255,1))' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-brand-blue text-white flex items-center justify-center flex-shrink-0">
            {sparkIcon}
          </span>
          <p className="text-xs font-semibold text-brand-blue">{title}</p>
        </div>
        {text && !loading && (
          <button
            onClick={run}
            className="text-[11px] text-brand-blue/70 hover:text-brand-blue transition flex-shrink-0"
          >
            ↺ Regenerate
          </button>
        )}
      </div>

      {!text && !loading && (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">{hint || 'Minta AI jelaskan pola dari data di halaman ini.'}</p>
          <button
            onClick={run}
            disabled={!ready}
            className="bg-brand-blue text-white px-3 py-1.5 rounded-full text-[11px] font-medium hover:opacity-90 transition disabled:opacity-40 flex-shrink-0 whitespace-nowrap"
          >
            Jelaskan dengan AI
          </button>
        </div>
      )}

      {loading && (
        <div className="mt-2.5 flex items-center gap-2 text-brand-blue">
          <div className="w-3.5 h-3.5 border-2 border-brand-sky border-t-brand-blue rounded-full animate-spin" />
          <span className="text-xs">Gemini sedang menganalisis...</span>
        </div>
      )}

      {text && !loading && (
        <p className="text-xs text-gray-700 leading-relaxed mt-2.5">{text}</p>
      )}

      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
    </div>
  )
}

function Breadcrumb({ items }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span>/</span>}
          <span className={i === items.length - 1 ? 'text-brand-blue font-medium' : ''}>{item}</span>
        </span>
      ))}
    </div>
  )
}

function MaplLogo({ size = 'md' }) {
  const sizes = {
    sm: { text: 'text-base' },
    md: { text: 'text-lg' },
    lg: { text: 'text-2xl' },
  }
  const s = sizes[size]
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 32, height: 32, flexShrink: 0 }}>
        <polyline points="4,24 9,13 15,20 21,11 27,16" stroke="#94CFE5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <circle cx="15" cy="9" r="3" fill="#004996"/>
        <polyline points="22,8 27,8 27,13" stroke="#004996" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <span className={`font-bold text-brand-blue ${s.text}`}>
        MAPL<span className="text-brand-sky">+</span>
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'dashboard',   label: 'Overview',
    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { key: 'analysis',    label: 'Analisis',
    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  { key: 'simulator',   label: 'Simulator',
    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg> },
  { key: 'ai',          label: 'AI Insights',
    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 20 L10.5 12.5 L3 11 L10.5 9.5 Z"/><path d="M19 2 L19.8 5.2 L23 6 L19.8 6.8 L19 10 L18.2 6.8 L15 6 L18.2 5.2 Z"/><path d="M5 17 L5.6 19.4 L8 20 L5.6 20.6 L5 23 L4.4 20.6 L2 20 L4.4 19.4 Z"/></svg> },
  { key: 'settings',    label: 'Settings',
    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> },
]

const SB = {
  bg:           '#0F2D6B',
  bgActive:     '#FFFFFF',
  bgHover:      'rgba(255,255,255,0.07)',
  border:       'rgba(255,255,255,0.1)',
  text:         'rgba(255,255,255,0.65)',
  textActive:   '#0F2D6B',
  textLabel:    'rgba(255,255,255,0.35)',
  accent:       '#94CFE5',
  statBg:       'rgba(255,255,255,0.08)',
  profileBg:    'rgba(255,255,255,0.08)',
  avatarBg:     'rgba(255,255,255,0.2)',
  uploadBorder: 'rgba(148,207,229,0.5)',
}

function Sidebar({ datasets, activeId, activeNav, onSelect, onUploaded, onDeleted, username, onLogout, onNav }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const initials = username ? username.slice(0, 2).toUpperCase() : 'U'
  const totalAnalyzed = datasets.filter(d => d.has_cannibalization || d.has_forecast).length

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true); setError(null)
    try { onUploaded(await api.uploadDataset(file)) }
    catch (err) { setError(err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  async function handleDelete(id, e) {
    e.stopPropagation()
    if (!confirm('Hapus dataset ini?')) return
    await api.deleteDataset(id)
    onDeleted(id)
  }

  return (
    <aside style={{ width: 240, background: '#0F2D6B', display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0, fontFamily: 'Poppins, sans-serif', flexShrink: 0 }}>

      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${SB.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 38, height: 38, flexShrink: 0 }}>
            <polyline points="4,24 9,13 15,20 21,11 27,16" stroke="#94CFE5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="15" cy="9" r="3" fill="#FFFFFF"/>
            <polyline points="22,8 27,8 27,13" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <div>
            <p style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, lineHeight: 1.1, letterSpacing: '-0.5px' }}>
              MAPL<span style={{ color: '#94CFE5' }}>+</span>
            </p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>v2.0</p>
          </div>
        </div>
      </div>

      {/* User profile */}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ background: SB.profileBg, borderRadius: 14, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', background: SB.avatarBg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#fff', margin: 0 }}>Halo, {username}!</p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', margin: '2px 0 0' }}>{username?.toLowerCase()}@gmail.com</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['Datasets', datasets.length], ['Analyses', totalAnalyzed], ['Alerts', 0]].map(([label, val]) => (
              <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 4px', textAlign: 'center' }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>{val}</p>
                <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: '4px 10px 6px' }}>
        <p style={{ fontSize: 9, fontWeight: 600, color: SB.textLabel, textTransform: 'uppercase', letterSpacing: '0.8px', padding: '0 6px', margin: '0 0 4px' }}>Menu</p>
        <nav>
          {NAV_ITEMS.map(({ key, label, svg }) => {
            const isActive = activeNav === key
            return (
              <button
                key={key}
                onClick={() => onNav(key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: isActive ? 600 : 400, fontFamily: 'Poppins, sans-serif',
                  background: isActive ? '#FFFFFF' : 'transparent',
                  color: isActive ? '#0F2D6B' : SB.text,
                  marginBottom: 1, transition: 'all 0.15s', textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = SB.bgHover; e.currentTarget.style.color = '#fff' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = SB.text } }}
              >
                <span style={{ color: isActive ? '#0F2D6B' : 'inherit', opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>{svg}</span>
                {label}
              </button>
            )
          })}
        </nav>
      </div>

      <div style={{ margin: '2px 12px 6px', borderTop: `1px solid ${SB.border}` }} />

      {/* Dataset list — FIX: outer element pakai div bukan button supaya tidak nested dengan delete button */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 6px' }}>
        <p style={{ fontSize: 9, fontWeight: 600, color: SB.textLabel, textTransform: 'uppercase', letterSpacing: '0.8px', padding: '0 6px', margin: '0 0 4px' }}>Datasets</p>
        {datasets.map((d) => {
          const isActive = activeId === d.dataset_id
          const hasAnalysis = d.has_cannibalization || d.has_forecast
          return (
            <div
              key={d.dataset_id}
              onClick={() => onSelect(d)}
              style={{
                width: '100%', textAlign: 'left', borderRadius: 12, padding: '8px 10px',
                border: isActive ? '1px solid rgba(148,207,229,0.35)' : '1px solid transparent',
                cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
                background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                marginBottom: 2, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 8,
                boxSizing: 'border-box',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = SB.bgHover }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: SB.statBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SB.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: isActive ? '#fff' : SB.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.filename}
                </p>
                <p style={{ fontSize: 10, color: SB.textLabel, margin: '1px 0 0' }}>{d.summary?.n_sku} SKU · {d.summary?.n_months} bln</p>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {hasAnalysis && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />}
                <button
                  onClick={(e) => handleDelete(d.dataset_id, e)}
                  title="Hapus dataset"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                    borderRadius: 6, color: 'rgba(255,255,255,0.30)', lineHeight: 1,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fca5a5'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.30)'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
        {datasets.length === 0 && (
          <p style={{ fontSize: 11, color: SB.textLabel, textAlign: 'center', padding: '12px 0' }}>Belum ada dataset.</p>
        )}
      </div>

      {/* Upload & logout */}
      <div style={{ padding: '10px 12px', borderTop: `1px solid ${SB.border}` }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: `1px solid ${SB.uploadBorder}`, borderRadius: 12, padding: '9px', fontSize: 11, fontWeight: 500, color: SB.accent, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', background: 'transparent' }}>
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {uploading ? 'Mengupload...' : '+ Upload Dataset (.csv)'}
        </label>
        {error && <p style={{ fontSize: 11, color: '#fca5a5', margin: '6px 0 0' }}>{error}</p>}
        <button onClick={onLogout} style={{ width: '100%', background: 'none', border: 'none', fontSize: 11, color: SB.textLabel, cursor: 'pointer', padding: '8px 0 0', fontFamily: 'Poppins, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Keluar
        </button>
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────
function Header({ breadcrumbs, active, onExport, onNav }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <Breadcrumb items={breadcrumbs} />
      {active && (
        <div className="flex items-center gap-2">
          <button onClick={onExport} className="flex items-center gap-1.5 text-xs text-gray-500 border border-brand-sky/40 px-3 py-1.5 rounded-xl hover:bg-brand-sky/10 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Dashboard page
// ─────────────────────────────────────────────────────────────────────────
function DashboardPage({ active, checks, datasetId, onNav }) {
  const [trends, setTrends]                     = useState(null)
  const [trendGranularity, setTrendGranularity] = useState('month')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [trendsLoading, setTrendsLoading]       = useState(false)

  useEffect(() => {
    if (!datasetId) return
    setTrends(null)
    setTrendsLoading(true)
    api.getCategoryTrends(datasetId)
      .then(data => {
        setTrends(data)
        const rec = data.recommended_granularity || 'month'
        setTrendGranularity(rec)
        setSelectedCategory(data[rec]?.top_category || null)
      })
      .catch(() => {})
      .finally(() => setTrendsLoading(false))
  }, [datasetId])

  if (!active) {
    return (
      <Card className="text-center py-20">
        <MaplLogo size="lg" />
        <p className="text-gray-400 text-sm mt-4">Pilih atau upload dataset untuk memulai.</p>
      </Card>
    )
  }

  const { summary } = active
  const iconBaris  = <svg className="w-5 h-5" style={{color:'#004996'}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
  const iconSKU    = <svg className="w-5 h-5" style={{color:'#004996'}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
  const iconBranch = <svg className="w-5 h-5" style={{color:'#004996'}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>
  const iconDate   = <svg className="w-5 h-5" style={{color:'#004996'}} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>

  const skuByCategory = summary.sku_by_category || {}
  const categoryNames = summary.categories?.length ? summary.categories : Object.keys(skuByCategory)

  const trendPayload    = trends?.[trendGranularity] || {}
  const categorySummary = trendPayload.category_summary || []
  const activeCategory  = selectedCategory || trendPayload.top_category || categorySummary[0]?.category
  const categorySeries  = (trendPayload.series || [])
    .filter(r => r.category === activeCategory)
    .map(r => ({
      period:           r.period,
      promo_rate_pct:   Number((r.promo_rate * 100).toFixed(1)),
      avg_discount_pct: Number((r.avg_discount * 100).toFixed(1)),
      revenue_m:        Number((r.revenue / 1_000_000).toFixed(2)),
    }))

  const dashboardInsightData = {
    dataset_summary: {
      n_rows: summary.n_rows, n_sku: summary.n_sku, n_branch: summary.n_branch,
      date_range: `${summary.date_min} s/d ${summary.date_max}`,
    },
    granularity: trendGranularity,
    top_category: activeCategory,
    category_ranking: categorySummary.slice(0, 5).map(c => ({
      category: c.category,
      risk_score: c.risk_score,
      promo_rate_pct: Number((c.avg_promo_rate * 100).toFixed(1)),
      avg_discount_pct: Number((c.avg_discount * 100).toFixed(1)),
      revenue_growth_pct: Number((c.revenue_growth * 100).toFixed(1)),
    })),
    highlights: trendPayload.highlights || [],
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Baris"   value={summary.n_rows.toLocaleString('id-ID')} sub="Total transaksi tercatat"  icon={iconBaris} />
        <StatCard label="Jumlah SKU"    value={summary.n_sku}                   sub="Varian produk dianalisis"  icon={iconSKU} />
        <StatCard label="Jumlah Branch" value={summary.n_branch}                sub="Lokasi cabang tercakup"    icon={iconBranch} />
        <StatCard label="Rentang Data"  value={`${summary.n_months} bulan`}     sub={`${summary.date_min} sampai ${summary.date_max}`} icon={iconDate} />
      </div>

      <InsightCard
        title="AI Insight — Ringkasan Dataset"
        hint="Minta AI ringkas pola tren kategori & promo dari dataset ini."
        context="dashboard"
        datasetId={datasetId}
        data={dashboardInsightData}
        cachedText={active?.context_insights?.dashboard}
        ready={!trendsLoading}
      />

      {checks && (
        <Card>
          <h3 className="text-sm font-semibold text-brand-blue mb-3">Validasi Dataset</h3>
          <div className="space-y-2">
            {checks.map((c, i) => (
              <div key={i} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                <Badge status={c.status} />
                <div>
                  <p className="text-sm font-medium text-gray-800">{c.check}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.message}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-4">Kategori &amp; SKU</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categoryNames.map(cat => {
            const skus = skuByCategory[cat] || []
            return (
              <div key={cat} className="border border-brand-sky/20 rounded-xl p-4 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-semibold text-brand-blue">{cat}</span>
                  <span className="text-xs bg-brand-sky/15 text-brand-blue px-2 py-0.5 rounded-full">
                    {skus.length} SKU
                  </span>
                </div>
                <div className="space-y-1.5">
                  {skus.map(sku => (
                    <div key={sku.SKU_ID} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400 w-12 flex-shrink-0">{sku.SKU_ID}</span>
                      <span className="text-xs text-gray-700 leading-tight">{sku.SKU_Name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {trendsLoading && <Card><Spinner label="Memuat category trends..." /></Card>}

      {!trendsLoading && trends && (
        <>
          {(trendPayload.highlights || []).length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {trendPayload.highlights.map((item, i) => (
                <Card key={i} className={i === 0 ? 'border-brand-blue/40' : ''}>
                  <p className="text-xs text-gray-400 mb-1">{item.title}</p>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-semibold text-brand-blue">{item.category}</h3>
                    <span className="text-lg font-bold text-brand-blue">{item.value}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{item.detail}</p>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-sm font-semibold text-brand-blue">Category Promo Trend</h3>
                <p className="text-xs text-gray-400 mt-1">Highlight awal sebelum drill down ke pasangan SKU cannibalization.</p>
              </div>
              <div className="flex items-center gap-2">
                {['week', 'month'].map(g => (
                  <button
                    key={g}
                    onClick={() => {
                      setTrendGranularity(g)
                      setSelectedCategory(trends[g]?.top_category || null)
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      trendGranularity === g
                        ? 'bg-brand-blue text-white border-brand-blue'
                        : 'bg-white text-gray-500 border-brand-sky/40 hover:border-brand-blue'
                    }`}
                  >
                    {g === 'week' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-12 gap-5">
              <div className="col-span-4">
                <p className="text-xs font-medium text-gray-400 mb-2">Ranking Category</p>
                <div className="space-y-2">
                  {categorySummary.map((cat, i) => (
                    <button
                      key={cat.category}
                      onClick={() => setSelectedCategory(cat.category)}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition ${
                        activeCategory === cat.category
                          ? 'border-brand-blue bg-brand-sky/10'
                          : 'border-gray-100 bg-white hover:border-brand-sky'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-brand-blue">#{i + 1} {cat.category}</span>
                        <span className="text-xs text-gray-400">Score {cat.risk_score}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-500">
                        <span>Promo {(cat.avg_promo_rate * 100).toFixed(1)}%</span>
                        <span>Disc {(cat.avg_discount * 100).toFixed(1)}%</span>
                        <span>Rev {(cat.revenue_growth * 100).toFixed(1)}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-8">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-gray-400">Selected category</p>
                    <h4 className="text-sm font-semibold text-brand-blue">{activeCategory || '-'}</h4>
                  </div>
                  <p className="text-xs text-gray-400">{trendGranularity === 'week' ? 'Weekly view' : 'Monthly view'}</p>
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={categorySeries} margin={{ left: 0, right: 20, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94CFE5" opacity={0.25} />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `Rp${v}M`} />
                    <Tooltip formatter={(v, name) => name === 'revenue_m' ? `Rp${v}M` : `${v}%`} />
                    <Area yAxisId="left"  type="monotone" dataKey="promo_rate_pct"   name="Promo rate"   stroke="#004996" fill="#94CFE5" fillOpacity={0.28} />
                    <Area yAxisId="left"  type="monotone" dataKey="avg_discount_pct" name="Avg discount" stroke="#F37748" fill="#F37748" fillOpacity={0.14} />
                    <Area yAxisId="right" type="monotone" dataKey="revenue_m"        name="Revenue"      stroke="#ECC30B" fill="#ECC30B" fillOpacity={0.12} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────
// Analysis page  (versi temen — DiD per bulan, filter branch/periode/kategori)
// ─────────────────────────────────────────────────────────────────────────
function AnalysisPage({ datasetId, onResult }) {
  const [loading, setLoading]               = useState(false)
  const [result, setResult]                 = useState(null)
  const [error, setError]                   = useState(null)
  const [filterBranch, setFilterBranch]     = useState([])
  const [filterMonth, setFilterMonth]       = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [page, setPage]                     = useState(1)
  const [chartMetric, setChartMetric]       = useState('revenue')
  const [cachedInsight, setCachedInsight]   = useState(null)
  const PAGE_SIZE = 25

  useEffect(() => {
    let cancelled = false
    setResult(null); setError(null); setLoading(true)
    api.getDatasetResults(datasetId)
      .then(data => {
        if (cancelled) return
        if (data.did) setResult(data.did)
        setCachedInsight(data.context_insights?.analysis || null)
      })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [datasetId])

  async function run() {
    setLoading(true); setError(null)
    try {
      const [did] = await Promise.all([
        api.runDid(datasetId),
        api.runDidSimulator(datasetId),
        api.runForecast(datasetId, 28),
      ])
      // matrix harus dibangun SETELAH did_result tersimpan (backend butuh did_result)
      const matrix = await api.buildMatrix(datasetId)
      setResult(did)
      onResult?.({ has_did: true, has_did_simulator: true, has_forecast: true, has_cannibalization: !!matrix })
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  function normalizeDid(raw) {
    const confirmed = raw.confirmed || raw.significant || []
    return {
      ...raw,
      summary: {
        ...(raw.summary || {}),
        significant_cannibalization: raw.summary?.confirmed ?? raw.summary?.significant_cannibalization ?? confirmed.length,
      },
      significant: confirmed.map(r => ({
        ...r,
        did_ab_pct: r.did_ab_pct ?? r.qty_loss_pct ?? (r.did_ab != null ? r.did_ab * 100 : null),
        rev_impact: r.rev_impact ?? 0,
      })),
    }
  }

  if (!result && !loading) return (
    <Card className="text-center py-16">
      <p className="text-2xl mb-3">📊</p>
      <h3 className="text-base font-semibold text-brand-blue mb-2">Cannibalization Analysis</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
        DiD estimator per pasangan SKU dalam kategori yang sama, per branch dan bulan.
      </p>
      <button onClick={run} className="bg-brand-blue text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition">
        Jalankan Analisis
      </button>
      {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
    </Card>
  )

  if (loading) return <Card><Spinner label="Menjalankan DiD Analisis..." /></Card>

  const normalized = normalizeDid(result)
  const { summary, significant, results } = normalized

  const allResults    = results || []
  const allSignificant = significant || []

  const branches   = [...new Set(allResults.map(r => r.branch))].sort()
  const months     = ['all', ...[...new Set(allResults.map(r => r.year_month))].filter(Boolean).sort()]
  const categories = ['all', ...[...new Set(allResults.map(r => r.category))].filter(Boolean).sort()]

  const filteredPairs = allResults.filter(r =>
    (filterBranch.length === 0 || filterBranch.includes(r.branch)) &&
    (filterMonth === 'all' || r.year_month === filterMonth) &&
    (filterCategory === 'all' || r.category === filterCategory)
  )
  const filtered = allSignificant.filter(r =>
    (filterBranch.length === 0 || filterBranch.includes(r.branch)) &&
    (filterMonth === 'all' || r.year_month === filterMonth) &&
    (filterCategory === 'all' || r.category === filterCategory)
  ).sort((a, b) => (a.did_ab_pct ?? 0) - (b.did_ab_pct ?? 0))

  const filteredSummary = {
    total_pairs:                filteredPairs.length,
    significant_cannibalization: filtered.length,
    total_revenue_at_risk:      filtered.reduce((acc, r) => acc + (r.rev_impact ?? 0), 0),
  }

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const chartData = filtered
    .map(r => ({
      name:  `${r.sku_a_name} → ${r.sku_b_name}`,
      value: chartMetric === 'revenue' ? (Math.abs(r.rev_impact) ?? 0) : (Math.abs(r.did_ab_pct) ?? 0),
    }))
    .filter(r => r.value !== 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const showPeriode = filterMonth === 'all'

  function toggleBranch(b) {
    setPage(1)
    setFilterBranch(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 mr-1">Branch:</span>
          {branches.map(b => (
            <button
              key={b}
              onClick={() => toggleBranch(b)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                filterBranch.includes(b) ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-gray-200" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Periode:</span>
          <select
            value={filterMonth}
            onChange={e => { setPage(1); setFilterMonth(e.target.value) }}
            className="border border-brand-sky/40 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-sky text-gray-600"
          >
            <option value="all">Semua Periode</option>
            {months.filter(m => m !== 'all').map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="w-px h-4 bg-gray-200" />

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Kategori:</span>
          <select
            value={filterCategory}
            onChange={e => { setPage(1); setFilterCategory(e.target.value) }}
            className="border border-brand-sky/40 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-sky text-gray-600"
          >
            <option value="all">Semua Kategori</option>
            {categories.filter(c => c !== 'all').map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Pasangan" value={filteredSummary.total_pairs} />
        <StatCard label="Cannibalization" value={filteredSummary.significant_cannibalization} />
        <StatCard
          label={<span className='text-red-500'>Revenue Loss</span>}
          
          value={
            <span className="text-red-500">
              Rp{Math.abs(filteredSummary.total_revenue_at_risk ?? 0).toLocaleString('id-ID')}
            </span>}
          accent
        />
      </div>

      <InsightCard
        title="AI Insight — Cannibalization"
        hint="Minta AI jelaskan pasangan SKU paling signifikan sesuai filter di atas."
        context="analysis"
        datasetId={datasetId}
        data={{
          filters: { branch: filterBranch, month: filterMonth, category: filterCategory },
          summary: filteredSummary,
          top_pairs: filtered.slice(0, 5).map(r => ({
            branch: r.branch, period: r.year_month, category: r.category,
            from: r.sku_a_name, to: r.sku_b_name, qty_loss_pct: r.did_ab_pct,
          })),
        }}
        cachedText={cachedInsight}
      />

      {/* Chart */}
      {chartData.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setChartMetric('revenue')}
              className={`px-3 py-1 rounded-full text-xs ${chartMetric === 'revenue' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500'}`}
            >Revenue Loss</button>
            <button
              onClick={() => setChartMetric('qty')}
              className={`px-3 py-1 rounded-full text-xs ${chartMetric === 'qty' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500'}`}
            >Quantity Loss</button>
          </div>
          <h3 className="text-sm font-semibold text-brand-blue mb-1">
            {chartMetric === 'revenue' ? 'Top 10 Revenue Loss' : 'Top 10 Quantity Loss'}
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 60)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 180, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94CFE5" opacity={0.2} />
              <XAxis type="number" tickFormatter={v =>
                chartMetric === 'revenue'
                  ? `${v < 0 ? '-' : ''}Rp${Math.abs(v ?? 0).toLocaleString('id-ID')}`
                  : `${v}%`
              } tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={175} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v =>
                chartMetric === 'revenue'
                  ? `${v < 0 ? '-' : ''}Rp${Math.abs(v ?? 0).toLocaleString('id-ID')}`
                  : `${v}%`
              } />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? '#004996' : '#94CFE5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Tabel */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-brand-blue">Cannibalization Impact</h3>
          <span className="text-xs text-gray-400">{filtered.length} dari {allSignificant.length} pairs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-brand-sky/20">
                <th className="py-2 pr-4 font-medium">No</th>
                {showPeriode && <th className="py-2 pr-4 font-medium">Periode</th>}
                <th className="py-2 pr-4 font-medium">Branch</th>
                <th className="py-2 pr-4 font-medium">Produk Promoted</th>
                <th className="py-2 pr-4 font-medium">Produk Terdampak</th>
                <th className="py-2 pr-4 font-medium">Qty Loss(%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((r, i) => (
                <tr key={i} className="hover:bg-brand-cream/30 text-xs">
                  <td className="py-2.5 pr-4 text-gray-400">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  {showPeriode && <td className="py-2.5 pr-4 text-gray-500">{r.year_month}</td>}
                  <td className="py-2.5 pr-4 text-gray-500">{r.branch}</td>
                  <td className="py-2.5 pr-4">{r.sku_a_name}</td>
                  <td className="py-2.5 pr-4">{r.sku_b_name}</td>
                  <td className="py-2.5 pr-4 font-mono text-red-500">
                    {r.did_ab_pct != null ? `${Number(r.did_ab_pct).toFixed(2)}%` : '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={showPeriode ? 6 : 5} className="py-8 text-center text-gray-400 text-xs">Tidak ada pasangan cannibalization untuk filter ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-gray-400">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length} pairs
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1 rounded-lg text-xs border border-brand-sky/40 text-gray-500 hover:bg-gray-50 disabled:opacity-30">←</button>
            {Array.from({ length: Math.min(totalPages, 15) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={`px-3 py-1 rounded-lg text-xs border transition ${
                  page === p ? 'bg-brand-blue text-white border-brand-blue' : 'border-brand-sky/40 text-gray-500 hover:bg-gray-50'
                }`}
              >{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1 rounded-lg text-xs border border-brand-sky/40 text-gray-500 hover:bg-gray-50 disabled:opacity-30">→</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Forecasting page
// ─────────────────────────────────────────────────────────────────────────
function ForecastingPage({ datasetId, onResult }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [selectedSku, setSelectedSku] = useState(null)
  const [days, setDays] = useState(90)

  async function run() {
    setLoading(true); setError(null)
    try {
      const data = await api.runForecast(datasetId, days)
      setResult(data); setSelectedSku(data.per_sku[0]?.sku_id || null)
      onResult?.()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (!result && !loading) return (
    <Card className="text-center py-16">
      <p className="text-2xl mb-3">📈</p>
      <h3 className="text-base font-semibold text-brand-blue mb-2">Revenue Forecasting</h3>
      <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">XGBoost per branch dengan iterative lag features.</p>
      <div className="flex items-center justify-center gap-3 mb-6">
        <label className="text-sm text-gray-500">Horizon:</label>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className="border border-brand-sky/60 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky">
          <option value={30}>30 hari</option>
          <option value={90}>90 hari</option>
          <option value={180}>180 hari</option>
        </select>
      </div>
      <button onClick={run} className="bg-brand-blue text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition">Jalankan Forecast</button>
      {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
    </Card>
  )

  if (loading) return <Card><Spinner label="Menjalankan XGBoost forecast per branch..." /></Card>

  const selected = result.per_sku.find(s => s.sku_id === selectedSku)
  const chartData = selected?.daily_series.map(d => ({ date: d.date.slice(5), qty: d.qty })) || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Forecast Horizon" value={`${result.forecast_days} hari`} sub={`mulai ${result.forecast_start}`} />
        <StatCard label="Model" value="XGBoost" sub="per branch, iterative lag" />
        <StatCard label="Total Revenue Forecast" value={`Rp${(result.total_revenue_forecast / 1e9).toFixed(2)}B`} accent />
      </div>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-brand-blue">Forecast per SKU</h3>
          <select value={selectedSku || ''} onChange={e => setSelectedSku(e.target.value)} className="text-xs border border-brand-sky/40 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-sky">
            {result.per_sku.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_id} — {s.sku_name}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94CFE5" opacity={0.2} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Area type="monotone" dataKey="qty" stroke="#004996" fill="#94CFE5" fillOpacity={0.3} strokeWidth={2} name="Forecast Qty" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-4">Ringkasan Semua SKU</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-brand-sky/20">
                <th className="py-2 pr-4 font-medium">SKU</th>
                <th className="py-2 pr-4 font-medium">Nama</th>
                <th className="py-2 pr-4 font-medium">Kategori</th>
                <th className="py-2 pr-4 font-medium">Qty Forecast</th>
                <th className="py-2 pr-4 font-medium">Range CI ±15%</th>
                <th className="py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {result.per_sku.map((s, i) => (
                <tr key={i} onClick={() => setSelectedSku(s.sku_id)} className={`cursor-pointer hover:bg-brand-cream/30 ${s.sku_id === selectedSku ? 'bg-brand-sky/10' : ''}`}>
                  <td className="py-2.5 pr-4 font-mono">{s.sku_id}</td>
                  <td className="py-2.5 pr-4">{s.sku_name}</td>
                  <td className="py-2.5 pr-4 text-gray-500">{s.category}</td>
                  <td className="py-2.5 pr-4 font-mono">{s.qty_forecast.toLocaleString('id-ID')}</td>
                  <td className="py-2.5 pr-4 font-mono text-gray-400">{s.qty_lower.toLocaleString('id-ID')} – {s.qty_upper.toLocaleString('id-ID')}</td>
                  <td className="py-2.5 font-semibold text-brand-blue">Rp{(s.revenue_forecast / 1e6).toFixed(1)}M</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Simulator page
// ─────────────────────────────────────────────────────────────────────────
function SimulatorPage({ datasetId, hasCannibalization }) {
  const [skuList, setSkuList]               = useState([])
  const [branchList, setBranchList]         = useState([])
  const [selectedSku, setSelectedSku]       = useState('')
  const [selectedBranch, setSelectedBranch] = useState('all')
  const [discountPct, setDiscountPct]       = useState(10)
  const [selectedWeek, setSelectedWeek]     = useState(0)
  const [loading, setLoading]               = useState(false)
  const [result, setResult]                 = useState(null)
  const [error, setError]                   = useState(null)
  const [cachedInsight, setCachedInsight]   = useState(null)

  useEffect(() => {
    if (!hasCannibalization) return
    api.simulate(datasetId, '__meta__', 'all', 0)
      .then(d => {
        if (d.metadata) {
          setSkuList(d.metadata.sku_list || [])
          setBranchList(['all', ...(d.metadata.branch_list || [])])
          if (d.metadata.sku_list?.length > 0) setSelectedSku(d.metadata.sku_list[0].SKU_ID)
        }
      })
      .catch(() => {})
    api.getDatasetResults(datasetId)
      .then(d => setCachedInsight(d.context_insights?.simulator || null))
      .catch(() => {})
  }, [datasetId, hasCannibalization])

  async function run() {
    if (!selectedSku) return
    setLoading(true); setError(null); setCachedInsight(null)
    try {
      const data = await api.simulate(datasetId, selectedSku, selectedBranch, discountPct / 100, selectedWeek)
      setResult(data)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (!hasCannibalization) return (
    <Card className="text-center py-16">
      <p className="text-2xl mb-3">🎛️</p>
      <h3 className="text-base font-semibold text-brand-blue mb-2">What-If Pricing Simulator</h3>
      <p className="text-sm text-gray-400 max-w-sm mx-auto">Jalankan <strong>Analysis</strong> terlebih dahulu agar simulator bisa membaca koefisien cannibalization.</p>
    </Card>
  )

  const fmt    = (n) => n >= 0 ? `+Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}` : `-Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`
  const fmtRev = (n) => `Rp${Math.round(Math.abs(n)).toLocaleString('id-ID')}`

  function buildWeeklyChartData(res) {
    if (!res) return []
    return (res.weekly_projection || []).map(row => ({
      week: `Minggu ${row.week}`,
      promo: Math.round(row.promo_revenue),
      nonPromo: Math.round(row.baseline_revenue),
    }))
  }

  const allWeeksData = result ? buildWeeklyChartData(result) : []
  const chartData = selectedWeek === 0
    ? allWeeksData
    : allWeeksData.filter((_, i) => i === selectedWeek - 1)

  const weekLabels = ['Semua Minggu', 'Minggu 1', 'Minggu 2', 'Minggu 3', 'Minggu 4']

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-4">Parameter Simulasi</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Branch</label>
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="w-full border border-brand-sky/40 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky">
              {branchList.map(b => <option key={b} value={b}>{b === 'all' ? 'Semua Branch' : b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Produk</label>
            <select value={selectedSku} onChange={e => setSelectedSku(e.target.value)} className="w-full border border-brand-sky/40 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky">
              {skuList.map(s => <option key={s.SKU_ID} value={s.SKU_ID}>{s.SKU_ID} — {s.SKU_Name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Diskon ({discountPct}%)</label>
            <input type="range" min={0} max={70} step={1} value={discountPct} onChange={e => setDiscountPct(Number(e.target.value))} className="w-full mt-2" />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0%</span><span>35%</span><span>70%</span></div>
          </div>
        </div>
        <button onClick={run} disabled={loading || !selectedSku} className="bg-brand-blue text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition disabled:opacity-40">
          {loading ? 'Menghitung...' : 'Jalankan Simulasi'}
        </button>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Revenue Generated"           value={fmt(result.sku_a_result.rev_uplift_daily)}   sub={`${result.sku_a_result.qty_uplift_pct > 0 ? '+' : ''}${result.sku_a_result.qty_uplift_pct}% Units Sold`} />
            <StatCard label="Revenue Loss (Cannibalization)"  value={result.summary.total_rev_lost <= 0 ? `-Rp${Math.abs(result.summary.total_rev_lost).toLocaleString('id-ID')}` : `+Rp${result.summary.total_rev_lost.toLocaleString('id-ID')}`} sub={`${result.summary.n_sku_cannibalized} Produk terdampak`} />
            <StatCard label="Net Revenue Impact"      value={fmt(result.summary.net_revenue_impact)} sub={result.summary.is_worth_it ? '✅ Worth it' : '⚠️ Tidak worth it'} accent={result.summary.is_worth_it} />
            <StatCard
              label="Break-even Discount"
              value={
                result.summary.always_worth_it
                  ? '70%+'
                  : result.summary.break_even_discount_pct != null
                    ? `${result.summary.break_even_discount_pct}%`
                    : '0%'
              }
              sub={
                result.summary.always_worth_it
                  ? 'Selalu worth it di range slider'
                  : result.summary.break_even_discount_pct != null
                    ? `Batas atas discount profitable`
                    : 'Sudah rugi sejak discount terkecil'
              }
              accent={result.summary.always_worth_it || result.summary.break_even_discount_pct != null}
            />
          </div>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-brand-blue">
                Proyeksi Revenue — {result.input.sku_name}
                <span className="ml-2 text-xs font-normal text-gray-400">Diskon {(result.input.discount_pct * 100).toFixed(0)}%</span>
              </h3>
            </div>

            <div className="flex gap-4 mb-3">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block w-4 h-0.5 bg-[#3b82f6] rounded"></span> Dengan Diskon (Promo)
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block w-4 h-0.5 bg-[#94a3b8] rounded"></span> Tanpa Diskon (Non-Promo)
              </span>
            </div>

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="promoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="nonPromoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.10}/>
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                <Tooltip
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value, name) => [
                    `Rp${Math.round(value).toLocaleString('id-ID')}`,
                    name === 'promo' ? 'Dengan Diskon' : 'Tanpa Diskon'
                  ]}
                />
                <Area type="monotone" dataKey="nonPromo" stroke="#94a3b8" strokeWidth={2}
                  strokeDasharray="5 4" fill="url(#nonPromoGrad)" dot={{ r: 4, fill: '#94a3b8', strokeWidth: 0 }} />
                <Area type="monotone" dataKey="promo" stroke="#3b82f6" strokeWidth={2.5}
                  fill="url(#promoGrad)" dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-brand-blue mb-4">
              Detail Product Promoted — {result.input.sku_name}
              <span className="ml-2 text-xs font-normal text-gray-400">Diskon {(result.input.discount_pct * 100).toFixed(0)}% · Branch: {result.input.branch}</span>
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Baseline</p>
                  <p className="text-xs text-gray-400">Qty/hari</p>
                  <p className="text-xl font-bold text-gray-500 mt-1">{Math.round(result.sku_a_result.baseline_qty_daily).toLocaleString('id-ID')}</p>
                </div>
                <div className="flex flex-col items-center flex-shrink-0 w-14">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94CFE5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7"/>
                  </svg>
                </div>
                <div className="flex-1 bg-brand-blue rounded-xl p-4">
                  <p className="text-xs text-brand-sky mb-1">Setelah Diskon</p>
                  <p className="text-xs text-brand-sky/80">Qty/hari</p>
                  <p className="text-xl font-bold text-white mt-1">{Math.round(result.sku_a_result.qty_new_daily).toLocaleString('id-ID')}</p>
                </div>
                <div className="flex-shrink-0 w-28 px-2 text-right">
                  <p className="text-xs text-gray-400">Total Units Sold</p>
                  <p className="text-xs font-bold text-green-600">+{result.sku_a_result.qty_uplift_pct}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">Baseline</p>
                  <p className="text-xs text-gray-400">Revenue/hari</p>
                  <p className="text-xl font-bold text-gray-500 mt-1">{fmtRev(result.sku_a_result.baseline_rev_daily)}</p>
                </div>
                <div className="flex flex-col items-center flex-shrink-0 w-14">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94CFE5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7"/>
                  </svg>
                </div>
                <div className="flex-1 bg-brand-blue rounded-xl p-4">
                  <p className="text-xs text-brand-sky mb-1">Setelah Diskon</p>
                  <p className="text-xs text-brand-sky/80">Revenue/hari</p>
                  <p className="text-xl font-bold text-white mt-1">{fmtRev(result.sku_a_result.rev_new_daily )}</p>
                </div>
                <div className="flex-shrink-0 w-28 text-right">
                  <p className="text-xs text-gray-400">Uplift revenue</p>
                  <p className={`text-xs font-bold ${result.sku_a_result.rev_uplift_daily >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {fmt(result.sku_a_result.rev_uplift_daily)}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {result.cannibalization_impact.length > 0 && (
          <Card>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-brand-blue">
                  Produk Terdampak
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Produk yang terdampak akibat promosi pada produk terpilih.
                </p>
              </div>              
            </div>

            <div className="overflow-x-auto rounded-xl border border-brand-sky/20">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr className="text-left border-b border-brand-sky/20">
                    <th className="py-3 pl-4 pr-3 font-medium">Produk</th>
                    <th className="py-3 px-3 font-medium">Nama Produk</th>
                    <th className="py-3 px-3 text-left font-medium ">
                      Forecasted Units Sold
                    </th>
                    <th className="py-3 px-3 text-left font-medium">
                      Projected Units Sold
                    </th>
                    <th className="py-3 px-3 text-left font-medium">
                      Quantity Loss
                    </th>                    
                    <th className="py-3 px-3 text-left font-medium">
                      Revenue Loss
                    </th>                    
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50 bg-white">
                  {result.cannibalization_impact.map((r, i) => (
                    <tr
                      key={`${r.sku_b_id}-${i}`}
                      className="hover:bg-brand-cream/30"
                    >
                    
                      <td className="py-3 pl-4 pr-3 font-mono text-gray-600 whitespace-nowrap">
                        {r.sku_b_id}
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-medium text-gray-700">
                          {r.sku_b_name}
                        </p>
                      </td>
                      <td className="py-3 px-3 font-mono text-gray-600">
                        {(Math.round(r.baseline_qty) ?? 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3 font-mono text-gray-600">
                        {(Math.round(r.new_qty) ?? 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex justify-center min-w-[45px] rounded-full bg-red-50 px-2 py-1 font-mono font-semibold text-red-600">
                          -{(Math.round(r.lost_qty) ?? 0).toLocaleString('id-ID')}
                        </span>
                      </td>   
                      <td
                        className={`py-3 pl-3 pr-4 font-mono font-semibold ${
                          (r.rev_impact ?? 0) < 0
                            ? 'text-red-500'
                            : 'text-green-600'
                        }`}
                      >
                        {(r.rev_impact ?? 0) >= 0 ? '+' : '-'}
                        Rp{Math.abs(r.rev_impact ?? 0).toLocaleString('id-ID')}
                      </td>                   
                    </tr>
                  ))}
                    <tr className="bg-gray-50 border-t-2 border-brand-sky/20">
                      <td colSpan={5} className="py-3 pl-4 pr-3 text-right font-semibold text-gray-700">
                        Total Revenue Loss
                      </td>

                      <td className="py-3 pl-3 pr-4 font-mono font-bold text-red-500">
                        {fmt(result.summary.total_rev_lost)}
                      </td>
                    </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}

          {result.summary.analysis_timestamp && result.summary.analysis_timestamp !== 'unknown' && (
            <p className="text-xs text-gray-400 text-right">
              ⚠️ Simulasi berdasarkan analisis: {new Date(result.summary.analysis_timestamp).toLocaleString('id-ID')}
            </p>
          )}

          <InsightCard
            title="AI Insight — Simulasi Pricing"
            hint="Minta AI jelaskan apakah skenario diskon ini worth it dijalankan."
            context="simulator"
            datasetId={datasetId}
            data={{
              input: result.input,
              sku_a_result: result.sku_a_result,
              summary: result.summary,
              cannibalization_impact: (result.cannibalization_impact || []).slice(0, 5),
            }}
            cachedText={cachedInsight}
          />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// AI Insights page
// ─────────────────────────────────────────────────────────────────────────
function AIInsightsPage({ datasetId, hasCannibalization, hasForecast }) {
  const [loading, setLoading] = useState(false)
  const [recs, setRecs]       = useState(null)
  const [rawText, setRawText] = useState(null)
  const [error, setError]     = useState(null)
  const ready = hasCannibalization && hasForecast

  async function run() {
    setLoading(true); setError(null)
    try {
      const data = await api.aiRecommendation(datasetId)
      try { setRecs(JSON.parse(data.recommendation)) }
      catch { setRawText(data.recommendation) }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const severityColor = { HIGH: 'border-red-200 bg-red-50', MED: 'border-amber-200 bg-amber-50', LOW: 'border-blue-100 bg-blue-50' }

  if (!recs && !rawText && !loading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4 opacity-40 pointer-events-none">
        <StatCard label="Total Rekomendasi" value="—" />
        <StatCard label="Potensi Revenue Saved" value="—" />
        <StatCard label="Produk Perlu Perhatian" value="—" />
        <StatCard label="Confidence Level" value="—" accent />
      </div>
      <Card className="text-center py-12">
        <p className="text-2xl mb-3">✨</p>
        <h3 className="text-base font-semibold text-brand-blue mb-2">AI Insights</h3>
        <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">Ringkasan & rekomendasi bisnis dari hasil cannibalization + forecast, dihasilkan oleh Gemini API.</p>
        {!ready && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 max-w-sm mx-auto">Jalankan <strong>Analysis</strong> dan <strong>Forecasting</strong> terlebih dahulu.</p>}
        <button onClick={run} disabled={!ready} className="bg-brand-blue text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition disabled:opacity-40">Generate Rekomendasi</button>
        {error && <p className="text-xs text-red-500 mt-4 bg-red-50 rounded-xl p-3">{error}</p>}
      </Card>
    </div>
  )

  if (loading) return <Card><Spinner label="Gemini sedang menganalisis..." /></Card>

  if (recs) {
    const items = recs.recommendations || []
    const stats = recs.summary || {}
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Rekomendasi" value={items.length} />
          <StatCard label="Potensi Revenue Saved" value={stats.potential_revenue_saved || '—'} />
          <StatCard label="Produk Perlu Perhatian" value={stats.sku_at_risk || '—'} />
          <StatCard label="Confidence Level" value={stats.confidence || '95%'} accent />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400">Analisis AI selesai</p>
            <p className="text-sm font-medium text-brand-blue mt-0.5">{stats.summary || `${items.length} rekomendasi terdeteksi.`}</p>
          </div>
          <button onClick={run} className="text-xs text-brand-blue border border-brand-sky/60 px-3 py-1.5 rounded-xl hover:bg-brand-sky/10 transition">↺ Regenerate</button>
        </div>
        <div className="space-y-3">
          {items.map((rec, i) => (
            <div key={i} className={`rounded-2xl border p-5 ${severityColor[rec.severity] || 'border-gray-100 bg-white'}`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <h4 className="text-sm font-semibold text-gray-800">{rec.title}</h4>
                <Badge status={rec.severity || 'MED'} />
              </div>
              <p className="text-xs text-gray-600 mb-3 leading-relaxed">{rec.explanation}</p>
              <div className="bg-white/70 rounded-xl px-4 py-3 border border-white">
                <p className="text-xs font-medium text-brand-blue mb-1">Rekomendasi</p>
                <p className="text-xs text-gray-700">{rec.action}</p>
              </div>
              {rec.impact && <p className="text-xs text-gray-400 mt-2">💰 {rec.impact}</p>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-brand-blue">Analisis AI selesai</p>
        <button onClick={run} className="text-xs text-brand-blue border border-brand-sky/60 px-3 py-1.5 rounded-xl hover:bg-brand-sky/10 transition">↺ Regenerate</button>
      </div>
      <Card><div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{rawText}</div></Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Settings page
// ─────────────────────────────────────────────────────────────────────────
function SettingsPage({ username }) {
  const [aiStatus, setAiStatus] = useState(null)

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-4">Profil</h3>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-blue text-white flex items-center justify-center text-xl font-semibold">
            {username?.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-800">{username}</p>
            <p className="text-xs text-gray-400 mt-0.5">Analyst</p>
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-4">Model AI</h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Provider</span>
            <span className="font-medium text-gray-800">{aiStatus?.provider || 'Google Gemini'}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Model</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{aiStatus?.model || '...'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Status</span>
            {aiStatus && (
              aiStatus.configured
                ? <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">● Terhubung</span>
                : <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded-full">● GEMINI_API_KEY belum di-set</span>
            )}
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-2">Tentang MAPL+</h3>
        <p className="text-xs text-gray-400">Cannibalization & Forecast Dashboard — v3.1</p>
        <p className="text-xs text-gray-400 mt-1">Elasticity · DiD (Majority Branch) · XGBoost · Gemini API</p>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────
export default function App() {
  const [username, setUsername]           = useState(null)
  const [checkingAuth, setCheckingAuth]   = useState(true)
  const [datasets, setDatasets]           = useState([])
  const [active, setActive]               = useState(null)
  const [activeChecks, setActiveChecks]   = useState(null)
  const [nav, setNav]                     = useState('dashboard')
  const [analysisFlags, setAnalysisFlags] = useState({ cannibalization: false, forecast: false, didSimulator: false })

  useEffect(() => {
    const token = getToken()
    if (!token) { setCheckingAuth(false); return }
    api.me()
      .then(d => setUsername(d.username))
      .catch(() => setToken(null))
      .finally(() => setCheckingAuth(false))
  }, [])

  useEffect(() => {
    if (!username) return
    api.listDatasets().then(list => {
      setDatasets(list)
      if (list.length > 0) {
        const first = list[0]
        setActive(first)
        setAnalysisFlags({
          cannibalization: first.has_cannibalization || first.has_did,
          forecast: first.has_forecast,
          didSimulator: first.has_did_simulator,
        })
      }
    }).catch(() => {})
  }, [username])

  function handleLogout() {
    setToken(null); setUsername(null); setDatasets([]); setActive(null)
  }

  function handleUploaded(data) {
    const ds = {
      dataset_id: data.dataset_id, filename: data.filename, summary: data.summary,
      has_elasticity: false, has_did: false, has_matrix: false,
      has_cannibalization: false, has_forecast: false, has_did_simulator: false,
    }
    setDatasets(prev => [...prev, ds])
    setActive(ds); setActiveChecks(data.checks)
    setAnalysisFlags({ cannibalization: false, forecast: false, didSimulator: false })
    setNav('dashboard')
  }

  function handleDeleted(id) {
    setDatasets(prev => prev.filter(d => d.dataset_id !== id))
    if (active?.dataset_id === id) { setActive(null); setNav('dashboard') }
  }

  function handleSelect(d) {
    setActive(d); setActiveChecks(null)
    setAnalysisFlags({
      cannibalization: d.has_cannibalization || d.has_did,
      forecast: d.has_forecast,
      didSimulator: d.has_did_simulator,
    })
    setNav('dashboard')
  }

  function markActiveDataset(patch) {
    const normalized = {
      has_cannibalization: patch.has_cannibalization ?? patch.has_did ?? false,
      has_did:             patch.has_did ?? false,
      has_did_simulator:   patch.has_did_simulator ?? false,
      has_forecast:        patch.has_forecast ?? false,
    }
    setDatasets(prev => prev.map(d =>
      d.dataset_id === active?.dataset_id ? { ...d, ...normalized } : d
    ))
    setActive(prev => prev ? { ...prev, ...normalized } : prev)
    setAnalysisFlags({
      cannibalization: !!normalized.has_cannibalization,
      forecast:        !!normalized.has_forecast,
      didSimulator:    !!normalized.has_did_simulator,
    })
  }

  function handleExport() {
    alert('Export coming soon — akan download PDF ringkasan analisis.')
  }

  const breadcrumbMap = {
    dashboard: ['Dashboard', active?.filename].filter(Boolean),
    analysis:  ['Dashboard', 'Analysis'],
    simulator: ['Dashboard', 'Simulator'],
    ai:        ['Dashboard', 'AI Insights'],
    settings:  ['Dashboard', 'Settings'],
  }

  if (checkingAuth) return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <Spinner label="Memuat..." />
    </div>
  )

  if (!username) return <AuthScreen onAuthenticated={setUsername} />

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <Sidebar
        datasets={datasets}
        activeId={active?.dataset_id}
        activeNav={nav}
        onSelect={handleSelect}
        onUploaded={handleUploaded}
        onDeleted={handleDeleted}
        username={username}
        onLogout={handleLogout}
        onNav={setNav}
      />

      <main className="flex-1 px-8 py-8 w-full">
        <Header breadcrumbs={breadcrumbMap[nav] || ['Dashboard']} active={active} onExport={handleExport} onNav={setNav} />

        {nav === 'dashboard' && <DashboardPage active={active} checks={activeChecks} datasetId={active?.dataset_id} onNav={setNav} />}
        {nav === 'analysis'  && active && <AnalysisPage   datasetId={active.dataset_id} onResult={markActiveDataset} />}
        {nav === 'simulator' && active && <SimulatorPage  datasetId={active.dataset_id} hasCannibalization={analysisFlags.cannibalization} />}
        {nav === 'ai'        && active && <AIInsightsPage datasetId={active.dataset_id} hasCannibalization={analysisFlags.cannibalization} hasForecast={analysisFlags.forecast} />}
        {nav === 'settings'  && <SettingsPage username={username} />}
        {!active && !['dashboard', 'settings'].includes(nav) && (
          <Card className="text-center py-16">
            <p className="text-gray-400 text-sm">Pilih dataset di sidebar terlebih dahulu.</p>
          </Card>
        )}
      </main>
    </div>
  )
}