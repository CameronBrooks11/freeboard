import { defineStore } from "pinia";

export const useProfileCatalogStore = defineStore("profileCatalog", {
  state: () => ({
    credentialProfiles: [],
    brokerProfiles: [],
  }),

  actions: {
    setCredentialProfiles(profiles) {
      this.credentialProfiles = Array.isArray(profiles) ? profiles : [];
    },

    clearCredentialProfiles() {
      this.credentialProfiles = [];
    },

    setBrokerProfiles(profiles) {
      this.brokerProfiles = Array.isArray(profiles) ? profiles : [];
    },

    clearBrokerProfiles() {
      this.brokerProfiles = [];
    },
  },
});
