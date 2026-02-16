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
    labelShare: "Share",
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
    labelStatus: "Status",
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
    labelConfirmPassword: "Confirm Password",
    labelToken: "Token",
    labelNewPassword: "New Password",
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
    labelVisibility: "Visibility",
    labelVisibilityPrivate: "Private",
    labelVisibilityLink: "Link",
    labelVisibilityPublic: "Public",
    labelOwner: "Owner",
    labelAccessLevel: "Access Level",
    labelAccessViewer: "Viewer",
    labelAccessEditor: "Editor",
    labelStyle: "Style",
    labelScript: "Script",
    labelStylesheet: "Stylesheet",
    labelResources: "Resources",
    labelName: "Name",
    labelRefresh: "Refresh interval",
    labelTemplate: "Template",
    labelUrl: "URL",
    labelUseGateway: "Use Gateway",
    labelMethod: "Method",
    labelMethodGET: "GET",
    labelMethodPOST: "POST",
    labelMethodPUT: "PUT",
    labelMethodDELETE: "DELETE",
    labelBody: "Body",
    labelParser: "Parser",
    labelTimeoutMs: "Timeout (ms)",
    labelHeadersJson: "Headers (JSON)",
    labelCredentials: "Credentials",
    labelCredentialProfile: "Credential Profile",
    labelDatasourceStaleAfterSeconds: "Mark stale after",
    labelStatic: "Static",
    labelStaticValue: "Static Value",
    labelTheme: "Theme",
    labelThemeAuto: "Auto",
    labelThemeDark: "Dark",
    labelThemeLight: "Light",
    suffixRefresh: "seconds",
    placeholderCredentialProfile: "Select a credential profile",
    optionCredentialProfileNone: "None",
    placeholderList: "Search...",
  },

  // Controls for Freeboard actions
  freeboardControl: {
    labelSave: "Save Freeboard",
    labelUpdate: "Update Freeboard",
    labelImport: "Import Freeboard",
    labelExport: "Export Freeboard",
    labelOpenSaved: "Open Saved",
  },

  // Saved dashboards dialog
  savedDashboards: {
    title: "Saved Dashboards",
    loading: "Loading dashboards…",
    error: "Could not load dashboards.",
    empty: "No dashboards found.",
    public: "Public",
    link: "Link",
    private: "Private",
  },

  // Header title
  header: {
    title: "Freeboard",
  },

  admin: {
    title: "Admin",
    backToDashboard: "Back To Dashboard",
    loadError: "Could not load admin data.",
    datasourceDiagnosticsTitle: "Datasource Diagnostics",
    loadingDatasourceDiagnostics: "Loading datasource diagnostics...",
    totalDashboards: "Dashboards",
    totalDatasources: "Datasources",
    credentialBoundDatasources: "Credential-Bound Datasources",
    externalDashboardDatasources: "External Dashboard Datasources",
    invalidDatasources: "Invalid Datasources",
    count: "Count",
    noDatasourceDiagnostics: "No datasource diagnostics available.",
    policyTitle: "Auth Policy",
    registrationMode: "Registration Mode",
    registrationDefaultRole: "Registration Default Role",
    editorCanPublish: "Editors can publish dashboards",
    dashboardDefaultVisibility: "Default Dashboard Visibility",
    dashboardPublicListingEnabled: "Include public dashboards in user listings",
    executionMode: "Execution Mode",
    currentRuntimeMode: "Current execution mode",
    savePolicy: "Save Policy",
    policyLockedHint: "Policy edits are locked by environment configuration.",
    invitesTitle: "Invites",
    createInviteButton: "Create Invite",
    revokeInvite: "Revoke Invite",
    loadingInvites: "Loading invites...",
    noPendingInvites: "No pending invites.",
    inviteToken: "Invite Token",
    inviteLink: "Invite Link",
    expiresHours: "Expires (hours)",
    expiresAt: "Expires At",
    createUserTitle: "Create User",
    createUserButton: "Create User",
    usersTitle: "Users",
    noUsers: "No users found.",
    loadingUsers: "Loading users...",
    role: "Role",
    active: "Active",
    actions: "Actions",
    saveUser: "Save",
    issueResetToken: "Issue Reset Token",
    deleteUser: "Delete",
    deactivateBeforeDelete: "Deactivate the account before permanent deletion.",
    credentialProfilesTitle: "Credential Profiles",
    createCredentialProfileButton: "Create Profile",
    saveCredentialProfile: "Save Profile",
    deleteCredentialProfile: "Delete Profile",
    loadingCredentialProfiles: "Loading credential profiles...",
    noCredentialProfiles: "No credential profiles found.",
    allowPublicUse: "Allow Public Use",
    description: "Description",
    headerName: "Header Name",
    headerValue: "Header Value",
    tokenSecret: "Token Secret",
    usernameSecret: "Username Secret",
    passwordSecret: "Password Secret",
    secretShape: "Secret Fields",
  },

  share: {
    title: "Share Dashboard",
    unsavedHint: "Save the dashboard before configuring sharing.",
    noPermission: "You do not have permission to manage sharing for this dashboard.",
    visibility: "Visibility",
    visibilityDescription:
      "Private is authenticated-only. Link requires the share URL. Public can be listed.",
    shareLink: "Share Link",
    copyLink: "Copy Link",
    revokeLink: "Revoke Link",
    collaboratorsTitle: "Collaborators",
    ownerTransferTitle: "Transfer Ownership",
    addCollaborator: "Grant Access",
    removeCollaborator: "Remove",
    loadingCollaborators: "Loading collaborators...",
    noCollaborators: "No collaborators yet.",
    transferButton: "Transfer Ownership",
    saveVisibility: "Save Visibility",
  },

  // Login button text
  login: {
    titleLogin: "Login",
    titleCreateAccount: "Create Account",
    titleAcceptInvite: "Accept Invite",
    titleRequestReset: "Request Password Reset",
    titleCompleteReset: "Reset Password",
    buttonOk: "Login",
    buttonCreateAccount: "Create Account",
    buttonUseExisting: "Use Existing Account",
    buttonAcceptInvite: "Accept Invite",
    buttonRequestReset: "Send Reset Request",
    buttonCompleteReset: "Reset Password",
    buttonForgotPassword: "Forgot Password",
    buttonUseResetToken: "Use Reset Token",
    buttonBackToLogin: "Back To Login",
    registrationDisabled: "Account creation is disabled on this deployment.",
    inviteRequired: "This deployment requires an invitation to create accounts.",
    inviteTokenHelp: "Paste your invitation token to create your account.",
    resetRequested:
      "If the account exists and is active, a password reset request has been recorded.",
    resetCompleted: "Password reset complete. You can now sign in.",
    accountDeactivated:
      "Your account is deactivated. Contact an administrator.",
    resetTokenHelp: "Provide your reset token and a new strong password.",
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
