class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.players = {};
        this.avatars = {};
        this.myPlayerId = null;
        this.myPlayer = null;
        
        // Avatar image cache
        this.avatarImageCache = {};
        
        // Viewport system
        this.viewport = {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        };
        
        // WebSocket connection
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Movement state
        this.pressedKeys = new Set();
        this.movementKeys = {
            'ArrowUp': 'up',
            'ArrowDown': 'down',
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        // Removed collision detection - server handles this
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.setupKeyboardControls();
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to match the world dimensions
        this.canvas.width = this.worldWidth;
        this.canvas.height = this.worldHeight;
        
        // Set display size to fill the browser window
        this.canvas.style.width = '100vw';
        this.canvas.style.height = '100vh';
        
        // Initialize viewport
        this.viewport.width = this.canvas.width;
        this.viewport.height = this.canvas.height;
        
        // Disable image smoothing to maintain pixel-perfect rendering
        this.ctx.imageSmoothingEnabled = false;
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.drawWorldMap();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map image');
        };
        this.worldImage.src = 'world.jpg';
    }
    
    // Removed collision detection methods - server handles collision detection
    
    setupKeyboardControls() {
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
    }
    
    handleKeyDown(event) {
        // Only handle movement keys
        if (this.movementKeys[event.code]) {
            event.preventDefault(); // Prevent page scrolling
            
            // Add key to pressed keys set
            this.pressedKeys.add(event.code);
            
            // Send move command directly to server (let server handle collision)
            const direction = this.movementKeys[event.code];
            this.sendMoveCommand(direction);
        }
    }
    
    
    handleKeyUp(event) {
        // Only handle movement keys
        if (this.movementKeys[event.code]) {
            event.preventDefault(); // Prevent page scrolling
            
            // Remove key from pressed keys set
            this.pressedKeys.delete(event.code);
            
            // If no movement keys are pressed, send stop command
            if (this.pressedKeys.size === 0) {
                this.sendStopCommand();
            }
        }
    }
    
    sendMoveCommand(direction) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const moveMessage = {
                action: 'move',
                direction: direction
            };
            this.ws.send(JSON.stringify(moveMessage));
        }
    }
    
    sendStopCommand() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const stopMessage = {
                action: 'stop'
            };
            this.ws.send(JSON.stringify(stopMessage));
        }
    }
    
    drawWorldMap() {
        if (this.worldImage) {
            // Draw the world map at actual size, starting from the upper left corner
            // This ensures the coordinate system matches (0,0) at top-left
            this.ctx.drawImage(
                this.worldImage,
                0, 0, this.worldWidth, this.worldHeight,  // source rectangle
                0, 0, this.worldWidth, this.worldHeight   // destination rectangle
            );
        }
    }
    
    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.reconnectAttempts = 0;
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.attemptReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
            this.attemptReconnect();
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => {
                this.connectToServer();
            }, 2000 * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }
    
    joinGame() {
        const joinMessage = {
            action: 'join_game',
            username: 'Dawn'
        };
        
        this.ws.send(JSON.stringify(joinMessage));
    }
    
    handleServerMessage(message) {
        switch (message.action) {
            case 'join_game':
                this.handleJoinGameResponse(message);
                break;
            case 'player_joined':
                this.handlePlayerJoined(message);
                break;
            case 'players_moved':
                this.handlePlayersMoved(message);
                break;
            case 'player_left':
                this.handlePlayerLeft(message);
                break;
            default:
                console.log('Unknown message:', message);
        }
    }
    
    handleJoinGameResponse(message) {
        if (message.success) {
            this.myPlayerId = message.playerId;
            this.players = message.players;
            this.avatars = message.avatars;
            this.myPlayer = this.players[this.myPlayerId];
            
            
            // Preload all avatar images
            Object.values(this.avatars).forEach(avatar => {
                this.preloadAvatarImages(avatar);
            });
            
            console.log('Joined game successfully!', {
                playerId: this.myPlayerId,
                position: { x: this.myPlayer.x, y: this.myPlayer.y },
                totalPlayers: Object.keys(this.players).length
            });
            
            this.centerViewportOnPlayer();
            this.startRenderLoop();
        } else {
            console.error('Failed to join game:', message.error);
        }
    }
    
    handlePlayerJoined(message) {
        this.players[message.player.id] = message.player;
        this.avatars[message.avatar.name] = message.avatar;
        this.preloadAvatarImages(message.avatar);
        console.log('Player joined:', message.player.username);
    }
    
    handlePlayersMoved(message) {
        Object.assign(this.players, message.players);
        
        // Update viewport to follow our player if they moved
        if (this.myPlayerId && message.players[this.myPlayerId]) {
            this.myPlayer = message.players[this.myPlayerId];
            this.centerViewportOnPlayer();
        }
    }
    
    
    handlePlayerLeft(message) {
        delete this.players[message.playerId];
        console.log('Player left:', message.playerId);
    }
    
    centerViewportOnPlayer() {
        if (this.myPlayer) {
            // Center the viewport on the player
            this.viewport.x = this.myPlayer.x - this.viewport.width / 2;
            this.viewport.y = this.myPlayer.y - this.viewport.height / 2;
            
            // Clamp viewport to world boundaries
            this.clampViewportToWorld();
        }
    }
    
    clampViewportToWorld() {
        this.viewport.x = Math.max(0, Math.min(this.viewport.x, this.worldWidth - this.viewport.width));
        this.viewport.y = Math.max(0, Math.min(this.viewport.y, this.worldHeight - this.viewport.height));
    }
    
    startRenderLoop() {
        const render = () => {
            this.render();
            requestAnimationFrame(render);
        };
        render();
    }
    
    render() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw world map with viewport offset
        this.drawWorldMapWithViewport();
        
        // Draw all players
        this.drawPlayers();
    }
    
    drawWorldMapWithViewport() {
        if (this.worldImage) {
            this.ctx.drawImage(
                this.worldImage,
                this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height,  // source rectangle
                0, 0, this.viewport.width, this.viewport.height  // destination rectangle
            );
        }
    }
    
    drawPlayers() {
        Object.values(this.players).forEach(player => {
            this.drawPlayer(player);
        });
    }
    
    preloadAvatarImages(avatar) {
        if (!avatar || !avatar.frames) return;
        
        Object.keys(avatar.frames).forEach(direction => {
            avatar.frames[direction].forEach((frameData, frameIndex) => {
                const cacheKey = `${avatar.name}_${direction}_${frameIndex}`;
                if (!this.avatarImageCache[cacheKey]) {
                    const img = new Image();
                    img.onload = () => {
                        // Store the image with its natural dimensions
                        this.avatarImageCache[cacheKey] = {
                            image: img,
                            width: img.naturalWidth,
                            height: img.naturalHeight
                        };
                    };
                    img.src = frameData;
                }
            });
        });
    }
    
    drawPlayer(player) {
        const avatar = this.avatars[player.avatar];
        if (!avatar) return;
        
        // Convert world coordinates to screen coordinates
        const screenX = player.x - this.viewport.x;
        const screenY = player.y - this.viewport.y;
        
        // Check if player is visible in viewport
        if (screenX < -50 || screenX > this.viewport.width + 50 || 
            screenY < -50 || screenY > this.viewport.height + 50) {
            return;
        }
        
        // Get the appropriate frame based on facing direction and animation frame
        const frameData = this.getAvatarFrame(avatar, player.facing, player.animationFrame);
        if (!frameData) return;
        
        // Get cached image
        const cacheKey = `${avatar.name}_${player.facing}_${player.animationFrame || 0}`;
        const cachedData = this.avatarImageCache[cacheKey];
        
        if (cachedData && cachedData.image) {
            const img = cachedData.image;
            const naturalWidth = cachedData.width;
            const naturalHeight = cachedData.height;
            
            // Calculate avatar size maintaining aspect ratio
            const baseHeight = 128;
            const aspectRatio = naturalWidth / naturalHeight;
            const displayWidth = baseHeight * aspectRatio;
            const displayHeight = baseHeight;
            
            const drawX = screenX - displayWidth / 2;
            const drawY = screenY - displayHeight / 2;
            
            // Handle west direction by flipping horizontally
            if (player.facing === 'west') {
                this.ctx.save();
                this.ctx.scale(-1, 1);
                this.ctx.drawImage(img, -drawX - displayWidth, drawY, displayWidth, displayHeight);
                this.ctx.restore();
            } else {
                this.ctx.drawImage(img, drawX, drawY, displayWidth, displayHeight);
            }
            
            this.drawPlayerLabel(player, screenX, screenY - displayHeight / 2 - 5);
        }
    }
    
    getAvatarFrame(avatar, facing, animationFrame) {
        if (!avatar.frames) return null;
        
        // For west direction, use east frames (will be flipped in rendering)
        const direction = facing === 'west' ? 'east' : facing;
        
        if (!avatar.frames[direction]) return null;
        
        const frames = avatar.frames[direction];
        const frameIndex = Math.min(animationFrame || 0, frames.length - 1);
        return frames[frameIndex];
    }
    
    drawPlayerLabel(player, x, y) {
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        // Show username and short player ID to distinguish duplicates
        const shortId = player.id.substring(0, 4);
        const labelText = `${player.username} (${shortId})`;
        
        // Draw text with outline
        this.ctx.strokeText(labelText, x, y);
        this.ctx.fillText(labelText, x, y);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
