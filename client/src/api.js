export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || `Request failed (${status})`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: { code: 'NETWORK', message: 'Cannot reach the server. Check that the API is running.' } });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// Lets independent views (sidebar badge, dashboard, order list) refresh after a write.
const ORDERS_CHANGED = 'orders:changed';
export const notifyOrdersChanged = () => window.dispatchEvent(new Event(ORDERS_CHANGED));
export const onOrdersChanged = (fn) => {
  window.addEventListener(ORDERS_CHANGED, fn);
  return () => window.removeEventListener(ORDERS_CHANGED, fn);
};

export const api = {
  products: () => request('/products'),
  stats: () => request('/stats'),
  orders: ({ q, status }) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status && status !== 'ALL') params.set('status', status);
    return request(`/orders?${params}`);
  },
  order: (id) => request(`/orders/${encodeURIComponent(id)}`),
  createOrder: async (payload, idempotencyKey) => {
    const order = await request('/orders', { method: 'POST', body: payload, headers: { 'Idempotency-Key': idempotencyKey } });
    notifyOrdersChanged();
    return order;
  },
  setStatus: async (id, status) => {
    const order = await request(`/orders/${id}/status`, { method: 'POST', body: { status } });
    notifyOrdersChanged();
    return order;
  },
};
