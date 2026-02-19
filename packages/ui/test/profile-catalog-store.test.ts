import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createPinia, setActivePinia } from "pinia";

import { useProfileCatalogStore } from "../src/stores/profileCatalog.js";

beforeEach(() => {
  setActivePinia(createPinia());
});

test("profile catalog normalizes profile arrays and clears state", () => {
  const store = useProfileCatalogStore();

  store.setCredentialProfiles([{ _id: "cred-1", name: "API Token" }]);
  store.setBrokerProfiles([{ _id: "broker-1", name: "Main MQTT" }]);

  assert.equal(store.credentialProfiles.length, 1);
  assert.equal(store.brokerProfiles.length, 1);

  store.setCredentialProfiles(null);
  store.setBrokerProfiles(undefined);

  assert.deepEqual(store.credentialProfiles, []);
  assert.deepEqual(store.brokerProfiles, []);

  store.setCredentialProfiles([{ _id: "cred-2" }]);
  store.setBrokerProfiles([{ _id: "broker-2" }]);
  store.clearCredentialProfiles();
  store.clearBrokerProfiles();

  assert.deepEqual(store.credentialProfiles, []);
  assert.deepEqual(store.brokerProfiles, []);
});
