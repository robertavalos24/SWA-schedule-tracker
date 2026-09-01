const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  // Go to page
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  
  // Inject some data into localStorage to simulate a user state
  await page.evaluate(() => {
    const logs = {
      '2026-07-20': [{ type: 'WOP', label: undefined, hrs: 8 }, { type: 'WORK-MID', label: '2200-0600', hrs: 8 }],
      '2026-07-21': [{ type: 'WOP', label: '0400-0600', hrs: 2 }, { type: 'WORK-MID', label: '2200-0600', hrs: 8 }]
    };
    localStorage.setItem('logs', JSON.stringify(logs));
  });
  
  // Reload page
  await page.reload({ waitUntil: 'networkidle0' });
  
  const rootHtml = await page.evaluate(() => {
    return document.getElementById('root') ? document.getElementById('root').innerHTML : 'No root';
  });
  
  if (rootHtml.length < 100) {
    console.log("Root length after data:", rootHtml.length);
    console.log("Root HTML:", rootHtml);
  } else {
    console.log("Rendered OK after data. Length:", rootHtml.length);
  }
  
  await browser.close();
})();
