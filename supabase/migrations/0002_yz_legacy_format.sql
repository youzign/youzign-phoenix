-- Some later v3 designs (2020-2025 era) carry JSON {"canvasData":...} in
-- designstring instead of the classic XML. The app can only import XML for
-- now, so expose the format to the client and let the UI disable JSON rows
-- up front instead of failing at import time.
alter table public.yz_legacy_designs
  add column if not exists format text not null default 'xml';

update public.yz_legacy_designs
  set format = 'json'
  where designstring like '{%' and format <> 'json';
