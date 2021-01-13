const express = require('express')

const Queue = require('../lib').default

const webhookQueue = new Queue('webhook', { redis: 'redis://localhost:6379', verbose: true })

const app = express()

app.use(express.json())

function generateRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

app.post('/handler', webhookQueue.process((req, res) => {
  const { name } = req.body

  setTimeout(async () => {
    console.log('[sending]', name)

    res.send({
      message: `Hello ${name}!`
    })
  }, generateRandomInt(0, 250))
}))

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`listening on port#${port}`))
