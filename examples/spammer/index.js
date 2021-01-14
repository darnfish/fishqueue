const axios = require('axios')
const Listr = require('listr')

const createServer = require('./server')

const ports = []
const basePort = 4000
const serverCount = 3

const batchCount = 3
const requestCount = 50

let currentPortIndex = 0
let currentPortBatch = 0

function generateRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

function generatePort() {
  let port = ports[currentPortBatch]
  if(!port) {
    currentPortIndex = 0
    currentPortBatch = 0

    return generatePort()
  }

  const portBatchSize = requestCount / ports.length

  currentPortIndex += 1
  if(currentPortIndex >= portBatchSize) {
    currentPortIndex = 0
    currentPortBatch += 1
  }

  return port
}

async function runSpamRequest(batch, request, { port, task }) {
  const portLog = `port#${port}`
  const batchLog = `batch#${batch}`
  const requestLog = `request#${request}`

  task.title += ` ${portLog}`

  const logLine = [portLog, batchLog, requestLog].join(' ')

  let responseTime = Date.now()
  
  const { data } = await axios.post(`http://localhost:${port}/handler`, { name: logLine })
  responseTime = Date.now() - responseTime

  task.title += ` (${responseTime}ms) (got ${JSON.stringify(data)})`
}

const config = {
  waitTime: 500,
  queueConfig: {
    redis: 'redis://localhost:6379',

    concurrency: 2,
    concurrencyType: 'node'
  }
}

async function main() {
  for(let port = basePort; port < (basePort + serverCount); port ++)
    ports.push(port)

  console.log('fishspammer 🐟')
  console.log(`- running ${ports.length} servers (on ports ${ports.join(', ')})`)

  if(config.waitTime)
    console.log(`- waiting ${config.waitTime}ms between requests`)

  if(config.queueConfig.concurrency) {
    console.log(`- running with a concurrency of ${config.queueConfig.concurrency} (${config.queueConfig.concurrencyType || 'node'} mode)`)
  }

  console.log('')

  await new Promise(resolve => setTimeout(resolve, 250))

  const servers = []

  for(const port of ports)
    servers.push(await new Promise(resolve => {
      createServer(port, {
        ready: server => resolve(server),

        ...config
      })
    }))

  const batches = []
  for(let batch = 1; batch <= batchCount; batch++) {
    const requests = []
    for(let request = 1; request <= requestCount; request++)
      requests.push({
        title: `request#${request}`,
        task: (ctx, task) => runSpamRequest(batch, request, { task, port: generatePort() })
      })

    batches.push({
      title: `batch#${batch}`,
      task: () => new Listr(requests, { concurrent: true })
    })
  }

  let task
  if(batches.length === 1)
    task = batches[0].task()
  else
    task = new Listr(batches, { concurrent: false })
  
  await task.run()

  for(const server of servers)
    await server.close()

  console.log('\n🎣 done!\n')
}

main()
