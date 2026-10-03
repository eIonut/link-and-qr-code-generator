import express from 'express'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(express.json())

app.get('/', (_req, res) => {
  res.json({ message: 'Hello from the API!' })
})

app.listen(port, () => {
  console.log(`API server listening on http://localhost:${port}`)
})
