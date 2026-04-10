#!/bin/bash

# Define color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FOLDER="$ROOT_DIR/backend/log"
CONFIG_FILE="$ROOT_DIR/backend/config.json"
SECRET_DIR="$ROOT_DIR/backend/secret"
NODE_MODULES="$ROOT_DIR/node_modules"

# ─── Setup Check ────────────────────────────────────────────────

MISSING=()
SETUP_NEEDED=()

[ ! -f "$CONFIG_FILE" ]                           && MISSING+=("backend/config.json")
[ ! -d "$SECRET_DIR" ] || [ -z "$(ls -A "$SECRET_DIR" 2>/dev/null)" ] \
                                                  && MISSING+=("backend/secret/")
[ ! -f "$SECRET_DIR/service-account.json" ]       && MISSING+=("backend/secret/service-account.json")
[ ! -f "$SECRET_DIR/users.json" ]                 && MISSING+=("backend/secret/users.json")

[ ! -d "$NODE_MODULES" ]                          && SETUP_NEEDED+=("node_modules (run npm install)")
[ ! -d "$LOG_FOLDER" ]                            && SETUP_NEEDED+=("backend/log/ folder")

if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${RED}The following required files are missing and must be created manually:${NC}"
    for item in "${MISSING[@]}"; do
        echo -e "  ${RED}✗ $item${NC}"
    done
    exit 1
fi

if [ ${#SETUP_NEEDED[@]} -gt 0 ]; then
    echo -e "${YELLOW}Setup required:${NC}"
    for item in "${SETUP_NEEDED[@]}"; do
        echo -e "  ${YELLOW}• $item${NC}"
    done
    read -r -p "$(echo -e "${CYAN}Set up now? [y/N]: ${NC}")" SETUP_CHOICE
    if [[ "$SETUP_CHOICE" =~ ^[Yy]$ ]]; then
        if [ ! -d "$NODE_MODULES" ]; then
            echo -e "${CYAN}Running npm install...${NC}"
            cd "$ROOT_DIR" && npm install
            if [ $? -ne 0 ]; then
                echo -e "${RED}npm install failed.${NC}"
                exit 1
            fi
            echo -e "${GREEN}npm install completed.${NC}"
        fi
        if [ ! -d "$LOG_FOLDER" ]; then
            mkdir -p "$LOG_FOLDER"
            echo -e "${GREEN}Created backend/log/.${NC}"
        fi
    else
        echo -e "${YELLOW}Setup cancelled.${NC}"
        exit 0
    fi
fi

# ─── Load Config ────────────────────────────────────────────────

PROD_PORT=$(grep '"prod_port"' "$CONFIG_FILE" | grep -o '[0-9]*')
BETA_PORT=$(grep '"beta_port"' "$CONFIG_FILE" | grep -o '[0-9]*')

# ─── Server Selection ───────────────────────────────────────────

echo -e "${CYAN}Select a server to start:${NC}"
echo "1) Production (port $PROD_PORT)"
echo "2) Beta (port $BETA_PORT)"
read -r -p "$(echo -e "${CYAN}Enter your choice [1/2]: ${NC}")" CHOICE

case "$CHOICE" in
    1) PORT=$PROD_PORT; TYPE="production"; BETA_FLAG="" ;;
    2) PORT=$BETA_PORT; TYPE="beta";       BETA_FLAG="--beta" ;;
    *) echo -e "${RED}Invalid choice.${NC}"; exit 1 ;;
esac

# ─── Helpers ────────────────────────────────────────────────────

SERVER_PID=""

start_server() {
    if lsof -i:"$PORT" > /dev/null 2>&1; then
        echo -e "${YELLOW}Port $PORT is in use. Killing existing process...${NC}"
        lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
        sleep 0.3
    fi

    node "$ROOT_DIR/backend/server.js" $BETA_FLAG &
    SERVER_PID=$!

    echo -e "${GREEN}$TYPE server started (PID: $SERVER_PID, port: $PORT).${NC}"

    URL="http://localhost:$PORT"
    if command -v open > /dev/null; then
        open "$URL"
    elif command -v xdg-open > /dev/null; then
        xdg-open "$URL"
    else
        echo -e "${YELLOW}Open $URL in your browser.${NC}"
    fi
}

stop_server() {
    if [ -n "$SERVER_PID" ]; then
        kill "$SERVER_PID" 2>/dev/null
        wait "$SERVER_PID" 2>/dev/null
        SERVER_PID=""
    fi
}

# ─── Start ──────────────────────────────────────────────────────

start_server

# ─── Control Loop ───────────────────────────────────────────────

echo -e "${CYAN}Commands: [r] restart   [s] stop${NC}"
while true; do
    read -r CMD
    case "$CMD" in
        r)
            echo -e "${YELLOW}Restarting $TYPE server...${NC}"
            stop_server
            start_server
            echo -e "${CYAN}Commands: [r] restart   [s] stop${NC}"
            ;;
        s|q)
            echo -e "${YELLOW}Stopping $TYPE server...${NC}"
            stop_server
            echo -e "${GREEN}Server stopped.${NC}"
            break
            ;;
    esac
done
