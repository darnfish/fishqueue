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

    this.id = this.generateId()
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

  private generateId() {
    return `${this.queue.name}:${intformat(this.queue.idGenerator.next(), 'dec')}`
  }
}

export default class Queue {
  name: string
  options: QueueOptions

  requests: HandlerMap = {}

  redis: Redis.Redis
  publisher: Redis.Redis
  subscriber: Redis.Redis

  queue: Set<string> = new Set([])
  currentlyProcessing: Set<string> = new Set([])

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

      this.withEvent('new_request'),
      this.withEvent('request_processing'),
      this.withEvent('request_done')
    ]

    this.subscriber.on('message', async (channel, message) => {
      const [header, queue, type] = channel.split(':')
      if(type === 'hello')
        return

      switch(type) {
      case 'new_request': {
        this.queue.add(message)

        await this.runOutstandingItems()

        break
      }
      case 'request_processing': {
        this.currentlyProcessing.add(message)

        break
      }
      case 'request_done': {
        delete this.requests[message]

        this.queue.delete(message)
        this.currentlyProcessing.delete(message)

        await this.runOutstandingItems()

        break
      }
      }

      if(this.options?.verbose) {
        console.log('[got]', type, '->', message)
        console.log('[queue]', this.queue)
        console.log('')
      }
    }).subscribe([
      ...this.eventTypes
    ])

    const machineId = await this.publisher.publish(this.withEvent('hello'), 'world')
    this.idGenerator = new FlakeId({ epoch: new Date(2002, 7, 9), worker: machineId })

    death(signal => this.onDeath(signal))
  }

  async runOutstandingItems() {
    if(this.currentlyProcessing.size >= (this.options?.concurrency || 3))
      return

    let requestIds = Object.keys(this.requests)
    requestIds = requestIds.filter(id => !this.currentlyProcessing.has(id))

    if(requestIds.length === 0)
      return

    this.requests[requestIds[0]].run()
    this.currentlyProcessing.add(requestIds[0])
  }

  withEvent(eventName) {
    return `fq:${this.name}:${eventName}`
  }

  private createRedis() {
    // dont ask lol
    if(typeof this.options?.redis === 'string')
      return new Redis(this.options?.redis)

    return new Redis(this.options?.redis)
  }

  private async onDeath(signal) {
    const internalQueueItems = Object.keys(this.requests)

    for(const requestId of internalQueueItems)
      try {
        await this.requests[requestId].deregister()
      } catch(error) {
        console.error('error deleting request', requestId, '->', error)
      }

    process.exit(signal)
  }
}
