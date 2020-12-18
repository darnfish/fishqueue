# fishqueue
Automatically queue incoming Express requests over a replicated codebase. Backed by [Bee Queue](https://github.com/bee-queue/bee-queue)

## Install
```
yarn add fishqueue
```

## Usage
```js
import Queue from 'fishqueue'

const queue = new Queue('apple/webhook', { redis: process.env.REDIS_URI, concurrency: 3 })

app.post('/webhook/apple', queue.process(async (req, res) => {
  const result = await handleAppleWebHook(req.body)

  res.send(result)
}))
```

## License
Do No Harm
