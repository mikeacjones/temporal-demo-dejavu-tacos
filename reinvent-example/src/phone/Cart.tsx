import type { CartItem } from './types'

interface CartProps {
  items: CartItem[]
  onUpdateQuantity: (menuItemId: string, delta: number) => void
  onCheckout: () => void
  onBack: () => void
}

export function Cart({ items, onUpdateQuantity, onCheckout, onBack }: CartProps) {
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
        <h1 className="text-lg font-bold">Your Cart</h1>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">🌮</p>
            <p>Your cart is empty</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.menu_item_id}
              className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 text-sm">
                  {item.name}
                </h3>
                <p className="text-sm text-orange-600 font-bold">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateQuantity(item.menu_item_id, -1)}
                  className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center font-bold"
                >
                  -
                </button>
                <span className="w-6 text-center font-semibold text-gray-900">
                  {item.quantity}
                </span>
                <button
                  onClick={() => onUpdateQuantity(item.menu_item_id, 1)}
                  className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold"
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals + Checkout */}
      {items.length > 0 && (
        <div className="p-3 bg-white border-t border-orange-100 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Tax</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-gray-900">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <button
            onClick={onCheckout}
            className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold hover:bg-orange-600 active:scale-[0.98] transition-all"
          >
            Proceed to Checkout
          </button>
        </div>
      )}
    </div>
  )
}
