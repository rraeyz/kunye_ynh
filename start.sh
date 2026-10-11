#!/bin/bash

echo "🚀 Künye - Quick Start"
echo "===================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed."
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Docker Compose: yeni "docker compose" eklentisi veya eski "docker-compose" komutu
if docker compose version &> /dev/null; then
    DC="docker compose"
elif command -v docker-compose &> /dev/null; then
    DC="docker-compose"
else
    echo "❌ Docker Compose is not installed."
    echo "Please install Docker Compose first: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Kurulum sihirbazının ayarlarını yazacağı dosya (yoksa Docker klasör olarak oluşturur)
touch .env

# Build and start containers
echo "🏗️  Building Docker image..."
$DC build

echo ""
echo "🚀 Starting application..."
$DC up -d

echo ""
echo "⏳ Waiting for application to start..."
for i in $(seq 1 60); do
    curl -sf http://localhost:${PORT:-3000}/api/health > /dev/null 2>&1 && break
    sleep 2
done

# Check if container is running
if [ "$(docker ps -q -f name=personal-linktree)" ]; then
    echo ""
    echo "✅ Application is running!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Open your browser and visit: http://localhost:3000/setup"
    echo "   2. Complete the initial setup wizard"
    echo "   3. Login at: http://localhost:3000/admin/login"
    echo ""
    echo "📖 Useful commands:"
    echo "   View logs:    $DC logs -f"
    echo "   Stop app:     $DC down"
    echo "   Restart app:  $DC restart"
    echo ""
else
    echo ""
    echo "❌ Failed to start application"
    echo "   Check logs: $DC logs"
    exit 1
fi
