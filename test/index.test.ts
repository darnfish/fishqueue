import axios from 'axios'
import express from 'express'

import Queue from '../lib'

let port = 4000

describe('queue', () => {
  it('creates a queue', () => {
    const queueName = 'myQueue'
    const queue = new Queue(queueName)

    expect(queue.id.split(':')[0]).toBe(queueName)
    expect(queue.name).toBe(queueName)
  })

  describe('requests', () => {
    it('accepts requests', async done => {
      // Create Queue
      const queue = new Queue('acceptsRequests')

      // Create Express server
      const app = express()
      const server = app.listen(port)

      // Create route
      app.post('/', queue.process((req, res) => {
        res.sendStatus(200)

        server.close(done)
      }))

      // Send request
      await axios.post(`http://localhost:${port}`)
    })

    it('accepts multiple requests', async done => {
      // Create Queue
      const queue = new Queue('queuesRequests')

      // Create Express server
      const app = express()
      const server = app.listen(port)

      // Create handler
      const handler = jest.fn((req, res) => res.sendStatus(200))

      // Create route
      app.post('/', queue.process(handler))

      const callTimes = 100

      // Send 10 requests
      for(let i = 0; i < callTimes; i++)
        await axios.post(`http://localhost:${port}`)

      expect(handler).toHaveBeenCalledTimes(callTimes)

      server.close(done)
    })
  })

  describe('concurrency', () => {
    it('runs requests in parallel', async done => {
      // Create Queue
      const queue = new Queue('queuesRequests', { concurrency: 5 })

      // Create Express server
      const app = express()
      const server = app.listen(port)

      // Create handler
      const handler = jest.fn((req, res) => res.sendStatus(200))

      // Create route
      app.post('/', queue.process(handler))

      const requests = []
      const callTimes = 50

      // Send 10 requests
      for(let i = 0; i < callTimes; i++)
        requests.push(axios.post(`http://localhost:${port}`))

      await Promise.all(requests)

      expect(handler).toHaveBeenCalledTimes(callTimes)
      expect(queue.concurrencyCount).toBe(5)

      server.close(done)
    })
  })

  describe('redis', () => {
    it('distributes requests across many servers', async done => {
      const ports = []
      const queues = []
      const servers = []
      const handlers = []

      const serverCount = 5

      for(let i = 0; i < serverCount; i++) {
        // Create Queue
        const queue = new Queue('queuesRequests', { redis: 'redis://localhost:6379', concurrency: 3 })

        // Create Express server
        const app = express()
        const server = app.listen(port)

        // Create handler
        const handler = jest.fn((req, res) => res.sendStatus(200))

        // Create route
        app.post('/', queue.process(handler))

        // Increase port
        ports.push(port)
        port += 1

        // Add server and queue
        queues.push(queue)
        servers.push(server)
        handlers.push(handler)

        await new Promise(resolve => setTimeout(resolve, 250))
      }

      // Ensure every queue knows of its friends
      for(const queue of queues)
        expect(queue.machineCount).toBe(serverCount)

      const requests = []
      const callCount = 2

      // Create two requests per server
      for(const port of ports) 
        for(let i = 0; i < callCount; i++)
          requests.push(axios.post(`http://localhost:${port}`))

      // Run requests
      await Promise.all(requests)

      // Handler check
      for(const handler of handlers)
        expect(handler).toHaveBeenCalledTimes(callCount)

      // Close all servers
      for(const server of servers)
        server.close()

      // Close all queues
      for(const queue of queues)
        for(const client of [queue.redis, queue.publisher, queue.subscriber])
          try {
            await client.quit()
          } catch(error) {
            // blah blah
          }

      // Done!
      done()
    })
  })
})

afterEach(() => port += 1)
