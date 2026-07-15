import { Router } from 'express'
import multer from 'multer'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const execFileAsync = promisify(execFile)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
})

const router = Router()

router.post('/convert', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' })
  }
  if (!file.originalname.toLowerCase().endsWith('.mobi')) {
    return res.status(400).json({ error: 'Only .mobi files are supported' })
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebook-convert-'))
  const inputPath = path.join(workDir, `${crypto.randomUUID()}.mobi`)
  const outputPath = path.join(workDir, `${crypto.randomUUID()}.epub`)

  try {
    await fs.writeFile(inputPath, file.buffer)
    await execFileAsync('ebook-convert', [inputPath, outputPath], {
      timeout: 120_000,
    })

    const converted = await fs.readFile(outputPath)
    res.setHeader('Content-Type', 'application/epub+zip')
    res.send(converted)
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(500).json({
        error:
          "Calibre's ebook-convert CLI was not found. Install Calibre and make sure it is on the server's PATH.",
      })
    } else {
      res.status(500).json({
        error: 'MOBI to EPUB conversion failed',
        detail: err.message,
      })
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
})

export default router
