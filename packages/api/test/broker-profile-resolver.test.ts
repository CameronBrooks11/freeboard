import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BrokerProfileResolvers from "../src/resolvers/BrokerProfile.js";
import { dataStore } from "../src/data/index.js";

const brokerProfileRepository = dataStore.repositories.brokerProfiles;
const credentialProfileRepository = dataStore.repositories.credentialProfiles;
const originalMethods = {
  brokerListSortedByName: brokerProfileRepository.listSortedByName,
  brokerCreate: brokerProfileRepository.create,
  credentialProfileFindById: credentialProfileRepository.findById,
};

afterEach(() => {
  brokerProfileRepository.listSortedByName = originalMethods.brokerListSortedByName;
  brokerProfileRepository.create = originalMethods.brokerCreate;
  credentialProfileRepository.findById = originalMethods.credentialProfileFindById;
});

test("brokerProfiles query returns profiles for editor role", async () => {
  brokerProfileRepository.listSortedByName = async () => [
    {
      _id: "broker-1",
      name: "Factory Broker",
      description: "",
      protocol: "mqtt",
      brokerUrl: "mqtt://broker.example.com:1883",
      tls: {},
      credentialProfileId: null,
      allowPublicUse: false,
      topicAllowlist: ["factory/#"],
      createdBy: null,
      updatedBy: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];

  const result = await BrokerProfileResolvers.Query.brokerProfiles(
    null,
    {},
    { user: { _id: "editor-1", role: "editor" } },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Factory Broker");
  assert.equal(result[0].protocol, "mqtt");
  assert.deepEqual(result[0].topicAllowlist, ["factory/#"]);
});

test("adminCreateBrokerProfile enforces basic credential profile for mqtt", async () => {
  credentialProfileRepository.findById = async () => ({
    _id: "cred-1",
    name: "HTTP bearer",
    description: "",
    type: "bearer",
    allowPublicUse: false,
    metadata: {},
    secret: {},
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  await assert.rejects(
    () =>
      BrokerProfileResolvers.Mutation.adminCreateBrokerProfile(
        null,
        {
          input: {
            name: "Factory Broker",
            protocol: "mqtt",
            brokerUrl: "mqtt://broker.example.com:1883",
            credentialProfileId: "cred-1",
          },
        },
        { user: { _id: "admin-1", role: "admin" } },
      ),
    /must use a basic credential profile/,
  );
});

test("adminCreateBrokerProfile creates mqtt broker profile with normalized values", async () => {
  credentialProfileRepository.findById = async () => ({
    _id: "cred-basic",
    name: "MQTT basic",
    description: "",
    type: "basic",
    allowPublicUse: false,
    metadata: {},
    secret: {},
    createdBy: null,
    updatedBy: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  brokerProfileRepository.create = async (params) => ({
    _id: "broker-created",
    name: params.name,
    description: params.description,
    protocol: params.protocol,
    brokerUrl: params.brokerUrl,
    tls: params.tls,
    credentialProfileId: params.credentialProfileId,
    allowPublicUse: params.allowPublicUse,
    topicAllowlist: params.topicAllowlist,
    createdBy: String(params.createdBy || ""),
    updatedBy: String(params.updatedBy || ""),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  const result = await BrokerProfileResolvers.Mutation.adminCreateBrokerProfile(
    null,
    {
      input: {
        name: "Factory Broker",
        description: "Main line",
        protocol: "mqtt",
        brokerUrl: "mqtt://broker.example.com:1883",
        credentialProfileId: "cred-basic",
        allowPublicUse: true,
        topicAllowlist: ["factory/#", "factory/#", "line/+/status"],
      },
    },
    { user: { _id: "admin-1", role: "admin" } },
  );

  assert.equal(result._id, "broker-created");
  assert.equal(result.protocol, "mqtt");
  assert.equal(result.credentialProfileId, "cred-basic");
  assert.deepEqual(result.topicAllowlist, ["factory/#", "line/+/status"]);
  assert.equal(result.allowPublicUse, true);
});
