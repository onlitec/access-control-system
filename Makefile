SHELL := /bin/bash
COMPOSE := docker compose -f docker-compose.yml

.PHONY: build up down ps logs health smoke e2e-admin backend-contract regression release-gate backup-verify collect-security-metrics-snapshot prune-security-metrics-snapshots

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=150

health:
	$(COMPOSE) ps
	curl -k -sS https://127.0.0.1:8443/api/health | cat

smoke:
	./scripts/smoke-test.sh

e2e-admin:
	./scripts/e2e-admin.sh

backend-contract:
	./scripts/backend-contract-test.sh

regression:
	./scripts/regression-suite.sh

release-gate:
	./scripts/release-gate.sh

backup-verify:
	./scripts/backup-verify.sh

collect-security-metrics-snapshot:
	./scripts/collect-security-metrics-snapshot.sh

prune-security-metrics-snapshots:
	./scripts/prune-security-metrics-snapshots.sh
