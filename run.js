fs = require('fs');

const puppeteer = require('puppeteer');

function log(msg) {
  console.log(msg);
}

async function agreeToDisclaimer(page) {
  await page.waitForSelector('#btAgree')
  await page.click('#btAgree')
  return page.waitForNavigation({ waitUntil: 'domcontentloaded' });
}

async function streetSearch(page, text) {
  await page.waitForSelector('#inpStreet')

  // clear the input street text
  await page.evaluate(() => document.getElementById('inpStreet').value = '');

  await page.type('#inpStreet', text)
  await page.select('#selPageSize', '50')
  await page.click('#btSearch')
  return page.waitForNavigation({ waitUntil: 'domcontentloaded' });
}

async function innerText(elt) {
  return (await elt.getProperty('innerText')).jsonValue();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

(async () => {
  const browser = await puppeteer.launch({
    // for some reason I do not understand this script fails when run in
    // headless mode
    headless: false,
    // slowMo: 200,
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1096 })

  const parcels = {};

  await page.goto('https://assessors.portlandmaine.gov/search/commonsearch.aspx?mode=realprop')
  await agreeToDisclaimer(page);
  log("disclaimer agreed to")

  const alpha = "abcdefghijklmnopqrstuvwxyz".split('');
  for (const letter of alpha) {
    await streetSearch(page, letter);
    log(letter);

    while(1) {
      let rows = await page.$$eval("tr.SearchResults", trs => 
        trs.map(tr =>
          Array.from(tr.querySelectorAll("td")).map(td => td.innerText)));
      rows.forEach(row => parcels[row[0]] = row);

      // Grab all IndexLinks. If the last one has "Next" in it, it's a link to
      // continue, and click it. Otherwise we're done this letter
      let links = await page.$$(".IndexLink");
      let lastLink = links[links.length-1];
      if ((await innerText(lastLink)).indexOf("Next") === -1) {
        break;
      } else {
        fs.writeFileSync('parcels.json', JSON.stringify(parcels));
        await sleep(500);
        await lastLink.click();
        await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
      }
    }
  }

  fs.writeFileSync('parcels.json', JSON.stringify(parcels));

  await browser.close()
})()
