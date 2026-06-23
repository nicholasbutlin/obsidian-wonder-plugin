# [1.8.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.7.0...1.8.0) (2026-06-23)


### Features

* edit diagrams in place, snippet palette, pan/zoom, .mermaid files ([7794f77](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/7794f77c4ea9f37028b8efc41757ffa7500fa814))

# [1.7.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.6.1...1.7.0) (2026-06-23)


### Features

* add live Mermaid editor and CDN-based rendering ([3919440](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/39194400fac17c060ebab36a7385682d3d755deb))

## [1.6.1](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.6.0...1.6.1) (2026-06-23)


### Bug Fixes

* remove created date and block ID from action-captured tasks ([efa5271](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/efa527108ce36f874d44a4abbb28d86377ab3867))

# [1.6.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.5.3...1.6.0) (2026-06-18)


### Features

* add Refresh Context command for the daily note (F3) ([8922431](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/892243113be327a858f84411ef4dd5dcce115340))

## [1.5.3](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.5.2...1.5.3) (2026-06-18)


### Bug Fixes

* refresh Kanban board without rebuildView (which blanked the board) ([ebef4a7](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/ebef4a743f08febdac91abd9c2dc0f9c7fb572b5))

## [1.5.2](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.5.1...1.5.2) (2026-06-18)


### Bug Fixes

* rebuild the Kanban leaf after reconcile so the stale date clears ([22e545e](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/22e545e480ad06da1b7c5d33ebdb5876d655377e))

## [1.5.1](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.5.0...1.5.1) (2026-06-18)


### Bug Fixes

* keep a trailing space after a multi-line card's date so Kanban renders it ([402e385](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/402e385029ef9a4bc560a26ee0dd36c0fb779a2f))

# [1.5.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.4.1...1.5.0) (2026-06-18)


### Features

* capture [@action](https://github.com/action) as a canonical Tasks line on the board ([2b7ec26](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/2b7ec267b794790e8bc93f870c015ef88a54ec97))
* separate date-reconcile and action-capture debounces ([f110f18](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/f110f18439c648343562658023f0f6b8c5f3885e))

## [1.4.1](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.4.0...1.4.1) (2026-06-17)


### Bug Fixes

* route board vs note when the debounce fires, not at event time ([85e4a03](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/85e4a03db7821e43b376ef4bb775c93145f25512))

# [1.4.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.3.0...1.4.0) (2026-06-17)


### Features

* re-render open Kanban board after normalizing its dates ([6399526](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/6399526f635d361651db10a25f420478d16e26fd))

# [1.3.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.2.0...1.3.0) (2026-06-17)


### Features

* place normalized Kanban dates on the card's main line ([3e9b084](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/3e9b084acedc9d45e9102ac2986b089bf310c192))

# [1.2.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.1.0...1.2.0) (2026-06-17)


### Features

* reconcile re-picked Kanban dates to a single due date ([ef9c55f](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/ef9c55f683016a9445bc5c5da9bd8a7c217b0ba0))

# [1.1.0](https://github.com/nicholasbutlin/obsidian-wonder-plugin/compare/1.0.0...1.1.0) (2026-06-17)


### Features

* normalize Kanban dates to Tasks emoji format ([2b38db9](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/2b38db994defa2cf767105521f85205151f50292))

# 1.0.0 (2026-06-15)


### Bug Fixes

* prevent note corruption when Kanban file lacks a ToDo heading ([4f5e2ea](https://github.com/nicholasbutlin/obsidian-wonder-plugin/commit/4f5e2ea95bcb2da5d1506dd6ff073e429ba4abe6))
