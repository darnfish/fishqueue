import BeeQueue from 'bee-queue'
import { parse, stringify } from 'flatted'
import { Request, Response } from 'express'

type QueueRequest = Request

type ResponseSendFunc = (data: any) => void
type HandlerFunc = (req: QueueRequest, res: QueueResponse) => void

interface QueueResponse {
  send: ResponseSendFunc
  json: ResponseSendFunc
  sendStatus: (statusCode: number) => void
}

interface QueueSettings extends BeeQueue.QueueSettings {
  concurrency?: number
}

export default class Queue {
  name: string

  handler: HandlerFunc

  private queue: BeeQueue
  private settings: QueueSettings

  constructor(name: string, settings: QueueSettings) {
    this.name = name
    this.settings = Object.assign({}, { removeOnSuccess: true, removeOnFailure: true }, settings)

    this.setupQueue()
  }

  process(handler: HandlerFunc, ) {
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
    const queue = new BeeQueue(this.name, this.settings)

    queue.process(this.settings.concurrency || 1, (job, done) => {
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

    this.queue = queue
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
