import { useCallback, useEffect, useState } from 'react';
import { api, onOrdersChanged } from '../api.js';
import { navigate } from '../router.js';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChips,
  PageHeader,
  STATUS_ORDER,
  SearchInput,
  Skeleton,
  StatusBadge,
  cx,
  formatDay,
  formatINR,
  formatTime,
  statusLabel,
  td,
  th,
} from './ui.jsx';
import OrderDetail from './OrderDetail.jsx';

const VALID = new Set(['ALL', ...STATUS_ORDER]);

export default function Orders({ route }) {
  const [q, setQ] = useState(route.query.q || '');
  const [status, setStatus] = useState(VALID.has(route.query.status) ? route.query.status : 'ALL');
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Follow links from the dashboard (#/orders?status=PACKED) and the top-bar search (#/orders?q=...).
  useEffect(() => {
    if (VALID.has(route.query.status)) setStatus(route.query.status);
  }, [route.query.status]);
  useEffect(() => {
    if (route.query.q !== undefined) setQ(route.query.q);
  }, [route.query.q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([api.orders({ q: q.trim(), status }), api.stats()]);
      setOrders(list);
      setCounts({ ALL: stats.totalOrders, ...stats.ordersByStatus });
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => {
    const t = setTimeout(load, 200); // debounce typing
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => onOrdersChanged(load), [load]);

  const openOrder = (ref) => navigate(`/orders/${ref}`);
  const closeOrder = useCallback(() => navigate('/orders'), []);
  const clearFilters = () => {
    setQ('');
    setStatus('ALL');
  };

  const tabs = ['ALL', ...STATUS_ORDER].map((s) => ({
    value: s,
    label: s === 'ALL' ? 'All' : statusLabel(s),
    count: counts ? counts[s] : undefined,
  }));
  const filtered = q.trim() || status !== 'ALL';

  return (
    <>
      <PageHeader
        title="Orders"
        actions={
          <Button icon="plus" onClick={() => navigate('/new')}>
            Create order
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line px-2 py-2 md:flex-row md:items-center md:justify-between">
          <div className="overflow-x-auto">
            <FilterChips options={tabs} value={status} onChange={setStatus} label="Filter by fulfilment status" />
          </div>
          <div className="w-full md:w-72">
            <SearchInput value={q} onChange={setQ} placeholder="Search reference or customer" label="Search orders" />
          </div>
        </div>

        {error && (
          <div className="p-4">
            <ErrorState message={error} onRetry={load} />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className={th}>Order</th>
                <th scope="col" className={cx(th, 'hidden md:table-cell')}>Date</th>
                <th scope="col" className={th}>Customer</th>
                <th scope="col" className={cx(th, 'text-right')}>Total</th>
                <th scope="col" className={th}>Fulfilment status</th>
                <th scope="col" className={cx(th, 'hidden text-right sm:table-cell')}>Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading && orders.length === 0
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="px-4 py-2.5">
                        <Skeleton className="h-5 bg-[#ebebeb]" />
                      </td>
                    </tr>
                  ))
                : orders.map((o) => (
                    <tr
                      key={o.id}
                      onClick={() => openOrder(o.reference)}
                      className={cx('cursor-pointer transition-colors hover:bg-hover', route.id === o.reference && 'bg-[#f1f1f1]')}
                    >
                      <td className={cx(td, 'whitespace-nowrap font-semibold')}>
                        <a href={`#/orders/${o.reference}`} onClick={(e) => e.stopPropagation()} className="hover:underline focus-visible:outline-2 focus-visible:outline-link">
                          {o.reference}
                        </a>
                      </td>
                      <td className={cx(td, 'hidden whitespace-nowrap text-ink-subdued md:table-cell')}>
                        {formatDay(o.createdAt)} at {formatTime(o.createdAt)}
                      </td>
                      <td className={td}>
                        <span className="block max-w-52 truncate">{o.customerName}</span>
                      </td>
                      <td className={cx(td, 'whitespace-nowrap text-right tabular-nums')}>{formatINR(o.totalPaise)}</td>
                      <td className={td}>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className={cx(td, 'hidden whitespace-nowrap text-right tabular-nums text-ink-subdued sm:table-cell')}>
                        {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>

          {!loading && !error && orders.length === 0 && (
            <EmptyState
              icon={filtered ? 'search' : 'orders'}
              title={filtered ? 'No orders found' : 'No orders yet'}
              description={filtered ? 'Try changing the search term or status tab.' : 'Orders you create will appear here.'}
              action={
                filtered ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" icon="plus" onClick={() => navigate('/new')}>
                    Create order
                  </Button>
                )
              }
            />
          )}
        </div>

        {orders.length > 0 && (
          <div className="border-t border-line px-4 py-2.5 text-xs text-ink-subdued">
            {orders.length} order{orders.length === 1 ? '' : 's'}
            {filtered && ' matching filters'}
          </div>
        )}
      </Card>

      <OrderDetail idOrRef={route.id} onClose={closeOrder} />
    </>
  );
}
