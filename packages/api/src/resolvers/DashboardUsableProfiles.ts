/**
 * @module resolvers/DashboardUsableProfiles
 * Resolver for `dashboardUsableProfiles` — the dashboard-scoped profile picker
 * source (issue #213). Authorized by ACL `canEdit`; the returned set is filtered
 * by the SAME author-trust tier as the write-time gate
 * (`assertCredentialAuthorAuthorized`), so the picker never offers a profile a
 * save would reject. Secrets are never returned (mappers redact to `secretShape`).
 */

import type { IResolvers } from "@graphql-tools/utils";
import { dataStore } from "../data/index.js";
import { ensureThatUserIsLogged } from "../auth.js";
import {
  ensureDashboardEditable,
  getDashboardOrNotFound,
  isTrustedProfileAuthor,
} from "./dashboardHelpers.js";
import { toCredentialProfileResponse } from "./CredentialProfile.js";
import { toBrokerProfileResponse } from "./BrokerProfile.js";

const credentialProfileRepository = dataStore.repositories.credentialProfiles;
const brokerProfileRepository = dataStore.repositories.brokerProfiles;

/**
 * The profiles the principal may author with: every profile for a trusted author
 * (global editor/admin), only `allowPublicUse` profiles otherwise. Pure — must
 * stay identical to the write-time gate's notion of "usable".
 */
export const selectUsableProfiles = <T extends { allowPublicUse?: boolean }>(
  profiles: T[],
  trusted: boolean,
): T[] => (trusted ? profiles : profiles.filter((profile) => profile.allowPublicUse === true));

const resolvers: IResolvers = {
  Query: {
    dashboardUsableProfiles: async (_parent, { dashboardId }, context) => {
      ensureThatUserIsLogged(context);
      const dashboard = await getDashboardOrNotFound(dashboardId);
      ensureDashboardEditable(dashboard, context);

      const trusted = isTrustedProfileAuthor(context);
      const [credentials, brokers] = await Promise.all([
        credentialProfileRepository.listSortedByName(),
        brokerProfileRepository.listSortedByName({ protocol: null }),
      ]);
      return {
        credentialProfiles: selectUsableProfiles(credentials, trusted).map(
          toCredentialProfileResponse,
        ),
        brokerProfiles: selectUsableProfiles(brokers, trusted).map(toBrokerProfileResponse),
      };
    },
  },
};

export default resolvers;
