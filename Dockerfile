FROM node:26-alpine

WORKDIR /app

# Install build tools
RUN apk update && apk add --no-cache --no-scripts build-base g++ cairo-dev jpeg-dev pango-dev giflib-dev python3 py3-setuptools

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application (see .dockerignore for what is left out, e.g. .env)
COPY . .

# Run as an unprivileged user, which only may write the directories holding data and installed apps
RUN mkdir -p /app/data /app/installed_apps && chown -R node:node /app/data /app/installed_apps
USER node

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
