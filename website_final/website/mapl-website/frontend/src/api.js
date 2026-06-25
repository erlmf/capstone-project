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

function normalizeAnalisis(elasticity, did, matrix, trends) {
  const confirmed = did.confirmed || []
  const rankByCategory = {}
  confirmed
    .slice()
    .sort((a, b) => a.category.localeCompare(b.category) || (b.cannib_coef || 0) - (a.cannib_coef || 0))
    .forEach(r => {
      rankByCategory[r.category] = (rankByCategory[r.category] || 0) + 1
      r.category_rank = rankByCategory[r.category]
    })
  const revenueImpact = confirmed
    .filter(r => r.cannib_coef !== null)
    .map(r => ({
      sku_a: r.sku_a,
      sku_b: r.sku_b,
      sku_a_name: r.sku_a_name,
      sku_b_name: r.sku_b_name,
      daily_rev_impact: Math.round((r.cannib_coef || 0) * 100000),
    }))
    .sort((a, b) => Math.abs(b.daily_rev_impact) - Math.abs(a.daily_rev_impact))

  return {
    summary: {
      total_pairs: did.summary?.total_pairs || 0,
      reliable_pairs: (elasticity.results || []).filter(r => r.p_value < 0.05).length,
      cannibalization: did.summary?.confirmed || 0,
      total_revenue_at_risk: revenueImpact.reduce((sum, r) => sum + Math.abs(r.daily_rev_impact), 0),
    },
    results: confirmed.map(r => ({
      category: r.category,
      sku_a: r.sku_a,
      sku_b: r.sku_b,
      sku_a_name: r.sku_a_name,
      sku_b_name: r.sku_b_name,
      category_rank: r.category_rank,
      coef_disc_a: -(r.cannib_coef || 0),
      p_value: r.p_value,
      verdict: 'CANNIBALIZATION',
    })),
    revenue_impact: revenueImpact,
    matrix,
    trends,
  }
}

function normalizeDid(did) {
  const confirmed = did.confirmed || []
  return {
    ...did,
    summary: {
      ...(did.summary || {}),
      significant_cannibalization: did.summary?.confirmed || 0,
    },
    significant: confirmed.map(r => ({
      ...r,
      did_pct: r.did_ab,
    })),
  }
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

  runCannibalization: async (id) => {
    const { ols } = await api.runAnalisisPipelineCompat(id)
    return ols
  },

  runElasticity: (id) =>
    request(`/datasets/${id}/elasticity`, { method: 'POST' }),

  runDid: async (id) => normalizeDid(await request(`/datasets/${id}/did`, { method: 'POST' })),

  buildMatrix: (id) =>
    request(`/datasets/${id}/cannibalization/matrix`, { method: 'POST' }),

  getCategoryTrends: (id) =>
    request(`/datasets/${id}/category-trends`),

  runAnalisisPipeline: async (id) => {
    const trends = await api.getCategoryTrends(id)
    const elasticity = await api.runElasticity(id)
    const did = await request(`/datasets/${id}/did`, { method: 'POST' })
    const matrix = await api.buildMatrix(id)
    return { elasticity, did, matrix, trends }
  },

  runAnalisisPipelineCompat: async (id) => {
    const { elasticity, did, matrix, trends } = await api.runAnalisisPipeline(id)
    return {
      ols: normalizeAnalisis(elasticity, did, matrix, trends),
      did: normalizeDid(did),
      matrix,
      trends,
    }
  },

  runDidSimulator: (id) =>
    request(`/datasets/${id}/did-simulator`, { method: 'POST' }),

  getDatasetResults: (id) =>
    request(`/datasets/${id}/results`).catch(() => ({})),

  runForecast: (id, days) =>
    request(`/datasets/${id}/forecast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forecast_days: days }),
    }),

  aiRecommendation: (id) =>
    request(`/datasets/${id}/ai-recommendation`, { method: 'POST' }),

  aiInsight: (id, context, data) =>
    request(`/datasets/${id}/ai-insight`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, data }),
    }),

  aiStatus: () => request('/ai/status'),

  simulate: (id, sku_id, branch, discount_pct, forecast_week = 0) =>
    request(`/datasets/${id}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku_id, branch, discount_pct, forecast_week }),
    }),
}

export { request }