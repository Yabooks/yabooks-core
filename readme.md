# YaBooks Core

An easily extendable ERP system for businesses of any size.

YaBooks Core is the backend/server component of YaBooks. It's a Node.js (Express) application that also ships as a desktop app (via Electron), and exposes a JSON API secured with JWT authentication and Casbin-based authorization, with auto-generated Swagger/OpenAPI documentation.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+ and npm
- A MongoDB instance (local, Docker, or hosted — e.g. MongoDB Atlas)
- Git

## Getting the code

```bash
git clone https://github.com/Yabooks/yabooks-core.git
cd yabooks-core
```

## Configuration

The server is configured through environment variables (loaded via `dotenv`). Create a `.env` file in the project root:

```env
# Port the server listens on
PORT=3000

# MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/yabooks

# Secret used to sign/verify JWTs
JWT_SECRET=change-this-to-a-long-random-string

# Optional: AI provider keys, only needed if you use the AI-powered features
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

## Running as a server application (without Docker)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Make sure a MongoDB instance is reachable at the connection string set in `MONGODB_URI`.

3. Start the server:

   ```bash
   npm run server
   ```

   This runs `node index.js`, which starts the Express server on the configured port.

4. Once running, the application is available at `http://localhost:<PORT>`, and an interactive API documentation is available at `http://localhost:<PORT>/api/doc`.

5. To stop the server, press `Ctrl+C`.

### Running in the background (optional)

For a persistent, production-style deployment without Docker, use a process manager such as [PM2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start index.js --name yabooks-core
pm2 save
```

---

## Running as a server application (with Docker)

### Option A: Docker alone (with an external/existing MongoDB)

```bash
docker build -t yabooks-core .

docker run -d \
  --name yabooks-core \
  -p 3000:3000 \
  -e PORT=3000 \
  -e MONGODB_URI="mongodb://host.docker.internal:27017/yabooks" \
  -e JWT_SECRET="change-this-to-a-long-random-string" \
  yabooks-core
```

### Option B: Docker Compose (app + MongoDB together)

Add a `docker-compose.yml` at the project root:

```yaml
version: "3.8"

services:
  app:
    build: .
    container_name: yabooks-core
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      PORT: 3000
      MONGODB_URI: mongodb://mongo:27017/yabooks
      JWT_SECRET: change-this-to-a-long-random-string
    depends_on:
      - mongo

  mongo:
    image: mongo:7
    container_name: yabooks-mongo
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
    ports:
      - "27017:27017"

volumes:
  mongo-data:
```

Then start everything with:

```bash
docker compose up -d --build
```

The app will be reachable at `http://localhost:3000`, with Swagger docs at `http://localhost:3000/api/doc`.

---

## Desktop mode

YaBooks Core can also run with certain limitations as an Electron desktop app instead of a server:

```bash
npm run desktop
```

## License

Licensed under the [EUPL-1.2](LICENSE).
