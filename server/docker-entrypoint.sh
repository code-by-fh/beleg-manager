#!/bin/sh
set -e
chown -R node:node /app/data
exec su-exec node "$@"
