import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ---------- formatting ----------

// Whole-rupee amounts show as ₹1,647; amounts with paise keep two decimals (₹12.50).
export const formatINR = (paise) =>
  (paise / 100).toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

export const formatDate = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const formatDay = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatTime = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export const cx = (...c) => c.filter(Boolean).join(' ');

// ---------- icons (inline SVG, 24px grid, stroke) ----------

const ICONS = {
  dashboard: [{ r: [3, 3, 7, 9, 1] }, { r: [14, 3, 7, 5, 1] }, { r: [14, 12, 7, 9, 1] }, { r: [3, 16, 7, 5, 1] }],
  cart: [{ c: [8, 21, 1] }, { c: [19, 21, 1] }, 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12'],
  orders: [{ r: [8, 2, 8, 4, 1] }, 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M12 11h4', 'M12 16h4', 'M8 11h.01', 'M8 16h.01'],
  search: [{ c: [11, 11, 8] }, 'm21 21-4.3-4.3'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  check: ['M20 6 9 17l-5-5'],
  checkCircle: [{ c: [12, 12, 10] }, 'm9 12 2 2 4-4'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  info: [{ c: [12, 12, 10] }, 'M12 16v-4', 'M12 8h.01'],
  package: ['m7.5 4.27 9 5.15', 'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],
  truck: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14', { c: [17, 18, 2] }, { c: [7, 18, 2] }],
  xCircle: [{ c: [12, 12, 10] }, 'm15 9-6 6', 'm9 9 6 6'],
  clock: [{ c: [12, 12, 10] }, 'M12 6v6l4 2'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', { c: [12, 7, 4] }],
  phone: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'],
  arrowRight: ['M5 12h14', 'm12 5 7 7-7 7'],
  chevronRight: ['m9 18 6-6-6-6'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  store: ['m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M2 7h20', 'M2 7v3a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0V7'],
  layers: ['m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z', 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65', 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65'],
  // category glyphs
  shirt: ['M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z'],
  shoe: ['M2 15h20v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z', 'M2 15V7a1 1 0 0 1 1-1h3.5l1.5 3h3l2-2 6.4 4.4A3 3 0 0 1 22 14v1', 'M10 9.5 9 11', 'M13 9l-1 2'],
  bag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  jacket: ['M20.38 3.46 16 2l-4 3-4-3-4.38 1.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z', 'M12 5v17', 'M9 13h1', 'M14 13h1'],
};

export function Icon({ name, className = 'h-4 w-4', strokeWidth = 1.75 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {(ICONS[name] || []).map((el, i) =>
        typeof el === 'string' ? (
          <path key={i} d={el} />
        ) : el.c ? (
          <circle key={i} cx={el.c[0]} cy={el.c[1]} r={el.c[2]} />
        ) : (
          <rect key={i} x={el.r[0]} y={el.r[1]} width={el.r[2]} height={el.r[3]} rx={el.r[4]} />
        )
      )}
    </svg>
  );
}

// ---------- product placeholder ----------

const CATEGORY_STYLE = {
  Apparel: { icon: 'shirt', tone: 'bg-indigo-50 text-indigo-600 ring-indigo-100' },
  Footwear: { icon: 'shoe', tone: 'bg-sky-50 text-sky-600 ring-sky-100' },
  Accessories: { icon: 'bag', tone: 'bg-amber-50 text-amber-600 ring-amber-100' },
  Outerwear: { icon: 'jacket', tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
};

export function ProductThumb({ category, size = 'md', muted = false }) {
  const style = CATEGORY_STYLE[category] || { icon: 'package', tone: 'bg-neutral-100 text-neutral-500 ring-neutral-200' };
  const dims = { sm: 'h-9 w-9 rounded-lg', md: 'h-12 w-12 rounded-xl', lg: 'h-14 w-14 rounded-xl' }[size];
  const iconSize = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-7 w-7' }[size];
  return (
    <div className={cx('grid shrink-0 place-items-center ring-1 ring-inset', dims, muted ? 'bg-neutral-100 text-neutral-400 ring-neutral-200' : style.tone)}>
      <Icon name={style.icon} className={iconSize} strokeWidth={1.5} />
    </div>
  );
}

/**
 * Product photo by SKU convention (/products/<sku>.jpg in client/public).
 * Falls back to the category icon tile if the image is missing or fails to load.
 */
export function ProductImage({ sku, category, className, muted = false, rounded = 'rounded-lg' }) {
  const [failed, setFailed] = useState(false);
  if (!sku || failed) {
    const style = CATEGORY_STYLE[category] || { icon: 'package', tone: 'bg-neutral-100 text-neutral-500 ring-neutral-200' };
    return (
      <div className={cx('grid shrink-0 place-items-center ring-1 ring-inset', rounded, muted ? 'bg-neutral-100 text-neutral-400 ring-neutral-200' : style.tone, className)}>
        <Icon name={style.icon} className="h-1/3 w-1/3 max-h-8 max-w-8" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <img
      src={`/products/${sku.toLowerCase()}.jpg`}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cx('shrink-0 bg-neutral-100 object-cover ring-1 ring-inset ring-neutral-900/5', rounded, muted && 'opacity-60 grayscale', className)}
    />
  );
}

// ---------- badges ----------

// Fulfilment badges use a progress glyph (empty → half → full circle) so the
// stage reads at a glance, like the fulfilment badges in commerce admins.
const STATUS_META = {
  PLACED: { label: 'Placed', tone: 'bg-[#ffeb78] text-[#4f4700]', progress: 'empty', bar: 'bg-[#e4b82d]', hex: '#e4b82d' },
  PACKED: { label: 'Packed', tone: 'bg-[#e0f0ff] text-[#00527c]', progress: 'half', bar: 'bg-[#4ba3e8]', hex: '#4ba3e8' },
  SHIPPED: { label: 'Shipped', tone: 'bg-[#affebf] text-[#014b40]', progress: 'full', bar: 'bg-[#29845a]', hex: '#29845a' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-[#e3e3e3] text-[#616161]', progress: null, bar: 'bg-[#b5b5b5]', hex: '#b5b5b5' },
};
export const STATUS_ORDER = ['PLACED', 'PACKED', 'SHIPPED', 'CANCELLED'];
export const statusMeta = (s) => STATUS_META[s] || { label: s, tone: 'bg-[#e3e3e3] text-ink', bar: 'bg-neutral-400', hex: '#a3a3a3' };
export const statusLabel = (s) => statusMeta(s).label;

function ProgressGlyph({ kind }) {
  if (!kind) return null;
  return (
    <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden="true">
      <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={kind === 'empty' ? '2 1.4' : undefined} />
      {kind === 'half' && <path d="M6 1.75a4.25 4.25 0 0 1 0 8.5z" fill="currentColor" />}
      {kind === 'full' && <circle cx="6" cy="6" r="4.25" fill="currentColor" />}
    </svg>
  );
}

const badgeBase = 'inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-xs font-medium';

export function StatusBadge({ status }) {
  const m = statusMeta(status);
  return (
    <span className={cx(badgeBase, m.tone)}>
      <ProgressGlyph kind={m.progress} />
      {m.label}
    </span>
  );
}

const STOCK_META = {
  IN_STOCK: { label: 'In stock', tone: 'bg-[#affebf] text-[#014b40]' },
  LOW_STOCK: { label: 'Low stock', tone: 'bg-[#ffd6a4] text-[#5e4200]' },
  OUT_OF_STOCK: { label: 'Out of stock', tone: 'bg-[#fedad9] text-[#8e0b21]' },
};

export function StockBadge({ status, stock, showCount = true }) {
  const m = STOCK_META[status] || STOCK_META.IN_STOCK;
  return (
    <span className={cx(badgeBase, m.tone)}>
      {m.label}
      {showCount && status !== 'OUT_OF_STOCK' && <span className="tabular-nums opacity-75">· {stock}</span>}
    </span>
  );
}

// ---------- layout primitives ----------

export function Card({ className, children, ...rest }) {
  return (
    <div className={cx('rounded-xl bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, id, divider = false }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 px-4 pt-4', divider ? 'border-b border-line pb-3' : 'pb-2')}>
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-semibold text-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink-subdued">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink-subdued">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Index-table cell classes shared by every list view. */
export const th = 'h-9 whitespace-nowrap bg-hover px-3 text-left text-xs font-medium text-ink-subdued first:pl-4 last:pr-4';
export const td = 'h-11 px-3 first:pl-4 last:pr-4';

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-md bg-neutral-100', className)} />;
}

export function EmptyState({ icon = 'package', title, description, action, compact = false }) {
  return (
    <div className={cx('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className="grid h-11 w-11 place-items-center rounded-full bg-neutral-100 text-neutral-400">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-neutral-900">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-neutral-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="font-medium underline underline-offset-2 hover:no-underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Button({ variant = 'primary', size = 'md', loading = false, icon, className, children, disabled, ...props }) {
  const variants = {
    primary: 'bg-[#303030] text-white shadow-btn-primary hover:bg-[#1a1a1a] disabled:bg-[#b5b5b5] disabled:shadow-none',
    secondary: 'bg-white text-ink shadow-btn hover:bg-hover disabled:bg-hover disabled:text-ink-muted disabled:shadow-none disabled:ring-1 disabled:ring-inset disabled:ring-line',
    danger: 'bg-[#c70a24] text-white shadow-btn-primary hover:bg-[#a30a1f] disabled:bg-[#e8a0a9] disabled:shadow-none',
    dangerOutline: 'bg-white text-[#8e0b21] shadow-btn hover:bg-[#fff4f4] disabled:text-ink-muted',
    ghost: 'text-ink-subdued hover:bg-black/5 hover:text-ink disabled:text-ink-muted',
  };
  const sizes = { sm: 'h-7 px-2 text-xs gap-1', md: 'h-8 px-3 text-sm gap-1.5', lg: 'h-10 px-4 text-sm gap-2' };
  return (
    <button
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-link disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, required, children, htmlFor }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-medium text-neutral-700">
        <span>
          {label} {required && <span className="text-red-500" aria-hidden="true">*</span>}
        </span>
        {hint && <span className="text-xs font-normal text-neutral-400">{hint}</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass = (invalid) =>
  cx(
    'block h-8 w-full rounded-lg bg-white px-3 text-sm text-ink ring-1 ring-inset placeholder:text-ink-muted outline-none focus:ring-2 focus:ring-inset',
    invalid ? 'bg-[#fff4f4] ring-[#c70a24] focus:ring-[#c70a24]' : 'ring-[#8a8a8a]/60 hover:ring-[#8a8a8a] focus:ring-link'
  );

export function SearchInput({ value, onChange, placeholder, label }) {
  return (
    <div className="relative">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} className={cx(inputClass(false), 'pl-9')} />
    </div>
  );
}

export function FilterChips({ options, value, onChange, label }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cx(
            'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors',
            value === o.value ? 'bg-[#e3e3e3] text-ink' : 'text-ink-subdued hover:bg-black/5 hover:text-ink'
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cx('text-xs tabular-nums', value === o.value ? 'text-ink-subdued' : 'text-ink-muted')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- overlays ----------

// Stack of open overlays: only the top-most one handles Escape and traps Tab,
// so a confirm dialog opened from a drawer behaves correctly.
const overlayStack = [];

function useOverlay(open, onClose, panelRef) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const panel = panelRef.current;
    const token = {};
    overlayStack.push(token);
    const isTop = () => overlayStack[overlayStack.length - 1] === token;
    const focusables = () =>
      [...panel.querySelectorAll('button:not([disabled]), input, a[href], [tabindex]:not([tabindex="-1"])')].filter(
        (el) => el.closest('[role="dialog"]') === panel
      );
    (panel.querySelector('[data-autofocus]') || focusables()[0] || panel).focus();

    const onKey = (e) => {
      if (!isTop()) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      overlayStack.splice(overlayStack.indexOf(token), 1);
      document.body.style.overflow = overflow;
      if (previous && previous.focus && document.contains(previous)) previous.focus();
    };
  }, [open, panelRef]);
}

export function Modal({ open, onClose, title, children, footer, size = 'md', labelledBy = 'modal-title' }) {
  const ref = useRef(null);
  useOverlay(open, onClose, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-neutral-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cx('relative w-full rounded-2xl bg-white shadow-xl outline-none', { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }[size])}
      >
        {title && (
          <h2 id={labelledBy} className="px-6 pt-6 text-base font-semibold text-neutral-900">
            {title}
          </h2>
        )}
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Keep order', tone = 'danger', busy, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onCancel}
      size="sm"
      labelledBy="confirm-title"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full', tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-[#e0f0ff] text-link')}>
          <Icon name="alert" className="h-5 w-5" />
        </div>
        <div>
          <h2 id="confirm-title" className="text-base font-semibold text-neutral-900">
            {title}
          </h2>
          <div className="mt-1 text-sm text-neutral-600">{children}</div>
        </div>
      </div>
    </Modal>
  );
}

export function Drawer({ open, onClose, children, labelledBy }) {
  const ref = useRef(null);
  useOverlay(open, onClose, ref);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-neutral-900/30" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl outline-none">
        {children}
      </div>
    </div>
  );
}

// ---------- toasts ----------

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, type, message }]);
    setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[68px] z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-neutral-200 bg-white p-3.5 text-sm text-neutral-800 shadow-lg"
          >
            <Icon name={t.type === 'error' ? 'alert' : 'checkCircle'} className={cx('mt-0.5 h-4 w-4 shrink-0', t.type === 'error' ? 'text-red-600' : 'text-emerald-600')} />
            <p className="flex-1">{t.message}</p>
            <button onClick={() => dismiss(t.id)} className="text-neutral-400 hover:text-neutral-600" aria-label="Dismiss notification">
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
