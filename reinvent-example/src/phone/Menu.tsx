import { useEffect, useState } from 'react'
import { api } from '../api'
import type { CartItem, MenuItem } from './types'

interface MenuProps {
  cart: CartItem[]
  onAddToCart: (item: MenuItem) => void
  onViewCart: () => void
}

export function Menu({ cart, onAddToCart, onViewCart }: MenuProps) {
  const [items, setItems] = useState<MenuItem[]>([])

  useEffect(() => {
    fetch(api('/menu'))
      .then((r) => r.json())
      .then(setItems)
  }, [])

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const categories = [...new Set(items.map((i) => i.category))]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 text-white">
        <h1 className="text-lg font-bold">Déjà Vu Tacos</h1>
        <p className="text-xs opacity-80">Haven't you ordered this before?</p>
      </div>

      {/* Menu items */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4">
        {categories.map((cat) => (
          <div key={cat}>
            <h2 className="text-sm font-bold text-orange-800 uppercase tracking-wider mb-2">
              {cat}
            </h2>
            <div className="space-y-2">
              {items
                .filter((i) => i.category === cat)
                .map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-xl p-3 shadow-sm flex items-center gap-3"
                  >
                    <span className="text-3xl">{item.image}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">
                        {item.name}
                      </h3>
                      <p className="text-xs text-gray-500 truncate">
                        {item.description}
                      </p>
                      <p className="text-sm font-bold text-orange-600">
                        ${item.price.toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => onAddToCart(item)}
                      className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg hover:bg-orange-600 active:scale-95 transition-all"
                    >
                      +
                    </button>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cart bar */}
      {cartCount > 0 && (
        <div className="p-3 bg-white border-t border-orange-100">
          <button
            onClick={onViewCart}
            className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-600 active:scale-[0.98] transition-all"
          >
            <span className="bg-white text-orange-500 w-6 h-6 rounded-full text-sm flex items-center justify-center">
              {cartCount}
            </span>
            View Cart
          </button>
        </div>
      )}
    </div>
  )
}
