import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import ShareTokenRevocationEvent from "../src/models/ShareTokenRevocationEvent.js";
import {
  queryShareTokenRevocationFeed,
  recordShareTokenRevocationEvent,
} from "../src/shareTokenRevocationFeed.js";

const originalMethods = {
  find: ShareTokenRevocationEvent.find,
  prototypeSave: ShareTokenRevocationEvent.prototype.save,
};

afterEach(() => {
  ShareTokenRevocationEvent.find = originalMethods.find;
  ShareTokenRevocationEvent.prototype.save = originalMethods.prototypeSave;
});

test("recordShareTokenRevocationEvent skips save when dashboardId is empty", async () => {
  let saveCalls = 0;
  ShareTokenRevocationEvent.prototype.save = async function saveStub() {
    saveCalls += 1;
    return this;
  };

  await recordShareTokenRevocationEvent({
    dashboardId: "",
    shareTokenVersion: 2,
  });

  assert.equal(saveCalls, 0);
});

test("queryShareTokenRevocationFeed seeds bootstrap cursor when no events", async () => {
  ShareTokenRevocationEvent.find = () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [],
      }),
    }),
  });

  const result = await queryShareTokenRevocationFeed({
    sinceCursor: null,
    limit: 10,
    retentionSeconds: 3600,
  });

  assert.deepEqual(result.events, []);
  assert.equal(result.cursorExpired, false);
  assert.ok(result.nextCursor);
});

test("queryShareTokenRevocationFeed flags invalid cursor as expired", async () => {
  ShareTokenRevocationEvent.find = () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [],
      }),
    }),
  });

  const result = await queryShareTokenRevocationFeed({
    sinceCursor: "not-a-real-cursor",
    limit: 10,
    retentionSeconds: 3600,
  });

  assert.equal(result.cursorExpired, true);
  assert.ok(result.nextCursor);
});

test("queryShareTokenRevocationFeed returns ordered events with next cursor", async () => {
  ShareTokenRevocationEvent.find = () => ({
    sort: () => ({
      limit: () => ({
        lean: async () => [
          {
            _id: "507f1f77bcf86cd799439011",
            dashboardId: "dash-1",
            shareTokenVersion: 3,
            revokedAt: new Date("2026-01-01T00:00:00.000Z"),
            createdAt: new Date("2026-01-01T00:00:01.000Z"),
          },
        ],
      }),
    }),
  });

  const result = await queryShareTokenRevocationFeed({
    sinceCursor: null,
    limit: 10,
    retentionSeconds: 3600,
  });

  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].dashboardId, "dash-1");
  assert.equal(result.events[0].shareTokenVersion, 3);
  assert.equal(result.cursorExpired, false);
  assert.ok(result.nextCursor);
});
