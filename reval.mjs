// Import necessary modules
import { readFileSync } from "node:fs";
import sqlite3 from "node:sqlite3";
import { open } from "node:sqlite/sqlite3";

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
    { waitUntil: "domcontentloaded", timeout: TIMEOUT },
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
  let parcelData = await page.$$eval("#Parcel tr", (trs) =>
    trs.map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText),
    ),
  );
  let ownerData = await page.$$eval("#Owners tr", (trs) =>
    trs.map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText),
    ),
  );

  // go to assessment history
  await page.waitForSelector('a[href*="mode=assessment_history"] span', {
    timeout: TIMEOUT,
  });
  await page.click('a[href*="mode=assessment_history"] span');

  // the stupid table has an id with a space in it
  await page.waitForSelector("[id='Assessment History'] tr", {
    timeout: TIMEOUT,
  });
  let assessments = await page.$$eval("[id='Assessment History'] tr", (trs) =>
    trs.map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => td.innerText),
    ),
  );

  return {
    assessments: assessments,
    parcelData: parcelData,
    ownerData: ownerData,
  };
}

async function initDB(filename = "property_data.db") {
  const db = await open({
    filename,
    driver: sqlite3.Database,
  });

  await db.exec(`CREATE TABLE IF NOT EXISTS properties (
    parcel TEXT PRIMARY KEY,
    parcel_id TEXT,
    owner1 TEXT,
    owner2 TEXT,
    address TEXT,
    parcel_type TEXT,
    property_data TEXT,
    error TEXT
  )`);

  return db;
}

async function existsInDB(db, parcel) {
  return !!(await db.get("SELECT 1 FROM properties WHERE parcel = ?", parcel));
}

async function main() {
  const parcels = await JSON.parse(readFileSync("./parcels.json", "utf8"));
  const db = await initDB();

  const browser = await puppeteer.launch({
    // for some reason I do not understand this script fails when run in
    // headless mode
    headless: false,
    // slowMo: 200,
  });
  const page = await browser.newPage();

  await page.goto(
    "https://assessors.portlandmaine.gov/search/commonsearch.aspx?mode=parid",
    { waitUntil: "domcontentloaded", timeout: TIMEOUT },
  );
  await agreeToDisclaimer(page);

  let currentSleep = SLEEP;

  for (const parcel of process.argv.slice(2)) {
    if (existsInDB(db, parcel)) {
      continue;
    }

    let result;
    try {
      result = await getParcel(page, parcel);
    } catch (e) {
      // Store the error in the database
      await db.run(
        "INSERT OR REPLACE INTO properties (parcel, error) VALUES (?, ?)",
        parcel,
        JSON.stringify(e),
      );
      console.log(currentSleep, e);
      await sleep(currentSleep);
      continue;
    }

    result["parcel_id"] = parcels[parcel][0];
    result["owner1"] = parcels[parcel][1];
    result["owner2"] = parcels[parcel][2];
    result["address"] = parcels[parcel][3];
    result["parcel_type"] = parcels[parcel][4];

    // Store the result in the database
    await db.run(
      `INSERT OR REPLACE INTO properties 
      (parcel, parcel_id, owner1, owner2, address, parcel_type, property_data, error) 
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      parcel,
      result.parcel_id,
      result.owner1,
      result.owner2,
      result.address,
      result.parcel_type,
      JSON.stringify(result),
    );

    currentSleep = SLEEP;
    await sleep(currentSleep);
  }

  await db.close();
  await browser.close();
}

await main();
