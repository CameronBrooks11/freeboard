# Gauge Widget Examples

## Example 1: Temperature Gauge (Open-Meteo)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = weatherBerlin`.
4. Set `URL = https://api.open-meteo.com/v1/forecast?latitude=52.5200&longitude=13.4050&current_weather=true`.
5. Set `Refresh = 60` seconds.
6. You can enable `Use proxy` if you encounter CORS issues.
7. Unless you have specific need, do not alter the http method or headers.
8. If required, set authentication.
9. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Gauge`.
3. Set `Title = Berlin Temperature`.
4. Set `Header Text = Berlin Temp`.
5. Set `Minimum = -20`.
6. Set `Maximum = 45`.
7. Set `Precision = 1`.
8. Set `Unit Text = °C`.
9. Set `Value Path = weatherBerlin.current_weather.temperature`.
10. The `Unit Path` can be left empty since we have a static unit text.
11. The `Header Path` can also be left empty since we have a static header text.
12. Save.

Expected output: circular gauge with current temperature.

## Example 2: Wind Speed Gauge (Open-Meteo)

### Datasource Setup

Use the same datasource from Example 1 (`weatherBerlin`) or add a second one with a new city.

### Widget Setup

1. Add widget.
2. Set `Type = Gauge`.
3. Set `Title = Berlin Wind`.
4. Set `Header Text = Wind Speed`.
5. Set `Minimum = 0`.
6. Set `Maximum = 120`.
7. Set `Precision = 0`.
8. Set `Unit Text = km/h`.
9. Set `Value Path = weatherBerlin.current_weather.windspeed`.
10. The `Unit Path` can be left empty since we have a static unit text.
11. The `Header Path` can also be left empty since we have a static header text.
12. Save.

Expected output: circular gauge showing live wind speed.
