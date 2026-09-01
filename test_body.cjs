const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("Body text:");
  console.log(bodyText.substring(0, 1000));
  await browser.close();
})();
