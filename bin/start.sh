#!/bin/bash

# Define color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Define the log folder path and config path
LOG_FOLDER="$(dirname "$0")/../backend/log"
CONFIG_FILE="$(dirname "$0")/../backend/config.json"

# Load config
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Config file not found at $CONFIG_FILE${NC}"
    exit 1
fi

PROD_PORT=$(grep '"prod_port"' "$CONFIG_FILE" | grep -o '[0-9]*')
BETA_PORT=$(grep '"beta_port"' "$CONFIG_FILE" | grep -o '[0-9]*')

echo -e "${CYAN}Select an option:${NC}"
echo "1) Production server (port $PROD_PORT)"
echo "2) Beta server (port $BETA_PORT)"
echo "3) Both servers"
read -p "$(echo -e ${CYAN}Enter your choice [1/2/3]: ${NC})" CHOICE

SERVERS=()
if [[ "$CHOICE" == "1" || "$CHOICE" == "3" ]]; then
    SERVERS+=("$PROD_PORT:production")
fi
if [[ "$CHOICE" == "2" || "$CHOICE" == "3" ]]; then
    SERVERS+=("$BETA_PORT:beta")
fi

if [[ ${#SERVERS[@]} -eq 0 ]]; then
    echo -e "${RED}Invalid choice.${NC}"
    exit 1
fi

# Kill processes on necessary ports and setup log folder
for SERVER in "${SERVERS[@]}"; do
    PORT="${SERVER%%:*}"
    if lsof -i:$PORT > /dev/null; then
        echo -e "${RED}Port $PORT is currently in use.${NC}"
        echo -e "${YELLOW}Killing process on port $PORT...${NC}"
        lsof -ti:$PORT | xargs kill -9
        echo -e "${GREEN}Process on port $PORT has been terminated.${NC}"
    fi
done

# Setup log folder
if [ -d "$LOG_FOLDER" ]; then
    rm -f "$LOG_FOLDER"/*
    echo -e "${GREEN}All files in the log folder have been removed.${NC}"
else
    echo -e "${RED}Log folder does not exist.${NC}"
    echo -e "${YELLOW}Creating log folder...${NC}"
    cd "$(dirname "$0")/../backend" || exit
    mkdir -p "$LOG_FOLDER"
    echo -e "${GREEN}Log folder created.${NC}"
    cd - || exit
fi

# Start servers
for SERVER in "${SERVERS[@]}"; do
    PORT="${SERVER%%:*}"
    TYPE="${SERVER##*:}"
    URL="http://localhost:$PORT"
    
    echo -e "${GREEN}Starting $TYPE server...${NC}"
    
    if [[ "$TYPE" == "beta" ]]; then
        node backend/server.js --beta &
    else
        node backend/server.js &
    fi
    
    if command -v xdg-open > /dev/null; then
        xdg-open "$URL"
    elif command -v open > /dev/null; then
        open "$URL"
    else
        echo -e "${YELLOW}Please open $URL in your browser manually.${NC}"
    fi
done

echo -e "${CYAN}Type 'q' to quit all servers.${NC}"
while true; do
    read -r CMD
    if [[ "$CMD" == "q" ]]; then
        echo -e "${YELLOW}Quitting...${NC}"
        killall node
        break
    fi
done
