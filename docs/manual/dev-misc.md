# Dev Misc

## RPi Mongo Images

- [github.com/themattman/mongodb-raspberrypi-docker](https://github.com/themattman/mongodb-raspberrypi-docker)
- [github.com/themattman/mongodb-raspberrypi-binaries](https://github.com/themattman/mongodb-raspberrypi-binaries)

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

Count lines of code for all files tracked by Git (automatically ignores anything in `.gitignore`):

```bash
cloc --vcs=git
```

Alternatively, for non-Git projects, create a `cloc.exclude` file with one directory or file pattern per line and run:

```bash
cloc . --exclude-list-file=cloc.exclude
```

### Last Run: 2025-08-09 19:26EST

```shell
162 text files.
152 unique files.
11 files ignored.

github.com/AlDanial/cloc v 2.06  T=1.05 s (144.9 files/s, 22019.7 lines/s)
-------------------------------------------------------------------------------
Language                     files          blank        comment           code
-------------------------------------------------------------------------------
JSON                             6              0              0          12347
JavaScript                      47            442           1593           2735
Vuejs Component                 34            313            510           1893
CSS                             32            160             23           1210
Markdown                        15            277              0            762
YAML                             8             71              7            582
Bourne Shell                     2             11              3             35
Dockerfile                       3             24             27             22
INI                              2              2              0             17
Jinja Template                   1              2              0             14
HTML                             1              0              3             13
Text                             1              0              0              2
-------------------------------------------------------------------------------
SUM:                           152           1302           2166          19632
-------------------------------------------------------------------------------
```
