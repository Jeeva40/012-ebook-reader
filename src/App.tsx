import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'

function App() {
  return (
    <BrowserRouter>
      <Header />
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/read/:bookId" element={<ReaderPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
