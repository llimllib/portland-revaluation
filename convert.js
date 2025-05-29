import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

console.log("Starting conversion process...");
console.time("Total execution time");

// Read the property data JSON
console.log("Reading property_data.json file...");
console.time("JSON parsing");
const propertyData = JSON.parse(readFileSync("./property_data.json", "utf8"));
console.timeEnd("JSON parsing");

const totalProperties = Object.keys(propertyData).length;
console.log(`Found ${totalProperties} properties to process`);

// Open or create the database synchronously
console.log("Opening database...");
const db = new DatabaseSync("property_data.db");

console.log("Applying database schema from schema.sql...");
try {
  const schemaSQL = readFileSync("./schema.sql", "utf8");
  db.exec(schemaSQL);
  console.log("Database schema applied successfully");
} catch (error) {
  console.error("Error applying database schema:", error);
  process.exit(1);
}

// Helper function to convert currency string to numeric value
function currencyToNumber(value) {
  if (!value || value === "") return 0;
  return parseFloat(value.replace(/[\$,]/g, ""));
}

// Helper function to extract structured data from parcelData (optimized)
function extractParcelDetails(parcelData) {
  if (!parcelData || !Array.isArray(parcelData)) return undefined;

  const details = {
    unit: "",
    livingUnit: "",
    landArea: "",
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
        details.unit = value;
        break;
      case "Living Unit":
        details.livingUnit = value;
        break;
      case "Land Area (acreage)":
        details.landArea = value;
        break;
      case "Notes":
        details.notes.push(value);
        currentSection = "notes";
        break;
      case "Utilities":
        details.utilities.push(value);
        currentSection = "utilities";
        break;
      case " ":
        if (currentSection === "notes") details.notes.push(value);
        else if (currentSection === "utilities") details.utilities.push(value);
        break;
      default:
        if (
          key !== "Parcel ID" &&
          key !== "Property Location" &&
          key !== "Land Use Code" &&
          !key.startsWith("Verify")
        ) {
          details.additionalFields[key] = value;
        }
    }
  }

  return {
    unit: details.unit,
    livingUnit: details.livingUnit,
    landArea: details.landArea,
    notes: details.notes.join("\n").trim(),
    utilities: details.utilities.join("\n").trim(),
    additionalFields:
      Object.keys(details.additionalFields).length > 0
        ? JSON.stringify(details.additionalFields)
        : null,
  };
}

// Helper function to extract structured data from ownerData (optimized)
function extractOwnerDetails(ownerData) {
  if (!ownerData || !Array.isArray(ownerData)) return undefined;

  const details = {
    mailingAddress: "",
    cityStateZip: "",
    deedDate: "",
    book: "",
    page: "",
    additionalFields: {},
  };

  for (const row of ownerData) {
    if (!row || row.length < 2 || !row[0]) continue;

    const key = row[0].trim();
    const value = row[1] || "";

    switch (key) {
      case "Address":
        details.mailingAddress = value;
        break;
      case "City, State, Zip":
        details.cityStateZip = value;
        break;
      case "Deed Date":
        details.deedDate = value;
        break;
      case "Book":
        details.book = value;
        break;
      case "Page":
        details.page = value;
        break;
      default:
        if (key !== "Owner") {
          details.additionalFields[key] = value;
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

// Prepare statements for better performance
console.log("Preparing SQL statements...");
const errorStmt = db.prepare(
  "INSERT OR REPLACE INTO properties (parcel, error) VALUES (?, ?)",
);
const propertiesStmt = db.prepare(`
  INSERT OR REPLACE INTO properties 
  (parcel, parcel_id, owner1, owner2, address, parcel_type, error) 
  VALUES (?, ?, ?, ?, ?, ?, NULL)
`);
const propertyDetailsStmt = db.prepare(`
  INSERT OR REPLACE INTO property_details
  (parcel, unit, living_unit, land_area, notes, utilities, additional_fields)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const ownerDetailsStmt = db.prepare(`
  INSERT OR REPLACE INTO owner_details
  (parcel, mailing_address, city_state_zip, deed_date, book, page, additional_fields)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const assessmentStmt = db.prepare(`
  INSERT INTO assessments 
  (parcel, year, land, building, total, standard_exemption, other_exemption, taxable_value)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// Start a transaction for faster inserts
db.exec("BEGIN TRANSACTION");

let successCount = 0;
let errorCount = 0;
let assessmentCount = 0;
let nonStandardFieldsCount = 0;
let lastReportedPercent = 0;
let processedCount = 0;

console.log("Starting to process properties...");
console.time("Processing time");

const propertyEntries = Object.entries(propertyData);
const batchSize = 1000; // Process in batches to report progress
let batchCount = 0;

for (let i = 0; i < propertyEntries.length; i++) {
  const [parcelId, parcelInfo] = propertyEntries[i];
  processedCount++;

  // Check if this is an error entry
  if (
    parcelInfo.name &&
    (parcelInfo.name === "TimeoutError" || parcelInfo.name.includes("Error"))
  ) {
    // Handle error entry
    errorStmt.run(parcelId, JSON.stringify(parcelInfo));
    errorCount++;
  } else {
    // Extract basic property data
    propertiesStmt.run(
      parcelId,
      parcelInfo.parcel_id || "",
      parcelInfo.owner1 || "",
      parcelInfo.owner2 || "",
      parcelInfo.address || "",
      parcelInfo.parcel_type || "",
    );

    // Extract and store property details
    const propertyDetails = extractParcelDetails(parcelInfo.parcelData);
    if (propertyDetails) {
      try {
        propertyDetailsStmt.run(
          parcelId,
          propertyDetails.unit,
          propertyDetails.livingUnit,
          propertyDetails.landArea,
          propertyDetails.notes,
          propertyDetails.utilities,
          propertyDetails.additionalFields,
        );
      } catch (e) {
        console.error(e, parcelId, propertyDetails);
        throw e;
      }
    }

    if (propertyDetails?.additionalFields) nonStandardFieldsCount++;

    // Extract and store owner details
    const ownerDetails = extractOwnerDetails(parcelInfo.ownerData);
    if (ownerDetails) {
      try {
        ownerDetailsStmt.run(
          parcelId,
          ownerDetails.mailingAddress,
          ownerDetails.cityStateZip,
          ownerDetails.deedDate,
          ownerDetails.book,
          ownerDetails.page,
          ownerDetails.additionalFields,
        );
      } catch (e) {
        console.error(e, parcelId, ownerDetails);
        throw e;
      }
    }

    if (ownerDetails?.additionalFields) nonStandardFieldsCount++;

    successCount++;

    // Process assessments if they exist
    if (
      parcelInfo.assessments &&
      Array.isArray(parcelInfo.assessments) &&
      parcelInfo.assessments.length > 1
    ) {
      // Skip the header row (index 0)
      for (let j = 1; j < parcelInfo.assessments.length; j++) {
        const assessment = parcelInfo.assessments[j];
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
        assessmentStmt.run(
          parcelId,
          year,
          land,
          building,
          total,
          standardExemption,
          otherExemption,
          taxableValue,
        );
        assessmentCount++;
      }
    }
  }

  // Report progress by percentage
  const percentComplete = Math.floor((processedCount / totalProperties) * 100);
  if (percentComplete > lastReportedPercent) {
    console.log(
      `Progress: ${percentComplete}% (${processedCount}/${totalProperties})`,
    );
    lastReportedPercent = percentComplete;
  }

  // Commit every batch to avoid large transactions
  if (++batchCount >= batchSize) {
    db.exec("COMMIT; BEGIN TRANSACTION");
    batchCount = 0;
    console.log(
      `Committed batch, processed ${processedCount} properties so far...`,
    );
  }
}

// Commit the final transaction
db.exec("COMMIT");
console.timeEnd("Processing time");

// Create any final indexes
console.log("Creating additional indexes...");
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(address);
  CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner1);
`);

// Close the database
db.close();
console.log("Database closed");

console.log(`\nSummary:`);
console.log(
  `Imported ${successCount} successful properties and ${errorCount} error entries into database`,
);
console.log(`Added ${assessmentCount} assessment records`);
console.log(
  `Found ${nonStandardFieldsCount} properties with non-standard fields (stored in additional_fields)`,
);

console.timeEnd("Total execution time");
