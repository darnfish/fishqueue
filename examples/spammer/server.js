const express = require('express')
const Queue = require('../../lib').default

module.exports = function createServer(port, { queueConfig, waitTime, ready } = {}) {
  const app = express()
  const queue = new Queue('spammer', queueConfig)

  app.use(express.json())

  app.post('/handler', queue.process((req, res) => {
    const { name } = req.body

    setTimeout(async () => {
      res.send({
        machineId: queue.machineId,
        machineCount: queue.machines.size,

        size: queue.currentlyProcessing.size,
        expected: queue.concurrencyCount
      })
    } , waitTime || 100)
  }))

  const server = app.listen(port, () => {
    if(!ready)
      return

    ready(server)
  })
}
