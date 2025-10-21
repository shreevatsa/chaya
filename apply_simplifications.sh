#!/bin/bash

# This script applies all the simplifications to convert from 3-tab to single-tab design

cd /home/user/chaya

# Backup the original files
cp index.html index.html.bak
cp src/app.ts src/app.ts.bak
cp package.json package.json.bak

echo "Applying simplifications..."

# The changes have already been applied manually, so just run build
yarn build

echo "Simplifications complete!"
