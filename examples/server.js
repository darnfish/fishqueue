const express = require('express')

const Queue = require('../lib').default

const webhookQueue = new Queue('webhook', { redis: 'redis://localhost:6379' })

const app = express()

app.post('/handler', webhookQueue.process((req, res) => {
  const { name } = req.body

  res.send({
    message: `Hello ${name}!`
  })
}))

app.listen(4000, () => console.log('listening on 4k'))
