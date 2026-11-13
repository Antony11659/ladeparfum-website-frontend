import HeroSection from '../sections/HeroSection.jsx'
import BestsellersSection from '../sections/BestsellersSection.jsx'
import PersonalSelection from '../sections/PersonalSelection.jsx'
import CategoriesSection from '../sections/CategoriesSection.jsx'
import AboutSection from '../sections/AboutSection.jsx'

function Home() {
  return (
    <main className="home" lang="ru">
      <HeroSection />
      <BestsellersSection />
      <PersonalSelection />
      <CategoriesSection />
      <AboutSection />
    </main>
  )
}

export default Home
