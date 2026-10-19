"use strict";

const ee = require("@google/earthengine");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

let earthEngineReady;

function jsonEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return JSON.parse(value);
}

function firebaseAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert(jsonEnvironment("FIREBASE_ADMIN_SERVICE_ACCOUNT")) });
  }
  return getAuth();
}

function initializeEarthEngine() {
  if (earthEngineReady) return earthEngineReady;
  earthEngineReady = new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      jsonEnvironment("EARTH_ENGINE_SERVICE_ACCOUNT"),
      () => ee.initialize(null, null, resolve, reject, null, process.env.EARTH_ENGINE_PROJECT),
      reject,
    );
  }).catch((error) => {
    earthEngineReady = null;
    throw error;
  });
  return earthEngineReady;
}

function evaluate(object) {
  return new Promise((resolve, reject) => object.evaluate((value, error) => {
    if (error) reject(new Error(error.message || String(error)));
    else resolve(value);
  }));
}

function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function maskSentinel2(image) {
  const scl = image.select("SCL");
  return image.updateMask(scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)));
}

async function surfaceSummary(latitude, longitude) {
  const point = ee.Geometry.Point([longitude, latitude]);
  const start = ee.Date(Date.now()).advance(-120, "day");
  const sentinelCollection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(point).filterDate(start, ee.Date(Date.now()))
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 45)).map(maskSentinel2)
    .sort("system:time_start", false);
  if (!(await evaluate(sentinelCollection.size()))) throw new Error("NO_SENTINEL_IMAGE");

  const sentinel = ee.Image(sentinelCollection.first());
  const ndvi = sentinel.normalizedDifference(["B8", "B4"]).rename("ndvi");
  const ndviMean = ndvi.reduceRegion({ reducer: ee.Reducer.mean(), geometry: point.buffer(40), scale: 10, maxPixels: 1e7, bestEffort: true }).get("ndvi");

  const landsatCollection = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
    .merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
    .filterBounds(point).filterDate(start, ee.Date(Date.now()))
    .filter(ee.Filter.lt("CLOUD_COVER", 45)).sort("system:time_start", false);
  const landsatAvailable = await evaluate(landsatCollection.size());
  let landSurfaceTemperature = null;
  if (landsatAvailable) {
    landSurfaceTemperature = ee.Image(landsatCollection.first()).select("ST_B10")
      .multiply(0.00341802).add(149.0).subtract(273.15).rename("lst")
      .reduceRegion({ reducer: ee.Reducer.mean(), geometry: point.buffer(60), scale: 30, maxPixels: 1e7, bestEffort: true }).get("lst");
  }
  const result = await evaluate(ee.Dictionary({
    ndvi: ndviMean,
    landSurfaceTemperature,
    observedAt: ee.Date(sentinel.get("system:time_start")).format("YYYY-MM-dd"),
  }));
  return {
    ndvi: result.ndvi ?? null,
    landSurfaceTemperature: result.landSurfaceTemperature ?? null,
    soilMoisture: null,
    observedAt: result.observedAt,
    source: "Sentinel-2 SR Harmonized / Landsat 8-9 L2",
  };
}

function setCors(request, response) {
  const origin = request.headers.origin;
  if (origin && origin === process.env.ALLOWED_ORIGIN) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

module.exports = async (request, response) => {
  setCors(request, response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "GET") return response.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  try {
    const authorization = request.headers.authorization || "";
    if (!authorization.startsWith("Bearer ")) return response.status(401).json({ error: "UNAUTHENTICATED" });
    await firebaseAdmin().verifyIdToken(authorization.slice(7));
    const latitude = coordinate(request.query.latitude, -90, 90);
    const longitude = coordinate(request.query.longitude, -180, 180);
    if (latitude === null || longitude === null) return response.status(400).json({ error: "INVALID_COORDINATES" });
    await initializeEarthEngine();
    response.setHeader("Cache-Control", "private, max-age=21600");
    return response.status(200).json(await surfaceSummary(latitude, longitude));
  } catch (error) {
    const message = error?.message || String(error);
    console.error("satellite-surface failed", message);
    if (message === "NO_SENTINEL_IMAGE") return response.status(404).json({ error: "NO_CLEAR_SENTINEL_IMAGE" });
    return response.status(500).json({ error: "SATELLITE_LOOKUP_FAILED" });
  }
};
