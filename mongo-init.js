/* global db */

const appUsername = process?.env?.MONGO_APP_USERNAME || "";
const appPassword = process?.env?.MONGO_APP_PASSWORD || "";
const appDatabase = process?.env?.MONGO_APP_DATABASE || "freeboard";

if (!appUsername || !appPassword) {
  throw new Error(
    "MONGO_APP_USERNAME and MONGO_APP_PASSWORD must be provided for mongo initialization."
  );
}

db.getSiblingDB(appDatabase).createUser({
  user: appUsername,
  pwd: appPassword,
  roles: [
    {
      role: "readWrite",
      db: appDatabase,
    },
    {
      role: "dbAdmin",
      db: appDatabase,
    },
  ],
});
