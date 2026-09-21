FROM node:26-alpine

WORKDIR /app

# Install build tools
RUN apk update && apk add --no-cache --no-scripts build-base g++ cairo-dev jpeg-dev pango-dev giflib-dev python3 py3-setuptools

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]