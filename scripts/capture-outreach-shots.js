// Headless screenshot capture for the outreach UI.
// Runs on the VPS (where Puppeteer is installed in /tmp/shots).
//   ssh root@95.216.199.47 "cd /tmp/shots && node /tmp/shots/capture.js"
// Outputs PNGs to /tmp/shots/*.png

const puppeteer = require('puppeteer');

(async () => {
  // Get a real auth token via the backend API
  const loginResp = await fetch('http://localhost:3011/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@landjet.com', password: 'Admin123!' }),
  });
  const loginJson = await loginResp.json();
  const token = loginJson.token;
  if (!token) {
    console.error('No token from login:', JSON.stringify(loginJson));
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

  // Pre-set token before navigation so the page bypasses /login redirect
  await page.evaluateOnNewDocument((t) => {
    localStorage.setItem('token', t);
  }, token);

  console.log('Navigating to /outreach...');
  await page.goto('http://localhost:4000/outreach', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 1: top of the outreach page (header + first card)
  await page.screenshot({ path: '/tmp/shots/01-card.png', clip: { x: 0, y: 0, width: 1280, height: 600 } });
  console.log('Saved 01-card.png');

  // Inspect the first <select> and find Education option value
  const optionInfo = await page.evaluate(() => {
    const selects = document.querySelectorAll('select');
    if (selects.length === 0) return null;
    const opts = Array.from(selects[0].options).map(o => ({ value: o.value, text: o.textContent }));
    return { count: selects.length, options: opts };
  });
  console.log('Selects on page:', optionInfo && optionInfo.count);

  if (optionInfo) {
    const edu = optionInfo.options.find(o => (o.text || '').includes('Education'));
    if (edu) {
      console.log('Selecting Education campaign value:', edu.value);
      const handle = await page.$('select');
      await handle.select(edu.value);
      await new Promise(r => setTimeout(r, 1500));
      // Choice panel renders inline below the card -- capture top 800px
      await page.screenshot({ path: '/tmp/shots/02-choice-panel.png', clip: { x: 0, y: 0, width: 1280, height: 800 } });
      console.log('Saved 02-choice-panel.png');
    } else {
      console.log('Education option not found in dropdown');
    }
  }

  await browser.close();
  console.log('Done.');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
