import { Link } from 'react-router-dom'
import InstallAppButton from './InstallAppButton'

export default function Header() {
  return (
    <header className="h-14 border-b border-gray-200">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="text-lg font-semibold text-gray-900">
          Ebook Reader
        </Link>
        <InstallAppButton />
      </div>
    </header>
  )
}
