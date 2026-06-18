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
  { key: 'dashboard',   label: 'Dashboard',
    svg: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> },
  { key: 'analysis',    label: 'Analysis',
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

      {/* Dataset list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 6px' }}>
        <p style={{ fontSize: 9, fontWeight: 600, color: SB.textLabel, textTransform: 'uppercase', letterSpacing: '0.8px', padding: '0 6px', margin: '0 0 4px' }}>Datasets</p>
        {datasets.map((d) => {
          const isActive = activeId === d.dataset_id
          const hasAnalysis = d.has_cannibalization || d.has_forecast
          return (
            <button
              key={d.dataset_id}
              onClick={() => onSelect(d)}
              style={{
                width: '100%', textAlign: 'left', borderRadius: 12, padding: '8px 10px',
                border: isActive ? '1px solid rgba(148,207,229,0.35)' : '1px solid transparent',
                cursor: 'pointer', fontFamily: 'Poppins, sans-serif',
                background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                marginBottom: 2, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = SB.bgHover }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ width: 30, height: 30, borderRadius: 8, background: SB.statBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={SB.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: isActive ? '#fff' : SB.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.filename}
                </p>
                <p style={{ fontSize: 10, color: SB.textLabel, margin: '1px 0 0' }}>{d.summary?.n_sku} SKU · {d.summary?.n_months} bln</p>
              </div>
              {hasAnalysis && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', flexShrink: 0, marginLeft: 'auto' }} />}
            </button>
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
          <div className="flex items-center gap-1.5 border border-brand-sky/40 rounded-xl px-3 py-1.5 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5 text-brand-sky" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {active.summary?.date_min} — {active.summary?.date_max}
          </div>
          <button onClick={onExport} className="flex items-center gap-1.5 text-xs text-gray-500 border border-brand-sky/40 px-3 py-1.5 rounded-xl hover:bg-brand-sky/10 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>
          <button onClick={() => onNav('analysis')} className="flex items-center gap-1.5 text-xs text-white bg-brand-blue px-3 py-1.5 rounded-xl hover:opacity-90 transition font-medium">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
            </svg>
            Analisis
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Dashboard page
// ─────────────────────────────────────────────────────────────────────────
function DashboardPage({ active, checks, onNav }) {
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Baris"   value={summary.n_rows.toLocaleString()} sub="Total transaksi tercatat"  icon={iconBaris} />
        <StatCard label="Jumlah SKU"    value={summary.n_sku}                   sub="Varian produk dianalisis"  icon={iconSKU} />
        <StatCard label="Jumlah Branch" value={summary.n_branch}                sub="Lokasi cabang tercakup"    icon={iconBranch} />
        <StatCard label="Rentang Data"  value={`${summary.n_months} bulan`}     sub={`${summary.date_min} sampai ${summary.date_max}`} icon={iconDate} />
      </div>

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

      <div className="grid grid-cols-3 gap-4">
        {[
          { nav: 'analysis',    label: 'Cannibalization Analysis', desc: 'OLS + DiD cross-validation per pasangan SKU', icon: '📊' },
          { nav: 'simulator',   label: 'Pricing Simulator',        desc: 'Simulasi what-if diskon & proyeksi revenue', icon: '🎛️' },
          { nav: 'ai',          label: 'AI Insights',              desc: 'Rekomendasi bisnis dari local LLM (Ollama)',  icon: '✨' },
        ].map(({ nav, label, desc, icon }) => (
          <button key={nav} onClick={() => onNav(nav)} className="text-left p-5 bg-white border border-brand-sky/30 rounded-2xl hover:border-brand-blue/40 hover:shadow-sm transition-all group">
            <span className="text-2xl">{icon}</span>
            <p className="text-sm font-semibold text-brand-blue mt-3">{label}</p>
            <p className="text-xs text-gray-400 mt-1">{desc}</p>
          </button>
        ))}
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-2">Kategori SKU</h3>
        <div className="flex flex-wrap gap-2">
          {summary.categories?.map(cat => (
            <span key={cat} className="text-xs bg-brand-sky/15 text-brand-blue px-3 py-1 rounded-full">{cat}</span>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Analysis page
// ─────────────────────────────────────────────────────────────────────────
function AnalysisPage({ datasetId, onResult }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [didResult, setDidResult] = useState(null)
  const [error, setError] = useState(null)

  async function run() {
    setLoading(true); setError(null)
    try {
      const [ols, did] = await Promise.all([api.runCannibalization(datasetId), api.runDid(datasetId)])
      setResult(ols); setDidResult(did)
      onResult?.()
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (!result && !loading) return (
    <Card className="text-center py-16">
      <p className="text-2xl mb-3">📊</p>
      <h3 className="text-base font-semibold text-brand-blue mb-2">Cannibalization Analysis</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">OLS discount-elasticity per pasangan SKU dalam kategori yang sama, dengan diagnostic checks dan cross-validation DiD.</p>
      <button onClick={run} className="bg-brand-blue text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition">Jalankan Analisis</button>
      {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
    </Card>
  )

  if (loading) return <Card><Spinner label="Menjalankan regresi & diagnostic checks..." /></Card>

  const { summary, results, revenue_impact } = result
  const cannibal = results.filter(r => r.verdict === 'CANNIBALIZATION').sort((a, b) => a.coef_disc_a - b.coef_disc_a)
  const chartData = revenue_impact.slice(0, 8).map(r => ({
    name: `${r.sku_a_name.split(' ').slice(-2).join(' ')} → ${r.sku_b_name.split(' ').slice(-2).join(' ')}`,
    impact: Math.abs(r.daily_rev_impact),
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Pasangan" value={summary.total_pairs} />
        <StatCard label="Reliable" value={summary.reliable_pairs} />
        <StatCard label="Cannibalization" value={summary.cannibalization} sub="OLS reliable" />
        <StatCard label="Revenue at Risk" value={`Rp${summary.total_revenue_at_risk.toLocaleString()}`} sub="per hari" accent />
      </div>

      {chartData.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-brand-blue mb-1">Top Revenue Impact</h3>
          <p className="text-xs text-gray-400 mb-4">per 10pp kenaikan diskon SKU_A</p>
          <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 180, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94CFE5" opacity={0.2} />
              <XAxis type="number" tickFormatter={v => `Rp${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={175} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => `Rp${v.toLocaleString()}`} />
              <Bar dataKey="impact" radius={[0, 6, 6, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={i === 0 ? '#004996' : '#94CFE5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-4">Pasangan Cannibalization (p&lt;0.05)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-brand-sky/20">
                <th className="py-2 pr-4 font-medium">Kategori</th>
                <th className="py-2 pr-4 font-medium">SKU A (promo)</th>
                <th className="py-2 pr-4 font-medium">SKU B (terdampak)</th>
                <th className="py-2 pr-4 font-medium">Coef</th>
                <th className="py-2 pr-4 font-medium">p-value</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cannibal.map((r, i) => (
                <tr key={i} className="hover:bg-brand-cream/30 text-xs">
                  <td className="py-2.5 pr-4 text-gray-500">{r.category}</td>
                  <td className="py-2.5 pr-4">{r.sku_a_name}</td>
                  <td className="py-2.5 pr-4">{r.sku_b_name}</td>
                  <td className="py-2.5 pr-4 font-mono text-red-500">{r.coef_disc_a.toFixed(3)}</td>
                  <td className="py-2.5 pr-4 font-mono text-gray-500">{r.p_value.toFixed(4)}</td>
                  <td className="py-2.5"><Badge status={r.reliability} /></td>
                </tr>
              ))}
              {cannibal.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400 text-xs">Tidak ada pasangan cannibalization terdeteksi.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {didResult && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-brand-blue">Cross-Validation — DiD</h3>
            <span className="text-xs text-gray-400">{didResult.summary.significant_cannibalization} dari {didResult.summary.total_pairs} pairs signifikan</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-brand-sky/20">
                  <th className="py-2 pr-4 font-medium">SKU A</th>
                  <th className="py-2 pr-4 font-medium">SKU B</th>
                  <th className="py-2 pr-4 font-medium">DiD (%)</th>
                  <th className="py-2 pr-4 font-medium">p-value</th>
                  <th className="py-2 font-medium">OLS Confirm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {didResult.significant.map((r, i) => {
                  const olsMatch = cannibal.find(o => o.sku_a === r.sku_a && o.sku_b === r.sku_b)
                  return (
                    <tr key={i} className="hover:bg-brand-cream/30">
                      <td className="py-2 pr-4">{r.sku_a_name}</td>
                      <td className="py-2 pr-4">{r.sku_b_name}</td>
                      <td className="py-2 pr-4 font-mono text-red-500">{r.did_pct.toFixed(2)}%</td>
                      <td className="py-2 pr-4 font-mono text-gray-500">{r.p_value.toFixed(4)}</td>
                      <td className="py-2">{olsMatch ? <Badge status="RELIABLE" /> : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
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
      <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">Prophet per SKU dengan yearly seasonality otomatis aktif jika data ≥ 12 bulan.</p>
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

  if (loading) return <Card><Spinner label="Melatih model Prophet per SKU..." /></Card>

  const selected = result.per_sku.find(s => s.sku_id === selectedSku)
  const chartData = selected?.daily_series.map(d => ({ date: d.date.slice(5), qty: d.qty })) || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Forecast Horizon" value={`${result.forecast_days} hari`} sub={`mulai ${result.forecast_start}`} />
        <StatCard label="Yearly Seasonality" value={result.yearly_seasonality_used ? 'Aktif' : 'Nonaktif'} sub={result.yearly_seasonality_used ? 'Data ≥ 12 bulan' : 'Data < 12 bulan'} />
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
                <th className="py-2 pr-4 font-medium">Range 95% CI</th>
                <th className="py-2 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {result.per_sku.map((s, i) => (
                <tr key={i} onClick={() => setSelectedSku(s.sku_id)} className={`cursor-pointer hover:bg-brand-cream/30 ${s.sku_id === selectedSku ? 'bg-brand-sky/10' : ''}`}>
                  <td className="py-2.5 pr-4 font-mono">{s.sku_id}</td>
                  <td className="py-2.5 pr-4">{s.sku_name}</td>
                  <td className="py-2.5 pr-4 text-gray-500">{s.category}</td>
                  <td className="py-2.5 pr-4 font-mono">{s.qty_forecast.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 font-mono text-gray-400">{s.qty_lower.toLocaleString()} – {s.qty_upper.toLocaleString()}</td>
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
  const [selectedWeek, setSelectedWeek]     = useState(0) // 0 = all 4 weeks
  const [loading, setLoading]               = useState(false)
  const [result, setResult]                 = useState(null)
  const [error, setError]                   = useState(null)

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
  }, [datasetId, hasCannibalization])

  async function run() {
    if (!selectedSku) return
    setLoading(true); setError(null)
    try {
      const data = await api.simulate(datasetId, selectedSku, selectedBranch, discountPct / 100)
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

  const fmt    = (n) => n >= 0 ? `+Rp${Math.abs(Math.round(n)).toLocaleString()}` : `-Rp${Math.abs(Math.round(n)).toLocaleString()}`
  const fmtRev = (n) => `Rp${Math.round(Math.abs(n)).toLocaleString()}`

  // Build per-week projection data from result for the dual-line chart
  function buildWeeklyChartData(res) {
    if (!res) return []
    const baseRev   = res.sku_a_result.baseline_rev_daily
    const promoRev  = res.sku_a_result.rev_new_daily
    // Weekly multipliers: slight ramp-up effect (week 1 adoption, week 2-3 peak, week 4 saturation)
    const weekMultipliers = [0.85, 1.05, 1.10, 1.00]
    return [1, 2, 3, 4].map((w, i) => ({
      week: `Minggu ${w}`,
      promo:    Math.round(promoRev  * weekMultipliers[i] * 7),
      nonPromo: Math.round(baseRev   * weekMultipliers[i] * 7),
    }))
  }

  const allWeeksData  = result ? buildWeeklyChartData(result) : []
  // Filter to selected week or show all
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
            <label className="text-xs text-gray-400 mb-1 block">SKU (Produk)</label>
            <select value={selectedSku} onChange={e => setSelectedSku(e.target.value)} className="w-full border border-brand-sky/40 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky">
              {skuList.map(s => <option key={s.SKU_ID} value={s.SKU_ID}>{s.SKU_ID} — {s.SKU_Name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Branch</label>
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} className="w-full border border-brand-sky/40 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky">
              {branchList.map(b => <option key={b} value={b}>{b === 'all' ? 'Semua Branch' : b}</option>)}
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
            <StatCard label="Uplift SKU A"          value={fmt(result.sku_a_result.rev_uplift_daily)}   sub={`+${result.sku_a_result.qty_uplift_pct}% qty/hari`} />
            <StatCard label="Revenue Lost (Kanibal)" value={result.summary.total_rev_lost <= 0 ? `-Rp${Math.abs(result.summary.total_rev_lost).toLocaleString()}` : `+Rp${result.summary.total_rev_lost.toLocaleString()}`} sub={`${result.summary.n_sku_cannibalized} SKU terdampak`} />
            <StatCard label="Net Revenue Impact"     value={fmt(result.summary.net_revenue_impact)}       sub={result.summary.is_worth_it ? '✅ Worth it' : '⚠️ Tidak worth it'} accent={result.summary.is_worth_it} />
            <StatCard label="Break-even Discount"    value={result.summary.break_even_discount !== null ? `${(result.summary.break_even_discount * 100).toFixed(1)}%` : 'N/A'} sub="diskon minimum agar net > 0" />
          </div>

          {/* ── Dual-line chart: Promo vs Non-Promo per minggu ── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-brand-blue">
                Proyeksi Revenue — {result.input.sku_name}
                <span className="ml-2 text-xs font-normal text-gray-400">Diskon {(result.input.discount_pct * 100).toFixed(0)}%</span>
              </h3>
              {/* Week filter pills */}
              <div className="flex gap-1">
                {weekLabels.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedWeek(i)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      selectedWeek === i
                        ? 'bg-brand-blue text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4 mb-3">
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block w-4 h-0.5 bg-[#3b82f6] rounded"></span> Dengan Diskon (Promo)
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="inline-block w-4 h-0.5 bg-[#94a3b8] rounded" style={{borderTop:'2px dashed #94a3b8', background:'none'}}></span> Tanpa Diskon (Non-Promo)
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
              Detail SKU A — {result.input.sku_name}
              <span className="ml-2 text-xs font-normal text-gray-400">Diskon {(result.input.discount_pct * 100).toFixed(0)}% · Branch: {result.input.branch}</span>
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              {[
                ['Qty baseline/hari',        result.sku_a_result.baseline_qty_daily.toLocaleString()],
                ['Qty setelah diskon/hari',  Math.round(result.sku_a_result.qty_new_daily).toLocaleString()],
                ['Uplift qty',               `+${result.sku_a_result.qty_uplift_pct}%`],
                ['Revenue baseline/hari',    fmtRev(result.sku_a_result.baseline_rev_daily)],
                ['Revenue setelah diskon/hari', fmtRev(result.sku_a_result.rev_new_daily)],
                ['Uplift revenue/hari',      fmt(result.sku_a_result.rev_uplift_daily)],
              ].map(([label, val]) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-semibold text-brand-blue mt-1">{val}</p>
                </div>
              ))}
            </div>
          </Card>

          {result.cannibalization_impact.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-brand-blue mb-4">SKU Terdampak</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-brand-sky/20">
                      <th className="py-2 pr-4 font-medium">SKU</th>
                      <th className="py-2 pr-4 font-medium">Nama</th>
                      <th className="py-2 pr-4 font-medium">Tipe</th>
                      <th className="py-2 pr-4 font-medium">Δ Qty (%)</th>
                      <th className="py-2 pr-4 font-medium">Revenue Baseline/hari</th>
                      <th className="py-2 pr-4 font-medium">Revenue Impact/hari</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.cannibalization_impact.map((r, i) => (
                      <tr key={i} className="hover:bg-brand-cream/30">
                        <td className="py-2.5 pr-4 font-mono">{r.sku_b_id}</td>
                        <td className="py-2.5 pr-4">{r.sku_b_name}</td>
                        <td className="py-2.5 pr-4"><Badge status={r.verdict} /></td>
                        <td className={`py-2.5 pr-4 font-mono font-semibold ${r.qty_change_pct < 0 ? 'text-red-500' : 'text-green-600'}`}>{r.qty_change_pct > 0 ? '+' : ''}{r.qty_change_pct}%</td>
                        <td className="py-2.5 pr-4 font-mono">{fmtRev(r.baseline_rev)}</td>
                        <td className={`py-2.5 pr-4 font-mono font-semibold ${r.rev_impact < 0 ? 'text-red-500' : 'text-green-600'}`}>{r.rev_impact >= 0 ? '+' : '-'}Rp{Math.abs(r.rev_impact).toLocaleString()}</td>
                        <td className="py-2.5"><Badge status={r.reliability} /></td>
                      </tr>
                    ))}
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
        <StatCard label="SKU Perlu Perhatian" value="—" />
        <StatCard label="Confidence Level" value="—" accent />
      </div>
      <Card className="text-center py-12">
        <p className="text-2xl mb-3">✨</p>
        <h3 className="text-base font-semibold text-brand-blue mb-2">AI Insights</h3>
        <p className="text-sm text-gray-400 mb-4 max-w-sm mx-auto">Ringkasan & rekomendasi bisnis dari hasil cannibalization + forecast, dihasilkan oleh local LLM (Ollama).</p>
        {!ready && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 max-w-sm mx-auto">Jalankan <strong>Analysis</strong> dan <strong>Forecasting</strong> terlebih dahulu.</p>}
        <button onClick={run} disabled={!ready} className="bg-brand-blue text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition disabled:opacity-40">Generate Rekomendasi</button>
        {error && <p className="text-xs text-red-500 mt-4 bg-red-50 rounded-xl p-3">{error}</p>}
      </Card>
    </div>
  )

  if (loading) return <Card><Spinner label="Local LLM sedang menganalisis..." /></Card>

  if (recs) {
    const items = recs.recommendations || []
    const stats = recs.summary || {}
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Rekomendasi" value={items.length} />
          <StatCard label="Potensi Revenue Saved" value={stats.potential_revenue_saved || '—'} />
          <StatCard label="SKU Perlu Perhatian" value={stats.sku_at_risk || '—'} />
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
            <span className="font-medium text-gray-800">Ollama (local)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-gray-600">Model</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">llama3.1</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-gray-600">Endpoint</span>
            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">localhost:11434</span>
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="text-sm font-semibold text-brand-blue mb-2">Tentang MAPL+</h3>
        <p className="text-xs text-gray-400">Cannibalization & Forecast Dashboard — v2.0</p>
        <p className="text-xs text-gray-400 mt-1">OLS · DiD · Prophet · Ollama</p>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────
export default function App() {
  const [username, setUsername]         = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [datasets, setDatasets]         = useState([])
  const [active, setActive]             = useState(null)
  const [activeChecks, setActiveChecks] = useState(null)
  const [nav, setNav]                   = useState('dashboard')
  const [analysisFlags, setAnalysisFlags] = useState({ cannibalization: false, forecast: false })

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
      // Auto-select dataset pertama dan restore analysisFlags dari data server
      if (list.length > 0) {
        const first = list[0]
        setActive(first)
        setAnalysisFlags({ cannibalization: first.has_cannibalization, forecast: first.has_forecast })
      }
    }).catch(() => {})
  }, [username])

  function handleLogout() {
    setToken(null); setUsername(null); setDatasets([]); setActive(null)
  }

  function handleUploaded(data) {
    const ds = { dataset_id: data.dataset_id, filename: data.filename, summary: data.summary, has_cannibalization: false, has_forecast: false }
    setDatasets(prev => [...prev, ds])
    setActive(ds); setActiveChecks(data.checks)
    setAnalysisFlags({ cannibalization: false, forecast: false })
    setNav('dashboard')
  }

  function handleDeleted(id) {
    setDatasets(prev => prev.filter(d => d.dataset_id !== id))
    if (active?.dataset_id === id) { setActive(null); setNav('dashboard') }
  }

  function handleSelect(d) {
    setActive(d); setActiveChecks(null)
    setAnalysisFlags({ cannibalization: d.has_cannibalization, forecast: d.has_forecast })
    setNav('dashboard')
  }

  function handleExport() {
    alert('Export coming soon — akan download PDF ringkasan analisis.')
  }

  const breadcrumbMap = {
    dashboard:   ['Dashboard', active?.filename].filter(Boolean),
    analysis:    ['Dashboard', 'Analysis'],
    simulator:   ['Dashboard', 'Simulator'],
    ai:          ['Dashboard', 'AI Insights'],
    settings:    ['Dashboard', 'Settings'],
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

        {nav === 'dashboard'   && <DashboardPage active={active} checks={activeChecks} onNav={setNav} />}
        {nav === 'analysis'    && active && <AnalysisPage    datasetId={active.dataset_id} onResult={() => setAnalysisFlags(f => ({ ...f, cannibalization: true }))} />}
        {nav === 'simulator'   && active && <SimulatorPage   datasetId={active.dataset_id} hasCannibalization={analysisFlags.cannibalization} />}
        {nav === 'ai'          && active && <AIInsightsPage  datasetId={active.dataset_id} hasCannibalization={analysisFlags.cannibalization} hasForecast={analysisFlags.forecast} />}
        {nav === 'settings'    && <SettingsPage username={username} />}
        {!active && !['dashboard','settings'].includes(nav) && (
          <Card className="text-center py-16">
            <p className="text-gray-400 text-sm">Pilih dataset di sidebar terlebih dahulu.</p>
          </Card>
        )}
      </main>
    </div>
  )
}
