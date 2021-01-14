import Redis from 'ioredis'
import { Request, Response } from 'express'

import QueueRequest from './request'

export type HandlerFunc = (req: Request, res: Response) => void

export interface HandlerMap {
  [key: string]: QueueRequest
}

export type ConcurrencyType = 'node' | 'cluster'

export interface QueueOptions {
  redis?: string | Redis.RedisOptions

  verbose?: boolean
  concurrency?: number
  concurrencyType?: ConcurrencyType
}
