import express from 'express'
import mongoose from 'mongoose'

const app = express()
const port = Number(process.env.PORT ?? 3000)

await mongoose.connect(
  process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/qr_code_generator',
)
console.log('Connected to MongoDB')

app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from the API!' })
})

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
})
