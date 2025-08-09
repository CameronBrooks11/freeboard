/**
 * @module auth/HeaderAuthProvider
 * @description Defines an authentication provider that uses custom HTTP headers.
 */

/**
 * Header-based authentication provider.
 *
 * @class HeaderAuthProvider
 */
export class HeaderAuthProvider {
  /**
   * Provider type identifier.
   * @static
   * @type {string}
   */
  static typeName = "header";

  /**
   * Human-readable label for the provider.
   * @static
   * @type {string}
   */
  static label = "Header";

  /**
   * Configuration fields for the provider UI.
   *
   * @static
   * @param {Object} [authProvider] - Existing authProvider settings.
   * @param {Object} dashboard      - Dashboard object context.
   * @param {Object} general        - General settings schema.
   * @returns {Array<Object>} Array of field group definitions including header and value inputs.
   */
  static fields = (authProvider, dashboard, general) => [
    {
      ...general,
      settings: {
        ...general.settings,
        header: authProvider?.settings.header,
        value: authProvider?.settings.value,
      },
      fields: [
        ...general.fields,
        {
          name: "header",
          label: "form.labelHeader",
          type: "text",
          required: true,
        },
        {
          name: "value",
          label: "form.labelValue",
          type: "text",
          required: true,
        },
      ],
    },
  ];

  /** @private {Object} Holds the current settings for this provider. */
  currentSettings = null;

  /**
   * Instantiate the HeaderAuthProvider with initial settings.
   *
   * @param {Object} settings - Initial settings containing header and value.
   */
  constructor(settings) {
    this.settings = settings;
  }

  /**
   * Update the provider settings.
   *
   * @param {Object} settings - New settings object.
   */
  set settings(settings) {
    this.currentSettings = settings;
  }

  /**
   * Retrieve the current provider settings.
   *
   * @returns {Object} Current settings object.
   */
  get settings() {
    return this.currentSettings;
  }

  /**
   * Create the request options for header-based authentication.
   *
   * @async
   * @returns {Promise<Object>} An object containing a headers map.
   */
  createRequest = async () => {
    return {
      headers: {
        [this.currentSettings.header]: this.currentSettings.value,
      },
    };
  };
}
