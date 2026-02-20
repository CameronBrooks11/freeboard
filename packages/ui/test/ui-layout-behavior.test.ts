import assert from "node:assert/strict";
import test from "node:test";

import { LOGIN_ACTION_MODES } from "../src/auth/loginMode";
import {
  isSmallDashboardLayout,
  shouldShowBrokerProfileQuickCreate,
  shouldShowForgotPasswordFooterAction,
} from "../src/uiLayoutPolicy";

test("login forgot-password footer action renders only in login mode", () => {
  assert.equal(shouldShowForgotPasswordFooterAction(LOGIN_ACTION_MODES.login), true);
  assert.equal(shouldShowForgotPasswordFooterAction(LOGIN_ACTION_MODES.register), false);
  assert.equal(shouldShowForgotPasswordFooterAction(LOGIN_ACTION_MODES.invite), false);
  assert.equal(shouldShowForgotPasswordFooterAction(LOGIN_ACTION_MODES.requestReset), false);
  assert.equal(shouldShowForgotPasswordFooterAction(LOGIN_ACTION_MODES.completeReset), false);
});

test("datasource dialog MQTT broker quick-create hint only shows when no broker profiles exist", () => {
  assert.equal(
    shouldShowBrokerProfileQuickCreate({
      datasourceType: "mqtt",
      brokerProfilesCount: 0,
    }),
    true,
  );

  assert.equal(
    shouldShowBrokerProfileQuickCreate({
      datasourceType: "mqtt",
      brokerProfilesCount: 1,
    }),
    false,
  );

  assert.equal(
    shouldShowBrokerProfileQuickCreate({
      datasourceType: "http",
      brokerProfilesCount: 0,
    }),
    false,
  );
});

test("board uses stacked rendering only for explicit sm dashboard width", () => {
  assert.equal(isSmallDashboardLayout("sm"), true);
  assert.equal(isSmallDashboardLayout("SM"), true);
  assert.equal(isSmallDashboardLayout(" md "), false);
  assert.equal(isSmallDashboardLayout(null), false);
});
