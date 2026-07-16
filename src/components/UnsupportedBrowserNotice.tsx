export default function UnsupportedBrowserNotice() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-56px)] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <svg
        className="h-10 w-10 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
        />
      </svg>
      <h1 className="text-lg font-semibold text-gray-900">
        This browser isn't supported
      </h1>
      <p className="text-sm text-gray-600">
        Ebook Reader saves highlights directly back into your original PDF
        and EPUB files on disk, which relies on the File System Access API.
        That API is only available in Chromium-based browsers.
      </p>
      <p className="text-sm text-gray-600">
        Please open this app in <span className="font-medium">Chrome</span>,{' '}
        <span className="font-medium">Edge</span>,{' '}
        <span className="font-medium">Opera</span>, or{' '}
        <span className="font-medium">Brave</span> on desktop or Android.
        It isn't available in Firefox, Safari, or any browser on iOS.
      </p>
    </div>
  )
}
