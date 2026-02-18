/**
 * @module widgets/TableWidget
 * @description Table widget with configurable columns, client-side sorting, and optional pagination.
 */

import { toPathSegments } from "./runtime/bindings.js";
import { ReactiveWidget } from "./runtime/ReactiveWidget.js";

const DEFAULT_EMPTY_VALUE = "—";
const DEFAULT_EMPTY_TABLE_TEXT = "No rows";

const toPositiveIntegerOrZero = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  if (normalized < 0) {
    return fallback;
  }
  return normalized;
};

const normalizeAlign = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["left", "center", "right"].includes(normalized)) {
    return normalized;
  }
  return "left";
};

const normalizeFormat = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["auto", "number", "integer", "percent", "date", "datetime", "json"].includes(normalized)) {
    return normalized;
  }
  return "auto";
};

const toDisplayString = (value) => {
  if (value === null || value === undefined || value === "") {
    return DEFAULT_EMPTY_VALUE;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : DEFAULT_EMPTY_VALUE;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const resolveTableRowValue = (row, fieldPath) => {
  if (!fieldPath || typeof fieldPath !== "string") {
    return row;
  }

  const segments = toPathSegments(fieldPath);
  if (!segments.length) {
    return row;
  }

  let current = row;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

export const normalizeTableColumns = (rawColumns, rows = []) => {
  if (Array.isArray(rawColumns) && rawColumns.length > 0) {
    return rawColumns.map((column, index) => {
      const fallbackHeader = `Column ${index + 1}`;
      const field = typeof column?.field === "string" ? column.field.trim() : "";
      const header = typeof column?.header === "string" ? column.header.trim() : "";
      const width = typeof column?.width === "string" ? column.width.trim() : "";
      return {
        field,
        header: header || field || fallbackHeader,
        width,
        align: normalizeAlign(column?.align),
        format: normalizeFormat(column?.format),
      };
    });
  }

  const firstObjectRow = rows.find((row) => row && typeof row === "object" && !Array.isArray(row));
  if (firstObjectRow) {
    return Object.keys(firstObjectRow).map((key) => ({
      field: key,
      header: key,
      width: "",
      align: "left",
      format: "auto",
    }));
  }

  return [
    {
      field: "",
      header: "Value",
      width: "",
      align: "left",
      format: "auto",
    },
  ];
};

const normalizeComparableValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return { rank: 3, value: null };
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && String(value).trim() !== "") {
    return { rank: 0, value: numericValue };
  }

  const dateMs = Date.parse(String(value));
  if (Number.isFinite(dateMs)) {
    return { rank: 1, value: dateMs };
  }

  return { rank: 2, value: String(value).toLowerCase() };
};

const compareTableValues = (leftValue, rightValue, direction) => {
  const left = normalizeComparableValue(leftValue);
  const right = normalizeComparableValue(rightValue);

  const sign = direction === "desc" ? -1 : 1;

  if (left.rank !== right.rank) {
    return left.rank < right.rank ? -1 * sign : 1 * sign;
  }

  if (left.value === right.value) {
    return 0;
  }

  if (typeof left.value === "string" && typeof right.value === "string") {
    return left.value.localeCompare(right.value, undefined, { numeric: true }) * sign;
  }

  return left.value < right.value ? -1 * sign : 1 * sign;
};

export const sortTableRows = (rows, sortState) => {
  const field = String(sortState?.field || "").trim();
  const direction = sortState?.direction === "desc" ? "desc" : "asc";

  if (!field) {
    return [...rows];
  }

  return [...rows].sort((leftRow, rightRow) =>
    compareTableValues(
      resolveTableRowValue(leftRow, field),
      resolveTableRowValue(rightRow, field),
      direction,
    ),
  );
};

export const paginateTableRows = (rows, rowsPerPage, currentPage) => {
  const normalizedRowsPerPage = toPositiveIntegerOrZero(rowsPerPage, 0);
  if (normalizedRowsPerPage < 1) {
    return {
      rows: [...rows],
      currentPage: 1,
      totalPages: 1,
      rowsPerPage: 0,
    };
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / normalizedRowsPerPage));
  const safePage = Math.min(Math.max(1, toPositiveIntegerOrZero(currentPage, 1)), totalPages);
  const startIndex = (safePage - 1) * normalizedRowsPerPage;
  const pageRows = rows.slice(startIndex, startIndex + normalizedRowsPerPage);

  return {
    rows: pageRows,
    currentPage: safePage,
    totalPages,
    rowsPerPage: normalizedRowsPerPage,
  };
};

export const formatTableCellValue = (value, format) => {
  const normalizedFormat = normalizeFormat(format);

  if (value === null || value === undefined || value === "") {
    return DEFAULT_EMPTY_VALUE;
  }

  if (normalizedFormat === "json") {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return toDisplayString(value);
    }
  }

  if (
    normalizedFormat === "number" ||
    normalizedFormat === "integer" ||
    normalizedFormat === "percent"
  ) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_EMPTY_VALUE;
    }
    if (normalizedFormat === "integer") {
      return Math.round(parsed).toLocaleString();
    }
    if (normalizedFormat === "percent") {
      return `${(parsed * 100).toFixed(1)}%`;
    }
    return parsed.toLocaleString();
  }

  if (normalizedFormat === "date" || normalizedFormat === "datetime") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return DEFAULT_EMPTY_VALUE;
    }
    if (normalizedFormat === "date") {
      return date.toLocaleDateString();
    }
    return date.toLocaleString();
  }

  return toDisplayString(value);
};

export class TableWidget extends ReactiveWidget {
  static typeName = "table";
  static label = "Table";
  static preferredRows = 4;

  static fields = (widget, dashboard, general) => [
    general,
    {
      label: "Display",
      icon: "hi-code",
      name: "display",
      settings: {
        headerText: widget?.settings?.headerText ?? widget?.title ?? "",
        rowsPerPage: widget?.settings?.rowsPerPage ?? 0,
        sortable: widget?.settings?.sortable ?? true,
        striped: widget?.settings?.striped ?? true,
        compact: widget?.settings?.compact ?? false,
        emptyText: widget?.settings?.emptyText ?? DEFAULT_EMPTY_TABLE_TEXT,
      },
      fields: [
        { name: "headerText", label: "Header Text", type: "text" },
        {
          name: "rowsPerPage",
          label: "Rows Per Page (0 = all)",
          type: "integer",
          default: 0,
        },
        { name: "sortable", label: "Sortable", type: "boolean", default: true },
        { name: "striped", label: "Striped Rows", type: "boolean", default: true },
        { name: "compact", label: "Compact Rows", type: "boolean", default: false },
        { name: "emptyText", label: "Empty Table Text", type: "text" },
      ],
    },
    {
      label: "Bindings",
      icon: "hi-variable",
      name: "bindings",
      settings: {
        valuePath: widget?.settings?.valuePath,
        headerPath: widget?.settings?.headerPath,
      },
      fields: [
        {
          name: "valuePath",
          label: "Rows Path",
          type: "text",
          required: true,
          description: "Path to an array value in datasource snapshot.",
        },
        {
          name: "headerPath",
          label: "Header Path",
          type: "text",
        },
      ],
    },
    {
      label: "Columns",
      icon: "hi-archive",
      name: "columns",
      settings: {
        columns:
          widget?.settings?.columns && widget.settings.columns.length
            ? widget.settings.columns
            : [{ field: "", header: "Value", width: "", align: "left", format: "auto" }],
      },
      fields: [
        {
          name: "columns",
          label: "Columns",
          type: "array",
          settings: [
            { name: "field", label: "Field Path", type: "text" },
            { name: "header", label: "Header", type: "text" },
            {
              name: "width",
              label: "Width (optional)",
              type: "text",
              placeholder: "120px or 20%",
            },
            {
              name: "align",
              label: "Align",
              type: "option",
              default: "left",
              options: [
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
              ],
            },
            {
              name: "format",
              label: "Format",
              type: "option",
              default: "auto",
              options: [
                { label: "Auto", value: "auto" },
                { label: "Number", value: "number" },
                { label: "Integer", value: "integer" },
                { label: "Percent", value: "percent" },
                { label: "Date", value: "date" },
                { label: "Date & Time", value: "datetime" },
                { label: "JSON", value: "json" },
              ],
            },
          ],
        },
      ],
    },
  ];

  static newInstance(settings, newInstanceCallback) {
    newInstanceCallback(new TableWidget(settings));
  }

  constructor(settings) {
    super(settings);

    this.sortState = {
      field: "",
      direction: "asc",
    };
    this.currentPage = 1;
    this.lastInputs = null;
    this.lastVisibleRowCount = 0;
    this.isNarrow = false;

    this.widgetElement.style.display = "flex";
    this.widgetElement.style.flexDirection = "column";
    this.widgetElement.style.height = "100%";
    this.widgetElement.style.width = "100%";
    this.widgetElement.style.overflow = "hidden";

    this.headerElement = document.createElement("div");
    this.headerElement.style.fontSize = "12px";
    this.headerElement.style.opacity = "0.8";
    this.headerElement.style.marginBottom = "8px";
    this.headerElement.style.textTransform = "uppercase";
    this.headerElement.style.letterSpacing = "0.04em";

    this.scrollWrap = document.createElement("div");
    this.scrollWrap.style.flex = "1";
    this.scrollWrap.style.minHeight = "70px";
    this.scrollWrap.style.overflowX = "auto";
    this.scrollWrap.style.overflowY = "auto";
    this.scrollWrap.style.WebkitOverflowScrolling = "touch";
    this.scrollWrap.style.touchAction = "pan-y";

    this.tableElement = document.createElement("table");
    this.tableElement.style.width = "100%";
    this.tableElement.style.minWidth = "100%";
    this.tableElement.style.borderCollapse = "collapse";
    this.tableElement.style.tableLayout = "auto";
    this.tableElement.style.fontSize = "13px";

    this.tableHead = document.createElement("thead");
    this.tableBody = document.createElement("tbody");
    this.tableElement.append(this.tableHead, this.tableBody);
    this.scrollWrap.append(this.tableElement);

    this.paginationElement = document.createElement("div");
    this.paginationElement.style.display = "none";
    this.paginationElement.style.marginTop = "8px";
    this.paginationElement.style.alignItems = "center";
    this.paginationElement.style.justifyContent = "space-between";
    this.paginationElement.style.gap = "10px";

    this.widgetElement.append(this.headerElement, this.scrollWrap, this.paginationElement);
  }

  resolveInputs() {
    const rowData = this.getBinding(this.currentSettings?.valuePath);
    const rows = Array.isArray(rowData) ? rowData : [];

    const normalizedRows = rows.map((row) =>
      row && typeof row === "object" && !Array.isArray(row) ? row : { value: row },
    );

    const columns = normalizeTableColumns(this.currentSettings?.columns, normalizedRows);
    const rowsPerPage = toPositiveIntegerOrZero(this.currentSettings?.rowsPerPage, 0);
    const sortable = this.currentSettings?.sortable !== false;
    const striped = this.currentSettings?.striped !== false;
    const compact = this.currentSettings?.compact === true;
    const emptyText = String(this.currentSettings?.emptyText || DEFAULT_EMPTY_TABLE_TEXT);

    return {
      header:
        this.getBinding(this.currentSettings?.headerPath) ??
        this.currentSettings?.headerText ??
        this.title ??
        "",
      rows: normalizedRows,
      columns,
      rowsPerPage,
      sortable,
      striped,
      compact,
      emptyText,
    };
  }

  onInputsChanged(inputs) {
    this.lastInputs = inputs;

    this.headerElement.textContent = inputs.header || "";
    this.headerElement.style.display = inputs.header ? "block" : "none";

    const columns = inputs.columns;
    if (!columns.some((column) => column.field === this.sortState.field)) {
      this.sortState = { field: "", direction: "asc" };
    }

    const sortedRows = sortTableRows(inputs.rows, this.sortState);
    const page = paginateTableRows(sortedRows, inputs.rowsPerPage, this.currentPage);
    this.currentPage = page.currentPage;
    this.lastVisibleRowCount = page.rows.length;

    this.renderHeader(columns, inputs.sortable);
    this.renderBody(columns, page.rows, {
      compact: inputs.compact,
      striped: inputs.striped,
      emptyText: inputs.emptyText,
    });
    this.renderPagination(page, sortedRows.length, inputs.rowsPerPage);
    this.applyResponsiveStyles(inputs.compact);
  }

  onResize(size: { width?: number } = {}) {
    const width = Number(size.width);
    this.isNarrow = Number.isFinite(width) && width > 0 && width < 520;
    this.applyResponsiveStyles(this.currentSettings?.compact === true);
  }

  onSettingsChanged(newSettings) {
    this.currentPage = 1;
    super.onSettingsChanged(newSettings);
  }

  applyResponsiveStyles(compact) {
    const effectiveCompact = compact || this.isNarrow;
    this.tableElement.style.fontSize = this.isNarrow ? "12px" : "13px";
    this.tableElement.dataset.compact = effectiveCompact ? "true" : "false";
  }

  handleSort(field) {
    const normalizedField = String(field || "").trim();
    if (!normalizedField) {
      return;
    }

    if (this.sortState.field === normalizedField) {
      this.sortState.direction = this.sortState.direction === "asc" ? "desc" : "asc";
    } else {
      this.sortState = {
        field: normalizedField,
        direction: "asc",
      };
    }

    this.currentPage = 1;
    if (this.lastInputs) {
      this.onInputsChanged(this.lastInputs);
    }
  }

  setCellBaseStyle(cell, { align = "left", isHeader = false, compact = false } = {}) {
    cell.style.textAlign = normalizeAlign(align);
    cell.style.padding = compact ? "4px 6px" : "7px 8px";
    cell.style.borderBottom = "1px solid var(--color-shade-2)";
    cell.style.whiteSpace = "nowrap";
    if (isHeader) {
      cell.style.fontWeight = "600";
      cell.style.fontSize = "12px";
      cell.style.textTransform = "uppercase";
      cell.style.letterSpacing = "0.03em";
      cell.style.color = "var(--color-shade-8)";
      cell.style.backgroundColor = "var(--color-shade-2)";
      cell.style.position = "sticky";
      cell.style.top = "0";
      cell.style.zIndex = "1";
    }
  }

  renderHeader(columns, sortable) {
    this.tableHead.innerHTML = "";
    const row = document.createElement("tr");
    const compact = this.currentSettings?.compact === true || this.isNarrow;

    columns.forEach((column) => {
      const cell = document.createElement("th");
      this.setCellBaseStyle(cell, { align: column.align, isHeader: true, compact });
      if (column.width) {
        cell.style.width = column.width;
        cell.style.maxWidth = column.width;
      }

      const isSorted = this.sortState.field === column.field && column.field;
      const sortMarker = isSorted
        ? this.sortState.direction === "asc"
          ? " \u25B2"
          : " \u25BC"
        : "";
      cell.textContent = `${column.header}${sortMarker}`;

      if (sortable && column.field) {
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => this.handleSort(column.field));
      }

      row.append(cell);
    });

    this.tableHead.append(row);
  }

  renderBody(columns, rows, { compact, striped, emptyText }) {
    this.tableBody.innerHTML = "";
    const effectiveCompact = compact || this.isNarrow;

    if (!rows.length) {
      const emptyRow = document.createElement("tr");
      const emptyCell = document.createElement("td");
      emptyCell.colSpan = Math.max(1, columns.length);
      this.setCellBaseStyle(emptyCell, { align: "left", compact: effectiveCompact });
      emptyCell.style.opacity = "0.85";
      emptyCell.textContent = emptyText || DEFAULT_EMPTY_TABLE_TEXT;
      emptyRow.append(emptyCell);
      this.tableBody.append(emptyRow);
      return;
    }

    rows.forEach((row, rowIndex) => {
      const tableRow = document.createElement("tr");
      if (striped && rowIndex % 2 === 1) {
        tableRow.style.backgroundColor = "var(--color-shade-2)";
      }

      columns.forEach((column) => {
        const cell = document.createElement("td");
        this.setCellBaseStyle(cell, { align: column.align, compact: effectiveCompact });
        if (column.width) {
          cell.style.maxWidth = column.width;
          cell.style.overflow = "hidden";
          cell.style.textOverflow = "ellipsis";
        }
        const rawValue = resolveTableRowValue(row, column.field);
        cell.textContent = formatTableCellValue(rawValue, column.format);
        tableRow.append(cell);
      });

      this.tableBody.append(tableRow);
    });
  }

  createPagerButton(label, disabled, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.style.padding = "4px 8px";
    button.style.border = "1px solid var(--color-shade-4)";
    button.style.background = disabled ? "var(--color-shade-2)" : "var(--color-shade-3)";
    button.style.color = "var(--color-foreground)";
    button.style.cursor = disabled ? "not-allowed" : "pointer";
    button.style.borderRadius = "3px";
    if (!disabled) {
      button.addEventListener("click", onClick);
    }
    return button;
  }

  renderPagination(page, totalRows, rowsPerPage) {
    this.paginationElement.innerHTML = "";

    if (!rowsPerPage || page.totalPages <= 1) {
      this.paginationElement.style.display = "none";
      return;
    }

    this.paginationElement.style.display = "flex";

    const left = document.createElement("div");
    left.style.display = "inline-flex";
    left.style.alignItems = "center";
    left.style.gap = "6px";

    const previousButton = this.createPagerButton("Prev", page.currentPage <= 1, () => {
      this.currentPage = Math.max(1, this.currentPage - 1);
      if (this.lastInputs) {
        this.onInputsChanged(this.lastInputs);
      }
    });
    const nextButton = this.createPagerButton("Next", page.currentPage >= page.totalPages, () => {
      this.currentPage = Math.min(page.totalPages, this.currentPage + 1);
      if (this.lastInputs) {
        this.onInputsChanged(this.lastInputs);
      }
    });

    left.append(previousButton, nextButton);

    const right = document.createElement("div");
    right.style.fontSize = "12px";
    right.style.opacity = "0.85";
    right.textContent = `Page ${page.currentPage} / ${page.totalPages} (${totalRows} rows)`;

    this.paginationElement.append(left, right);
  }

  getPreferredRows() {
    const visibleRows = this.lastVisibleRowCount || 0;
    return Math.max(2, Math.ceil(visibleRows / 2) + 1);
  }
}
