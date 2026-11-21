import type { CartItem } from './types'

interface CheckoutProps {
  items: CartItem[]
  onPlaceOrder: () => void
  onBack: () => void
  isLoading: boolean
}

export function Checkout({ items, onPlaceOrder, onBack, isLoading }: CheckoutProps) {
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const tax = subtotal * 0.0825
  const total = subtotal + tax

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-white flex items-center gap-3">
        <button onClick={onBack} className="text-xl">
          &larr;
        </button>
        <h1 className="text-lg font-bold">Checkout</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {/* Pickup info */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2 text-sm">Pickup Location</h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="text-lg">📍</span>
            <div>
              <p className="font-medium text-gray-900">Déjà Vu Tacos #42</p>
              <p>123 Temporal Ave, San Francisco, CA</p>
              <p className="text-orange-600">~12 min wait</p>
            </div>
          </div>
        </div>

        {/* Payment */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2 text-sm">Payment Method</h2>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="text-lg">💳</span>
            <div>
              <p className="font-medium text-gray-900">Visa ending in 4242</p>
              <p>Demo Card</p>
            </div>
          </div>
        </div>

        {/* Order summary */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-2 text-sm">Order Summary</h2>
          {items.map((item) => (
            <div key={item.menu_item_id} className="flex justify-between text-sm py-1">
              <span className="text-gray-600">
                {item.quantity}x {item.name}
              </span>
              <span className="text-gray-900 font-medium">
                ${(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
          <div className="border-t border-gray-100 mt-2 pt-2 space-y-1">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Tax</span>
              <span>${tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900">
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Place Order button */}
      <div className="p-3 bg-white border-t border-orange-100">
        <button
          onClick={onPlaceOrder}
          disabled={isLoading}
          className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> Placing Order...
            </span>
          ) : (
            `Place Order — $${total.toFixed(2)}`
          )}
        </button>
      </div>
    </div>
  )
}
