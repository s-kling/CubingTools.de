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
TNOODLE_PORT=2014

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
TNOODLE_PID=""

start_tnoodle() {
    TNOODLE_JAR="$ROOT_DIR/bin/tnoodle.jar"

    if [ ! -f "$TNOODLE_JAR" ]; then
        echo -e "${YELLOW}No tnoodle.jar found in project root. Scramble generation will not work.${NC}"
        return
    fi

    if ! command -v java > /dev/null 2>&1; then
        echo -e "${YELLOW}Java not found. TNoodle requires Java to run.${NC}"
        return
    fi

    if lsof -i:"$TNOODLE_PORT" > /dev/null 2>&1; then
        echo -e "${YELLOW}TNoodle port $TNOODLE_PORT is already in use. Skipping TNoodle start.${NC}"
        return
    fi

    echo -e "${CYAN}Starting TNoodle server on port $TNOODLE_PORT...${NC}"
    java -jar "$TNOODLE_JAR" &>/dev/null &
    TNOODLE_PID=$!

    # Wait for TNoodle to become ready
    echo -ne "${CYAN}Waiting for TNoodle to be ready"
    for i in $(seq 1 30); do
        if curl -s -o /dev/null -w '' "http://localhost:$TNOODLE_PORT" 2>/dev/null; then
            echo -e "${NC}"
            echo -e "${GREEN}TNoodle started (PID: $TNOODLE_PID, port: $TNOODLE_PORT).${NC}"
            return
        fi
        if ! kill -0 "$TNOODLE_PID" 2>/dev/null; then
            echo -e "${NC}"
            echo -e "${RED}TNoodle process exited unexpectedly.${NC}"
            TNOODLE_PID=""
            return
        fi
        echo -n "."
        sleep 1
    done
    echo -e "${NC}"
    echo -e "${YELLOW}TNoodle started (PID: $TNOODLE_PID) but may not be ready yet.${NC}"
}

stop_tnoodle() {
    if [ -n "$TNOODLE_PID" ]; then
        echo -e "${CYAN}Stopping TNoodle (PID: $TNOODLE_PID)...${NC}"
        kill "$TNOODLE_PID" 2>/dev/null
        wait "$TNOODLE_PID" 2>/dev/null
        echo -e "${GREEN}TNoodle stopped.${NC}"
        TNOODLE_PID=""
    fi
}

start_server() {
    if lsof -i:"$PORT" > /dev/null 2>&1; then
        echo -e "${YELLOW}Port $PORT is in use. Killing existing process...${NC}"
        lsof -ti:"$PORT" | xargs kill -9 2>/dev/null
        sleep 0.3
    fi

    echo -e "${CYAN}Starting $TYPE server on port $PORT...${NC}"
    node "$ROOT_DIR/backend/server.js" $BETA_FLAG &
    SERVER_PID=$!

    echo -e "${GREEN}$TYPE server started (PID: $SERVER_PID, port: $PORT).${NC}"
}

stop_server() {
    if [ -n "$SERVER_PID" ]; then
        echo -e "${CYAN}Stopping $TYPE server (PID: $SERVER_PID)...${NC}"
        kill "$SERVER_PID" 2>/dev/null
        wait "$SERVER_PID" 2>/dev/null
        echo -e "${GREEN}$TYPE server stopped.${NC}"
        SERVER_PID=""
    fi
}

# ─── Start ──────────────────────────────────────────────────────

start_tnoodle
start_server

URL="http://localhost:$PORT"
if command -v open > /dev/null; then
    open "$URL"
elif command -v xdg-open > /dev/null; then
    xdg-open "$URL"
else
    echo -e "${YELLOW}Open $URL in your browser.${NC}"
fi

# ─── Control Loop ───────────────────────────────────────────────

echo -e "${CYAN}Commands: [r] restart all   [rn] restart node   [rt] restart tnoodle   [s] stop all   [sn] stop node   [st] stop tnoodle${NC}"
while true; do
    read -r CMD
    case "$CMD" in
        r)
            echo -e "${YELLOW}Restarting all servers...${NC}"
            stop_server
            stop_tnoodle
            start_tnoodle
            start_server
            echo -e "${CYAN}Commands: [r] restart all   [rn] restart node   [rt] restart tnoodle   [s] stop all   [sn] stop node   [st] stop tnoodle${NC}"
            ;;
        rn)
            echo -e "${YELLOW}Restarting $TYPE server...${NC}"
            stop_server
            start_server
            echo -e "${CYAN}Commands: [r] restart all   [rn] restart node   [rt] restart tnoodle   [s] stop all   [sn] stop node   [st] stop tnoodle${NC}"
            ;;
        rt)
            echo -e "${YELLOW}Restarting TNoodle server...${NC}"
            stop_tnoodle
            start_tnoodle
            echo -e "${CYAN}Commands: [r] restart all   [rn] restart node   [rt] restart tnoodle   [s] stop all   [sn] stop node   [st] stop tnoodle${NC}"
            ;;
        sn)
            echo -e "${YELLOW}Stopping $TYPE server...${NC}"
            stop_server
            echo -e "${CYAN}Commands: [r] restart all   [rn] restart node   [rt] restart tnoodle   [s] stop all   [sn] stop node   [st] stop tnoodle${NC}"
            ;;
        st)
            echo -e "${YELLOW}Stopping TNoodle server...${NC}"
            stop_tnoodle
            echo -e "${CYAN}Commands: [r] restart all   [rn] restart node   [rt] restart tnoodle   [s] stop all   [sn] stop node   [st] stop tnoodle${NC}"
            ;;
        s|q)
            echo -e "${YELLOW}Stopping all servers...${NC}"
            stop_server
            stop_tnoodle
            echo -e "${GREEN}All servers stopped.${NC}"
            break
            ;;
    esac
done
