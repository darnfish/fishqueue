# fishqueue
Automatically queue incoming Express.js requests over a replicated codebase

## Install
```
yarn add fishqueue
```

## Usage
```js
import Queue from 'fishqueue'

const queue = new Queue('apple/webhook', { redis: process.env.REDIS_URI })

app.post('/webhook/apple', queue.process(async (req, res) => {
  const result = await handleAppleWebHook(req.body)

  res.send(result)
}))
```

## License
Do No Harm
