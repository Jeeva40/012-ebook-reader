import express from 'express'
import cors from 'cors'
import convertRouter from './convert.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api', convertRouter)

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})
