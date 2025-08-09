/**
 * @module datasources/ClockDatasource
 * @description Datasource that emits the current date/time at a configurable refresh interval.
 */
export class ClockDatasource {
  /**
   * Unique type identifier for registration.
   * @static
   * @type {string}
   */
  static typeName = "clock";

  /**
   * Human-readable label for UI selection.
   * @static
   * @type {string}
   */
  static label = "Clock";

  /**
   * Field definitions for configuring the clock datasource in the dashboard editor.
   *
   * @static
   * @param {Object} datasource          - Existing datasource settings.
   * @param {Object} dashboard           - Dashboard context.
   * @param {Object} general             - General field group schema.
   * @returns {Array<Object>} Array of configuration section objects.
   */
  static fields = (datasource, dashboard, general) => [
    {
      ...general,
      settings: {
        ...general.settings,
        refresh: datasource?.settings.refresh,
      },
      fields: [
        ...general.fields,
        {
          name: "refresh",
          label: "form.labelRefresh",
          type: "number",
          suffix: "form.suffixRefresh",
          default: 1,
        },
      ],
    },
  ];

  /**
   * Factory method to create and register a new ClockDatasource instance.
   *
   * @static
   * @param {Object} settings              - Initial settings for the instance.
   * @param {function(Object):void} newInstanceCallback - Called with new instance.
   * @param {function(Object):void} updateCallback      - Called on each tick.
   */
  static newInstance(settings, newInstanceCallback, updateCallback) {
    newInstanceCallback(new ClockDatasource(settings, updateCallback));
  }

  /** @private {number} Timer ID for the refresh interval. */
  updateTimer;

  /** @private {Object} Current settings for the datasource. */
  currentSettings;

  /** @private {function(Object):void} Callback to emit new data. */
  updateCallback;

  /**
   * Construct a ClockDatasource.
   *
   * @param {Object} settings             - Settings containing `refresh` interval in seconds.
   * @param {function(Object):void} updateCallback - Callback to invoke with new data.
   */
  constructor(settings, updateCallback) {
    this.updateCallback = updateCallback;
    this.onSettingsChanged(settings);
  }

  /**
   * Update the refresh interval timer based on new refresh time.
   *
   * @param {number} refreshTime - Interval in milliseconds.
   */
  updateRefresh(refreshTime) {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = setInterval(() => {
      this.updateNow();
    }, refreshTime);
  }

  /**
   * Emit the current date/time via the update callback.
   */
  updateNow() {
    this.updateCallback({
      data: new Date(),
    });
  }

  /**
   * Clean up resources when the datasource is disposed.
   */
  onDispose() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }

  /**
   * Handle changes to settings by resetting the timer and emitting initial data.
   *
   * @param {Object} newSettings - Updated settings object.
   */
  onSettingsChanged(newSettings) {
    this.currentSettings = newSettings;
    this.updateRefresh(this.currentSettings.refresh * 1000);
    this.updateNow();
  }
}
