function PerfumePlaceholder({ variant = 'violet', hero = false }) {
  return (
    <div className={`perfume-visual perfume-visual--${variant}${hero ? ' perfume-visual--hero' : ''}`} role="img" aria-label="Условный флакон духов — визуальный макет, не изображение товара">
      <div className="visual-orbit" />
      <div className="bottle">
        <div className="bottle-cap" />
        <div className="bottle-neck" />
        <div className="bottle-body"><div className="bottle-label"><span /><span /><span /></div></div>
      </div>
      <div className="bottle-plinth" />
    </div>
  )
}

export default PerfumePlaceholder
