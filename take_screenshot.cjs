const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  const html = await page.content();
  console.log(html.substring(0, 500));
  console.log("length:", html.length);
  await browser.close();
})();
