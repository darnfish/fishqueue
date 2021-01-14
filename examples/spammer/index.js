const axios = require('axios')
const Listr = require('listr')

const batchCount = 20
const requestCount = 10

async function runSpamRequest(batch, request, { task }) {
  const port = Math.random() >= 0.5 ? '4000' : '5000'

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
        task: (ctx, task) => runSpamRequest(batch, request, { task })
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
