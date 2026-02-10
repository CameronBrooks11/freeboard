# Indicator Widget Examples

## Example 1: Day/Night Status (Open-Meteo)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = tokyoWeather`.
4. Set `URL = https://api.open-meteo.com/v1/forecast?latitude=35.6762&longitude=139.6503&current_weather=true`.
5. Set `Refresh = 60` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Indicator`.
3. Set `Title = Tokyo Daylight`.
4. Set `Header Text = Tokyo`.
5. Set `On Text = Day`.
6. Set `Off Text = Night`.
7. Set `On Color = #16a34a`.
8. Set `Off Color = #4b5563`.
9. Set `Value Path = tokyoWeather.current_weather.is_day`.
10. Save.

Expected output: green indicator during day, gray at night.

## Example 2: DST Active (WorldTimeAPI)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = nyTime`.
4. Set `URL = https://worldtimeapi.org/api/timezone/America/New_York`.
5. Set `Refresh = 300` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Indicator`.
3. Set `Title = New York DST`.
4. Set `Header Text = NY Time`.
5. Set `On Text = DST On`.
6. Set `Off Text = Standard Time`.
7. Set `On Color = #22c55e`.
8. Set `Off Color = #64748b`.
9. Set `Value Path = nyTime.dst`.
10. Save.

Expected output: shows if daylight saving time is active.
