import death from 'death'
import Redis from 'ioredis'
import FlakeId from 'flake-idgen'
import intformat from 'biguint-format'
import { Request, Response } from 'express'

import QueueRequest from './request'
import { QueueOptions, HandlerMap, HandlerFunc } from './defs'

const mutedEvents = ['hello', 'goodbye']

export default class Queue {
  id: string

  name: string
  options: QueueOptions

  requests: HandlerMap = {}

  redis?: Redis.Redis
  publisher?: Redis.Redis
  subscriber?: Redis.Redis

  queue: Set<string> = new Set([])
  currentlyProcessing: Set<string> = new Set([])

  machineId: number
  machines: Set<string> = new Set([])

  idGenerator: any

  private eventTypes: string[]

  constructor(name: string, options: QueueOptions) {
    if(name.split('').indexOf(':') > -1)
      throw new Error('fishqueue does not support queue names with \':\'')
    
    this.name = name
    this.options = options

    this.setup()
  }

  process(handler: HandlerFunc) {
    return async (req: Request, res: Response) => new QueueRequest(req, res, handler, this)
  }

  async runOutstandingItems() {
    const requestIds = this.outstandingRequestIds
    if(requestIds.length === 0)
      return

    if(this.currentlyProcessing.size >= this.concurrencyCount)
      return

    const [requestId] = requestIds
    this.requests[requestId].run()
  }

  async nominateMachine(includeSelf = true) {
    if(this.queue.size === 0)
      return

    let machineIds = Array.from(this.machines)
    if(!includeSelf)
      machineIds = machineIds.filter(machineId => machineId !== this.id)

    const randomIndex = Math.floor(Math.random() * machineIds.length)
    const machineId = machineIds[randomIndex]

    await this.publisher.publish(this.withEvent(), `d:nominated:${machineId}`)
  }

  async fetchCurrentlyProcessing() {
    return new Set(await this.redis.smembers(this.withEvent('processing')))
  }

  generateId() {
    return `${this.name}:${intformat(this.idGenerator.next(), 'dec')}`
  }

  withEvent(eventName?) {
    return `fq:${this.name}${eventName ? `:${eventName}` : ''}`
  }

  get useRedis() {
    if(this.options?.concurrencyType === 'node')
      return false

    return !!this.options?.redis
  }

  get requestCount() {
    return Object.keys(this.requests).length
  }

  get concurrencyCount() {
    const baseConcurrency = Math.ceil(this.options?.concurrency) || 3
    if(!this.redis)
      return baseConcurrency

    const concurrencyType = this.options?.concurrencyType || 'node'

    switch(concurrencyType) {
    case 'cluster':
      return Math.ceil(baseConcurrency / this.machines.size) || baseConcurrency
    default:
      return baseConcurrency
    }
  }

  private async setup() {
    // Generate initial internal queue id
    const idParams = { epoch: new Date(2002, 7, 9) }

    this.idGenerator = new FlakeId(idParams)
    this.id = this.generateId()

    if(this.useRedis) {
      this.redis = this.createRedis()
      this.publisher = this.createRedis()
      this.subscriber = this.createRedis()

      this.queue = new Set(await this.redis.smembers(this.withEvent('queue')))

      this.eventTypes = [
        this.withEvent(),

        this.withEvent('hello'),
        this.withEvent('goodbye'),

        this.withEvent('new_request'),
        this.withEvent('request_processing'),
        this.withEvent('request_done')
      ]

      this.subscriber.on('message', async (channel, message) => {
        let isGlobalMessage = false
        let isDirectMessage = false
        let [header, queue, type] = channel.split(':')

        if(!type) {
          const parts = message.split(':')

          const messageType = parts[0]
          parts.splice(0, 1)

          type = parts[0]
          parts.splice(0, 1)

          switch(messageType) {
          case 'g':
            isGlobalMessage = true

            break
          case 'd':
            isDirectMessage = this.id === parts.join(':')

            break
          }

          message = parts.join(':')
        }

        switch(type) {
        case 'hello':
          this.machines.add(message)

          if(!isGlobalMessage)
            this.publisher.publish(this.withEvent(), `g:hello:${this.id}`)
    
          break
        case 'goodbye':
          this.machines.delete(message)

          if(!isGlobalMessage)
            this.publisher.publish(this.withEvent(), `g:goodbye:${this.id}`)
    
          break
        case 'nominated':
          if(!isDirectMessage || this.queue.size === 0)
            break

          if(this.outstandingRequestIds.length > 0)
            await this.runOutstandingItems()
          else
            this.nominateMachine(false)

          break
        case 'new_request':
          this.queue.add(message)

          break
        case 'request_processing':
          this.currentlyProcessing.add(message)

          break
        case 'request_done': {
          this.queue.delete(message)
          delete this.requests[message]
          this.currentlyProcessing.delete(message)

          break
        }
        }

        if(this.options?.verbose && !mutedEvents.includes(type)) {
          console.log('[got]', type, '->', message)
          // console.log('[queue]', this.queue)
          // console.log('')
        }
      }).subscribe([
        ...this.eventTypes
      ])

      // Find out how many nodes are currently on this queue
      const machineId = await this.publisher.publish(this.withEvent('hello'), this.id)
      this.machineId = machineId

      // Update queue id generator with machine id
      this.idGenerator = new FlakeId({ ...idParams, worker: machineId })
    }

    death(signal => this.onDeath(signal))
  }

  private createRedis() {
    // dont ask lol
    if(typeof this.options?.redis === 'string')
      return new Redis(this.options?.redis)

    return new Redis(this.options?.redis)
  }

  private async onDeath(signal, exitProcess = true) {
    if(this.redis) {
      const internalQueueItems = Object.keys(this.requests)

      await this.publisher.publish(this.withEvent('goodbye'), this.id)

      for(const requestId of internalQueueItems)
        try {
          await this.requests[requestId]?.deregister()
        } catch(error) {
          console.error('error deleting request', requestId, '->', error)
        }

      await Promise.all([
        this.redis.quit(),
        this.publisher.quit(),
        this.subscriber.quit()
      ])
    }

    if(exitProcess)
      process.exit(signal)
  }

  private get outstandingRequestIds() {
    const requests = Object.keys(this.requests).map(requestId => this.requests[requestId]).sort((a, b) => a.recievedAt - b.recievedAt)
    const requestIds = requests.map(request => request.id).filter(id => !this.currentlyProcessing.has(id))

    return requestIds
  }
}
