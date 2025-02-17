import proxy from "../proxy";

const EXPIRES_AT_PROPERTY_NAME = "expires_at";
const EXPIRES_IN_PROPERTY_NAME = "expires_in";

export class OAuth2PasswordGrantProvider {
  static typeName = "oauth2";
  static label = "OAuth2";
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
        {
          name: "url",
          label: "form.labelUrl",
          type: "text",
          required: true,
        },
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
        {
          name: "scope",
          label: "form.labelScope",
          type: "text",
        },
      ],
    },
  ];
  currentSettings = null;
  tokenProperties = null;

  constructor(settings) {
    this.settings = settings;
  }

  set settings(settings) {
    this.currentSettings = settings;
    this.tokenProperties = null;
  }

  get settings() {
    return this.currentSettings;
  }

  getAccessToken() {
    if (
      this.tokenProperties &&
      this.tokenProperties[EXPIRES_AT_PROPERTY_NAME] > new Date()
    ) {
      return this.tokenProperties.access_token;
    } else if (this.tokenProperties && this.tokenProperties[EXPIRES_AT_PROPERTY_NAME] >= new Date()) {
      return fetch(proxy(this.currentSettings.url), {
        body: new URLSearchParams({
          refresh_token: this.tokenProperties.refresh_token,
        }),
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      })
        .then((response) => ({
          ...response.json(),
          refresh_token: this.tokenProperties.refresh_token,
        }))
        .then((d) => (this.tokenProperties = this.parseToken(d)))
        .then((p) => p.access_token);
    } else {
      const body = {
        grant_type: "password",
        client_id: this.currentSettings.client_id,
        client_secret: this.currentSettings.client_secret,
        username: this.currentSettings.username,
        password: this.currentSettings.password,
      }

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

  parseToken(token) {
    const tokenProperties = {};

    if (EXPIRES_AT_PROPERTY_NAME in token) {
      tokenProperties[EXPIRES_AT_PROPERTY_NAME] = this.parseExpirationDate(
        token[EXPIRES_AT_PROPERTY_NAME],
      );
    } else if (EXPIRES_IN_PROPERTY_NAME in token) {
      tokenProperties[EXPIRES_AT_PROPERTY_NAME] = this.getExpirationDate(
        token[EXPIRES_IN_PROPERTY_NAME],
      );
    } else {
      throw new Error(
        "No token expiration property was found. Ignoring date parsing",
      );
    }

    return {
      ...token,
      ...tokenProperties,
    };
  }

  parseExpirationDate(expirationDate) {
    if (expirationDate instanceof Date) {
      return expirationDate;
    }

    // UNIX timestamp
    if (typeof expirationDate === "number") {
      return new Date(expirationDate * 1000);
    }

    // ISO 8601 string
    return new Date(expirationDate);
  }

  getExpirationDate(expiresIn) {
    return new Date(Date.now() + Number.parseInt(expiresIn, 10) * 1000);
  }

  createRequest = async () => {
    const token = await this.getAccessToken();
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  };
}
