# Sparkline Widget Examples

## Example 1: BTC Price Trend (Single Series)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = btcTicker`.
4. Set `URL = https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd`.
5. Set `Refresh = 15` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Sparkline`.
3. Set `Title = BTC Trend`.
4. Set `Header Text = BTC/USD`.
5. Set `History Length = 120`.
6. Set `Line Width = 2`.
7. Set `Scale Mode = Auto`.
8. Set `Value Path = btcTicker.bitcoin.usd`.
9. Leave `Series Paths` empty.
10. Save.

Expected output: one trend line showing recent BTC movement.

## Example 2: Temperature + Wind (Multi-Series)

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = weatherTrend`.
4. Set `URL = https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&current_weather=true`.
5. Set `Refresh = 30` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Sparkline`.
3. Set `Title = NYC Weather Trend`.
4. Set `Header Text = NYC`.
5. Set `History Length = 100`.
6. Set `Include Legend = true`.
7. Set `Legend Labels = Temp (C),Wind (km/h)`.
8. Set `Series Paths = weatherTrend.current_weather.temperature,weatherTrend.current_weather.windspeed`.
9. Set `Scale Mode = Auto`.
10. Save.

Expected output: two colored trend lines (temperature and wind speed).

