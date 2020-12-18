import BeeQueue from 'bee-queue'
import { parse, stringify } from 'flatted'
import { Request, Response } from 'express'

type QueueRequest = Request

type SendFunc = (data: any) => void
type HandlerFunc = (req: QueueRequest, res: QueueResponse) => void

interface QueueResponse {
  send: SendFunc
  json: SendFunc
  sendStatus: (statusCode: number) => void
}

interface QueueOptions {
  redis

  verbose: boolean

  handler: boolean
}

export default class Queue {
  name: string

  handler: HandlerFunc

  private queue: BeeQueue
  private options: QueueOptions

  constructor(name: string, options: QueueOptions) {
    this.name = name
    this.options = options

    this.setupQueue()
  }

  process(handler: HandlerFunc) {
    this.handler = handler

    return async (_req: Request, res: Response) => {
      const req = this.patchReq(_req)

      const job = this.queue.createJob(req)
      await job.save()

      const logPrefix = `[fish queue] job#${job.id} on queue#${this.queue.name}\n[fish queue]`

      job.on('succeeded', ({ data, status }) => {
        console.warn(logPrefix, `succeeded with status ${status}!`)

        res.status(status).send(data)
      })

      job.on('retrying', error => {
        console.warn(logPrefix, `retrying -> ${error}`)
      })

      job.on('failed', error => {
        console.error(logPrefix, `failed -> ${error}`)

        res.sendStatus(500)
      })
    }
  }

  private setupQueue() {
    this.queue = new BeeQueue(this.name, {
      redis: this.options.redis,

      removeOnSuccess: true,
      removeOnFailure: true
    })

    this.queue.process((job, done) => {
      function sender(data: any, status = 200) {
        done(null, { data, status })
      }

      try {
        this.handler(parse(job.data), {
          send: sender,
          json: sender,
          sendStatus: () => sender(null, 200)
        })
      } catch(error) {
        console.log(error)
      }
    })
  }

  private patchReq(_req: Request) {
    const req = Object.assign({}, _req) as any

    req.headers = Object.assign({}, _req.headers)

    req.connection = {
      remoteAddress: _req.connection.remoteAddress
    }

    return stringify(req)
  }

  private nomify(value) {
    return JSON.parse(JSON.stringify(value))
  }
}
