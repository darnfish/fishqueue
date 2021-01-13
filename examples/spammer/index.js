const axios = require('axios')

const batches = 5
const concurrentRequests = 150

async function runSpamRequest(batch, request) {
  const port = Math.random() >= 0.5 ? '4000' : '5000'

  const portLog = `port#${port}`
  const batchLog = `batch#${batch}`
  const requestLog = `request#${request}`

  console.log('- sending', batchLog, requestLog, 'to', portLog)
  
  const { data } = await axios.post(`http://localhost:${port}/handler`, { name: [portLog, batchLog, requestLog].join(' ') })
  console.log('- got', data, 'from', batchLog, requestLog, 'to', portLog)
}

async function main() {
  for(let batch = 0; batch < batches; batch++) {
    const requests = []
    for(let request = 0; request < concurrentRequests; request++)
      requests.push(runSpamRequest(batch, request))

    console.log(`batch#${batch} starting with ${concurrentRequests} requests...`)

    try {
      await Promise.all(requests)

      console.log(`batch#${batch} done!`)
    } catch(error) {
      console.log(error, `<- batch#${batch} failed :~(`)
    }
  
    console.log('')
  }
}

main()
