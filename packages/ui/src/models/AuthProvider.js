/**
 * @module models/AuthProvider
 * @description Client-side model for managing authentication provider configuration and plugin instantiation.
 */

import { storeToRefs } from "pinia";
import { useFreeboardStore } from "../stores/freeboard";

/**
 * Wrapper around an authentication provider plugin, handling type, settings, and instance lifecycle.
 *
 * @class AuthProvider
 */
export class AuthProvider {
  /** @type {string|null} Display title for this auth provider. */
  title = null;
  /** @type {boolean} Whether this provider is enabled. */
  enabled = true;
  /** @private {string|null} Underlying provider type identifier. */
  _type = null;
  /** @private {Object|null} Settings object for the provider. */
  _settings = null;
  /** @private {Object} Instance of the auth plugin corresponding to `type`. */
  authProviderInstance;

  /**
   * Set the provider type and instantiate the corresponding auth plugin.
   *
   * @param {string} newValue - Provider type key from `authPlugins`.
   */
  set type(newValue) {
    const freeboardStore = useFreeboardStore();
    const { authPlugins } = storeToRefs(freeboardStore);
    if (!this.authProviderInstance) {
      this.authProviderInstance = new authPlugins.value[newValue](
        this.settings
      );
    }
    this._type = newValue;
    this.updateAuthProviderInstance();
  }

  /**
   * Get the current provider type.
   *
   * @returns {string|null} The type identifier.
   */
  get type() {
    return this._type;
  }

  /**
   * Update the provider settings and refresh the auth plugin instance.
   *
   * @param {Object} newValue - Settings object for the provider.
   */
  set settings(newValue) {
    this._settings = newValue;
    this.updateAuthProviderInstance();
  }

  /**
   * Retrieve the current provider settings.
   *
   * @returns {Object|null} Settings object.
   */
  get settings() {
    return this._settings;
  }

  /**
   * Serialize this AuthProvider to a plain object for storage or transmission.
   *
   * @returns {{ title: string|null, type: string|null, settings: Object|null, enabled: boolean }}
   */
  serialize() {
    return {
      title: this.title,
      type: this.type,
      settings: this.settings,
      enabled: this.enabled,
    };
  }

  /**
   * Populate this AuthProvider from a serialized object.
   *
   * @param {{ title: string, type: string, settings: Object, enabled: boolean }} object - Serialized data.
   */
  deserialize(object) {
    this.settings = object.settings;
    this.type = object.type;
    this.enabled = object.enabled;
    this.title = object.title;
    this.updateAuthProviderInstance();
  }

  /**
   * Ensure the auth plugin instance exists and matches current type/settings.
   * No operation if `type` or `settings` are not yet defined.
   */
  updateAuthProviderInstance() {
    if (!this.type || !this.settings) {
      return;
    }
    const freeboardStore = useFreeboardStore();
    const { authPlugins } = storeToRefs(freeboardStore);
    if (!this.authProviderInstance) {
      this.authProviderInstance = new authPlugins.value[this.type](
        this.settings
      );
    }
  }
}
