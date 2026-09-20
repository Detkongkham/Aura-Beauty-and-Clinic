# Aura Beauty & Clinic Platform (`abcp`)

ລະບົບຈອງຄິວນັດໝາຍ ແລະ ຈັດການຄລີນິກ/ຮ້ານເສີມສວຍ (37 ໂມດູນ, multi-tenant, SaaS).

- ແຜນແມ່ບົດ: [implementation_plan.md](implementation_plan.md)
- ຄູ່ມື agent: [AGENT.md](AGENT.md)
- ADR: [docs/adr/](docs/adr/)

## Monorepo

| package | ໜ້າທີ່ |
|---------|--------|
| `packages/shared-types` | Zod schemas + enums — source of truth ຂອງ type |
| `packages/config-tsconfig` | tsconfig base/node/react |
| `packages/config-eslint` | eslint flat config base/node/react |
| `apps/backend` | Express + Prisma API ([README](apps/backend/README.md)) |

## ເລີ່ມ (Phase 0–1)

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env

pnpm db:setup                              # ຄັ້ງທຳອິດ: download Postgres 16 + build Redis ເຂົ້າ .devstack/
pnpm --filter @abcp/shared-types build
pnpm --filter @abcp/backend db:generate
pnpm --filter @abcp/backend db:migrate
pnpm --filter @abcp/backend db:seed
pnpm dev                                   # turbo run dev (predev ຈະ start .devstack ໃຫ້ອັດຕະໂນມັດ)
```

### Dev stack (project-local, ບໍ່ໃຊ້ Docker/Homebrew/sudo)

`scripts/devstack.sh` ຕິດຕັ້ງ **PostgreSQL 16 + Redis** ໄວ້ໃນ `abcp/.devstack/` (gitignored, ~100 MB).
Postgres = prebuilt binary ຈາກ [theseus-rs/postgresql-binaries](https://github.com/theseus-rs/postgresql-binaries);
Redis = build ຈາກ source. ບໍ່ແຕະ home dir, ບໍ່ຕ້ອງ sudo.

| ຄຳສັ່ງ | ເຮັດຫຍັງ |
|--------|----------|
| `pnpm db:setup` | download/build + initdb + ສ້າງ role `abcp` + db `abcp`/`abcp_test` + start |
| `pnpm db:up` / `pnpm db:down` | start / stop pg + redis (`pnpm dev` ຈະ up ໃຫ້ເອງ) |
| `pnpm db:status` | ກວດ pg + redis |
| `pnpm db:psql` | psql ເຂົ້າ db `abcp` |
| `bash scripts/devstack.sh reset` | ລຶບ data cluster ແລ້ວ init ໃໝ່ (ຕ້ອງ migrate+seed ຄືນ) |

> ບໍ່ auto-start ຕອນ login — ຫຼັງ reboot ໃຫ້ `pnpm db:up` (ຫຼືແຄ່ `pnpm dev`).
> Docker compose (`docker-compose.yml` / `pnpm docker:up`) ຍັງໃຊ້ໄດ້ຖ້າມີ Docker — CI ໃຊ້ service container.

## ກວດຄຸນນະພາບ

```bash
pnpm lint          # eslint ທຸກ package
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest (unit ບໍ່ຕ້ອງ DB; integration auth ຕ້ອງ pnpm db:up)
pnpm build         # turbo run build
```
