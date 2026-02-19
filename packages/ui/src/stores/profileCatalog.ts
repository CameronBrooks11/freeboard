import { defineStore } from "pinia";

type CredentialProfile = { _id: string; name: string } & Record<string, unknown>;
type BrokerProfile = { _id: string; name: string } & Record<string, unknown>;

export const useProfileCatalogStore = defineStore("profileCatalog", {
  state: () => ({
    credentialProfiles: [] as CredentialProfile[],
    brokerProfiles: [] as BrokerProfile[],
  }),

  actions: {
    setCredentialProfiles(profiles: unknown) {
      this.credentialProfiles = Array.isArray(profiles) ? (profiles as CredentialProfile[]) : [];
    },

    clearCredentialProfiles() {
      this.credentialProfiles = [];
    },

    setBrokerProfiles(profiles: unknown) {
      this.brokerProfiles = Array.isArray(profiles) ? (profiles as BrokerProfile[]) : [];
    },

    clearBrokerProfiles() {
      this.brokerProfiles = [];
    },
  },
});
