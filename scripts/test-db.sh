#!/usr/bin/env bash
# Yerel, geçici bir PostgreSQL kümesinde migration'ları ve RLS testlerini çalıştırır.
# Gereksinim: PostgreSQL 15+ (initdb, pg_ctl, psql). Supabase hesabı gerekmez.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="$(mktemp -d)/pg"
PORT="${PGPORT:-55432}"
LOG="$DATA.log"

cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$(dirname "$DATA")"; }
RUN=""
trap cleanup EXIT

if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown -R postgres "$(dirname "$DATA")"; else RUN=""; fi
$RUN "$PGBIN/initdb" -D "$DATA" -U postgres -A trust -E UTF8 --locale=C >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$LOG" -w start >/dev/null

PSQL=(psql -h /tmp -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -c "create database gidero_test" >/dev/null
DB=(-d gidero_test)

"${PSQL[@]}" "${DB[@]}" -f "$ROOT/supabase/tests/local/00_supabase_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  "${PSQL[@]}" "${DB[@]}" -f "$f"
done
for f in "$ROOT"/supabase/tests/local/[1-9]*.sql; do
  echo "test: $(basename "$f")"
  "${PSQL[@]}" "${DB[@]}" -f "$f" 2>&1 | sed -n 's/^.*NOTICE:  //p; /BAŞARISIZ\|ERROR/p; /TEST.* GEÇTİ$/p'
  test "${PIPESTATUS[0]}" -eq 0
done
