import onFinished from 'on-finished'
import { Request, Response } from 'express'

import Queue from './queue'

import { HandlerFunc } from './defs'

export default class QueueRequest {
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

    if(queue.useRedis) {
      await queue.redis.sadd(queue.withEvent('processing'), this.id)
      await queue.publisher.publish(queue.withEvent('request_processing'), this.id)
    }

    this.handler(this.req, this.res)
  }

  async register() {
    const { queue } = this

    queue.requests[this.id] = this

    if(queue.useRedis) {
      // Add to queue
      await queue.redis.sadd(queue.withEvent('queue'), this.id)
      await queue.publisher.publish(queue.withEvent('new_request'), this.id)
    } else
      queue.runOutstandingItems()
  }

  async deregister() {
    const { queue } = this
    if(queue.options?.verbose)
      console.log('[done]', this.id,)
    
    // Remove from local cache
    queue.queue.delete(this.id)
    delete queue.requests[this.id]
    queue.currentlyProcessing.delete(this.id)

    if(queue.useRedis) {
      // Remove from Redis
      await queue.redis.srem(queue.withEvent('queue'), this.id)
      await queue.redis.srem(queue.withEvent('processing'), this.id)
      await queue.publisher.publish(queue.withEvent('request_done'), this.id)
    } else
      queue.runOutstandingItems()
  }
}
