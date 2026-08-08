import type { Vehicle } from "@/db/schema";
import type { MarketCode } from "./market";

/**
 * Placeholder vehicles for the design previews ONLY.
 *
 * These exist in memory and are never written to the database — you cannot
 * accidentally publish them, and they do not affect the live sold count. They
 * exist purely so the car grids are populated while you judge the three design
 * directions against an empty inventory.
 *
 * Used only by /preview/*. The real site shows its genuine empty state.
 */

const base = {
  id: "sample",
  locationId: null,
  trim: null,
  stockNumber: null,
  bodyStyle: null,
  drivetrain: null,
  engine: null,
  exteriorColor: null,
  interiorColor: null,
  seats: null,
  wasPriceMinor: null,
  listingKind: "sale" as const,
  headline: null,
  description: null,
  features: [],
  historyReportUrl: null,
  inspectionNotes: null,
  isFeatured: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
  soldAt: null,
  status: "available" as const,
};

type SampleVehicle = Vehicle & { primaryImage?: string | null };

const US: SampleVehicle[] = [
  {
    ...base,
    id: "sample-us-1",
    marketCode: "us",
    vin: "1HGBH41JXMN109186",
    chassisNo: null,
    make: "Mercedes-Benz",
    model: "GLE 350",
    trim: "4MATIC",
    year: 2019,
    mileage: 41200,
    mileageUnit: "mi",
    transmission: "Automatic",
    fuelType: "Petrol",
    condition: "Certified Pre-Owned",
    priceMinor: 2850000,
    currency: "USD",
    slug: "sample-1",
    primaryImage: "/img/car-glk.png",
  },
  {
    ...base,
    id: "sample-us-2",
    marketCode: "us",
    vin: "5FNRL38707B012345",
    chassisNo: null,
    make: "Nissan",
    model: "Rogue",
    trim: "SV",
    year: 2021,
    mileage: 28400,
    mileageUnit: "mi",
    transmission: "Automatic",
    fuelType: "Petrol",
    condition: "Used",
    priceMinor: 1990000,
    currency: "USD",
    slug: "sample-2",
    primaryImage: "/img/car-rogue.png",
  },
  {
    ...base,
    id: "sample-us-3",
    marketCode: "us",
    vin: "4T1BF1FK5CU512345",
    chassisNo: null,
    make: "Toyota",
    model: "Camry",
    trim: "SE",
    year: 2020,
    mileage: 35100,
    mileageUnit: "mi",
    transmission: "Automatic",
    fuelType: "Petrol",
    condition: "Used",
    priceMinor: 1785000,
    currency: "USD",
    slug: "sample-3",
    primaryImage: "/img/car-camry.jpg",
  },
];

const NG: SampleVehicle[] = [
  {
    ...base,
    id: "sample-ng-1",
    marketCode: "ng",
    vin: null,
    chassisNo: "JN8AS5MT0DW0123456",
    make: "Toyota",
    model: "Land Cruiser",
    trim: "V8",
    year: 2021,
    mileage: 45000,
    mileageUnit: "km",
    transmission: "Automatic",
    fuelType: "Petrol",
    condition: "Foreign Used",
    priceMinor: 2500000000,
    currency: "NGN",
    slug: "sample-1",
    primaryImage: "/img/car-glk.png",
  },
  {
    ...base,
    id: "sample-ng-2",
    marketCode: "ng",
    vin: null,
    chassisNo: "WDD2050471F123456",
    make: "Mercedes-Benz",
    model: "GLK 350",
    trim: null,
    year: 2013,
    mileage: 90000,
    mileageUnit: "km",
    transmission: "Automatic",
    fuelType: "Petrol",
    condition: "Foreign Used",
    priceMinor: 1650000000,
    currency: "NGN",
    slug: "sample-2",
    primaryImage: "/img/car-benz.png",
  },
  {
    ...base,
    id: "sample-ng-3",
    marketCode: "ng",
    vin: null,
    chassisNo: "4T1BF1FK5CU987654",
    make: "Toyota",
    model: "Camry",
    trim: null,
    year: 2012,
    mileage: 135000,
    mileageUnit: "km",
    transmission: "Automatic",
    fuelType: "Petrol",
    condition: "Nigerian Used",
    priceMinor: 1250000000,
    currency: "NGN",
    slug: "sample-3",
    primaryImage: "/img/car-camry.jpg",
  },
];

export const sampleVehicles = (market: MarketCode): SampleVehicle[] =>
  market === "us" ? US : NG;

export const sampleMakes = (market: MarketCode): string[] => [
  ...new Set(sampleVehicles(market).map((v) => v.make)),
];
