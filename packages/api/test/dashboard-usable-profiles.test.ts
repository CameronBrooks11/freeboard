import assert from "node:assert/strict";
import test from "node:test";

import { selectUsableProfiles } from "../src/resolvers/DashboardUsableProfiles.js";

// Issue #213: the picker must offer exactly the set a save permits — every profile
// for a trusted author (global editor/admin), only `allowPublicUse` profiles for an
// ACL-only editor. Mirrors the write-time gate in assertCredentialAuthorAuthorized.

const profiles = [
  { _id: "p1", allowPublicUse: true },
  { _id: "p2", allowPublicUse: false },
  { _id: "p3", allowPublicUse: true },
  { _id: "p4" }, // missing flag => non-public
];

test("a trusted author sees every profile", () => {
  assert.deepEqual(
    selectUsableProfiles(profiles, true).map((p) => p._id),
    ["p1", "p2", "p3", "p4"],
  );
});

test("an untrusted author sees only allowPublicUse profiles", () => {
  assert.deepEqual(
    selectUsableProfiles(profiles, false).map((p) => p._id),
    ["p1", "p3"],
  );
});

test("missing allowPublicUse is treated as non-public for an untrusted author", () => {
  assert.deepEqual(selectUsableProfiles([{ _id: "x" }], false), []);
});
