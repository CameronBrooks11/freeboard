# Table Widget Examples

## Example 1: Static Device Status Table

### Datasource Setup

1. Add datasource.
2. Set `Type = Static`.
3. Set `Title = lineStatus`.
4. Set `Static Value` to:

```json
[
  { "device": "Mixer-01", "state": "ok", "temperature": 52.1, "updatedAt": "2026-02-10T12:10:00Z" },
  {
    "device": "Mixer-02",
    "state": "warn",
    "temperature": 67.4,
    "updatedAt": "2026-02-10T12:09:00Z"
  },
  { "device": "Mixer-03", "state": "ok", "temperature": 49.8, "updatedAt": "2026-02-10T12:08:00Z" }
]
```

5. Set `Refresh = 0`.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Table`.
3. Set `Title = Line Status`.
4. Set `Rows Path = lineStatus`.
5. Set `Rows Per Page = 2`.
6. Set `Sortable = true`.
7. Set `Striped Rows = true`.
8. Set columns:
   - `{ field: device, header: Device }`
   - `{ field: state, header: State }`
   - `{ field: temperature, header: Temp C, align: right, format: number }`
   - `{ field: updatedAt, header: Updated, format: datetime }`
9. Save.

Expected output: sortable 2-row table with paging controls.

## Example 2: Public API Users Table

### Datasource Setup

1. Add datasource.
2. Set `Type = HTTP`.
3. Set `Title = usersData`.
4. Set `URL = https://jsonplaceholder.typicode.com/users`.
5. Set `Refresh = 300` seconds.
6. Set `Use Gateway = true`.
7. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Table`.
3. Set `Title = Users`.
4. Set `Rows Path = usersData`.
5. Set `Rows Per Page = 5`.
6. Set `Compact Rows = true`.
7. Set columns:
   - `{ field: name, header: Name }`
   - `{ field: email, header: Email, width: 260px }`
   - `{ field: company.name, header: Company }`
   - `{ field: address.city, header: City }`
8. Save.

Expected output: paged user table with horizontal scroll available on narrow panes.

For containerized production deployments, include `jsonplaceholder.typicode.com` in `EGRESS_ALLOWED_HOSTS`.
