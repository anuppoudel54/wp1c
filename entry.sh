#!/bin/bash

if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Running npm install..."
  npm install
fi

node app.js
exec "$@"