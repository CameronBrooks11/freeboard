# Picture Widget Examples

## Example 1: Random Dog Image

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = dogImage`.
4. Set `URL = https://dog.ceo/api/breeds/image/random`.
5. Set `Refresh = 15` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Picture`.
3. Set `Title = Dog Cam`.
4. Set `Header Text = Random Dog`.
5. Set `Fit Mode = Cover`.
6. Set `Refresh Every = 0` (datasource drives refresh).
7. Set `Image URL Path = dogImage.message`.
8. Save.

Expected output: a new random dog image each datasource refresh.

## Example 2: Random Cat Image

### Datasource Setup

1. Add datasource.
2. Set `Type = JSON`.
3. Set `Title = catImage`.
4. Set `URL = https://api.thecatapi.com/v1/images/search`.
5. Set `Refresh = 20` seconds.
6. Save.

### Widget Setup

1. Add widget.
2. Set `Type = Picture`.
3. Set `Title = Cat Cam`.
4. Set `Header Text = Random Cat`.
5. Set `Fit Mode = Contain`.
6. Set `Image URL Path = catImage[0].url`.
7. Set `Alt Text Path = catImage[0].id`.
8. Save.

Expected output: random cat image with centered containment fit.

