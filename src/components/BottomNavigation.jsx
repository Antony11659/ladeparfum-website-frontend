import { NavLink } from 'react-router-dom'
import Icon from './Icon.jsx'

const items = [
  { label: 'Главная', icon: 'home', to: '/' },
  { label: 'Каталог', icon: 'catalog', to: '/catalog' },
  { label: 'Избранное', icon: 'heart' },
  { label: 'Корзина', icon: 'bag' },
  { label: 'Профиль', icon: 'user' },
]

function BottomNavigation() {
  return (
    <nav className="bottom-navigation" aria-label="Основная навигация" lang="ru">
      {items.map((item) => item.to ? (
        <NavLink key={item.icon} to={item.to} end className={({ isActive }) => `bottom-navigation-item${isActive ? ' is-active' : ''}`}>
          <Icon name={item.icon} /><span>{item.label}</span>
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
