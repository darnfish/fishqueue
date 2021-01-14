const express = require('express')
const Queue = require('../lib').default

const app = express()
const webhookQueue = new Queue('webhook', { verbose: false, concurrency: 2 })

app.use(express.json())

function generateRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

app.post('/handler', webhookQueue.process((req, res) => {
  const { name } = req.body

  setTimeout(async () => {
    console.log(`[sending to ${req.fishqueue.id}]`, name)

    res.send({
      id: req.fishqueue.id
    })
  }, 100 || generateRandomInt(1000, 5000))
}))

const port = process.env.PORT || 4000
app.listen(port, () => console.log(`listening on port#${port}`))
