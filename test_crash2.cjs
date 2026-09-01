const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Also check if any unhandled rejections are there
  
  const rootHtml = await page.evaluate(() => {
    return document.getElementById('root') ? document.getElementById('root').innerHTML : 'No root';
  });
  console.log("Root length:", rootHtml.length);
  if (rootHtml.length < 100) {
    console.log("Root HTML:", rootHtml);
  }
  
  await browser.close();
})();
