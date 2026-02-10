# HTML Widget Examples

## Example 1: Plain Text Advice

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = adviceData`.
4. Set `URL = https://api.adviceslip.com/advice`.
5. Set `Refresh = 30` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = HTML`.
3. Set `Title = Advice`.
4. Set `Header Text = Daily Advice`.
5. Set `Render Mode = Plain Text (Safe)`.
6. Set `Height Blocks = 3`.
7. Set `HTML/Text Path = adviceData.slip.advice`.
8. Save.

Expected output: plain text advice sentence (no HTML interpretation).

## Example 2: Trusted HTML Status Snippet

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = statusSnippet`.
4. Set `URL = https://httpbin.org/anything?snippet=%3Cdiv%20style%3D%22padding%3A8px%3Bbackground%3A%2318242f%3Bcolor%3Awhite%3Bborder-radius%3A6px%3Bfont-weight%3A600%22%3EService%20Status%3A%20%3Cspan%20style%3D%22color%3A%234ade80%22%3EOK%3C%2Fspan%3E%3C%2Fdiv%3E`.
5. Set `Refresh = 60` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = HTML`.
3. Set `Title = Status Card`.
4. Set `Header Text = Health`.
5. Set `Render Mode = Trusted HTML`.
6. Set `Height Blocks = 2`.
7. Set `HTML/Text Path = statusSnippet.args.snippet`.
8. Save.

Expected output: styled HTML card rendered in the widget.

Use Trusted HTML only with content you control.

