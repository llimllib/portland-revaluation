import { readFileSync, writeFileSync, existsSync } from "fs";

import puppeteer from "puppeteer";

// time to wait for requests, in ms
const TIMEOUT = 2000;

// amount of time to sleep between requests
const SLEEP = 500;

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

  // get the summary data on the parcel
  let parcelData = await page.$$eval("#Parcel tr", trs => trs.map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.innerText)))
  let ownerData = await page.$$eval("#Owners tr", trs => trs.map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.innerText)))

  // go to assessment history
  await page.waitForSelector(
    "#sidemenu > .navigation > .unsel:nth-child(8) > a > span",
    { timeout: TIMEOUT }
  );
  await page.click("#sidemenu > .navigation > .unsel:nth-child(8) > a > span");

  // the stupid table has an id with a space in it
  await page.waitForSelector("[id='Assessment History'] tr", {
    timeout: TIMEOUT,
  });
  let assessments = await page.$$eval("[id='Assessment History'] tr", (trs) =>
    trs.map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText)
    )
  );

  return new Promise((resolve) => {
    resolve({
      assessments: assessments,
      parcelData: parcelData,
      ownerData: ownerData,
    });
  });
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

  const propertyData = "./property_data.json";
  let properties;
  let currentSleep = SLEEP;
  if (existsSync(propertyData)) {
    properties = await JSON.parse(readFileSync(propertyData, "utf8"));
  } else {
    properties = {};
  }

  for (const parcel of process.argv.slice(2)) {
    if (properties.hasOwnProperty(parcel)) {
      continue;
    }

    let result;
    try {
      result = await getParcel(page, parcel);
    } catch (e) {
      properties[parcel] = e;
      console.log(currentSleep, e);
      await sleep(currentSleep);

      continue;
    }

    result["parcel_id"] = parcels[parcel][0];
    result["owner1"] = parcels[parcel][1];
    result["owner2"] = parcels[parcel][2];
    result["address"] = parcels[parcel][3];
    result["parcel_type"] = parcels[parcel][4];

    properties[parcel] = result;
    writeFileSync(propertyData, JSON.stringify(properties, null, 2));

    currentSleep = SLEEP;
    await sleep(currentSleep);
  }

  writeFileSync(propertyData, JSON.stringify(properties, null, 2));

  await browser.close();
})();
