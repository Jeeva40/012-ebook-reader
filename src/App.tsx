import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import UnsupportedBrowserNotice from './components/UnsupportedBrowserNotice'
import { isFileSystemAccessSupported } from './lib/fileSystemAccess'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'

function App() {
  const supported = isFileSystemAccessSupported()

  return (
    <BrowserRouter>
      <Header />
      {supported ? (
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/read/:bookId" element={<ReaderPage />} />
        </Routes>
      ) : (
        <UnsupportedBrowserNotice />
      )}
    </BrowserRouter>
  )
}

export default App
