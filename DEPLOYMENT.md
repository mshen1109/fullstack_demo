# Remote Deployment Guide

This guide explains how to deploy the optimized fullstack demo to various remote environments.

## Prerequisites

- Git repository: `https://github.com/mshen1109/reservation_grabber.git`
- Branch: `dev` (contains all optimizations)
- Docker and Docker Compose installed on remote server

## Deployment Options

### Option 1: Deploy to Cloud VM (AWS EC2, Google Cloud, DigitalOcean, etc.)

#### Step 1: Set up your VM

```bash
# SSH into your remote server
ssh user@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### Step 2: Clone and Deploy

```bash
# Clone the repository
git clone https://github.com/mshen1109/reservation_grabber.git
cd reservation_grabber/fullstack_demo

# Checkout dev branch
git checkout dev

# Start the application
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

#### Step 3: Configure Firewall

```bash
# Allow necessary ports
sudo ufw allow 5173/tcp  # Frontend
sudo ufw allow 3000/tcp  # Backend API
sudo ufw allow 16686/tcp # Jaeger UI (optional)
```

#### Step 4: Access Your Application

- Frontend: `http://your-server-ip:5173`
- Backend API: `http://your-server-ip:3000/api/tasks`
- Jaeger UI: `http://your-server-ip:16686`

---

### Option 2: Deploy to Render.com (Free Tier Available)

Render automatically detects Docker Compose and deploys all services.

#### Step 1: Create Render Account

1. Go to https://render.com
2. Sign up with GitHub
3. Authorize Render to access your repository

#### Step 2: Create New Service

1. Click "New +" → "Web Service"
2. Connect your GitHub repository: `mshen1109/reservation_grabber`
3. Select branch: `dev`
4. Root directory: `fullstack_demo`
5. Render will auto-detect `docker-compose.yml`

#### Step 3: Configure Services

Render will create separate services for each container. Configure:

**Backend Service:**
- Name: `fullstack-demo-backend`
- Environment: Docker
- Instance Type: Free
- Environment Variables:
  - `MONGO_URI`: (Render will provide MongoDB connection string)

**Frontend Service:**
- Name: `fullstack-demo-frontend`
- Environment: Docker
- Instance Type: Free

**MongoDB:**
- Use Render's managed MongoDB or external service like MongoDB Atlas

---

### Option 3: Deploy to Railway.app (Simple & Fast)

#### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

#### Step 2: Deploy

```bash
cd fullstack_demo
railway login
railway init
railway up
```

Railway will automatically detect Docker Compose and deploy all services.

---

### Option 4: Deploy to Fly.io

#### Step 1: Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
```

#### Step 2: Deploy

```bash
cd fullstack_demo
fly launch
fly deploy
```

---

### Option 5: Deploy to Your Own Server with Docker Swarm

For production-grade deployment with load balancing and scaling:

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml fullstack-demo

# Check services
docker service ls

# Scale services
docker service scale fullstack-demo_backend=3
```

---

## Production Considerations

### Environment Variables

Create a `.env` file in `fullstack_demo/` directory:

```bash
# Production settings
NODE_ENV=production
MONGO_URI=mongodb://your-production-mongodb:27017/tasks-db

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Optional: Custom ports
PORT=3000
```

### SSL/HTTPS Setup

For production, add a reverse proxy (nginx or Caddy) with SSL:

```yaml
# Add to docker-compose.yml
  nginx-proxy:
    image: nginxproxy/nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/tmp/docker.sock:ro
      - ./certs:/etc/nginx/certs
```

### Monitoring

Access Jaeger UI to monitor:
- API request traces
- Database query performance
- Chronos.js telemetry (hash-based diff detection)

---

## Verification

After deployment, verify all optimizations are active:

1. **Check Backend Logs:**
   ```bash
   docker-compose logs backend | grep "Lightweight Hash-Based Diff Detection"
   ```
   Should see: `Starting Telemetry Cron Service (Lightweight Hash-Based Diff Detection)...`

2. **Test Rate Limiting:**
   ```bash
   # Make 101 requests rapidly
   for i in {1..101}; do curl http://your-server/api/tasks; done
   ```
   Should get rate limit error after 100 requests.

3. **Check Health:**
   ```bash
   docker-compose ps
   ```
   All services should show "healthy" status.

---

## Recommended: Railway.app or Render.com

For the easiest deployment with minimal configuration:

**Railway.app:**
- ✅ Automatic Docker Compose detection
- ✅ Free tier available
- ✅ Built-in MongoDB
- ✅ Automatic HTTPS
- ✅ Simple CLI deployment

**Render.com:**
- ✅ Free tier with managed services
- ✅ Automatic SSL certificates
- ✅ GitHub integration
- ✅ Managed MongoDB available

Both platforms will automatically deploy from your `dev` branch and handle all the infrastructure for you.
