# Dev Misc

## Measuring Codebase Size

### Install `cloc`

#### Cross-platform (requires Perl)

```bash
npm install -g cloc
```

> Note: The npm package requires Perl. On Windows, this often fails unless Perl is installed.

#### Windows (standalone binary)

```sh
winget install AlDanial.cloc
```

> This installs a self-contained `.exe` that does not require Perl. If you previously installed `cloc` via npm, remove it so the `.exe` is used:

```bash
npm uninstall -g cloc
```

### Run `cloc` Ignoring `.gitignore` Entries

Count lines of code for all tracked files, respecting `.gitignore`:

```bash
git ls-files | cloc --stdin-name=all
```

Alternatively, have `cloc` read patterns from `.gitignore` (basic matching only, no negations):

```bash
cloc . --exclude-list-file=.gitignore
```

### Examples

Count everything except `node_modules` and `db` directories:

```bash
cloc . --exclude-dir=node_modules,db
```

### Last Run: 2025-08-09 17:30

```shell
142 text files.
133 unique files.
12 files ignored.

github.com/AlDanial/cloc v 2.06  T=1.35 s (98.4 files/s, 9689.5 lines/s)
-------------------------------------------------------------------------------
Language                     files          blank        comment           code
-------------------------------------------------------------------------------
JSON                             5              0              0           5622
JavaScript                      43            290             37           2622
Vuejs Component                 34            277              0           2109
CSS                             32            160             23           1210
YAML                             6             57              2            518
Markdown                         4             18              0             49
Bourne Shell                     2             10              3             31
Dockerfile                       3              0              0             22
INI                              2              2              0             17
HTML                             1              0              0             13
Text                             1              0              0              2
-------------------------------------------------------------------------------
SUM:                           133            814             65          12215
-------------------------------------------------------------------------------
```
