const axios = require('axios')
const Listr = require('listr')

const ports = ['4000', '5000', '6000', '7000']

const batchCount = 5
const requestCount = 40

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

async function main() {
  const batches = []
  for(let batch = 1; batch <= batchCount; batch++) {
    const requests = []
    for(let request = 1; request <= requestCount; request++)
      requests.push({
        title: `Request #${request}`,
        task: (ctx, task) => runSpamRequest(batch, request, { task, port: generatePort() })
      })

    batches.push({
      title: `Batch #${batch}`,
      task: () => new Listr(requests, { concurrent: true })
    })
  }

  const task = new Listr(batches, { concurrent: false })
  await task.run()
}

main()
