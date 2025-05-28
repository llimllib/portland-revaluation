import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

// Read the property data JSON
const propertyData = JSON.parse(readFileSync("./property_data.json", "utf8"));

// Open or create the database synchronously
const db = new DatabaseSync("property_data.db");

// Set pragmas for better performance and data integrity
db.exec(`
  PRAGMA foreign_keys = ON;     -- Enable foreign key constraints
  PRAGMA journal_mode = WAL;    -- Use Write-Ahead Logging for better performance
  PRAGMA synchronous = NORMAL;  -- Slightly less durability, better performance
  PRAGMA cache_size = -10000;   -- Use ~10MB memory for cache
  PRAGMA temp_store = MEMORY;   -- Store temp tables in memory
`);

// Create the properties table if it doesn't exist
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

// Create the assessments table if it doesn't exist
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

// Helper function to convert currency string to numeric value
function currencyToNumber(value) {
  if (!value || value === "") return 0;
  return parseFloat(value.replace(/[\$,]/g, ""));
}

// Prepare statements for better performance
const errorStmt = db.prepare(
  "INSERT OR REPLACE INTO properties (parcel, error) VALUES (?, ?)",
);
const successStmt = db.prepare(`
  INSERT OR REPLACE INTO properties 
  (parcel, parcel_id, owner1, owner2, address, parcel_type, property_data, error) 
  VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
`);
const assessmentStmt = db.prepare(`
  INSERT INTO assessments 
  (parcel, year, land, building, total, standard_exemption, other_exemption, taxable_value)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let successCount = 0;
let errorCount = 0;
let assessmentCount = 0;

for (const [parcelId, parcelInfo] of Object.entries(propertyData)) {
  // Check if this is an error entry
  if (
    parcelInfo.name &&
    (parcelInfo.name === "TimeoutError" || parcelInfo.name.includes("Error"))
  ) {
    // Handle error entry
    errorStmt.run(parcelId, JSON.stringify(parcelInfo));
    errorCount++;
  } else {
    // Handle normal entry
    successStmt.run(
      parcelId,
      parcelInfo.parcel_id || "",
      parcelInfo.owner1 || "",
      parcelInfo.owner2 || "",
      parcelInfo.address || "",
      parcelInfo.parcel_type || "",
    );
    successCount++;

    // Process assessments if they exist
    if (
      parcelInfo.assessments &&
      Array.isArray(parcelInfo.assessments) &&
      parcelInfo.assessments.length > 1
    ) {
      // Skip the header row (index 0)
      for (let i = 1; i < parcelInfo.assessments.length; i++) {
        const assessment = parcelInfo.assessments[i];
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
}

// Close the database
db.close();

console.log(
  `Imported ${successCount} successful properties and ${errorCount} error entries into database`,
);
console.log(`Added ${assessmentCount} assessment records`);
