import Icon from './Icon.jsx'

function Header() {
  return (
    <header className="site-header" lang="ru">
      <div className="header-inner">
        <button className="icon-button" type="button" aria-label="Меню"><Icon name="menu" /></button>
        <p className="brand">La De Parfum</p>
        <div className="header-actions">
          <button className="icon-button" type="button" aria-label="Избранное"><Icon name="heart" /></button>
          <button className="icon-button" type="button" aria-label="Корзина"><Icon name="bag" /></button>
        </div>
      </div>
    </header>
  )
}

export default Header
