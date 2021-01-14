// Imports
import death from 'death'
import Redis from 'ioredis'
import onFinished from 'on-finished'
import { Request, Response } from 'express'

// ID Gen
import FlakeId from 'flake-idgen'
import intformat from 'biguint-format'

// Types
type HandlerFunc = (req: Request, res: Response) => void

interface HandlerMap {
  [key: string]: QueueRequest
}

interface QueueOptions {
  redis: string | Redis.RedisOptions

  verbose?: boolean
  concurrency?: number
}

// Request
export class QueueRequest {
  id: string

  req: Request
  res: Response
  handler: HandlerFunc

  queue: Queue

  constructor(req: Request, res: Response, handler: HandlerFunc, queue: Queue) {
    this.queue = queue

    this.id = this.queue.generateId()
    if(queue.options?.verbose)
      console.log('[incoming]', this.id)

    this.req = Object.assign({}, req, { fishqueue: { id: this.id }})
    this.res = res
    this.handler = handler

    this.register()
    onFinished(res, () => this.deregister())
  }

  async run() {
    const { queue } = this
    if(queue.options?.verbose)
      console.log('[running]', this.id)

    queue.currentlyProcessing.add(this.id)
    await queue.redis.sadd(queue.withEvent('processing'), this.id)
    await queue.publisher.publish(queue.withEvent('request_processing'), this.id)

    this.handler(this.req, this.res)
  }

  async register() {
    const { queue } = this

    queue.requests[this.id] = this

    // Add to queue
    await queue.redis.sadd(queue.withEvent('queue'), this.id)
    await queue.publisher.publish(queue.withEvent('new_request'), this.id)
  }

  async deregister() {
    const { queue } = this
    if(queue.options?.verbose)
      console.log('[done]', this.id,)
    
    // Remove from local cache
    queue.queue.delete(this.id)
    delete queue.requests[this.id]
    queue.currentlyProcessing.delete(this.id)

    // Remove from Redis
    await queue.redis.srem(queue.withEvent('queue'), this.id)
    await queue.redis.srem(queue.withEvent('processing'), this.id)
    await queue.publisher.publish(queue.withEvent('request_done'), this.id)
  }
}

export default class Queue {
  id: string

  name: string
  options: QueueOptions

  requests: HandlerMap = {}

  redis: Redis.Redis
  publisher: Redis.Redis
  subscriber: Redis.Redis

  queue: Set<string> = new Set([])
  currentlyProcessing: Set<string> = new Set([])

  machineId: number
  machineCount: number

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

  private async setup() {
    this.redis = this.createRedis()
    this.publisher = this.createRedis()
    this.subscriber = this.createRedis()

    this.queue = new Set(await this.redis.smembers(this.withEvent('queue')))

    this.eventTypes = [
      this.withEvent('hello'),
      this.withEvent('goodbye'),

      this.withEvent('new_request'),
      this.withEvent('request_processing'),
      this.withEvent('request_done')
    ]

    const mutedEvents = ['hello', 'goodbye']

    this.subscriber.on('message', async (channel, message) => {
      const [header, queue, type] = channel.split(':')

      switch(type) {
      case 'hello':
        if(message !== this.id)
          this.machineCount += 1
  
        break
      case 'goodbye':
        if(message !== this.id)
          this.machineCount -= 1
  
        break
      case 'new_request': {
        this.queue.add(message)

        await this.runOutstandingItems()

        break
      }
      case 'request_done': {
        this.queue.delete(message)
        delete this.requests[message]

        await this.runOutstandingItems()

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

    // Generate initial internal queue id
    const idParams = { epoch: new Date(2002, 7, 9) }

    this.idGenerator = new FlakeId(idParams)
    this.id = this.generateId()

    // Find out how many nodes are currently on this queue
    const machineId = await this.publisher.publish(this.withEvent('hello'), this.id)
    this.machineId = machineId
    this.machineCount = machineId

    // Update queue id generator with machine id
    this.idGenerator = new FlakeId({ ...idParams, worker: machineId })

    death(signal => this.onDeath(signal))
  }

  async runOutstandingItems() {
    let requestIds = Object.keys(this.requests)
    requestIds = requestIds.filter(id => !this.currentlyProcessing.has(id))

    if(requestIds.length === 0)
      return

    if(this.currentlyProcessing.size >= this.concurrencyCount)
      return

    this.requests[requestIds[0]].run()
    this.currentlyProcessing.add(requestIds[0])
  }

  withEvent(eventName) {
    return `fq:${this.name}:${eventName}`
  }

  generateId() {
    return `${this.name}:${intformat(this.idGenerator.next(), 'dec')}`
  }

  private createRedis() {
    // dont ask lol
    if(typeof this.options?.redis === 'string')
      return new Redis(this.options?.redis)

    return new Redis(this.options?.redis)
  }

  private async onDeath(signal) {
    const internalQueueItems = Object.keys(this.requests)

    await this.publisher.publish(this.withEvent('goodbye'), 'world')

    for(const requestId of internalQueueItems)
      try {
        await this.requests[requestId].deregister()
      } catch(error) {
        console.error('error deleting request', requestId, '->', error)
      }

    process.exit(signal)
  }

  private get concurrencyCount() {
    return Math.ceil((this.options?.concurrency || 3) / this.machineCount) || 3
  }
}
