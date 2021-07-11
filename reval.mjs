import { readFileSync, writeFileSync, existsSync } from 'fs';

import puppeteer from 'puppeteer';

// time to wait for requests, in ms
const TIMEOUT = 2000;

// amount of time to sleep between requests
const SLEEP = 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function agreeToDisclaimer(page) {
  await page.waitForSelector("#btAgree");
  await page.click("#btAgree");
  return page.waitForNavigation({ waitUntil: "domcontentloaded" });
}

async function getParcel(page, parcel) {
  console.log(parcel);

  await page.goto(
    "https://assessors.portlandmaine.gov/search/commonsearch.aspx?mode=parid",
    { waitUntil: "domcontentloaded", timeout: TIMEOUT }
  );

  await page.waitForSelector("#btSearch");

  // clear the input and type the parcel id
  await page.evaluate(() => (document.getElementById("inpParid").value = ""));
  await page.type("#inpParid", parcel);
  await page.click("#btSearch");
  await page.waitForNavigation({
    waitUntil: "domcontentloaded",
    timeout: TIMEOUT,
  });

  if (
    page.url() ==
    "https://assessors.portlandmaine.gov/search/CommonSearch.aspx?mode=PARID"
  ) {
    console.log("error getting", parcel);
    return new Promise((_, reject) => { reject("error getting history") });
  }

  // go to assessment history
  await page.waitForSelector(
    "#sidemenu > .navigation > .unsel:nth-child(8) > a > span",
    { timeout: TIMEOUT }
  );
  await page.click(
    "#sidemenu > .navigation > .unsel:nth-child(8) > a > span"
  );

  // the stupid table has an id with a space in it
  await page.waitForSelector("[id='Assessment History'] tr");
  let rows = await page.$$eval("[id='Assessment History'] tr", (trs) =>
    trs.map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText)
    )
  );

  return new Promise((resolve) => { resolve(rows) })
}

(async () => {
  const parcels = await JSON.parse(readFileSync("./parcels.json", "utf8"));

  const browser = await puppeteer.launch({
    // for some reason I do not understand this script fails when run in
    // headless mode
    headless: false,
    // slowMo: 200,
  });
  const page = await browser.newPage();

  await page.goto(
    "https://assessors.portlandmaine.gov/search/commonsearch.aspx?mode=parid",
    { waitUntil: "domcontentloaded", timeout: TIMEOUT }
  );
  await agreeToDisclaimer(page);


  const historyFile = "./histories.json"
  let histories;
  if (existsSync(historyFile)) {
    histories = await JSON.parse(readFileSync(historyFile, "utf8"));
  } else {
    histories = {};
  }

  for (const parcel in parcels) {
    if (histories.hasOwnProperty(parcel)) {
      continue;
    }

    let result;
    try {
      result = await getParcel(page, parcel);
    } catch (e) {
      histories[parcel] = e;
      await sleep(SLEEP);
      continue;
    }

    histories[parcel] = result;
    writeFileSync(historyFile, JSON.stringify(histories));

    await sleep(SLEEP);
  }

  writeFileSync(historyFile, JSON.stringify(histories));

  await browser.close();
})();
