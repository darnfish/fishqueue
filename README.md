# fishqueue
![Unit Tests](https://github.com/darnfish/fishqueue/workflows/Unit%20Tests/badge.svg) ![Codecov](https://img.shields.io/codecov/c/gh/darnfish/fishqueue)

High-velocity queue for handling incoming Express.js requests across replicated codebase using Redis with minimal residue and maximum buzzwords

## Install
```
yarn add fishqueue
```

## Usage
```js
import Queue from 'fishqueue'

const queue = new Queue('webhook', { redis: process.env.REDIS_URI, concurrency: 3 })

app.post('/webhook', queue.process(async (req, res) => {
  const result = await handleWebHook(req.body)

  res.send(result)
}))
```

## License
Do No Harm
