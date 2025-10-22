#!/bin/bash

CRYTEK="cryteksoft-gameapi"


echo "🛑 Stopping old PM2 processes if running..."
pm2 delete $CRYTEK 2>/dev/null

echo "🚀 Starting DayZ API Launcher Auto Update..."
pm2 start app.js --name "$CRYTEK"


echo "💾 Saving PM2 process list..."
pm2 save

echo "✅ System started with PM2!"

echo -e "\n📜 Opening logs for $CRYTEK...\n"
pm2 logs $CRYTEK
