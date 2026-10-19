#!/usr/bin/env bash
# Applies the migrations to a throwaway database and runs the RLS checks.
# Usage: supabase/tests/run.sh   (needs a local Postgres reachable with psql as the postgres user)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
db="kiwar_test_$$"
psql_cmd=(psql -v ON_ERROR_STOP=1 -q)
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then psql_cmd=(sudo -u postgres "${psql_cmd[@]}"); fi
"${psql_cmd[@]}" -c "create database $db"
trap '"${psql_cmd[@]}" -c "drop database if exists $db" >/dev/null' EXIT
"${psql_cmd[@]}" -d "$db" -f "$here/supabase_stub.sql" >/dev/null
for f in "$here"/../migrations/*.sql; do "${psql_cmd[@]}" -d "$db" -f "$f" >/dev/null; done
"${psql_cmd[@]}" -d "$db" -f "$here/rls_test.sql"
