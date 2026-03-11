import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { dataStore } from "../src/data/index.js";
import {
  queryShareTokenRevocationFeed,
  recordShareTokenRevocationEvent,
} from "../src/shareTokenRevocationFeed.js";

const revocationRepository = dataStore.repositories.shareTokenRevocationFeed;
const originalMethods = {
  isReady: revocationRepository.isReady,
  insertEvent: revocationRepository.insertEvent,
  queryEvents: revocationRepository.queryEvents,
};

afterEach(() => {
  revocationRepository.isReady = originalMethods.isReady;
  revocationRepository.insertEvent = originalMethods.insertEvent;
  revocationRepository.queryEvents = originalMethods.queryEvents;
});

test("recordShareTokenRevocationEvent skips save when dashboardId is empty", async () => {
  let insertCalls = 0;
  revocationRepository.isReady = () => true;
  revocationRepository.insertEvent = async () => {
    insertCalls += 1;
  };

  await recordShareTokenRevocationEvent({
    dashboardId: "",
    shareTokenVersion: 2,
  });

  assert.equal(insertCalls, 0);
});

test("queryShareTokenRevocationFeed seeds bootstrap cursor when no events", async () => {
  revocationRepository.queryEvents = async () => [];

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
  revocationRepository.queryEvents = async () => [];

  const result = await queryShareTokenRevocationFeed({
    sinceCursor: "not-a-real-cursor",
    limit: 10,
    retentionSeconds: 3600,
  });

  assert.equal(result.cursorExpired, true);
  assert.ok(result.nextCursor);
});

test("queryShareTokenRevocationFeed returns ordered events with next cursor", async () => {
  revocationRepository.queryEvents = async () => [
    {
      eventId: "507f1f77bcf86cd799439011",
      dashboardId: "dash-1",
      shareTokenVersion: 3,
      revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:01.000Z"),
    },
  ];

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
