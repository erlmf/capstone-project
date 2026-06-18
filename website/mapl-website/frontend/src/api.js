const API_BASE = '/api'

export function getToken() {
  return localStorage.getItem('token')
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token)
  else localStorage.removeItem('token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { ...(options.headers || {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = new Error(data.detail || `Request gagal (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  register: (username, password) =>
    request('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),

  login: (username, password) => {
    const form = new URLSearchParams()
    form.append('username', username)
    form.append('password', password)
    return request('/auth/login', { method: 'POST', body: form })
  },

  me: () => request('/auth/me'),

  uploadDataset: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return request('/upload', { method: 'POST', body: formData })
  },

  listDatasets: () => request('/datasets'),

  deleteDataset: (id) => request(`/datasets/${id}`, { method: 'DELETE' }),

  runCannibalization: (id) =>
    request(`/datasets/${id}/cannibalization`, { method: 'POST' }),

  runDid: (id) =>
    request(`/datasets/${id}/did`, { method: 'POST' }),

  runForecast: (id, days) =>
    request(`/datasets/${id}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forecast_days: days }),
    }),

  aiRecommendation: (id) =>
    request(`/datasets/${id}/ai-recommendation`, { method: 'POST' }),

  simulate: (id, sku_id, branch, discount_pct) =>
    request(`/datasets/${id}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_id, branch, discount_pct }),
    }),
}

export { request }