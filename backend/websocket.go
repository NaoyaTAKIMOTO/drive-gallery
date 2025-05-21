package backend

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all connections by default.
		// TODO: Implement proper origin checking for security.
		return true
	},
}

// client represents a single WebSocket client.
type client struct {
	conn *websocket.Conn
	send chan []byte // Buffered channel of outbound messages.
}

// hub maintains the set of active clients and broadcasts messages to the clients.
type hub struct {
	clients    map[*client]bool   // Registered clients.
	broadcast  chan []byte        // Inbound messages from the clients.
	register   chan *client       // Register requests from the clients.
	unregister chan *client       // Unregister requests from clients.
}

var h = hub{
	broadcast:  make(chan []byte),
	register:   make(chan *client),
	unregister: make(chan *client),
	clients:    make(map[*client]bool),
}

func (h *hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			log.Println("Client registered")
		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				log.Println("Client unregistered")
			}
		case message := <-h.broadcast:
			log.Printf("Hub: Broadcasting message to %d clients: %s", len(h.clients), string(message))
			for client := range h.clients {
				select {
				case client.send <- message:
					log.Printf("Hub: Sent message to client %p", client)
				default:
					log.Printf("Hub: Failed to send message to client %p, closing connection.", client)
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

// ServeWs handles websocket requests from the peer.
func ServeWs(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Failed to upgrade to websocket:", err)
		return
	}
	client := &client{conn: conn, send: make(chan []byte, 256)}
	h.register <- client

	// Allow collection of memory referenced by the caller by doing all work in
	// new goroutines.
	go client.writePump()
	go client.readPump()

	log.Println("WebSocket connection established")
}

// readPump pumps messages from the websocket connection to the hub.
func (c *client) readPump() {
	defer func() {
		h.unregister <- c
		c.conn.Close()
	}()
	// Configure wait time for pong response, read limit, etc. if needed
	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		// For now, just log received messages.
		// Later, this could be used for client-to-server communication if needed.
		log.Printf("Received message from client: %s", string(message))
		// h.broadcast <- message // Example: Echo back to all clients
	}
}

// writePump pumps messages from the hub to the websocket connection.
func (c *client) writePump() {
	defer func() {
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := c.conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Printf("error writing message: %v", err)
				return
			}
		}
	}
}

// BroadcastMessage sends a message to all connected WebSocket clients.
// This function will be called by other parts of the backend (e.g., WebhookHandler)
// to notify clients of changes.
func BroadcastMessage(message []byte) {
	log.Printf("BroadcastMessage called with: %s", string(message))
	if h.broadcast == nil {
		log.Println("Error: Hub broadcast channel is nil!")
		return
	}
	h.broadcast <- message
	log.Println("BroadcastMessage: Message sent to hub broadcast channel.")
}

// InitHub starts the WebSocket hub. This should be called once during application startup.
func InitHub() {
	go h.run()
	log.Println("WebSocket hub initialized")
}
