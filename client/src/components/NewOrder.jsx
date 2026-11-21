import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { navigate } from '../router.js';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  FilterChips,
  Icon,
  Modal,
  PageHeader,
  ProductImage,
  SearchInput,
  Skeleton,
  StockBadge,
  cx,
  formatINR,
  inputClass,
  useToast,
} from './ui.jsx';

const PHONE_RE = /^[0-9+\-\s()]{6,20}$/;

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function QtyStepper({ value, max, onChange, label, size = 'md' }) {
  const h = size === 'sm' ? 'h-8' : 'h-9';
  return (
    <div className={cx('inline-flex items-center rounded-lg bg-white ring-1 ring-inset ring-neutral-300', h)}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className={cx('grid w-8 place-items-center rounded-l-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900', h)}
        aria-label={`Decrease quantity of ${label}`}
      >
        <Icon name="minus" className="h-3.5 w-3.5" />
      </button>
      <input
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
          if (!Number.isNaN(n)) onChange(Math.max(1, n));
        }}
        onFocus={(e) => e.target.select()}
        inputMode="numeric"
        aria-label={`Quantity of ${label}`}
        className="w-9 bg-transparent text-center text-sm font-medium tabular-nums text-neutral-900 outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        title={value >= max ? `Only ${max} available` : undefined}
        className={cx('grid w-8 place-items-center rounded-r-lg text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent', h)}
        aria-label={`Increase quantity of ${label}`}
      >
        <Icon name="plus" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ProductCard({ product, qty, onSetQty }) {
  const out = product.stockStatus === 'OUT_OF_STOCK';
  const inOrder = qty > 0;
  return (
    <li
      className={cx(
        'group flex flex-col overflow-hidden rounded-xl border bg-white transition-shadow',
        inOrder ? 'border-[#303030] ring-1 ring-[#303030]' : 'border-line hover:shadow-md',
        out && 'hover:shadow-none'
      )}
    >
      <div className="relative">
        <ProductImage sku={product.sku} category={product.category} muted={out} rounded="rounded-none" className="aspect-[4/3] w-full" />
        <div className="absolute left-2.5 top-2.5">
          <StockBadge status={product.stockStatus} stock={product.stock} />
        </div>
        {inOrder && (
          <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-lg bg-[#303030] px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
            <Icon name="check" className="h-3 w-3" strokeWidth={2.5} /> {qty} in order
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{product.category}</p>
        <h3 className={cx('mt-0.5 line-clamp-2 text-sm font-semibold leading-snug', out ? 'text-neutral-500' : 'text-neutral-900')} title={product.name}>
          {product.name}
        </h3>
        <p className="mt-0.5 text-xs text-neutral-500">SKU {product.sku}</p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className={cx('text-base font-semibold tabular-nums', out ? 'text-neutral-400' : 'text-neutral-900')}>{formatINR(product.pricePaise)}</span>
          {out ? (
            <span className="text-xs font-medium text-neutral-400">Unavailable</span>
          ) : inOrder ? (
            <QtyStepper size="sm" value={qty} max={product.stock} label={product.name} onChange={(n) => onSetQty(product, n)} />
          ) : (
            <Button size="sm" icon="plus" onClick={() => onSetQty(product, 1)} aria-label={`Add ${product.name} to order`}>
              Add
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function SuccessModal({ order, onClose }) {
  return (
    <Modal
      open={!!order}
      onClose={onClose}
      labelledBy="success-title"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} data-autofocus>
            Create another order
          </Button>
          <Button onClick={() => navigate(`/orders/${order.reference}`)}>
            View order <Icon name="arrowRight" />
          </Button>
        </>
      }
    >
      {order && (
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
            <Icon name="checkCircle" className="h-6 w-6" />
          </div>
          <h2 id="success-title" className="mt-4 text-base font-semibold text-neutral-900">
            Order placed successfully
          </h2>
          <p className="mt-1 text-sm text-neutral-500">Stock has been reserved for this order.</p>
          <div className="mt-4 flex justify-center -space-x-2">
            {order.items.slice(0, 6).map((it) => (
              <ProductImage key={it.productId} sku={it.sku} category={it.category} rounded="rounded-full" className="h-11 w-11 ring-2 ring-white" />
            ))}
          </div>
          <dl className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200 text-left text-sm">
            {[
              ['Order reference', <span className="font-semibold text-neutral-900">{order.reference}</span>],
              ['Customer', `${order.customerName}${order.customerPhone ? ` · ${order.customerPhone}` : ''}`],
              ['Items', `${order.items.reduce((s, i) => s + i.quantity, 0)} units · ${order.items.length} product${order.items.length > 1 ? 's' : ''}`],
              ['Total', <span className="font-semibold tabular-nums text-neutral-900">{formatINR(order.totalPaise)}</span>],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="text-right text-neutral-700">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Modal>
  );
}

/**
 * Review step shown before an order is submitted. Prices here are for review;
 * the server recalculates every price and re-checks stock when the order is confirmed.
 */
function ConfirmOrderModal({ open, lines, total, customerName, customerPhone, submitting, error, onBack, onConfirm }) {
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const blocked = lines.length === 0 || lines.some((l) => l.qty > l.product.stock);
  return (
    <Modal
      open={open}
      onClose={onBack}
      size="lg"
      labelledBy="confirm-order-title"
      footer={
        <>
          <Button variant="secondary" onClick={onBack} disabled={submitting} data-autofocus>
            Go Back
          </Button>
          <Button icon="check" onClick={onConfirm} loading={submitting} disabled={blocked}>
            {submitting ? 'Placing Order…' : 'Confirm Order'}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#e0f0ff] text-link">
          <Icon name="orders" className="h-5 w-5" />
        </div>
        <div>
          <h2 id="confirm-order-title" className="text-lg font-semibold text-ink">
            Confirm Your Order
          </h2>
          <p className="text-sm text-ink-subdued">Check the details below. Nothing is placed and no stock changes until you confirm.</p>
        </div>
      </div>

      <section aria-label="Customer" className="mt-4 flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-hover px-3 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2">
          <Icon name="user" className="h-4 w-4 text-ink-muted" />
          <span className="font-medium text-ink">{customerName}</span>
        </span>
        <span className="inline-flex items-center gap-2 text-ink-subdued">
          <Icon name="phone" className="h-4 w-4 text-ink-muted" />
          {customerPhone || 'No phone number'}
        </span>
      </section>

      <div className="mt-4 max-h-[40vh] overflow-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-hover">
            <tr className="text-left text-xs text-ink-subdued">
              <th scope="col" className="px-3 py-2 font-medium">Product</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Qty</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Unit price</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map(({ product, qty }) => {
              const short = qty > product.stock;
              return (
                <tr key={product.id} className={short ? 'bg-[#fff4f4]' : undefined}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <ProductImage sku={product.sku} category={product.category} className="h-9 w-9" />
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{product.name}</p>
                        <p className="text-xs text-ink-muted">
                          SKU {product.sku}
                          <span className="sm:hidden"> · {formatINR(product.pricePaise)} each</span>
                        </p>
                        {short && (
                          <p className="text-xs font-medium text-[#8e0b21]">{product.stock === 0 ? 'Now out of stock' : `Only ${product.stock} available`}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{qty}</td>
                  <td className="hidden px-2 py-2 text-right tabular-nums text-ink-subdued sm:table-cell">{formatINR(product.pricePaise)}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatINR(product.pricePaise * qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-lg bg-[#303030] px-4 py-3 text-white">
        <span className="text-sm">
          Order total <span className="text-[#b5b5b5]">· {units} item{units === 1 ? '' : 's'}</span>
        </span>
        <span className="text-xl font-bold tabular-nums" data-testid="confirm-total">
          {formatINR(total)}
        </span>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-[#fecaca] bg-[#fff4f4] p-3 text-sm text-[#8e0b21]">
          <div className="flex gap-2">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error.message}</p>
          </div>
          {error.shortages && (
            <ul className="mt-1.5 space-y-0.5 pl-6 text-xs">
              {error.shortages.map((s) => (
                <li key={s.productId}>
                  <span className="font-medium">{s.name}</span>: requested {s.requested}, {s.available} available
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function NewOrder() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [cart, setCart] = useState({}); // productId -> quantity
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null); // { message, shortages? }
  const [placed, setPlaced] = useState(null);
  const [reviewing, setReviewing] = useState(false); // confirmation dialog open
  const [confirmError, setConfirmError] = useState(null); // error shown inside the dialog
  // Synchronous guard: state updates are async, so a fast double click could
  // otherwise fire two requests before `submitting` re-renders the button.
  const inFlight = useRef(false);
  // One key per order attempt: double-clicks and retries reuse it, so the
  // server never creates a duplicate order. It rotates whenever the cart changes.
  const idemKey = useRef(newKey());

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await api.products());
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) => (category === 'ALL' || p.category === category) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    );
  }, [products, query, category]);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: byId[id], qty }))
    .filter((l) => l.product);
  const total = lines.reduce((s, l) => s + l.product.pricePaise * l.qty, 0);
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const overStock = lines.filter((l) => l.qty > l.product.stock);

  const touched = () => {
    idemKey.current = newKey();
    setError(null);
  };

  const setQty = (product, qty) => {
    touched();
    setCart((c) => {
      const next = { ...c };
      const clamped = Math.max(0, Math.min(product.stock, Math.floor(qty)));
      if (clamped === 0) delete next[product.id];
      else next[product.id] = clamped;
      return next;
    });
  };

  const adjustToStock = () => {
    touched();
    setCart((c) => {
      const next = {};
      for (const [id, qty] of Object.entries(c)) {
        const stock = byId[id]?.stock ?? 0;
        if (stock > 0) next[id] = Math.min(qty, stock);
      }
      return next;
    });
  };

  const clearCart = () => {
    touched();
    setCart({});
  };

  const validate = () => {
    const errs = {};
    if (!customerName.trim()) errs.customerName = 'Customer name is required';
    if (customerPhone.trim() && !PHONE_RE.test(customerPhone.trim())) errs.customerPhone = 'Enter 6–20 digits (+, -, spaces allowed)';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /** Step 1 – "Place Order": validate locally and open the review dialog. No API call. */
  const review = (e) => {
    e.preventDefault();
    if (submitting || lines.length === 0 || overStock.length > 0 || !validate()) return;
    setError(null);
    setConfirmError(null);
    setReviewing(true);
  };

  /** "Go Back": close the dialog; cart, quantities and customer details are untouched. */
  const goBack = () => {
    if (inFlight.current) return;
    setReviewing(false);
    setConfirmError(null);
  };

  /** Step 2 – "Confirm Order": the only place an order is actually submitted. */
  const confirmOrder = async () => {
    if (inFlight.current || lines.length === 0) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    setConfirmError(null);
    try {
      const order = await api.createOrder(
        {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim() || undefined,
          items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        },
        idemKey.current
      );
      // Success: only now is the cart cleared.
      setCart({});
      setCustomerName('');
      setCustomerPhone('');
      setFieldErrors({});
      idemKey.current = newKey();
      setReviewing(false);
      setPlaced(order);
      toast('success', `Order ${order.reference} placed successfully`);
    } catch (err) {
      // Failure: the cart is left exactly as it was so staff can correct it.
      let msg;
      if (err.code === 'INSUFFICIENT_STOCK' && Array.isArray(err.details)) {
        msg = { message: 'Order not placed. Some items no longer have enough stock, and no stock was changed. Go back to adjust the cart.', shortages: err.details };
      } else if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        const errs = {};
        for (const d of err.details) if (d.field === 'customerName' || d.field === 'customerPhone') errs[d.field] = d.message;
        setFieldErrors(errs);
        msg = { message: err.details.map((d) => d.message).join('. ') };
      } else {
        msg = { message: err.message };
      }
      setConfirmError(msg);
      setError(msg);
      toast('error', 'Order could not be placed');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      loadProducts(); // always reflect the latest stock after an attempt
    }
  };

  const chipOptions = [
    { value: 'ALL', label: 'All', count: products.length },
    ...categories.map((c) => ({ value: c, label: c, count: products.filter((p) => p.category === c).length })),
  ];

  return (
    <>
      <PageHeader title="Create order" subtitle="Add products, review the total, then enter customer details." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Catalogue */}
        <Card>
          <CardHeader
            title="Product catalogue"
            subtitle={loading ? 'Loading…' : `${visible.length} of ${products.length} products`}
            action={
              <Button variant="ghost" size="sm" icon="refresh" onClick={loadProducts}>
                Refresh stock
              </Button>
            }
          />
          <div className="space-y-3 border-b border-neutral-100 p-4">
            <SearchInput value={query} onChange={setQuery} placeholder="Search by product name or SKU" />
            <FilterChips options={chipOptions} value={category} onChange={setCategory} label="Filter by category" />
          </div>

          <div className="@container p-4">
            {loadError ? (
              <ErrorState message={loadError} onRetry={loadProducts} />
            ) : loading ? (
              <ul className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-72 rounded-xl" />
                ))}
              </ul>
            ) : visible.length === 0 ? (
              <EmptyState
                compact
                icon="search"
                title="No products match"
                description="Try a different search term or category."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setQuery('');
                      setCategory('ALL');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <ul className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-3 @5xl:grid-cols-4">
                {visible.map((p) => (
                  <ProductCard key={p.id} product={p} qty={cart[p.id] || 0} onSetQty={setQty} />
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Cart */}
        <Card className="lg:sticky lg:top-[72px]">
          <form onSubmit={review} noValidate>
            <CardHeader
              id="cart-title"
              title="Current order"
              subtitle={units ? `${units} item${units > 1 ? 's' : ''}` : 'No items yet'}
              action={
                lines.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={clearCart}>
                    Clear
                  </Button>
                )
              }
            />

            {lines.length === 0 ? (
              <EmptyState compact icon="cart" title="Your order is empty" description="Add products from the catalogue to start building this order." />
            ) : (
              <ul className="max-h-[360px] divide-y divide-neutral-100 overflow-y-auto" aria-labelledby="cart-title">
                {lines.map(({ product, qty }) => {
                  const short = qty > product.stock;
                  return (
                    <li key={product.id} className={cx('px-5 py-3', short && 'bg-red-50/60')}>
                      <div className="flex items-start gap-3">
                        <ProductImage sku={product.sku} category={product.category} className="h-11 w-11" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">{product.name}</p>
                          <p className="text-xs tabular-nums text-neutral-500">
                            {formatINR(product.pricePaise)} × {qty}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setQty(product, 0)}
                          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                          aria-label={`Remove ${product.name} from order`}
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 flex items-center justify-between pl-14">
                        <QtyStepper size="sm" value={qty} max={product.stock} label={product.name} onChange={(n) => setQty(product, n)} />
                        <span className="text-sm font-semibold tabular-nums text-neutral-900">{formatINR(product.pricePaise * qty)}</span>
                      </div>
                      {short ? (
                        <p className="mt-1.5 pl-14 text-xs font-medium text-red-600">
                          {product.stock === 0 ? 'Now out of stock' : `Only ${product.stock} available`}
                        </p>
                      ) : (
                        qty === product.stock && <p className="mt-1.5 pl-14 text-xs text-orange-600">Maximum available quantity</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-neutral-100 px-5 py-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between text-neutral-600">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{formatINR(total)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-dashed border-neutral-200 pt-2">
                  <dt className="font-semibold text-neutral-900">Total</dt>
                  <dd className="text-xl font-semibold tabular-nums tracking-tight text-neutral-900">{formatINR(total)}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-4 border-t border-neutral-100 p-5">
              <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">Customer details</h3>
              <Field label="Customer name" required htmlFor="customerName" error={fieldErrors.customerName}>
                <input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    setFieldErrors((f) => ({ ...f, customerName: undefined }));
                    touched();
                  }}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="e.g. Priya Sharma"
                  aria-invalid={!!fieldErrors.customerName}
                  aria-describedby={fieldErrors.customerName ? 'customerName-error' : undefined}
                  className={inputClass(!!fieldErrors.customerName)}
                />
              </Field>
              <Field label="Phone number" hint="Optional" htmlFor="customerPhone" error={fieldErrors.customerPhone}>
                <input
                  id="customerPhone"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    setFieldErrors((f) => ({ ...f, customerPhone: undefined }));
                    touched();
                  }}
                  inputMode="tel"
                  maxLength={20}
                  autoComplete="off"
                  placeholder="e.g. +91 98765 43210"
                  aria-invalid={!!fieldErrors.customerPhone}
                  aria-describedby={fieldErrors.customerPhone ? 'customerPhone-error' : undefined}
                  className={inputClass(!!fieldErrors.customerPhone)}
                />
              </Field>

              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <div className="flex gap-2">
                    <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>{error.message}</p>
                  </div>
                  {error.shortages && (
                    <ul className="mt-2 space-y-0.5 pl-6 text-xs">
                      {error.shortages.map((s) => (
                        <li key={s.productId}>
                          <span className="font-medium">{s.name}</span>: requested {s.requested}, {s.available} available
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {overStock.length > 0 && (
                <Button type="button" variant="secondary" className="w-full" onClick={adjustToStock}>
                  Adjust quantities to available stock
                </Button>
              )}

              <Button type="submit" size="lg" className="w-full" disabled={submitting || lines.length === 0 || overStock.length > 0}>
                {lines.length === 0 ? 'Add products to continue' : `Place Order · ${formatINR(total)}`}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <ConfirmOrderModal
        open={reviewing}
        lines={lines}
        total={total}
        customerName={customerName.trim()}
        customerPhone={customerPhone.trim()}
        submitting={submitting}
        error={confirmError}
        onBack={goBack}
        onConfirm={confirmOrder}
      />
      <SuccessModal order={placed} onClose={() => setPlaced(null)} />
    </>
  );
}
