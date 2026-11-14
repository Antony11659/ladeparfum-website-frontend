import { Link } from 'react-router-dom'
import { useCart } from '../context/cartContext.js'
import Icon from './Icon.jsx'

function Header() {
  const { cartCount } = useCart()
  return (
    <header className="site-header" lang="ru">
      <div className="header-inner">
        <button className="icon-button" type="button" aria-label="Меню"><Icon name="menu" /></button>
        <p className="brand">La De Parfum</p>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Избранное"><Icon name="heart" /></button>
          <Link className="icon-button cart-navigation-link" to="/cart" aria-label={`Корзина, ${cartCount} шт.`}><Icon name="bag" />{cartCount > 0 && <span className="cart-badge" aria-hidden="true">{cartCount > 99 ? '99+' : cartCount}</span>}</Link>
        </div>
      </div>
    </header>
  )
}

export default Header
