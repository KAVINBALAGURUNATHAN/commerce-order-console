import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, ConfirmDialog, Drawer, ErrorState, Icon, ProductImage, Skeleton, StatusBadge, cx, formatDate, formatINR, statusLabel, useToast } from './ui.jsx';

const ACTIONS = {
  PACKED: { label: 'Mark as packed', icon: 'package', variant: 'primary' },
  SHIPPED: { label: 'Mark as shipped', icon: 'truck', variant: 'primary' },
  CANCELLED: { label: 'Cancel order', icon: 'xCircle', variant: 'dangerOutline' },
};

const FLOW = ['PLACED', 'PACKED', 'SHIPPED'];
const STEP_COPY = {
  PLACED: 'Order created and stock reserved',
  PACKED: 'Items packed and ready to ship',
  SHIPPED: 'Handed over for delivery',
  CANCELLED: 'Order cancelled and stock returned',
};

/** Builds the progress timeline from the order's real status history. */
function buildSteps(order) {
  const at = Object.fromEntries(order.history.map((h) => [h.toStatus, h.at]));
  if (order.status === 'CANCELLED') {
    return order.history.map((h) => ({ status: h.toStatus, at: h.at, state: h.toStatus === 'CANCELLED' ? 'cancelled' : 'done' }));
  }
  const current = FLOW.indexOf(order.status);
  return FLOW.map((s, i) => ({
    status: s,
    at: at[s],
    state: i < current || (i === current && s === 'SHIPPED') ? 'done' : i === current ? 'current' : 'pending',
  }));
}

function Timeline({ order }) {
  const steps = buildSteps(order);
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.status} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className={cx('absolute left-[13px] top-7 h-[calc(100%-24px)] w-0.5', step.state === 'pending' ? 'bg-neutral-200' : 'bg-[#303030]')} aria-hidden="true" />}
            <span
              className={cx(
                'relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-white',
                step.state === 'done' && 'bg-[#303030] text-white',
                step.state === 'current' && 'bg-white text-ink shadow-[inset_0_0_0_2px_#303030]',
                step.state === 'pending' && 'bg-neutral-100 text-neutral-400',
                step.state === 'cancelled' && 'bg-rose-600 text-white'
              )}
            >
              {step.state === 'done' ? (
                <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} />
              ) : step.state === 'cancelled' ? (
                <Icon name="x" className="h-3.5 w-3.5" strokeWidth={2.5} />
              ) : (
                <span className={cx('h-2 w-2 rounded-full', step.state === 'current' ? 'bg-[#303030]' : 'bg-neutral-300')} />
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={cx('text-sm font-medium', step.state === 'pending' ? 'text-neutral-400' : step.state === 'cancelled' ? 'text-rose-700' : 'text-neutral-900')}>
                {statusLabel(step.status)}
                {step.state === 'current' && <span className="ml-2 text-xs font-normal text-link">Current</span>}
              </p>
              <p className="text-xs text-neutral-500">{step.at ? `${STEP_COPY[step.status]} · ${formatDate(step.at)}` : 'Pending'}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-busy="true">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-32" />
      <Skeleton className="h-40" />
    </div>
  );
}

export default function OrderDetail({ idOrRef, onClose }) {
  const toast = useToast();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!idOrRef) return;
    try {
      setOrder(await api.order(idOrRef));
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, [idOrRef]);

  useEffect(() => {
    setOrder(null);
    setError(null);
    setConfirmCancel(false);
    load();
  }, [load]);

  const transition = async (to) => {
    setBusy(to);
    try {
      const updated = await api.setStatus(order.id, to);
      setOrder(updated);
      toast('success', to === 'CANCELLED' ? `${updated.reference} cancelled — stock restored` : `${updated.reference} marked as ${statusLabel(to).toLowerCase()}`);
    } catch (e) {
      toast('error', e.message);
      load(); // show the server's truth if the order changed elsewhere
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  };

  const units = order ? order.items.reduce((s, i) => s + i.quantity, 0) : 0;
  const progress = order?.allowedTransitions.filter((t) => t !== 'CANCELLED') ?? [];
  const canCancel = order?.allowedTransitions.includes('CANCELLED');

  return (
    <Drawer open={!!idOrRef} onClose={confirmCancel ? () => {} : onClose} labelledBy="order-title">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-neutral-200 px-6 py-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">Order details</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 id="order-title" className="text-lg font-semibold text-neutral-900">
              {order?.reference ?? idOrRef}
            </h2>
            {order && <StatusBadge status={order.status} />}
          </div>
          {order && <p className="mt-0.5 text-xs text-neutral-500">Created {formatDate(order.createdAt)}</p>}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close order details">
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-6">
            <ErrorState message={error} onRetry={load} />
          </div>
        ) : !order ? (
          <DetailSkeleton />
        ) : (
          <div className="space-y-6 p-6">
            <section aria-labelledby="customer-h" className="rounded-xl border border-neutral-200 p-4">
              <h3 id="customer-h" className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                Customer
              </h3>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                <span className="inline-flex items-center gap-2 font-medium text-neutral-900">
                  <Icon name="user" className="h-4 w-4 text-neutral-400" />
                  {order.customerName}
                </span>
                <span className="inline-flex items-center gap-2 text-neutral-600">
                  <Icon name="phone" className="h-4 w-4 text-neutral-400" />
                  {order.customerPhone || <span className="text-neutral-400">No phone</span>}
                </span>
              </div>
            </section>

            <section aria-labelledby="timeline-h">
              <h3 id="timeline-h" className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
                Fulfilment progress
              </h3>
              <Timeline order={order} />
            </section>

            <section aria-labelledby="items-h">
              <h3 id="items-h" className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
                Items · {units} unit{units === 1 ? '' : 's'}
              </h3>
              <div className="overflow-hidden rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50">
                    <tr className="text-left text-xs text-neutral-500">
                      <th scope="col" className="px-4 py-2.5 font-medium">Product</th>
                      <th scope="col" className="px-2 py-2.5 text-right font-medium">Qty</th>
                      <th scope="col" className="hidden px-2 py-2.5 text-right font-medium sm:table-cell">Unit price</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {order.items.map((it) => (
                      <tr key={it.productId}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ProductImage sku={it.sku} category={it.category} className="h-10 w-10" />
                            <div className="min-w-0">
                              <p className="font-medium text-neutral-900">{it.name}</p>
                              <p className="text-xs text-neutral-500">
                                {it.sku}
                                <span className="sm:hidden"> · {formatINR(it.unitPricePaise)} each</span>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right tabular-nums text-neutral-700">{it.quantity}</td>
                        <td className="hidden px-2 py-3 text-right tabular-nums text-neutral-700 sm:table-cell">{formatINR(it.unitPricePaise)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-neutral-900">{formatINR(it.lineTotalPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-neutral-200 bg-neutral-50/60">
                    <tr>
                      <th scope="row" colSpan={2} className="px-4 py-3 text-left font-semibold text-neutral-900 sm:hidden">Total</th>
                      <th scope="row" colSpan={3} className="hidden px-4 py-3 text-left font-semibold text-neutral-900 sm:table-cell">Order total</th>
                      <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-neutral-900">{formatINR(order.totalPaise)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Actions */}
      {order && (
        <div className="border-t border-neutral-200 bg-neutral-50/60 px-6 py-4">
          {order.allowedTransitions.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-neutral-500">
              <Icon name="info" className="h-4 w-4" />
              {order.status === 'SHIPPED' ? 'This order has shipped. No further actions are available.' : 'This order was cancelled. No further actions are available.'}
            </p>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              {canCancel ? (
                <Button variant={ACTIONS.CANCELLED.variant} icon={ACTIONS.CANCELLED.icon} disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
                  {ACTIONS.CANCELLED.label}
                </Button>
              ) : (
                <span />
              )}
              {progress.map((to) => (
                <Button key={to} icon={ACTIONS[to].icon} loading={busy === to} disabled={busy !== null} onClick={() => transition(to)}>
                  {ACTIONS[to].label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        title={`Cancel ${order?.reference}?`}
        confirmLabel="Yes, cancel order"
        busy={busy === 'CANCELLED'}
        onConfirm={() => transition('CANCELLED')}
        onCancel={() => setConfirmCancel(false)}
      >
        <p>The following stock will be returned to the catalogue. This cannot be undone.</p>
        {order && (
          <ul className="mt-3 space-y-1.5">
            {order.items.map((it) => (
              <li key={it.productId} className="flex justify-between gap-3 text-xs">
                <span className="truncate text-neutral-700">{it.name}</span>
                <span className="font-medium tabular-nums text-neutral-900">+{it.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </ConfirmDialog>
    </Drawer>
  );
}
