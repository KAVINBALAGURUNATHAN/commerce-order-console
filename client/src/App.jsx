import { useEffect, useState } from 'react';
import { api, onOrdersChanged } from './api.js';
import { navigate, useRoute } from './router.js';
import { Icon, ToastProvider, cx } from './components/ui.jsx';
import Dashboard from './components/Dashboard.jsx';
import NewOrder from './components/NewOrder.jsx';
import Orders from './components/Orders.jsx';

const NAV = [
  { page: 'dashboard', href: '#/dashboard', label: 'Home', icon: 'dashboard' },
  { page: 'orders', href: '#/orders', label: 'Orders', icon: 'orders' },
  { page: 'new', href: '#/new', label: 'Create order', icon: 'cart' },
];

/** Orders waiting to be packed, shown as a nav badge. */
function usePendingCount() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    const load = () =>
      api
        .stats()
        .then((s) => setCount(s.ordersByStatus.PLACED))
        .catch(() => setCount(null));
    load();
    return onOrdersChanged(load);
  }, []);
  return count;
}

function NavLinks({ active, pending, horizontal }) {
  return (
    <nav aria-label="Main" className={cx('flex gap-0.5', horizontal ? 'flex-row' : 'flex-col')}>
      {NAV.map((item) => {
        const isActive = active === item.page;
        return (
          <a
            key={item.page}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cx(
              'flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-2 text-sm transition-colors',
              isActive ? 'bg-white font-semibold text-ink shadow-[0_1px_0_rgba(0,0,0,0.06)]' : 'font-medium text-ink-subdued hover:bg-black/5 hover:text-ink'
            )}
          >
            <Icon name={item.icon} className={cx('h-4 w-4', isActive ? 'text-ink' : 'text-ink-muted')} strokeWidth={isActive ? 2 : 1.75} />
            {item.label}
            {item.page === 'orders' && pending > 0 && (
              <span className="ml-auto rounded-md bg-[#e3e3e3] px-1.5 text-xs font-semibold tabular-nums text-ink" title={`${pending} order(s) waiting to be packed`}>
                {pending}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const submit = (e) => {
    e.preventDefault();
    navigate(`/orders?q=${encodeURIComponent(q.trim())}`);
    setQ('');
  };
  return (
    <form onSubmit={submit} role="search" className="relative w-full max-w-md">
      <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#b5b5b5]" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search orders by reference or customer"
        aria-label="Search orders"
        className="h-8 w-full rounded-lg border border-white/10 bg-[#303030] pl-8 pr-3 text-sm text-white outline-none placeholder:text-[#b5b5b5] hover:bg-[#3a3a3a] focus:border-white/40 focus:bg-[#3a3a3a]"
      />
    </form>
  );
}

export default function App() {
  const route = useRoute();
  const pending = usePendingCount();
  const page = NAV.some((n) => n.page === route.page) ? route.page : 'dashboard';

  useEffect(() => {
    const label = { dashboard: 'Dashboard', orders: 'Orders', new: 'Create order' }[page];
    document.title = `${label} · Order Console`;
  }, [page]);

  return (
    <ToastProvider>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-topbar px-3 sm:px-4">
        <a href="#/dashboard" className="flex shrink-0 items-center gap-2 rounded-lg px-1 text-white lg:w-56">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-topbar">
            <Icon name="store" className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="hidden text-sm font-semibold sm:inline">Order Console</span>
        </a>
        <div className="flex flex-1 justify-center">
          <GlobalSearch />
        </div>
        <div className="hidden w-56 justify-end lg:flex">
          <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium text-[#e3e3e3]">Store operations</span>
        </div>
      </header>

      {/* Tablet / phone navigation */}
      <div className="sticky top-14 z-20 overflow-x-auto border-b border-line bg-nav px-3 py-1.5 lg:hidden">
        <NavLinks active={page} pending={pending} horizontal />
      </div>

      <aside className="fixed bottom-0 left-0 top-14 hidden w-60 bg-nav px-3 py-3 lg:block">
        <NavLinks active={page} pending={pending} />
      </aside>

      <main className="lg:pl-60">
        <div className="mx-auto max-w-[1200px] px-4 py-5 sm:px-6">
          {page === 'dashboard' && <Dashboard />}
          {page === 'new' && <NewOrder />}
          {page === 'orders' && <Orders route={route} />}
        </div>
      </main>
    </ToastProvider>
  );
}
