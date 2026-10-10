FROM golang:1.21-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application (outside /app so the ./backend bind mount
# in docker-compose.yml cannot shadow the binary at runtime)
RUN go build -o /usr/local/bin/server ./cmd/server

# Expose port
EXPOSE 8080

# Run the server
CMD ["/usr/local/bin/server", "-port", "8080"]
