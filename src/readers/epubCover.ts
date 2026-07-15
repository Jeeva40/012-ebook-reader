import ePub from 'epubjs'

export async function extractEpubCover(file: Blob): Promise<Blob | null> {
  let book: ReturnType<typeof ePub> | null = null
  let coverUrl: string | null = null

  try {
    const data = await file.arrayBuffer()
    book = ePub(data)
    await book.ready
    coverUrl = await book.coverUrl()
    if (!coverUrl) return null

    const response = await fetch(coverUrl)
    return await response.blob()
  } catch {
    return null
  } finally {
    if (coverUrl) URL.revokeObjectURL(coverUrl)
    book?.destroy()
  }
}
