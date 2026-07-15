export async function convertMobiToEpub(file: File): Promise<Blob> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/convert', { method: 'POST', body: formData })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `Conversion failed (${res.status})`)
  }
  return res.blob()
}
