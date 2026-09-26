import puppeteer from 'puppeteer';

const SCRATCHPAD = 'C:/Users/David/AppData/Local/Temp/claude/C--Users-David-projects-budgeting-project/b3c2bf22-0009-42c6-9408-ad12e99aa6d9/scratchpad';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setViewport({ width: 1440, height: 900 });
await page.goto('http://localhost:9876', { waitUntil: 'networkidle0', timeout: 15000 });

// Get the search bar's HTML and class names
const searchInfo = await page.evaluate(() => {
  const navbar = document.querySelector('.navbar');
  const inputs = navbar ? navbar.querySelectorAll('input') : [];
  const buttons = navbar ? navbar.querySelectorAll('button') : [];
  const searchContainers = navbar ? navbar.querySelectorAll('[class*="search"], [class*="Search"]') : [];

  return {
    inputs: Array.from(inputs).map(el => ({ tag: el.tagName, class: el.className, type: el.type })),
    buttons: Array.from(buttons).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.trim() })),
    searchContainers: Array.from(searchContainers).map(el => ({ tag: el.tagName, class: el.className })),
    navbarHTML: navbar ? navbar.innerHTML.substring(0, 3000) : 'no navbar'
  };
});

console.log(JSON.stringify(searchInfo, null, 2));

await browser.close();
