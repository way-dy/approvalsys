# 캐시 전략 (로딩 코드를 만지기 전에 읽을 것)

> 정본. 루트 `CLAUDE.md` 가 @import 한다.

### Caching strategy (load this before touching loading code)

Performance is built around a multi-layer cache. Before changing how data loads, understand all four layers — they interact:

1. **Firestore IndexedDB persistent cache** — enabled via `initializeFirestore(app, { localCache: persistentLocalCache() })`. Survives page reload.
2. **localStorage caches** — keys defined in `CACHE_KEYS` (`dy_meta_cache_v2`, `dy_drafts_cache_v2`, `dy_user_cache_v2`, `dy_last_tab_v2`) with TTLs in `CACHE_EXPIRY_*`. Used for instant first paint.
3. **In-memory** — `allFetchedData` (current list), `draftCache` (id → full draft), `filteredDisplayData` (post-filter view).
4. **Optimistic update protection** — `recentlyUpdatedDocIds` is a Set of doc IDs touched by the local user in the last ~10 seconds; background DB refreshes must not overwrite these from server data. Always honor it when merging server results.

Initial load flow (`initApp` → `loadMetaAndDraftsParallel`): show cached UI immediately → render from localStorage → only hit Firestore in the background if cache age > `BG_UPDATE_THRESHOLD` (2 min). `loadDraftsFromDB`는 두 쿼리를 `Promise.all`로 병렬 실행: (1) 전역 최신 `INITIAL_LIMIT = 50`건 from `drafts_index`, (2) `_fetchMyDraftsIndex(currentUser.email)`로 본인 기안 최대 200건. 두 결과를 `docId` 기준 dedup 머지해 `allFetchedData`에 채움 → "내가 올린 기안" 탭이 전역 50건 윈도우에서 밀려도 항상 본인 기안 전체 표시. 그 외에 `drafts_index`에 미인덱싱된 오래된 문서를 `drafts`에서 backfill하는 `_supplementFromDrafts`도 실행되며 누락 발견 시 `saveIndexDoc`로 self-heal.
