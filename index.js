require('dotenv').config()
const puppeteer = require('puppeteer-extra')
const pluginStealth = require('puppeteer-extra-plugin-stealth')
const UserAgents = require('user-agents')
const ora = require('ora')

puppeteer.use(pluginStealth())

const generateUserAgent = () => new UserAgents((ua) => {
  return ua.deviceCategory === 'desktop' && ['Win32', 'MacIntel', 'Linux x86_64'].includes(ua.platform)
})

const setRandomUserAgent = async (page, overrideUA = null) => {
  const UA = overrideUA || generateUserAgent()

  await page._client.send('Network.setUserAgentOverride', {
    userAgent: UA.userAgent || (await page.browser().userAgent()),
    acceptLanguage: UA.locale || 'en-US,en;q=0.9',
    platform: UA.platform || 'Win32'
  })

  const deviceMemory = [8, 16, 32]
  const hardwareConcurrency = [4, 8, 16]

  await page.evaluateOnNewDocument(({ vendor, deviceMemory, hardwareConcurrency }) => {
    Object.defineProperty(navigator, 'vendor', { get: () => vendor })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => deviceMemory })
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => hardwareConcurrency })
  }, {
    vendor: UA.vendor || 'Google Inc.',
    deviceMemory: deviceMemory[Math.floor(Math.random() * deviceMemory.length)],
    hardwareConcurrency: hardwareConcurrency[Math.floor(Math.random() * hardwareConcurrency.length)]
  })

  return {
    userAgent: UA.userAgent,
    acceptLanguage: UA.acceptLanguage,
    platform: UA.platform,
    vendor: UA.vendor
  }
}

const blockAssets = async page => {
  await page.setRequestInterception(true)
  
  page.on('request', request => {
    const blockedTypes = [
      // 'document',
      'stylesheet',
      'image',
      'media',
      'font',
      'script',
      'texttrack',
      'xhr',
      // 'fetch',
      'eventsource',
      'websocket',
      'manifest',
      'other'
    ]

    if (blockedTypes.indexOf(request.resourceType()) !== -1) {
      request.abort()
    } else { 
      request.continue()
    }
  })
}

const browser = puppeteer.launch({
  defaultViewport: {
    width: 1920,
    height: 1080
  },

  args: [
    `--proxy-server=http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
  ],

  ignoreHTTPSErrors: true,

  headless: true,

  handleSIGTERM: false,
  handleSIGINT: false
})

const asins = [
  'B08K2ZRHJ9',
  'B01AQPLAP2',
  'B09HKVHC4M',
  'B08HTWGT6X',
  'B01KHILJH2',
  'B08HT2KWML',
  'B088S1PWBD',
  'B07Z5JFZDQ',
  'B073JBZJDN',
  'B06WLPJ5PG',
  'B01L99HL98',
  'B07N145FYD',
  'B073XQ6Y1C',
  'B07BY26RTM',
  'B01DDGE0LC',
  'B00UEMEJQ0',
  'B00BG5CPJC',
  'B00BG5BWK0',
  'B009567GKM',
  'B008BRGFE4',
  'B004UPPML8',
  'B099NQRCFX',
  'B099NQTD4G',
  'B099NSK1GR',
  'B073JPLL4F'
]

browser.then(async browser => {
  for (const asin of asins) {
    const context = await browser.createIncognitoBrowserContext()
    const page = await context.newPage()

    const spinner = ora(asin).start()

    await page.authenticate({
      username: process.env.PROXY_USERNAME + '-country-uk',
      password: process.env.PROXY_PASSWORD
    })

    await setRandomUserAgent(page)

    await page.goto('https://fingerprint.com/demo/')

    await page.waitForSelector('[class^="VisitorSection-module--idValue"]')
    const fingerprintId = await page.$eval('[class^="VisitorSection-module--idValue"]', el => el.innerText)

    await blockAssets(page)

    spinner.text = `${asin} \t fingerprint: ${fingerprintId}`

    await page.goto('https://arh.antoinevastel.com/bots/areyouheadless')

    const headlessCheck = await page.$eval('#res > p', el => el.className === 'success')

    spinner.text = `${asin} \t fingerprint: ${fingerprintId} \t headlessCheck: ${headlessCheck ? 'passed' : 'failed'}`

    await page.goto(`https://www.amazon.co.uk/d/${asin}?th=1&psc=1`)

    const hasDpSorryPageError = !!(await page.$('#dpSorryPage'))

    if (hasDpSorryPageError) {
      spinner.fail()
    } else {
      spinner.succeed()
    }

    await page.screenshot({ path: 'ohoh.png' })
    await context.close()
  }

  await browser.close()
})
