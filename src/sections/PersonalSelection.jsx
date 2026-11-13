import Icon from '../components/Icon.jsx'

function PersonalSelection() {
  return (
    <section className="section-shell selection-wrapper" aria-labelledby="selection-title">
      <div className="personal-selection">
        <div className="selection-decoration" aria-hidden="true">✦</div>
        <div className="selection-copy">
          <p className="eyebrow">✦ ПЕРСОНАЛЬНЫЙ ВЫБОР</p>
          <h2 id="selection-title">Не знаете, что выбрать?</h2>
          <p>Поможем найти аромат, который подходит именно вам.</p>
          <button className="button button-light" type="button">ПОДОБРАТЬ АРОМАТ <Icon name="arrow" /></button>
        </div>
      </div>
    </section>
  )
}

export default PersonalSelection
