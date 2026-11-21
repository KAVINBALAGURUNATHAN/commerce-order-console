import { useCallback, useEffect, useState } from 'react';
import { api, onOrdersChanged } from '../api.js';
import { navigate } from '../router.js';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  ProductImage,
  STATUS_ORDER,
  Skeleton,
  StatusBadge,
  StockBadge,
  cx,
  formatINR,
  statusMeta,
  td,
  th,
} from './ui.jsx';

const shortDay = (yyyyMmDd) => new Date(`${yyyyMmDd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const relativeTime = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const scrollToAlerts = (e) => {
  e.preventDefault();
  document.getElementById('stock-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ---------- metrics bar ----------

function Sparkline({ values, className }) {
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 28;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill="#005bd3" fillOpacity="0.08" stroke="none" />
      <polyline points={pts} fill="none" stroke="#005bd3" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function MetricsBar({ stats }) {
  const daily = stats.ordersByDay.map((d) => d.orders);
  const stockIssues = stats.lowStockCount + stats.outOfStockCount;
  const metrics = [
    { label: 'Total orders', value: stats.totalOrders, href: '#/orders', spark: daily, hint: `${formatINR(stats.revenuePaise)} booked` },
    { label: 'Placed', value: stats.ordersByStatus.PLACED, href: '#/orders?status=PLACED', hint: 'Awaiting packing' },
    { label: 'Packed', value: stats.ordersByStatus.PACKED, href: '#/orders?status=PACKED', hint: 'Ready to ship' },
    { label: 'Shipped', value: stats.ordersByStatus.SHIPPED, href: '#/orders?status=SHIPPED', hint: 'Completed' },
    { label: 'Cancelled', value: stats.ordersByStatus.CANCELLED, href: '#/orders?status=CANCELLED', hint: 'Stock restored' },
    { label: 'Low stock products', value: stats.lowStockCount, href: '#stock-alerts', hint: `${stats.outOfStockCount} out of stock`, warn: stockIssues > 0 },
  ];
  return (
    <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 xl:grid-cols-6">
      {metrics.map((m) => (
        <a
          key={m.label}
          href={m.href}
          onClick={m.href === '#stock-alerts' ? scrollToAlerts : undefined}
          className="block bg-white px-4 py-3 transition-colors hover:bg-hover focus-visible:relative focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link"
        >
          <p className="w-fit text-xs font-medium text-ink-subdued underline decoration-ink-muted/60 decoration-dotted underline-offset-4">{m.label}</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <p className="text-xl font-bold tabular-nums text-ink">{m.value}</p>
            {m.spark && <Sparkline values={m.spark} className="mb-1 h-6 w-16" />}
          </div>
          <p className={cx('mt-0.5 truncate text-xs', m.warn ? 'font-medium text-[#8e0b21]' : 'text-ink-muted')}>{m.hint}</p>
        </a>
      ))}
    </Card>
  );
}

// ---------- action items ----------

function ActionItems({ stats }) {
  const { PLACED, PACKED } = stats.ordersByStatus;
  const stockIssues = stats.lowStockCount + stats.outOfStockCount;
  const items = [
    PLACED > 0 && { icon: 'package', text: `${PLACED} order${PLACED > 1 ? 's' : ''} to pack`, href: '#/orders?status=PLACED' },
    PACKED > 0 && { icon: 'truck', text: `${PACKED} order${PACKED > 1 ? 's' : ''} to ship`, href: '#/orders?status=PACKED' },
    stockIssues > 0 && { icon: 'alert', text: `${stockIssues} product${stockIssues > 1 ? 's' : ''} low or out of stock`, href: '#stock-alerts' },
  ].filter(Boolean);

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-subdued">
        <Icon name="checkCircle" className="h-4 w-4 text-[#29845a]" /> You’re all caught up. Nothing is waiting to be packed or shipped.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <a
          key={it.text}
          href={it.href}
          onClick={it.href === '#stock-alerts' ? scrollToAlerts : undefined}
          className="inline-flex h-8 items-center gap-2 rounded-full bg-white pl-3 pr-2 text-sm font-medium text-ink shadow-card transition-colors hover:bg-hover"
        >
          <Icon name={it.icon} className="h-4 w-4 text-ink-subdued" />
          {it.text}
          <Icon name="chevronRight" className="h-4 w-4 text-ink-muted" />
        </a>
      ))}
    </div>
  );
}

// ---------- charts ----------

function OrdersOverTime({ days }) {
  const max = Math.max(1, ...days.map((d) => d.orders));
  const total = days.reduce((s, d) => s + d.orders, 0);
  const revenue = days.reduce((s, d) => s + d.revenuePaise, 0);
  const ticks = [0, Math.floor(days.length / 2), days.length - 1];
  return (
    <Card>
      <CardHeader title="Orders over time" subtitle="Last 14 days" />
      <div className="px-4 pb-4">
        <p className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums text-ink">{total}</span>
          <span className="text-xs text-ink-subdued">
            orders · <span className="font-medium text-ink">{formatINR(revenue)}</span> booked
          </span>
        </p>
        <div className="relative mt-3 h-32" role="img" aria-label={`Orders per day for the last 14 days, ${total} in total`}>
          {[0, 0.5, 1].map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${f * 100}%` }}>
              {f === 1 && <span className="absolute -top-2 right-0 bg-white pl-1 text-[10px] tabular-nums text-ink-muted">{max}</span>}
            </div>
          ))}
          <div className="absolute inset-y-0 left-0 right-7 flex items-end gap-1.5">
            {days.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 items-end">
                <div
                  className={cx('w-full rounded-t-[3px] transition-colors', d.orders ? 'bg-[#4ba3e8] group-hover:bg-link' : 'bg-line')}
                  style={{ height: d.orders ? `${(d.orders / max) * 100}%` : '2px' }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-topbar px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                  {shortDay(d.date)} · {d.orders} order{d.orders === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mr-7 mt-1.5 flex justify-between text-[11px] text-ink-muted">
          {ticks.map((i) => (
            <span key={i}>{shortDay(days[i].date)}</span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function StatusBreakdown({ stats }) {
  const total = stats.totalOrders;
  let offset = 0;
  const segments = STATUS_ORDER.map((s) => {
    const pct = total ? (stats.ordersByStatus[s] / total) * 100 : 0;
    const seg = { s, pct, offset };
    offset += pct;
    return seg;
  }).filter((x) => x.pct > 0);

  return (
    <Card>
      <CardHeader title="Fulfilment status" subtitle="All orders" />
      <div className="flex items-center gap-5 px-4 pb-4">
        <div className="relative h-24 w-24 shrink-0">
          <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#ebebeb" strokeWidth="4" />
            {segments.map(({ s, pct, offset: o }) => (
              <circle key={s} cx="18" cy="18" r="15.915" fill="none" stroke={statusMeta(s).hex} strokeWidth="4" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-o} />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-base font-bold leading-none tabular-nums text-ink">{total}</p>
              <p className="mt-0.5 text-[10px] text-ink-muted">orders</p>
            </div>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {STATUS_ORDER.map((s) => (
            <li key={s}>
              <a href={`#/orders?status=${s}`} className="flex items-center gap-2 text-sm hover:text-link">
                <span className={cx('h-2 w-2 shrink-0 rounded-sm', statusMeta(s).bar)} />
                <span className="flex-1 text-ink-subdued">{statusMeta(s).label}</span>
                <span className="font-semibold tabular-nums text-ink">{stats.ordersByStatus[s]}</span>
                <span className="w-9 text-right text-xs tabular-nums text-ink-muted">{total ? Math.round((stats.ordersByStatus[s] / total) * 100) : 0}%</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

// ---------- lists ----------

function RecentOrders({ orders }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Recent orders"
        action={
          <a href="#/orders" className="text-sm font-medium text-link hover:underline">
            View all
          </a>
        }
      />
      {orders.length === 0 ? (
        <EmptyState
          compact
          icon="cart"
          title="No orders yet"
          description="Orders you create will show up here."
          action={
            <Button icon="plus" size="sm" onClick={() => navigate('/new')}>
              Create order
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Date</th>
                <th className={th}>Customer</th>
                <th className={cx(th, 'text-right')}>Total</th>
                <th className={th}>Fulfilment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-t border-line">
              {orders.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-hover" onClick={() => navigate(`/orders/${o.reference}`)}>
                  <td className={cx(td, 'font-semibold')}>
                    <a href={`#/orders/${o.reference}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                      {o.reference}
                    </a>
                  </td>
                  <td className={cx(td, 'whitespace-nowrap text-ink-subdued')}>{relativeTime(o.createdAt)}</td>
                  <td className={cx(td, 'max-w-40 truncate')}>{o.customerName}</td>
                  <td className={cx(td, 'whitespace-nowrap text-right tabular-nums')}>{formatINR(o.totalPaise)}</td>
                  <td className={td}>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function StockAlerts({ stats }) {
  return (
    <Card id="stock-alerts" className="scroll-mt-24 overflow-hidden">
      <CardHeader
        title="Inventory alerts"
        subtitle={`${stats.lowStockThreshold} or fewer units left`}
        action={
          <a href="#/new" className="text-sm font-medium text-link hover:underline">
            Catalogue
          </a>
        }
      />
      {stats.stockAlerts.length === 0 ? (
        <EmptyState compact icon="checkCircle" title="All products well stocked" />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {stats.stockAlerts.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2">
              <ProductImage sku={p.sku} category={p.category} muted={p.stock === 0} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                <p className="text-xs text-ink-muted">{p.sku}</p>
              </div>
              <StockBadge status={p.stockStatus} stock={p.stock} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function InventoryOverview({ inventory }) {
  const maxUnits = Math.max(1, ...inventory.byCategory.map((c) => c.units));
  return (
    <Card>
      <CardHeader title="Inventory by category" subtitle={`${inventory.skuCount} products · ${inventory.totalUnits} units · ${formatINR(inventory.stockValuePaise)} at retail`} />
      <ul className="space-y-3 px-4 pb-4 pt-1">
        {inventory.byCategory.map((c) => (
          <li key={c.category}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{c.category}</span>
              <span className="text-xs text-ink-subdued">
                <span className="font-semibold tabular-nums text-ink">{c.units}</span> units · {c.skus} products
                {c.outOfStock > 0 && <span className="font-medium text-[#8e0b21]"> · {c.outOfStock} sold out</span>}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#ebebeb]">
              <div className="h-full rounded-full bg-[#303030]" style={{ width: `${(c.units / maxUnits) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-[92px] rounded-xl bg-white" />
      <Skeleton className="h-8 w-80 rounded-full bg-white" />
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-64 rounded-xl bg-white" />
        <Skeleton className="h-64 rounded-xl bg-white" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setStats(await api.stats());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    return onOrdersChanged(load);
  }, [load]);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={today}
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={load} loading={refreshing && !!stats}>
              Refresh
            </Button>
            <Button icon="plus" onClick={() => navigate('/new')}>
              Create order
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorState message={error} onRetry={load} />
        </div>
      )}

      {!stats ? (
        !error && <DashboardSkeleton />
      ) : (
        <div className="space-y-4">
          <MetricsBar stats={stats} />
          <ActionItems stats={stats} />

          <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <OrdersOverTime days={stats.ordersByDay} />
              <RecentOrders orders={stats.recentOrders} />
            </div>
            <div className="space-y-4">
              <StatusBreakdown stats={stats} />
              <StockAlerts stats={stats} />
              <InventoryOverview inventory={stats.inventory} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
