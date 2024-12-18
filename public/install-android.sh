#!/data/data/com.termux/files/usr/bin/bash

# Error handling
set -e
trap 'echo "Error: Installation failed. Please check your internet connection and try again."; exit 1' ERR

# Print colorful messages
print_step() {
    echo -e "\033[1;34m===> $1\033[0m"
}

print_success() {
    echo -e "\033[1;32m===> $1\033[0m"
}

# Check if running in Termux
if [ ! -d "/data/data/com.termux" ]; then
    echo "Error: This script must be run in Termux"
    exit 1
fi

# Update package repositories
print_step "Updating package repositories..."
pkg update -y

# Install required packages
print_step "Installing required packages..."
pkg install -y nodejs git termux-api termux-services

# Create app directory
print_step "Creating app directory..."
mkdir -p ~/vidchatbox
cd ~/vidchatbox

# Clone the repository (vercel branch)
print_step "Downloading VidChatBox..."
if [ -d ".git" ]; then
    git fetch
    git checkout vercel
    git pull origin vercel
else
    git clone -b vercel https://github.com/Alihkhawaher/vidchatbox.git .
fi

# Install dependencies
print_step "Installing Node.js dependencies..."
npm install

# Create autostart script
print_step "Setting up autostart..."
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-vidchatbox.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/vidchatbox
node server.js
EOF
chmod +x ~/.termux/boot/start-vidchatbox.sh

# Create convenient shortcut
mkdir -p ~/bin
cat > ~/bin/vidchatbox << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/vidchatbox

start_server() {
    if pgrep -f "node server.js" > /dev/null; then
        echo "Server is already running"
    else
        node server.js
    fi
}

stop_server() {
    if pgrep -f "node server.js" > /dev/null; then
        pkill -f "node server.js"
        echo "Server stopped"
    else
        echo "Server is not running"
    fi
}

case "$1" in
    "start")
        start_server
        ;;
    "stop")
        stop_server
        ;;
    "restart")
        stop_server
        sleep 2
        start_server
        ;;
    "status")
        if pgrep -f "node server.js" > /dev/null; then
            echo "Server is running"
        else
            echo "Server is not running"
        fi
        ;;
    *)
        echo "Usage: vidchatbox [start|stop|restart|status]"
        ;;
esac
EOF
chmod +x ~/bin/vidchatbox

# Create widget script for launcher icon
print_step "Creating launcher icon script..."
mkdir -p ~/.shortcuts
cat > ~/.shortcuts/VidChatBox.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash

# Function to start server if not running
ensure_server_running() {
    if ! pgrep -f "node server.js" > /dev/null; then
        cd ~/vidchatbox
        node server.js &
    fi
}

# Start server if not running
ensure_server_running

# Open in browser
termux-open-url "http://localhost:3005"
EOF
chmod +x ~/.shortcuts/VidChatBox.sh

print_success "Installation complete!"
echo ""
echo "To manage the server:"
echo "  vidchatbox start   - Start the server"
echo "  vidchatbox stop    - Stop the server"
echo "  vidchatbox restart - Restart the server"
echo "  vidchatbox status  - Check server status"
echo ""
echo "To create a home screen icon:"
echo "1. Install Termux:Widget from F-Droid"
echo "2. Add the Termux:Widget to your home screen"
echo "3. Select 'VidChatBox' from the widget list"
echo ""
echo "The server will automatically start when you:"
echo "- Open Termux"
echo "- Tap the home screen icon"
echo ""
echo "Access the app at: http://localhost:3005"

# Start the server
print_step "Starting the server..."
vidchatbox start
