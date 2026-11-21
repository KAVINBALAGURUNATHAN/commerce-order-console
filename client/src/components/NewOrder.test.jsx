import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui.jsx';
import NewOrder from './NewOrder.jsx';

// Only the network layer is mocked; the component, cart logic and dialogs are real.
vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, api: { products: vi.fn(), createOrder: vi.fn(), stats: vi.fn() } };
});
const { api, ApiError } = await import('../api.js');

const CAP = { id: 1, sku: 'CAP-NVY', name: 'Baseball Cap – Navy', category: 'Accessories', pricePaise: 44900, stock: 30, stockStatus: 'IN_STOCK' };
const TEE = { id: 2, sku: 'TEE-BLK-M', name: 'Classic Cotton Tee – Black', category: 'Apparel', pricePaise: 59900, stock: 2, stockStatus: 'LOW_STOCK' };

const placedOrder = {
  id: 7,
  reference: 'ORD-00007',
  customerName: 'Priya',
  customerPhone: null,
  status: 'PLACED',
  totalPaise: 44900 + 2 * 59900,
  items: [
    { productId: 1, sku: 'CAP-NVY', category: 'Accessories', name: CAP.name, quantity: 1, unitPricePaise: 44900, lineTotalPaise: 44900 },
    { productId: 2, sku: 'TEE-BLK-M', category: 'Apparel', name: TEE.name, quantity: 2, unitPricePaise: 59900, lineTotalPaise: 119800 },
  ],
};

function setup() {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <NewOrder />
    </ToastProvider>
  );
  return user;
}

/** Cap ×1, Tee ×2, customer "Priya", then click Place Order. */
async function fillCartAndPlace(user) {
  await user.click(await screen.findByRole('button', { name: /add baseball cap/i }));
  await user.click(screen.getByRole('button', { name: /add classic cotton tee/i }));
  await user.click(screen.getAllByRole('button', { name: /increase quantity of classic cotton tee/i })[0]);
  await user.type(screen.getByLabelText(/customer name/i), 'Priya');
  await user.click(screen.getByRole('button', { name: /place order/i }));
}

const cartPanel = () => screen.getByRole('heading', { name: 'Current order' }).closest('form');

beforeEach(() => {
  vi.clearAllMocks();
  api.products.mockResolvedValue([CAP, TEE]);
});

describe('order confirmation dialog', () => {
  test('Place Order opens a review dialog and does NOT call the API', async () => {
    const user = setup();
    await fillCartAndPlace(user);

    const dialog = await screen.findByRole('dialog', { name: 'Confirm Your Order' });
    expect(api.createOrder).not.toHaveBeenCalled();

    // Customer, every product with SKU, quantity, unit price, subtotal and the total.
    expect(within(dialog).getByText('Priya')).toBeInTheDocument();
    expect(within(dialog).getByText('No phone number')).toBeInTheDocument();
    expect(within(dialog).getByText(CAP.name)).toBeInTheDocument();
    expect(within(dialog).getByText(/SKU CAP-NVY/)).toBeInTheDocument();
    expect(within(dialog).getByText(/SKU TEE-BLK-M/)).toBeInTheDocument();
    expect(within(dialog).getByText('₹1,198')).toBeInTheDocument(); // 2 × ₹599 subtotal
    expect(within(dialog).getByTestId('confirm-total')).toHaveTextContent('₹1,647');
    expect(within(dialog).getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /confirm order/i })).toBeEnabled();
  });

  test('a missing customer name is caught before the dialog opens', async () => {
    const user = setup();
    await user.click(await screen.findByRole('button', { name: /add baseball cap/i }));
    await user.click(screen.getByRole('button', { name: /place order/i }));

    expect(screen.getByText('Customer name is required')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  test('Go Back closes the dialog, keeps the cart and creates nothing', async () => {
    const user = setup();
    await fillCartAndPlace(user);
    await user.click(await screen.findByRole('button', { name: 'Go Back' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.createOrder).not.toHaveBeenCalled();
    const cart = cartPanel();
    expect(within(cart).getByText(CAP.name)).toBeInTheDocument();
    expect(within(cart).getByRole('textbox', { name: /quantity of classic cotton tee/i })).toHaveValue('2');
    expect(within(cart).getByLabelText(/customer name/i)).toHaveValue('Priya');
  });

  test('Confirm Order submits once, clears the cart and shows the reference', async () => {
    api.createOrder.mockResolvedValue(placedOrder);
    const user = setup();
    await fillCartAndPlace(user);
    await user.click(await screen.findByRole('button', { name: /confirm order/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Confirm Your Order' })).not.toBeInTheDocument());
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    const [payload, idempotencyKey] = api.createOrder.mock.calls[0];
    expect(payload).toEqual({
      customerName: 'Priya',
      customerPhone: undefined,
      items: [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
      ],
    });
    expect(idempotencyKey).toEqual(expect.any(String));

    const success = await screen.findByRole('dialog', { name: 'Order placed successfully' });
    expect(within(success).getByText('ORD-00007')).toBeInTheDocument();
    expect(screen.getByText(/ORD-00007 placed successfully/)).toBeInTheDocument(); // toast
    expect(within(cartPanel()).getByText('Your order is empty')).toBeInTheDocument();
  });

  test('insufficient stock: error shown in the dialog, cart unchanged, confirm blocked', async () => {
    api.createOrder.mockRejectedValue(
      new ApiError(409, {
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock',
          details: [{ productId: 2, name: TEE.name, requested: 2, available: 1 }],
        },
      })
    );
    const user = setup();
    await fillCartAndPlace(user);
    // Someone else bought a tee meanwhile; the refreshed catalogue shows 1 left.
    api.products.mockResolvedValue([CAP, { ...TEE, stock: 1, stockStatus: 'LOW_STOCK' }]);
    await user.click(await screen.findByRole('button', { name: /confirm order/i }));

    const dialog = screen.getByRole('dialog', { name: 'Confirm Your Order' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/no stock was changed/i);
    expect(within(dialog).getByText(/requested 2, 1 available/)).toBeInTheDocument();
    expect(await within(dialog).findByText('Only 1 available')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /confirm order/i })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Go Back' }));
    const cart = cartPanel();
    expect(within(cart).getByRole('textbox', { name: /quantity of classic cotton tee/i })).toHaveValue('2'); // unchanged
    expect(within(cart).getByRole('button', { name: /adjust quantities to available stock/i })).toBeInTheDocument();
    expect(api.createOrder).toHaveBeenCalledTimes(1);
  });

  test('duplicate clicks send one request; button shows progress and re-enables on failure', async () => {
    let rejectRequest;
    api.createOrder.mockImplementation(() => new Promise((_, reject) => (rejectRequest = reject)));
    const user = setup();
    await fillCartAndPlace(user);

    const confirm = await screen.findByRole('button', { name: /confirm order/i });
    await user.dblClick(confirm);
    await user.click(confirm);

    expect(api.createOrder).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: /placing order/i });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeDisabled();

    rejectRequest(new ApiError(0, { error: { code: 'NETWORK', message: 'Cannot reach the server.' } }));
    const retry = await screen.findByRole('button', { name: /confirm order/i });
    expect(retry).toBeEnabled();
    expect(within(screen.getByRole('dialog', { name: 'Confirm Your Order' })).getByRole('alert')).toHaveTextContent('Cannot reach the server.');

    // Retrying after a failure reuses the same idempotency key, so a request that
    // actually reached the server can never become a second order.
    api.createOrder.mockResolvedValue(placedOrder);
    await user.click(retry);
    expect(api.createOrder).toHaveBeenCalledTimes(2);
    expect(api.createOrder.mock.calls[1][1]).toBe(api.createOrder.mock.calls[0][1]);
  });
});
