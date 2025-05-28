import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

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

// Helper function to convert currency string to numeric value
function currencyToNumber(value) {
  if (!value || value === "") return 0;
  return parseFloat(value.replace(/[\$,]/g, ""));
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

function initDB(filename = "property_data.db") {
  // Use synchronous database connection
  const db = new DatabaseSync(filename);

  // Set pragmas for better performance and data integrity
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -10000;
    PRAGMA temp_store = MEMORY;
  `);

  // Create properties table (same as original)
  db.exec(`CREATE TABLE IF NOT EXISTS properties (
    parcel TEXT PRIMARY KEY,
    parcel_id TEXT,
    owner1 TEXT,
    owner2 TEXT,
    address TEXT,
    parcel_type TEXT,
    property_data TEXT,
    error TEXT
  )`);

  // Create assessments table
  db.exec(`CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parcel TEXT,
    year INTEGER,
    land NUMERIC,
    building NUMERIC,
    total NUMERIC,
    standard_exemption NUMERIC,
    other_exemption NUMERIC,
    taxable_value NUMERIC,
    FOREIGN KEY (parcel) REFERENCES properties(parcel)
  )`);

  return db;
}

function existsInDB(db, parcel) {
  const result = db
    .prepare("SELECT 1 FROM properties WHERE parcel = ?")
    .get(parcel);
  return !!result;
}

function storeAssessments(db, parcel, assessments) {
  if (!assessments || !Array.isArray(assessments) || assessments.length <= 1)
    return 0;

  let count = 0;
  const stmt = db.prepare(`
    INSERT INTO assessments 
    (parcel, year, land, building, total, standard_exemption, other_exemption, taxable_value)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Skip the header row (index 0)
  for (let i = 1; i < assessments.length; i++) {
    const assessment = assessments[i];
    // Skip empty rows or incomplete data
    if (assessment.length < 7 || !assessment[0]) continue;

    // Extract and clean data
    const year = parseInt(assessment[0]) || 0;
    const land = currencyToNumber(assessment[1]);
    const building = currencyToNumber(assessment[2]);
    const total = currencyToNumber(assessment[3]);
    const standardExemption = currencyToNumber(assessment[4]);
    const otherExemption = currencyToNumber(assessment[5]);
    const taxableValue = currencyToNumber(assessment[6]);

    // Insert assessment record
    stmt.run(
      parcel,
      year,
      land,
      building,
      total,
      standardExemption,
      otherExemption,
      taxableValue,
    );
    count++;
  }

  return count;
}

async function main() {
  const parcels = JSON.parse(readFileSync("./parcels.json", "utf8"));
  const db = initDB();

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
  let assessmentCount = 0;

  for (const parcel of process.argv.slice(2)) {
    if (existsInDB(db, parcel)) {
      continue;
    }

    let result;
    try {
      result = await getParcel(page, parcel);
    } catch (e) {
      // Store the error in the database
      db.prepare(
        "INSERT OR REPLACE INTO properties (parcel, error) VALUES (?, ?)",
      ).run(parcel, JSON.stringify(e));
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
    db.prepare(
      `INSERT OR REPLACE INTO properties 
      (parcel, parcel_id, owner1, owner2, address, parcel_type, property_data, error) 
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      parcel,
      result.parcel_id,
      result.owner1,
      result.owner2,
      result.address,
      result.parcel_type,
      JSON.stringify(result),
    );

    // Store the assessments in the separate table
    assessmentCount += storeAssessments(db, parcel, result.assessments);

    currentSleep = SLEEP;
    await sleep(currentSleep);
  }

  db.close();
  await browser.close();

  console.log(`Processed ${process.argv.length - 2} parcels`);
  console.log(`Added ${assessmentCount} assessment records`);
}

await main();
