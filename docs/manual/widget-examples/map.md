# Map Widget Examples

## Example 1: My IP Location

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = myGeo`.
4. Set `URL = https://ipapi.co/json/`.
5. Set `Refresh = 300` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Map`.
3. Set `Title = My Location`.
4. Set `Header Text = IP Geolocation`.
5. Set `Map Provider = OpenStreetMap`.
6. Set `Zoom = 10`.
7. Set `Show Marker = true`.
8. Set `Latitude Path = myGeo.latitude`.
9. Set `Longitude Path = myGeo.longitude`.
10. Set `Label Path = myGeo.city`.
11. Save.

Expected output: map centered on detected public IP location.

## Example 2: ISS Live Position

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = issNow`.
4. Set `URL = https://api.wheretheiss.at/v1/satellites/25544`.
5. Set `Refresh = 5` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Map`.
3. Set `Title = ISS Tracker`.
4. Set `Header Text = ISS`.
5. Set `Map Provider = OpenStreetMap`.
6. Set `Zoom = 3`.
7. Set `Show Marker = true`.
8. Set `Latitude Path = issNow.latitude`.
9. Set `Longitude Path = issNow.longitude`.
10. Set `Label Path = issNow.id`.
11. Save.

Expected output: map updates as ISS coordinates change.

