-- Database configuration pragmas
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -10000;
PRAGMA temp_store = MEMORY;

-- Create tables
CREATE TABLE IF NOT EXISTS properties (
  parcel TEXT PRIMARY KEY,
  parcel_id TEXT,
  owner1 TEXT,
  owner2 TEXT,
  address TEXT,
  parcel_type TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS property_details (
  parcel TEXT PRIMARY KEY,
  unit TEXT,
  living_unit TEXT,
  land_area NUMERIC,
  notes TEXT,
  utilities TEXT,
  additional_fields TEXT,
  FOREIGN KEY (parcel) REFERENCES properties(parcel)
);

CREATE TABLE IF NOT EXISTS owner_details (
  parcel TEXT PRIMARY KEY,
  mailing_address TEXT,
  city_state_zip TEXT,
  deed_date TEXT,
  book TEXT,
  page TEXT,
  additional_fields TEXT,
  FOREIGN KEY (parcel) REFERENCES properties(parcel)
);

CREATE TABLE IF NOT EXISTS assessments (
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
);

CREATE TABLE IF NOT EXISTS geolocation (
  parcel TEXT NOT NULL,
  lat NUMERIC,
  lon NUMERIC,
  full_name text,
  FOREIGN KEY (parcel) REFERENCES properties(parcel)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assessments_parcel_year ON assessments(parcel, year);
CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(address);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner1);
