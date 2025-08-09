/**
 * @module i18n/en
 * @description English localization messages for Freeboard UI.
 */

/**
 * English translation strings structured by component and form context.
 * @constant {Object.<string, any>}
 */
export const en = {
  // Translations for array form elements
  arrayFormElement: {
    buttonAdd: "Add",
  },

  // Labels for authentication provider dialog
  authProviderDialogBox: {
    labelType: "Type",
    placeholderType: "Select an auth type...",
  },

  // Titles and buttons for the list of auth providers
  authProvidersList: {
    titleAdd: "Add auth provider",
    titleEdit: "Edit auth provider",
    titleDelete: "Delete auth provider",
    buttonAdd: "Add",
    labelName: "Name",
  },

  // Descriptions for the code editor form element
  codeEditor: {
    buttonClose: "Close",
    descriptionHeader: `
    <p>This javascript will be re-evaluated any time a datasource referenced herebis updated,
    and the value you <code><span>return</span></code> will be displayed in the widget.
    You can assume this javascript is wrapped in a function of the form <code><span>function</span>(<span>datasources</span>)</code>
    where datasources is a collection of javascript objects (keyed by their name) corresponding to the most current data in a datasource.</p>`,
  },

  // Controls for dashboard header and settings
  dashboardControl: {
    labelSettings: "Settings",
    labelAuth: "Auth",
    labelDatasources: "Datasources",
    labelAddPane: "Add Pane",
  },

  // Dialog box labels for datasource selection
  datasourceDialogBox: {
    labelType: "Type",
    placeholderType: "Select a datasource type...",
  },

  // List actions for datasources
  datasourcesList: {
    titleAdd: "Add datasource",
    titleEdit: "Edit datasource",
    titleDelete: "delete datasource",
    buttonAdd: "Add",
    labelName: "Name",
    labelLastUpdated: "Last Updated",
  },

  // Generic dialog box button labels
  dialogBox: {
    titleSettings: "Settings",
    titleConfirm: "Confirm",
    buttonOk: "Ok",
    buttonCancel: "Cancel",
  },

  // Form field labels and placeholders
  form: {
    labelAsset: "Asset",
    labelList: "Select...",
    labelService: "Service",
    labelAuth: "Auth",
    labelHTTP: "HTTP",
    labelHTML: "HTML",
    labelEnabled: "Enabled",
    labelPatch: "Patch",
    labelHeader: "Header",
    labelValue: "Value",
    labelClientId: "Client Id",
    labelClientSecret: "Client Secret",
    labelScope: "Scope",
    labelEmail: "Email",
    labelUsername: "Username",
    labelPassword: "Password",
    labelColumn3: "3",
    labelColumn4: "4",
    labelColumn5: "5",
    labelColumn6: "6",
    labelColumn7: "7",
    labelColumn8: "8",
    labelColumn9: "9",
    labelColumn10: "10",
    labelColumn11: "11",
    labelColumn12: "12",
    labelTitle: "Title",
    labelType: "Type",
    labelGeneral: "General",
    labelColumns: "Columns",
    labelPublished: "Published",
    labelStyle: "Style",
    labelScript: "Script",
    labelStylesheet: "Stylesheet",
    labelResources: "Resources",
    labelName: "Name",
    labelRefresh: "Refresh interval",
    labelTemplate: "Template",
    labelUrl: "URL",
    labelUseProxy: "Use Proxy",
    labelMethod: "Method",
    labelMethodGET: "GET",
    labelMethodPOST: "POST",
    labelMethodPUT: "PUT",
    labelMethodDELETE: "DELETE",
    labelBody: "Body",
    labelAuthProvider: "Auth provider",
    labelTheme: "Theme",
    labelThemeAuto: "Auto",
    labelThemeDark: "Dark",
    labelThemeLight: "Light",
    suffixRefresh: "seconds",
    placeholderAuthProvider: "Select an auth provider",
    placeholderList: "Search...",
  },

  // Controls for Freeboard actions
  freeboardControl: {
    labelSave: "Save Freeboard",
    labelUpdate: "Update Freeboard",
    labelImport: "Import Freeboard",
    labelExport: "Export Freeboard",
  },

  // Header title
  header: {
    title: "Freeboard",
  },

  // Login button text
  login: {
    buttonOk: "Login",
  },

  // Pane action titles
  pane: {
    titleAdd: "Add widget",
    titleEdit: "Edit pane",
    titleDelete: "delete pane",
  },

  // Labels for switch form elements
  switchFormElement: {
    labelOn: "Yes",
    labelOff: "No",
  },

  // Text area form element labels
  textareaFormElement: {
    labelCode: "Code",
  },

  // Widget action titles
  widget: {
    titleEdit: "Edit widget",
    titleDelete: "delete widget",
  },

  // Type select component labels
  typeSelect: {
    labelType: "Type",
    placeholderType: "Select...",
  },
};
