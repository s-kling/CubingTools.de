#!/bin/bash

# Define color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Define the log folder path
LOG_FOLDER="$(dirname "$0")/../backend/log"

read -p "$(echo -e ${CYAN}Do you want to start the beta? [Y/n]: ${NC})" START_BETA
if [[ "$START_BETA" == "n" ]]; then
    # Check if port 443 is in use
    if lsof -i:443 > /dev/null; then
        echo -e "${RED}Port 8443 is currently in use.${NC}"
        echo -e "${YELLOW}Killing process on port 8443...${NC}"
        lsof -ti:8443 | xargs kill -9
        echo -e "${GREEN}Process on port 8443 has been terminated.${NC}"
    fi

    # Start the production server
    echo -e "${YELLOW}Starting production server...${NC}"

    # Check if the folder exists
    if [ -d "$LOG_FOLDER" ]; then
        # Remove all files in the log folder
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
    
    echo -e "${GREEN}Starting production server...${NC}"
    node backend/server.js
else
    # Check if port 8443 is in use
    if lsof -i:8443 > /dev/null; then
        echo -e "${RED}Port 8443 is currently in use.${NC}"
        echo -e "${YELLOW}Killing process on port 8443...${NC}"
        lsof -ti:8443 | xargs kill -9
        echo -e "${GREEN}Process on port 8443 has been terminated.${NC}"
    fi

    # Check if the folder exists
    if [ -d "$LOG_FOLDER" ]; then
        # Remove all files in the log folder
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

    echo -e "${GREEN}Starting beta server...${NC}"  
    node backend/server.js --beta
fi