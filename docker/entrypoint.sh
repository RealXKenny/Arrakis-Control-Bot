#!/bin/sh
set -eu

cd /home/container
exec /bin/sh -c "${STARTUP:-cd /opt/arrakis && exec node dist/src/index.js}"
