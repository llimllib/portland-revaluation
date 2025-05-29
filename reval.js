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

// Helper function to extract structured data from parcelData
function extractParcelDetails(parcelData) {
  if (!parcelData || !Array.isArray(parcelData) || parcelData.length === 0) {
    return undefined;
  }

  const details = {
    unit: null,
    livingUnit: null,
    landArea: null,
    notes: [],
    utilities: [],
    additionalFields: {},
  };

  let currentSection = null;

  for (const row of parcelData) {
    if (!row || row.length < 2 || !row[0]) continue;

    const key = row[0].trim();
    const value = row[1] || "";

    switch (key) {
      case "Unit":
        details.unit = String(value);
        break;
      case "Living Unit":
        details.livingUnit = String(value);
        break;
      case "Land Area (acreage)":
        details.landArea = String(value);
        break;
      case "Notes":
        details.notes.push(String(value));
        currentSection = "notes";
        break;
      case "Utilities":
        details.utilities.push(String(value));
        currentSection = "utilities";
        break;
      case " ":
        if (currentSection === "notes") details.notes.push(String(value));
        else if (currentSection === "utilities")
          details.utilities.push(String(value));
        break;
      default:
        if (
          key !== "Parcel ID" &&
          key !== "Property Location" &&
          key !== "Land Use Code" &&
          !key.startsWith("Verify")
        ) {
          details.additionalFields[key] = String(value);
        }
    }
  }

  return {
    unit: details.unit,
    livingUnit: details.livingUnit,
    landArea: details.landArea,
    notes: details.notes.length > 0 ? details.notes.join("\n").trim() : null,
    utilities:
      details.utilities.length > 0 ? details.utilities.join("\n").trim() : null,
    additionalFields:
      Object.keys(details.additionalFields).length > 0
        ? JSON.stringify(details.additionalFields)
        : null,
  };
}

// Helper function to extract structured data from ownerData
function extractOwnerDetails(ownerData) {
  if (!ownerData || !Array.isArray(ownerData) || ownerData.length === 0) {
    return undefined;
  }

  const details = {
    mailingAddress: null,
    cityStateZip: null,
    deedDate: null,
    book: null,
    page: null,
    additionalFields: {},
  };

  for (const row of ownerData) {
    if (!row || row.length < 2 || !row[0]) continue;

    const key = row[0].trim();
    const value = row[1] || "";

    switch (key) {
      case "Address":
        details.mailingAddress = String(value);
        break;
      case "City, State, Zip":
        details.cityStateZip = String(value);
        break;
      case "Deed Date":
        details.deedDate = String(value);
        break;
      case "Book":
        details.book = String(value);
        break;
      case "Page":
        details.page = String(value);
        break;
      default:
        if (key !== "Owner") {
          details.additionalFields[key] = String(value);
        }
    }
  }

  return {
    mailingAddress: details.mailingAddress,
    cityStateZip: details.cityStateZip,
    deedDate: details.deedDate,
    book: details.book,
    page: details.page,
    additionalFields:
      Object.keys(details.additionalFields).length > 0
        ? JSON.stringify(details.additionalFields)
        : null,
  };
}

function initDB(filename = "property_data.db") {
  // Use synchronous database connection
  const db = new DatabaseSync(filename);

  console.log("Applying database schema from schema.sql...");
  try {
    const schemaSQL = readFileSync("./schema.sql", "utf8");
    db.exec(schemaSQL);
    console.log("Database schema applied successfully");
  } catch (error) {
    console.error("Error applying database schema:", error);
    process.exit(1);
  }

  return db;
}

function existsInDB(db, parcel) {
  const result = db
    .prepare("SELECT 1 FROM properties WHERE parcel = ?")
    .get(parcel);
  return !!result;
}

function hasError(db, parcel) {
  const result = db
    .prepare("SELECT error FROM properties WHERE parcel = ?")
    .get(parcel);
  return result && result.error !== null;
}

function storeAssessments(db, parcel, assessments) {
  if (!assessments || !Array.isArray(assessments) || assessments.length <= 1)
    return 0;

  // First, delete any existing assessments for this parcel
  db.prepare("DELETE FROM assessments WHERE parcel = ?").run(parcel);

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
  let errorCount = 0;
  let successCount = 0;
  let fixedCount = 0;

  for (const parcel of process.argv.slice(2)) {
    const wasErrored = hasError(db, parcel);
    if (existsInDB(db, parcel) && !wasErrored) {
      console.log(`Skipping ${parcel} - already exists and has no errors`);
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
      console.log(`Error processing ${parcel}:`, e);
      errorCount++;
      await sleep(currentSleep);
      continue;
    }

    // Extract data from parcels.json
    const parcelId = parcels[parcel] ? parcels[parcel][0] : "";
    const owner1 = parcels[parcel] ? parcels[parcel][1] : "";
    const owner2 = parcels[parcel] ? parcels[parcel][2] : "";
    const address = parcels[parcel] ? parcels[parcel][3] : "";
    const parcelType = parcels[parcel] ? parcels[parcel][4] : "";

    try {
      // Store the basic property info in the database
      db.prepare(
        `
        INSERT OR REPLACE INTO properties 
        (parcel, parcel_id, owner1, owner2, address, parcel_type, error) 
        VALUES (?, ?, ?, ?, ?, ?, NULL)
      `,
      ).run(parcel, parcelId, owner1, owner2, address, parcelType);

      const propertyDetails = extractParcelDetails(result.parcelData);
      if (propertyDetails) {
        db.prepare(
          `
        INSERT OR REPLACE INTO property_details
        (parcel, unit, living_unit, land_area, notes, utilities, additional_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        ).run(
          parcel,
          propertyDetails.unit,
          propertyDetails.livingUnit,
          propertyDetails.landArea,
          propertyDetails.notes,
          propertyDetails.utilities,
          propertyDetails.additionalFields,
        );
      }

      const ownerDetails = extractOwnerDetails(result.ownerData);
      if (ownerDetails) {
        db.prepare(
          `
        INSERT OR REPLACE INTO owner_details
        (parcel, mailing_address, city_state_zip, deed_date, book, page, additional_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        ).run(
          parcel,
          ownerDetails.mailingAddress,
          ownerDetails.cityStateZip,
          ownerDetails.deedDate,
          ownerDetails.book,
          ownerDetails.page,
          ownerDetails.additionalFields,
        );
      }

      // Store the assessments in the separate table
      const newAssessments = storeAssessments(db, parcel, result.assessments);
      assessmentCount += newAssessments;

      if (wasErrored) {
        fixedCount++;
        console.log(`Fixed previously errored parcel: ${parcel}`);
      }

      successCount++;
    } catch (e) {
      console.error(`Error storing data for parcel ${parcel}:`, e);
      db.prepare(
        "INSERT OR REPLACE INTO properties (parcel, error) VALUES (?, ?)",
      ).run(parcel, JSON.stringify(e));
      errorCount++;
    }

    currentSleep = SLEEP;
    await sleep(currentSleep);
  }

  db.close();
  await browser.close();

  console.log(`\nProcess summary:`);
  console.log(`- Processed ${process.argv.length - 2} parcels`);
  console.log(`- Successfully processed: ${successCount}`);
  console.log(`- Fixed previously errored: ${fixedCount}`);
  console.log(`- New errors: ${errorCount}`);
  console.log(`- Added ${assessmentCount} assessment records`);
}

await main();
