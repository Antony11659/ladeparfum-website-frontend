import Icon from './Icon.jsx'

const items = [
  { label: 'Главная', icon: 'home' },
  { label: 'Каталог', icon: 'catalog' },
  { label: 'Избранное', icon: 'heart' },
  { label: 'Корзина', icon: 'bag' },
  { label: 'Профиль', icon: 'user' },
]

function BottomNavigation() {
  return (
    <nav className="bottom-navigation" aria-label="Основная навигация" lang="ru">
      {items.map((item, index) => (
        <button type="button" key={item.icon} className={`bottom-navigation-item${index === 0 ? ' is-active' : ''}`} aria-current={index === 0 ? 'page' : undefined}>
          <Icon name={item.icon} /><span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

export default BottomNavigation
