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

### Configuration
Pass an object containing the following properties into the second constructor argument of `Queue`:

| Property        | Description                                                                                                              | Required? | Defaults To |
|-----------------|--------------------------------------------------------------------------------------------------------------------------|-----------|-------------|
| redis           | A Redis connection object or URI (see [here]() for more details)                                                                              | no        | `null`      |
| verbose         | A boolean stating if fishqueue should provide detail logs                                                                | no        | `false`     |
| concurrency     | A number stating the amount of concurrent requests to be handled in accordance with `concurrencyType`                    | no        | `3`         |
| concurrencyType | A string stating the type of concurrency which should be used. See [Concurrency Types](#concurrency-types) for more info | no        | `node`      |

#### Concurrency Types
| Type    | Description                                                                                                                                                                                                                 |
|---------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| node    | Each instance of your app can handle {{ concurrency }} requests at a time. For example, a cluster of 3 nodes with a concurrency of 6 will handle 6 requests per node, totalling 18 requests in processing at any given time |
| cluster | Requests will be handled in a distributed fashion. For example, a cluster of 3 nodes with a concurrency of 6 will handle 2 requests per node                                                                                |

## License
Do No Harm
