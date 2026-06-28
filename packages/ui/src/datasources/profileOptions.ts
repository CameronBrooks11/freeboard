/**
 * @module datasources/profileOptions
 * Builds the `<option>` list for a datasource credential/broker profile picker.
 *
 * The profiles offered are the ones the editor may USE (the server's
 * `dashboardUsableProfiles` already filters to those). When a datasource already
 * references a profile the editor may NOT use (e.g. a non-public profile authored
 * by the owner, shown to an ACL-only editor), that id is absent from the usable
 * list — so we append it as a DISABLED "kept" option. Without this the select
 * would fall back to its first option and misrepresent an attached credential as
 * "None" (issue #223). The kept option preserves and surfaces the value; the
 * write-time gate still prevents the editor from changing it.
 */

/** Minimal shape the picker needs from a credential/broker profile. */
export interface SelectableProfile {
  _id: string;
  name: string;
}

export interface ProfileSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * @param selectedId The id currently stored on the datasource (any type; coerced).
 * @param profiles The profiles the editor may use, from `dashboardUsableProfiles`.
 * @param placeholderLabel i18n key for the leading empty option (e.g. "None").
 */
export const buildProfileSelectOptions = (
  selectedId: unknown,
  profiles: SelectableProfile[],
  placeholderLabel: string,
): ProfileSelectOption[] => {
  const options: ProfileSelectOption[] = [
    { value: "", label: placeholderLabel },
    ...profiles.map((profile) => ({ value: profile._id, label: profile.name })),
  ];
  const id = typeof selectedId === "string" ? selectedId.trim() : "";
  if (id && !profiles.some((profile) => profile._id === id)) {
    options.push({ value: id, label: "form.optionProfileRestricted", disabled: true });
  }
  return options;
};
