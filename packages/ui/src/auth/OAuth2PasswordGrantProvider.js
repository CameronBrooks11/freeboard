/**
 * @module auth/OAuth2PasswordGrantProvider
 * @description Authentication provider implementing OAuth2 password grant flow.
 */

import proxy from "../proxy";

const EXPIRES_AT_PROPERTY_NAME = "expires_at";
const EXPIRES_IN_PROPERTY_NAME = "expires_in";

/**
 * OAuth2 provider that uses password grant type to obtain access tokens.
 *
 * @class OAuth2PasswordGrantProvider
 */
export class OAuth2PasswordGrantProvider {
  /**
   * Provider type identifier.
   * @static
   * @type {string}
   */
  static typeName = "oauth2";

  /**
   * Human-readable label for the provider.
   * @static
   * @type {string}
   */
  static label = "OAuth2";

  /**
   * Builds configuration fields for the provider UI.
   *
   * @static
   * @param {Object} [authProvider] - Existing provider settings.
   * @param {Object} dashboard      - Dashboard context.
   * @param {Object} general        - General field group schema.
   * @returns {Array<Object>} Array with fields definitions.
   */
  static fields = (authProvider, dashboard, general) => [
    {
      ...general,
      settings: {
        ...general.settings,
        service: authProvider?.settings.service,
        body: authProvider?.settings.body,
      },
      fields: [
        ...general.fields,
        // OAuth2 token endpoint URL
        {
          name: "url",
          label: "form.labelUrl",
          type: "text",
          required: true,
        },
        // Client credentials
        {
          name: "client_id",
          label: "form.labelClientId",
          type: "text",
          required: true,
        },
        {
          name: "client_secret",
          label: "form.labelClientSecret",
          type: "password",
          required: true,
        },
        // Resource owner credentials
        {
          name: "username",
          label: "form.labelUsername",
          type: "text",
          required: true,
        },
        {
          name: "password",
          label: "form.labelPassword",
          type: "password",
          required: true,
        },
        // Optional scope
        {
          name: "scope",
          label: "form.labelScope",
          type: "text",
        },
      ],
    },
  ];

  /** @private {Object} Holds current settings for token requests. */
  currentSettings = null;
  /** @private {Object} Cached token properties including expiration. */
  tokenProperties = null;

  /**
   * Initialize provider with settings.
   *
   * @param {Object} settings - Initial settings (url, client_id, etc.).
   */
  constructor(settings) {
    this.settings = settings;
  }

  /**
   * Update provider settings and reset cached token.
   *
   * @param {Object} settings - New settings object.
   */
  set settings(settings) {
    this.currentSettings = settings;
    this.tokenProperties = null;
  }

  /**
   * Retrieve current provider settings.
   *
   * @returns {Object} Current settings.
   */
  get settings() {
    return this.currentSettings;
  }

  /**
   * Obtain a valid access token, refreshing or fetching as needed.
   *
   * @returns {Promise<string>} Access token string.
   */
  getAccessToken() {
    if (
      this.tokenProperties &&
      this.tokenProperties[EXPIRES_AT_PROPERTY_NAME] > new Date()
    ) {
      // Token still valid
      return Promise.resolve(this.tokenProperties.access_token);
    } else if (
      this.tokenProperties &&
      this.tokenProperties[EXPIRES_AT_PROPERTY_NAME] >= new Date()
    ) {
      // Token expired: use refresh_token to obtain new token
      return fetch(proxy(this.currentSettings.url), {
        body: new URLSearchParams({
          refresh_token: this.tokenProperties.refresh_token,
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
        .then((response) => response.json())
        .then(
          (d) =>
            (this.tokenProperties = this.parseToken({
              ...d,
              refresh_token: this.tokenProperties.refresh_token,
            }))
        )
        .then((p) => p.access_token);
    } else {
      // No token: request new token with password grant
      const body = {
        grant_type: "password",
        client_id: this.currentSettings.client_id,
        client_secret: this.currentSettings.client_secret,
        username: this.currentSettings.username,
        password: this.currentSettings.password,
      };

      if (this.currentSettings.scope) {
        body.scope = this.currentSettings.scope;
      }

      return fetch(proxy(this.currentSettings.url), {
        body: new URLSearchParams(body),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
        .then((response) => response.json())
        .then((d) => (this.tokenProperties = this.parseToken(d)))
        .then((p) => p.access_token);
    }
  }

  /**
   * Parse token response to include expiration properties.
   *
   * @param {Object} token - Raw token response from server.
   * @returns {Object} Token with computed expiration date.
   * @throws {Error} If no expiration property found.
   */
  parseToken(token) {
    const tokenProperties = {};

    if (EXPIRES_AT_PROPERTY_NAME in token) {
      tokenProperties[EXPIRES_AT_PROPERTY_NAME] = this.parseExpirationDate(
        token[EXPIRES_AT_PROPERTY_NAME]
      );
    } else if (EXPIRES_IN_PROPERTY_NAME in token) {
      tokenProperties[EXPIRES_AT_PROPERTY_NAME] = this.getExpirationDate(
        token[EXPIRES_IN_PROPERTY_NAME]
      );
    } else {
      throw new Error(
        "No token expiration property was found. Ignoring date parsing"
      );
    }

    return {
      ...token,
      ...tokenProperties,
    };
  }

  /**
   * Parse an absolute expiration date value.
   *
   * @param {string|number|Date} expirationDate - Token expiration as ISO string, UNIX timestamp, or Date.
   * @returns {Date} Parsed expiration date.
   */
  parseExpirationDate(expirationDate) {
    if (expirationDate instanceof Date) {
      return expirationDate;
    }

    if (typeof expirationDate === "number") {
      // UNIX timestamp in seconds
      return new Date(expirationDate * 1000);
    }
    
    // ISO 8601 string
    return new Date(expirationDate);
  }

  /**
   * Compute expiration date relative to now based on `expires_in`.
   *
   * @param {string|number} expiresIn - Duration in seconds until expiration.
   * @returns {Date} Computed expiration date.
   */
  getExpirationDate(expiresIn) {
    return new Date(Date.now() + Number.parseInt(expiresIn, 10) * 1000);
  }

  /**
   * Create request options including Authorization header.
   *
   * @returns {Promise<{headers: Object<string,string>}>} Request options for authenticated requests.
   */
  createRequest = async () => {
    const token = await this.getAccessToken();
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  };
}
