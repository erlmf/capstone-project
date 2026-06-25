import React, { useState } from 'react'
import { api, setToken } from './api'

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const fn = mode === 'login' ? api.login : api.register
      const data = await fn(username, password)
      setToken(data.access_token)
      onAuthenticated(data.username)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-cream flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-brand-sky/30 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-3">
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#004996', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 26, height: 26 }}>
                <polyline points="4,24 9,13 15,20 21,11 27,16" stroke="#94CFE5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                <circle cx="15" cy="9" r="3" fill="#FFFFFF"/>
                <polyline points="22,8 27,8 27,13" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
          </div>
          <h1 className="text-lg font-semibold text-brand-blue">
            MAPL<span className="text-brand-sky">+</span>
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className="mt-1 w-full border border-brand-sky/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky"
              placeholder="minimal 3 karakter"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 w-full border border-brand-sky/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-sky"
              placeholder="minimal 6 karakter"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue text-white rounded-full py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? 'Memproses...' : mode === 'login' ? 'Masuk' : 'Daftar'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-5">
          {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null) }}
            className="text-brand-blue font-medium hover:underline"
          >
            {mode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
          </button>
        </p>
      </div>
    </div>
  )
}
