# Pointer Widget Examples

## Example 1: Wind Direction (Berlin)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = berlinWind`.
4. Set `URL = https://api.open-meteo.com/v1/forecast?latitude=52.5200&longitude=13.4050&current_weather=true`.
5. Set `Refresh = 60` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Pointer`.
3. Set `Title = Berlin Wind Dir`.
4. Set `Header Text = Berlin`.
5. Set `Unit Text = °`.
6. Set `Angle Path = berlinWind.current_weather.winddirection`.
7. Set `Value Text Path = berlinWind.current_weather.winddirection`.
8. Save.

Expected output: compass pointer rotates to current wind direction.

## Example 2: Wind Direction (Sydney)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = sydneyWind`.
4. Set `URL = https://api.open-meteo.com/v1/forecast?latitude=-33.8688&longitude=151.2093&current_weather=true`.
5. Set `Refresh = 60` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Pointer`.
3. Set `Title = Sydney Wind Dir`.
4. Set `Header Text = Sydney`.
5. Set `Unit Text = °`.
6. Set `Angle Path = sydneyWind.current_weather.winddirection`.
7. Set `Value Text Path = sydneyWind.current_weather.winddirection`.
8. Save.

Expected output: live directional pointer for Sydney wind heading.

