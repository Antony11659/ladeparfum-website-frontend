import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProductDetails from './pages/ProductDetails.jsx'
import Cart from './pages/Cart.jsx'
import Checkout from './pages/Checkout.jsx'
import PaymentResult from './pages/PaymentResult.jsx'
import Catalog from './pages/Catalog.jsx'
import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'
import Footer from './components/Footer.jsx'
import BottomNavigation from './components/BottomNavigation.jsx'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/payment-success" element={<PaymentResult />} />
        <Route path="/payment-failed" element={<PaymentResult />} />
        <Route path="/product/:id" element={<ProductDetails />} />
      </Routes>
      <Footer />
      <BottomNavigation />
    </BrowserRouter>
  )
}

export default App
