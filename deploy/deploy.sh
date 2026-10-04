#!/usr/bin/env bash
# Runs ON THE VPS (called by GitHub Actions over SSH, or by hand).
#   ./deploy.sh <tag> [--migrate]      deploy an image tag (a git SHA or "latest")
#   ./deploy.sh --rollback             go back to the previously deployed tag
# Expects, in this directory: docker-compose.prod.yml, .env, .env.api
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env"
CURRENT_FILE=.deployed_tag
PREVIOUS_FILE=.previous_tag

set -a; source .env; set +a

if [[ "${1:-}" == "--rollback" ]]; then
  [[ -f $PREVIOUS_FILE ]] || { echo "No previous tag recorded; nothing to roll back to." >&2; exit 1; }
  TAG=$(cat $PREVIOUS_FILE)
  MIGRATE=false
  echo "Rolling back to $TAG (the database is NOT rolled back)."
else
  TAG=${1:?usage: deploy.sh <tag> [--migrate] | --rollback}
  MIGRATE=false
  [[ "${2:-}" == "--migrate" ]] && MIGRATE=true
fi

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:?GHCR_USER is required with GHCR_TOKEN}" --password-stdin >/dev/null
fi

export TAG
echo "==> Pulling images for $TAG"
$COMPOSE pull api web

if $MIGRATE; then
  echo "==> Running database migrations (prisma migrate deploy)"
  $COMPOSE run --rm --no-deps api npx prisma migrate deploy
fi

echo "==> Starting containers"
$COMPOSE up -d --remove-orphans

echo "==> Waiting for the API health check"
for i in $(seq 1 30); do
  if $COMPOSE exec -T api node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    [[ -f $CURRENT_FILE && "$(cat $CURRENT_FILE)" != "$TAG" ]] && cp $CURRENT_FILE $PREVIOUS_FILE
    echo "$TAG" > $CURRENT_FILE
    docker image prune -f >/dev/null
    echo "==> Deployed $TAG"
    exit 0
  fi
  sleep 4
done

echo "!! API did not become healthy. Recent logs:" >&2
$COMPOSE logs --tail=80 api >&2
if [[ -f $CURRENT_FILE && "$(cat $CURRENT_FILE)" != "$TAG" ]]; then
  PREV=$(cat $CURRENT_FILE)
  echo "!! Restoring the previous version $PREV" >&2
  TAG=$PREV $COMPOSE up -d --remove-orphans
fi
exit 1
