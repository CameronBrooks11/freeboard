import { createRequire } from "module";
const require = createRequire(import.meta.url);

require("dotenv").config();

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = Object.freeze({
  host: process.env.API_HOST || "0.0.0.0", // Bind on all interfaces by default (good for RPi + dev)
  port: num(process.env.PORT, 4001), // Port with sensible fallback
  mongoUrl:
    process.env.MONGO_URL ||
    "mongodb://freeboard:unsecure@127.0.0.1:27017/freeboard", // Prefer IPv4 literal and include a DB name to be explicit
  jwtSecret: process.env.JWT_SECRET || "freeboard",
  jwtTimeExpiration: process.env.JWT_TIME_EXPIRATION || "2h",
  userLimit: num(process.env.USER_LIMIT, 0),
  adminEmail: process.env.ADMIN_EMAIL || "admin@freeboard",
  adminPassword: process.env.ADMIN_PASSWORD || "freeboard",
  createAdmin: process.env.CREATE_ADMIN === "false" ? false : true, // default true unless explicitly "false"
});
