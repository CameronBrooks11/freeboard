import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import BrokerProfileResolvers from "../src/resolvers/BrokerProfile.js";
import BrokerProfile from "../src/models/BrokerProfile.js";
import CredentialProfile from "../src/models/CredentialProfile.js";

const originalMethods = {
  brokerFind: BrokerProfile.find,
  brokerFindOne: BrokerProfile.findOne,
  brokerFindOneAndUpdate: BrokerProfile.findOneAndUpdate,
  brokerFindOneAndDelete: BrokerProfile.findOneAndDelete,
  brokerPrototypeSave: BrokerProfile.prototype.save,
  credentialProfileFindOne: CredentialProfile.findOne,
};

const asLean = (value) => ({
  lean: async () => value,
});

afterEach(() => {
  BrokerProfile.find = originalMethods.brokerFind;
  BrokerProfile.findOne = originalMethods.brokerFindOne;
  BrokerProfile.findOneAndUpdate = originalMethods.brokerFindOneAndUpdate;
  BrokerProfile.findOneAndDelete = originalMethods.brokerFindOneAndDelete;
  BrokerProfile.prototype.save = originalMethods.brokerPrototypeSave;
  CredentialProfile.findOne = originalMethods.credentialProfileFindOne;
});

test("brokerProfiles query returns profiles for editor role", async () => {
  BrokerProfile.find = () => ({
    sort: () =>
      asLean([
        {
          _id: "broker-1",
          name: "Factory Broker",
          protocol: "mqtt",
          brokerUrl: "mqtt://broker.example.com:1883",
          topicAllowlist: ["factory/#"],
          allowPublicUse: false,
        },
      ]),
  });

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
  CredentialProfile.findOne = () => ({
    select: () => asLean({ _id: "cred-1", type: "bearer" }),
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
  CredentialProfile.findOne = () => ({
    select: () => asLean({ _id: "cred-basic", type: "basic" }),
  });

  BrokerProfile.prototype.save = async function saveStub() {
    return {
      _id: "broker-created",
      allowPublicUse: this.allowPublicUse,
      toObject: () => ({
        _id: "broker-created",
        name: this.name,
        description: this.description,
        protocol: this.protocol,
        brokerUrl: this.brokerUrl,
        tls: this.tls,
        credentialProfileId: this.credentialProfileId,
        allowPublicUse: this.allowPublicUse,
        topicAllowlist: this.topicAllowlist,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    };
  };

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
