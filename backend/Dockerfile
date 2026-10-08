FROM golang:1.21-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum* ./

# Download dependencies
RUN go mod download || true

# Copy source code
COPY . .

# Build the application
RUN go build -o server ./cmd/server

# Expose port
EXPOSE 8080

# Run the server
CMD ["./server", "-port", "8080"]
