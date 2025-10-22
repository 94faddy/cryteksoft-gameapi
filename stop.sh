#!/bin/bash

CRYTEK="cryteksoft-gameapi"

echo "🛑 Stopping DayZ API Launcher Auto Update..."

pm2 delete $CRYTEK 2>/dev/null

echo "✅ PM2 processes stopped."
