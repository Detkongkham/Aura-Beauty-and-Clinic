#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# devstack — Postgres 16 + Redis ແບບ project-local (ຢູ່ໃນ abcp/.devstack/).
# ບໍ່ໃຊ້ Docker, ບໍ່ໃຊ້ Homebrew, ບໍ່ຕ້ອງ sudo. ທຸກຢ່າງ relocatable ຢູ່ໃນ repo.
#
#   scripts/devstack.sh setup     # download + extract + initdb + ສ້າງ role/db
#   scripts/devstack.sh start     # ເລີ່ມ pg + redis (background)
#   scripts/devstack.sh stop
#   scripts/devstack.sh status
#   scripts/devstack.sh psql      # psql ເຂົ້າ db abcp
#   scripts/devstack.sh reset     # ລຶບ data cluster ແລ້ວ init ໃໝ່
#   scripts/devstack.sh backup    # pg_dump → .devstack/backups (ຫຼື \$BACKUP_DIR)
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DS="$ROOT/.devstack"
PGHOME="$DS/pgsql"
PGDATA="$DS/data/pgdata"
REDIS_HOME="$DS/redis"
RUN="$DS/run"
LOG="$DS/log"

PG_VERSION="16.15.0"
REDIS_VERSION="7.4.2"
PG_ARCH="$(uname -m | sed 's/arm64/aarch64/;s/x86_64/x86_64/')-apple-darwin"
PG_TGZ_URL="https://github.com/theseus-rs/postgresql-binaries/releases/download/${PG_VERSION}/postgresql-${PG_VERSION}-${PG_ARCH}.tar.gz"
REDIS_SRC_URL="https://download.redis.io/releases/redis-${REDIS_VERSION}.tar.gz"

DB_USER="${POSTGRES_USER:-abcp}"
DB_PASS="${POSTGRES_PASSWORD:-abcp_dev_pw}"
DB_NAME="${POSTGRES_DB:-abcp}"
DB_TEST="${DB_NAME}_test"
PGPORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

export PGHOST="127.0.0.1"
export PGPORT
export PGUSER="$DB_USER"

pg()    { "$PGHOME/bin/$1" "${@:2}"; }
have()  { command -v "$1" >/dev/null 2>&1; }

mkdirs() { mkdir -p "$DS" "$RUN" "$LOG" "$DS/data"; }

download_pg() {
  [ -x "$PGHOME/bin/postgres" ] && [ -x "$PGHOME/bin/psql" ] && { echo "• postgres binaries ມີແລ້ວ"; return; }
  echo "==> ດາວໂຫລດ PostgreSQL ${PG_VERSION} (${PG_ARCH})"
  local tgz="$DS/pg.tar.gz"
  curl -fL --retry 3 -o "$tgz" "$PG_TGZ_URL"
  rm -rf "$PGHOME"; mkdir -p "$PGHOME"
  # theseus-rs archive มี top-level dir 1 ຊັ້ນ
  tar -xzf "$tgz" -C "$PGHOME" --strip-components 1
  rm -f "$tgz"
  echo "   ✔ $("$PGHOME/bin/postgres" --version)"
}

build_redis() {
  [ -x "$REDIS_HOME/bin/redis-server" ] && { echo "• redis-server ມີແລ້ວ"; return; }
  echo "==> build Redis ${REDIS_VERSION} ຈາກ source (~1–2 ນາທີ)"
  local tgz="$DS/redis.tar.gz" src="$DS/redis-src"
  curl -fL --retry 3 -o "$tgz" "$REDIS_SRC_URL"
  rm -rf "$src"; mkdir -p "$src"
  tar -xzf "$tgz" -C "$src" --strip-components 1
  make -C "$src" -j"$(sysctl -n hw.ncpu)" MALLOC=libc BUILD_TLS=no >/dev/null
  make -C "$src" PREFIX="$REDIS_HOME" install >/dev/null
  rm -rf "$tgz" "$src"
  echo "   ✔ $("$REDIS_HOME/bin/redis-server" --version | cut -d' ' -f1-3)"
}

write_redis_conf() {
  cat > "$DS/redis.conf" <<EOF
bind 127.0.0.1
port ${REDIS_PORT}
daemonize yes
pidfile ${RUN}/redis.pid
dir ${DS}/data
logfile ${LOG}/redis.log
appendonly yes
EOF
}

init_cluster() {
  if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "==> initdb → $PGDATA"
    mkdir -p "$PGDATA"
    pg initdb -D "$PGDATA" -U "$DB_USER" -E UTF8 --locale=C \
      --auth-local=trust --auth-host=trust >/dev/null
    {
      echo "unix_socket_directories = '${RUN}'"
      echo "listen_addresses = '127.0.0.1'"
      echo "port = ${PGPORT}"
      echo "log_min_messages = warning"
    } >> "$PGDATA/postgresql.conf"
  fi
}

pg_running() { pg pg_ctl -D "$PGDATA" status >/dev/null 2>&1; }

start_pg() {
  pg_running && { echo "• postgres ແລ່ນຢູ່ແລ້ວ"; return; }
  echo "==> start postgres :$PGPORT"
  pg pg_ctl -D "$PGDATA" -l "$LOG/postgres.log" -w start >/dev/null
}

start_redis() {
  if "$REDIS_HOME/bin/redis-cli" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo "• redis ແລ່ນຢູ່ແລ້ວ"; return
  fi
  echo "==> start redis :$REDIS_PORT"
  "$REDIS_HOME/bin/redis-server" "$DS/redis.conf"
}

ensure_roles() {
  pg psql -d postgres -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' SUPERUSER CREATEDB;
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}' SUPERUSER CREATEDB;
  END IF;
END \$\$;
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${DB_NAME}')\gexec
SELECT 'CREATE DATABASE ${DB_TEST} OWNER ${DB_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${DB_TEST}')\gexec
SQL
}

cmd_setup() {
  mkdirs
  have unzip || { echo "❌ ຕ້ອງມີ 'unzip'"; exit 1; }
  download_pg
  build_redis
  write_redis_conf
  init_cluster
  start_pg
  ensure_roles
  start_redis
  echo
  echo "✅ devstack ພ້ອມ."
  echo "   DATABASE_URL = postgresql://${DB_USER}:${DB_PASS}@localhost:${PGPORT}/${DB_NAME}?schema=public"
  echo "   REDIS_URL    = redis://localhost:${REDIS_PORT}"
}

cmd_start()  { mkdirs; write_redis_conf; init_cluster; start_pg; start_redis; cmd_status; }

cmd_stop() {
  if pg_running; then echo "==> stop postgres"; pg pg_ctl -D "$PGDATA" -m fast -w stop >/dev/null || true; fi
  if [ -f "$RUN/redis.pid" ] && kill -0 "$(cat "$RUN/redis.pid")" 2>/dev/null; then
    echo "==> stop redis"; "$REDIS_HOME/bin/redis-cli" -p "$REDIS_PORT" shutdown nosave 2>/dev/null || kill "$(cat "$RUN/redis.pid")"
  fi
  echo "✔ stopped"
}

cmd_status() {
  printf 'postgres : '; pg pg_isready -q && echo "up (:$PGPORT)" || echo "down"
  printf 'redis    : '; "$REDIS_HOME/bin/redis-cli" -p "$REDIS_PORT" ping 2>/dev/null || echo "down"
}

cmd_psql()  { exec pg psql "postgresql://${DB_USER}:${DB_PASS}@localhost:${PGPORT}/${DB_NAME}"; }

cmd_reset() {
  cmd_stop || true
  echo "==> ລຶບ $PGDATA"
  rm -rf "$PGDATA"
  init_cluster; start_pg; ensure_roles
  echo "✔ cluster ໃໝ່ພ້ອມ (ຕ້ອງ run: pnpm --filter @abcp/backend db:migrate && db:seed)"
}

# backup: pg_dump (custom format) → $BACKUP_DIR (default .devstack/backups), ເກັບ 14 ໄຟລ໌ຫຼ້າສຸດ.
# /portal system status ອ່ານໄຟລ໌ໃໝ່ສຸດຈາກ BACKUP_DIR ຂອງ backend. ຕັ້ງ cron: 0 2 * * * scripts/devstack.sh backup
cmd_backup() {
  local dir="${BACKUP_DIR:-$DS/backups}"
  mkdir -p "$dir"
  local file="$dir/${DB_NAME}-$(date +%Y%m%d-%H%M%S).dump"
  pg pg_dump -Fc -f "$file" "postgresql://${DB_USER}:${DB_PASS}@localhost:${PGPORT}/${DB_NAME}"
  ls -1t "$dir"/*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
  echo "✔ backup: $file ($(du -h "$file" | cut -f1))"
}

case "${1:-}" in
  setup)  cmd_setup ;;
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  psql)   cmd_psql ;;
  reset)  cmd_reset ;;
  backup) cmd_backup ;;
  *) echo "ໃຊ້: $0 {setup|start|stop|status|psql|reset|backup}"; exit 1 ;;
esac
