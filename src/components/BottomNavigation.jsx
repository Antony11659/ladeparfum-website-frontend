import { NavLink } from 'react-router-dom'
import { useCart } from '../context/cartContext.js'
import Icon from './Icon.jsx'

const items = [
  { label: 'Главная', icon: 'home', to: '/' },
  { label: 'Каталог', icon: 'catalog', to: '/catalog' },
  { label: 'Избранное', icon: 'heart' },
  { label: 'Корзина', icon: 'bag', to: '/cart' },
  { label: 'Профиль', icon: 'user' },
]

function BottomNavigation() {
  const { cartCount } = useCart()
  return (
    <nav className="bottom-navigation" aria-label="Основная навигация" lang="ru">
      {items.map((item) => item.to ? (
        <NavLink aria-label={item.icon === 'bag' ? `Корзина, ${cartCount} шт.` : undefined} key={item.icon} to={item.to} end className={({ isActive }) => `bottom-navigation-item${isActive ? ' is-active' : ''}`}>
          {item.icon === 'bag' ? <span className="cart-navigation-icon"><Icon name={item.icon} />{cartCount > 0 && <span className="cart-badge" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span>}</span> : <Icon name={item.icon} />}<span>{item.label}</span>
        </NavLink>
      ) : (
        <button type="button" key={item.icon} className="bottom-navigation-item">
          <Icon name={item.icon} /><span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default BottomNavigation
