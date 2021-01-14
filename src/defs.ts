import Redis from 'ioredis'
import { Request, Response } from 'express'

import QueueRequest from './request'

export type HandlerFunc = (req: Request, res: Response) => void

export interface HandlerMap {
  [key: string]: QueueRequest
}

export interface QueueOptions {
  redis?: string | Redis.RedisOptions

  verbose?: boolean
  concurrency?: number
}
